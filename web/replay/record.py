"""
录制运行回放：像学生一样运行各章 code.py，记录每一次模型调用，生成网页回放数据。

    .venv/bin/python web/replay/record.py s01          # 录一章
    .venv/bin/python web/replay/record.py s01 s03 s08  # 录多章
    .venv/bin/python web/replay/record.py all          # 录全部
    .venv/bin/python web/replay/record.py --rescrub    # 只对已有回放重新清理本机路径

- 需要项目根目录的 .env 里有可用的 API Key（会产生少量 API 费用）。
- 每章在一个临时目录里的仓库副本中运行，模型执行的命令不会改动真实仓库。
- 输入脚本见 scenarios.json；遇到 [y/N] 权限确认时按场景的 approve 回答（默认 n）；
  场景里写了 model 时用它覆盖 .env 的 MODEL_ID；git_init 把副本初始化成 git 仓库；
  步骤里写了 no_prompt 时不等提示符直接发送。
- 结果写到 web/replay/traces/<章节>.json，网页「回放」标签直接读取。
"""

import codecs
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TRACES = HERE / "traces"
HOOK_DIR = HERE / "hook"
PROMPT_RE = re.compile(r">>\s*$")
APPROVAL_RE = re.compile(r"\[y/N\]\s*$")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
MAX_TEXT = 6000
BUF_KEEP = 20000


def read_env() -> dict:
    env = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip().strip("'\"")
    return env


def make_sandbox() -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="replay-"))
    ignore = shutil.ignore_patterns(".git", ".venv", ".env", "web", "__pycache__", ".pytest_cache",
                                    ".memory", ".tasks", ".transcripts", ".task_outputs", ".scheduled_tasks.json")
    shutil.copytree(ROOT, tmp / "learn-claude-code", ignore=ignore)
    return tmp / "learn-claude-code"


