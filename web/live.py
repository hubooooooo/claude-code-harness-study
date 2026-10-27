"""
web/live.py — 课程网页里的「实时运行」：在本机启动章节进程，把运行事件交给网页。

- 每一课有一个独立工作区（系统临时目录里的仓库副本），模型执行的命令不会改到真实项目；
  同一课多次运行共用这个工作区（s09 记忆、s10 任务等需要跨运行保留），网页上可以重置。
- 运行事件由 web/replay/hook/sitecustomize.py 记录，和录制回放是同一套格式。
- 同一时间只运行一个章节进程；关闭课程网页服务时会一起结束。
"""

import atexit
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path

WEB = Path(__file__).resolve().parent
ROOT = WEB.parent
HOOK_DIR = WEB / "replay" / "hook"
WORKSPACES = Path(tempfile.gettempdir()) / "learn-claude-code-web"
PROMPT_RE = re.compile(r">>\s*$")
APPROVAL_RE = re.compile(r"\[y/N\]\s*$")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


launcher = _load("run_launcher", ROOT / "run.py")
recorder = _load("replay_record", WEB / "replay" / "record.py")
LESSON_DIRS = {num: folder for num, folder, _title, _desc in launcher.LESSONS}


def status() -> dict:
    return {"venv": launcher.venv_ready(), "key": launcher.check_api_key()}


def save_key(key: str) -> dict:
    key = (key or "").strip()
    if not key or launcher.is_placeholder(key) or any(c.isspace() for c in key):
        raise ValueError("Key 看起来不对，请检查后重新粘贴。")
    launcher.write_api_key(key)
    return status()


def workspace(lesson: str, reset: bool = False) -> Path:
    path = WORKSPACES / lesson / "learn-claude-code"
    if reset and path.parent.exists():
        shutil.rmtree(path.parent, ignore_errors=True)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        sandbox = recorder.make_sandbox()
        shutil.move(str(sandbox), str(path))
        shutil.rmtree(sandbox.parent, ignore_errors=True)
    return path


class Session:
    def __init__(self, lesson: str, reset: bool):
        self.id = uuid.uuid4().hex[:12]
        self.lesson = lesson
        self.cwd = workspace(lesson, reset)
        self.trace = self.cwd.parent / f"run-{self.id}.jsonl"
        chapter_dir = self.cwd / LESSON_DIRS[lesson]
        env = {**os.environ, **recorder.read_env(),
               "PYTHONPATH": str(HOOK_DIR),
               "PYTHONUNBUFFERED": "1",
               "PYTHONIOENCODING": "utf-8",
               "REPLAY_TRACE": str(self.trace),
               "REPLAY_CHAPTER_DIR": str(chapter_dir)}
        self.proc = subprocess.Popen(
            [str(launcher.venv_python()), str(chapter_dir / "code.py")],
            cwd=self.cwd, env=env, stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.events = []
        self.offset = 0
        self.tail = ""
        self.lock = threading.Lock()

    def _read_new(self):
        if not self.trace.exists():
            return
        with open(self.trace, "rb") as f:
            f.seek(self.offset)
            data = f.read()
        end = data.rfind(b"\n") + 1  # 只读完整的行
        self.offset += end
        for line in data[:end].decode("utf-8", "replace").splitlines():
            if not line.strip():
                continue
            ev = json.loads(line)
            if ev.get("type") == "console":
                self.tail = (self.tail + ev["text"])[-300:]
            elif ev.get("type") == "input":
                self.tail = ""
            self.events.append(ev)

    def state(self) -> str:
        if self.proc.poll() is not None:
            return "exited"
        tail = ANSI_RE.sub("", self.tail)
        if APPROVAL_RE.search(tail):
            return "approval"
        if PROMPT_RE.search(tail):
            return "prompt"
        return "running"

    def poll(self, start: int) -> dict:
        with self.lock:
            self._read_new()
            return {"events": self.events[start:], "next": len(self.events), "state": self.state(),
                    "exit_code": self.proc.returncode}

    def send(self, text: str):
        with self.lock:
            self._read_new()
            if self.state() not in ("prompt", "approval"):
                raise ValueError("程序正在运行，请等它停下来再输入。")
            self.tail = ""
            self.proc.stdin.write((text.replace("\n", " ") + "\n").encode("utf-8"))
            self.proc.stdin.flush()

    def stop(self):
        if self.proc.poll() is None:
            try:
                self.proc.stdin.close()
                self.proc.wait(timeout=3)
            except Exception:
                self.proc.kill()


_sessions = {}
_lock = threading.Lock()


def start(lesson: str, reset: bool = False) -> dict:
    if lesson not in LESSON_DIRS:
        raise ValueError("未知章节")
    st = status()
    if not st["venv"]:
        raise ValueError("还没有安装依赖：请先双击「启动.command」（或运行 python3 run.py）完成首次安装。")
    if not st["key"]:
        raise ValueError("还没有设置 API Key。")
    with _lock:
        for old in list(_sessions.values()):
            old.stop()
        _sessions.clear()
        session = Session(lesson, reset)
        _sessions[session.id] = session
    return {"id": session.id, "workspace": str(session.cwd)}


def get(session_id: str) -> Session:
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(session_id)
    return session


@atexit.register
def _cleanup():
    for session in list(_sessions.values()):
        session.stop()
