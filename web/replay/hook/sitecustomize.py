"""
录制钩子：由 web/replay/record.py 通过 PYTHONPATH 注入到被录制的章节进程里。
Python 启动时会自动导入 sitecustomize，只有设置了 REPLAY_TRACE 才会生效。

记录三类事件（按发生顺序写入 JSONL）：
  llm      每一次 client.messages.create 的请求与响应
  console  程序打印到终端的内容
  input    程序从 stdin 读到的每一行（学生输入或权限确认）
"""

import json
import os
import sys
import threading
import time
import traceback

TRACE = os.environ.get("REPLAY_TRACE")


def _install():
    # 只录被录制的章节进程本身：模型在 bash 里启动的 Python 子进程不能再继承录制设置
    os.environ.pop("REPLAY_TRACE", None)
    hook_dir = os.path.dirname(os.path.abspath(__file__))
    paths = [p for p in os.environ.get("PYTHONPATH", "").split(os.pathsep) if p and os.path.abspath(p) != hook_dir]
    if paths:
        os.environ["PYTHONPATH"] = os.pathsep.join(paths)
    else:
        os.environ.pop("PYTHONPATH", None)
    lock = threading.Lock()
    trace = open(TRACE, "a", encoding="utf-8")
    chapter_dir = os.environ.get("REPLAY_CHAPTER_DIR", "")
    state = {"tail": ""}

    def to_jsonable(obj):
        if hasattr(obj, "model_dump"):
            return obj.model_dump(exclude_none=True)
        if hasattr(obj, "__dict__"):
            return vars(obj)
        return str(obj)

    def log(event):
        event["ts"] = round(time.time(), 3)
        event["thread"] = threading.current_thread().name
        line = json.dumps(event, ensure_ascii=False, default=to_jsonable)
        with lock:
            trace.write(line + "\n")
            trace.flush()

    class Tee:
        def __init__(self, stream, name):
            self._stream = stream
            self._name = name

        def write(self, text):
            if text:
                log({"type": "console", "stream": self._name, "text": text})
                state["tail"] = (state["tail"] + text)[-200:]
            return self._stream.write(text)

        def __getattr__(self, attr):
            return getattr(self._stream, attr)

    class LoggingStdin:
        def __init__(self, stream):
            self._stream = stream

        def readline(self, *args):
            line = self._stream.readline(*args)
            if line:
                kind = "approval" if "[y/N]" in state["tail"] else "user"
                log({"type": "input", "kind": kind, "prompt": state["tail"].splitlines()[-1] if state["tail"].strip() else "",
                     "text": line.rstrip("\n")})
                state["tail"] = ""
            return line

        def __getattr__(self, attr):
            return getattr(self._stream, attr)

    sys.stdout = Tee(sys.stdout, "stdout")
    sys.stderr = Tee(sys.stderr, "stderr")
    sys.stdin = LoggingStdin(sys.stdin)

    def caller_chain():
        chain = []
        for frame in reversed(traceback.extract_stack()[:-2]):
            if chapter_dir and frame.filename.startswith(chapter_dir):
                chain.append(frame.name)
            if len(chain) >= 4:
                break
        return chain

    try:
        from anthropic.resources.messages import Messages
    except Exception:  # 没装 anthropic 的章节进程照常运行
        return
    original_create = Messages.create

    def create(self, *args, **kwargs):
        request = json.loads(json.dumps({
            "model": kwargs.get("model"),
            "system": kwargs.get("system"),
            "tools": [t.get("name") for t in (kwargs.get("tools") or []) if isinstance(t, dict)],
            "messages": kwargs.get("messages"),
        }, ensure_ascii=False, default=to_jsonable))
        chain = caller_chain()
        started = time.time()
        try:
            response = original_create(self, *args, **kwargs)
        except Exception as error:
            log({"type": "llm", "caller": chain, "request": request, "error": repr(error)})
            raise
        log({
            "type": "llm",
            "caller": chain,
            "request": request,
            "response": {
                "content": [to_jsonable(b) for b in response.content],
                "stop_reason": response.stop_reason,
                "usage": to_jsonable(response.usage),
            },
            "ms": int((time.time() - started) * 1000),
        })
        return response

    Messages.create = create


if TRACE:
    _install()