class Child:
    """运行一个章节进程，按输出里的提示符喂输入。"""

    def __init__(self, cmd, cwd, env):
        self.proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, bufsize=0)
        self.buf = ""
        self.lock = threading.Lock()
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        fd = self.proc.stdout.fileno()
        while True:
            chunk = os.read(fd, 65536)  # 有多少读多少，不按字节读
            if not chunk:
                return
            text = decoder.decode(chunk)
            sys.stdout.write(text)
            sys.stdout.flush()
            with self.lock:
                # 只需要看最近的输出（提示符、标记），缓冲区不无限增长
                self.buf = (self.buf + text)[-BUF_KEEP:]

    def tail(self):
        with self.lock:
            return ANSI_RE.sub("", self.buf[-300:])

    def send(self, text):
        with self.lock:
            self.buf = ""
        self.proc.stdin.write((text + "\n").encode())
        self.proc.stdin.flush()

    def wait_for(self, predicate, timeout, approve):
        """等到 predicate(tail) 成立；途中遇到权限确认就自动回答。"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc.poll() is not None:
                return False
            tail = self.tail()
            if APPROVAL_RE.search(tail):
                time.sleep(0.3)
                self.send(approve)
                continue
            if predicate(tail):
                return True
            time.sleep(0.2)
        return False


def run_session(sandbox, chapter_dir, run, env, approve):
    cmd = [sys.executable, str(sandbox / chapter_dir / "code.py"), *run.get("args", [])]
    child = Child(cmd, sandbox, env)
    at_prompt = lambda t: bool(PROMPT_RE.search(t))
    for step in run.get("steps", []):
        if "sleep" in step:
            time.sleep(step["sleep"])
        if "wait_for" in step:
            marker = step["wait_for"]
            with child.lock:
                seen = marker in child.buf
            if not seen:
                child.wait_for(lambda t: marker in t, step.get("timeout", 600), approve)
        if "send" in step:
            # no_prompt：主线程正停在 input() 里、提示符早已被后台输出冲走时，直接发送
            if not step.get("no_prompt") and not child.wait_for(at_prompt, step.get("timeout", 600), approve):
                print(f"\n[record] 等待提示符超时，跳过：{step['send']}")
                break
            child.send(step["send"])
    # 最后一轮结束、回到提示符后关闭 stdin，让程序自然退出
    child.wait_for(at_prompt, run.get("final_timeout", 600), approve)
    child.proc.stdin.close()
    try:
        child.proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        child.proc.kill()


# ---------- 后处理 ----------

SANDBOX_RE = re.compile(r"(?:/private)?/var/folders/[^\s'\"\])]*?/learn-claude-code")
TMP_RE = re.compile(r"(?:/private)?/var/folders/[^\s'\"\])]*")


def scrub(value, replacements):
    if isinstance(value, str):
        for old, new in replacements:
            value = value.replace(old, new)
        # 钩子日志里被截断的、或指向临时目录上级的本机路径
        value = SANDBOX_RE.sub("learn-claude-code", value)
        value = TMP_RE.sub("/tmp/…", value)
        value = ANSI_RE.sub("", value)
        if len(value) > MAX_TEXT:
            value = value[:4000] + f"\n…［回放中省略 {len(value) - 5000} 个字符］…\n" + value[-1000:]
        return value
    if isinstance(value, list):
        return [scrub(v, replacements) for v in value]
    if isinstance(value, dict):
        return {k: scrub(v, replacements) for k, v in value.items()}
    return value


def build_trace(lesson_id, scenario, raw_events, replacements):
    events = []
    systems, toolsets = [], []
    previous_msgs = []  # 每次 llm 调用的完整 messages，用来找前缀做去重
    for ev in raw_events:
        ev = scrub(ev, replacements)
        if ev["type"] == "console":
            text = ev["text"]
            if events and events[-1]["t"] == "console" and events[-1]["thread"] == ev["thread"]:
                events[-1]["text"] += text
            else:
                events.append({"t": "console", "thread": ev["thread"], "text": text})
        elif ev["type"] == "input":
            events.append({"t": ev["kind"], "thread": ev["thread"], "text": ev["text"], "prompt": ev.get("prompt", "")})
        elif ev["type"] == "llm":
            req = ev["request"]
            msgs = req.get("messages") or []
            system = req.get("system")
            if system not in systems:
                systems.append(system)
            tools = req.get("tools") or []
            if tools not in toolsets:
                toolsets.append(tools)
            # base = 第几次模型调用（从 0 起）的 messages 是本次的前缀；只存新增部分
            base, keep = -1, 0
            for nth in range(len(previous_msgs) - 1, -1, -1):
                prev = previous_msgs[nth]
                if keep < len(prev) <= len(msgs) and msgs[:len(prev)] == prev:
                    base, keep = nth, len(prev)
            events.append({
                "t": "llm",
                "thread": ev["thread"],
                "caller": ev.get("caller") or [],
                "model": req.get("model"),
                "system": systems.index(system),
                "tools": toolsets.index(tools),
                "base": base,
                "keep": keep,
                "add": msgs[keep:],
                "response": ev.get("response"),
                "error": ev.get("error"),
                "ms": ev.get("ms"),
            })
            previous_msgs.append(msgs)
    # 去掉只有空白的终端输出
    events = [e for e in events if not (e["t"] == "console" and not e["text"].strip())]
    return {
        "lesson": lesson_id,
        "recorded": date.today().isoformat(),
        "title": scenario.get("title", ""),
        "note": scenario.get("note", ""),
        "systems": systems,
        "toolsets": toolsets,
        "events": events,
    }


def record(lesson_id, scenario, env):
    chapter_dir = scenario["dir"]
    sandbox = make_sandbox()
    if scenario.get("git_init"):  # 需要 git worktree 的章节：把副本初始化成 git 仓库
        subprocess.run("git init -q && git add -A && git -c user.name=replay -c user.email=replay@example.com "
                       "commit -qm init", shell=True, cwd=sandbox, check=True)
    trace_file = sandbox.parent / "trace.jsonl"
    child_env = {**os.environ, **env,
                 "PYTHONPATH": str(HOOK_DIR),
                 "PYTHONUNBUFFERED": "1",
                 "PYTHONIOENCODING": "utf-8",
                 "REPLAY_TRACE": str(trace_file),
                 "REPLAY_CHAPTER_DIR": str(sandbox / chapter_dir)}
    if scenario.get("model"):
        child_env["MODEL_ID"] = scenario["model"]
    approve = scenario.get("approve", "n")
    try:
        for run in scenario["runs"]:
            run_session(sandbox, chapter_dir, run, child_env, approve)
        raw = [json.loads(line) for line in trace_file.read_text(encoding="utf-8").splitlines() if line.strip()]
        if os.environ.get("REPLAY_KEEP_RAW"):  # 调试用：保留原始事件
            shutil.copy(trace_file, os.environ["REPLAY_KEEP_RAW"])
    finally:
        real = str(sandbox.resolve())
        replacements = [(real, "learn-claude-code"), (str(sandbox), "learn-claude-code"),
                        (str(Path.home()), "~")]
        shutil.rmtree(sandbox.parent, ignore_errors=True)
    trace = build_trace(lesson_id, scenario, raw, replacements)
    TRACES.mkdir(exist_ok=True)
    out = TRACES / f"{lesson_id}.json"
    out.write_text(json.dumps(trace, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    calls = sum(1 for e in trace["events"] if e["t"] == "llm")
    print(f"\n[record] {lesson_id}: {calls} 次模型调用，{len(trace['events'])} 个回放步骤 → {out.relative_to(ROOT)}")


def rescrub():
    """对已录好的回放重新做一次路径清理（不重新录制）。"""
    for path in sorted(TRACES.glob("*.json")):
        trace = json.loads(path.read_text(encoding="utf-8"))
        path.write_text(json.dumps(scrub(trace, [(str(Path.home()), "~")]), ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")
        print(f"[record] 已清理 {path.name}")


def main(argv):
    if argv == ["--rescrub"]:
        rescrub()
        return 0
    scenarios = json.loads((HERE / "scenarios.json").read_text(encoding="utf-8"))
    targets = list(scenarios) if argv == ["all"] else argv
    if not targets:
        print(__doc__)
        return 1
    env = read_env()
    for lesson_id in targets:
        if lesson_id not in scenarios:
            print(f"未知章节或没有场景：{lesson_id}")
            return 1
        print(f"\n========== 录制 {lesson_id} ==========")
        record(lesson_id, scenarios[lesson_id], env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
