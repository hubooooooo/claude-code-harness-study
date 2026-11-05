"""Load one chapter's code.py in a temporary workdir, without network or an API key.

Shared by the tests that exercise chapter helpers directly. The chapter module
gets a fake `anthropic` client whose only behaviour is to fail loudly if a test
accidentally reaches the model.
"""

import importlib.util
import os
import sys
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class _FakeMessages:
    def create(self, **_kwargs):
        raise AssertionError("tests must not call the model")


class _FakeAnthropic:
    def __init__(self, *args, **kwargs):
        self.messages = _FakeMessages()


def load_lesson(chapter: str, workdir: Path):
    """`chapter` is a directory name such as "s09_memory"; module globals use Path.cwd()."""
    fake_anthropic = types.ModuleType("anthropic")
    fake_anthropic.Anthropic = _FakeAnthropic
    fake_dotenv = types.ModuleType("dotenv")
    fake_dotenv.load_dotenv = lambda *args, **kwargs: None

    previous = {name: sys.modules.get(name) for name in ("anthropic", "dotenv")}
    previous_cwd = Path.cwd()
    module_name = f"lesson_{chapter}_{time.time_ns()}"
    spec = importlib.util.spec_from_file_location(module_name, ROOT / chapter / "code.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules.update({"anthropic": fake_anthropic, "dotenv": fake_dotenv, module_name: module})
    try:
        os.chdir(workdir)
        spec.loader.exec_module(module)
    finally:
        os.chdir(previous_cwd)
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value
    return module
