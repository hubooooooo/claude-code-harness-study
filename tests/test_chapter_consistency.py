"""各章代码是「上一章全量 + 本章新增」的复制写法，复制件之间容易悄悄走样。

这里锁住几处必须保持一致的共享代码，改一处漏了别处时测试会先叫。
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAPTERS = sorted(ROOT.glob("s[0-9][0-9]_*/code.py"))


def bash_runner_source(code: str) -> str:
    match = re.search(r"^def (run_bash|_run_bash_process)\(", code, re.M)
    assert match, "chapter has no bash runner"
    rest = code[match.end():]
    end = re.search(r"^(def |class )", rest, re.M)
    return rest[: end.start()] if end else rest


def test_every_bash_runner_decodes_output_as_utf8_with_replacement():
    # Windows 上 subprocess 默认按本地编码解码，中文输出会直接抛 UnicodeDecodeError。
    for path in CHAPTERS:
        if path.parent.name.startswith(("s16", "s17")):
            continue  # s16 复用 s15 的工具；s17 自带独立的 bash 实现，另有测试
        runner = bash_runner_source(path.read_text(encoding="utf-8"))
        assert 'encoding="utf-8"' in runner and 'errors="replace"' in runner, path.parent.name


def test_s17_bash_runner_reads_files_with_replacement():
    code = (ROOT / "s17_goal_loop" / "code.py").read_text(encoding="utf-8")
    assert 'errors="replace"' in code


def test_chapters_keep_the_same_base_tool_names_after_s02():
    # s02 定下五个基础工具，后面每章都要带着同一套名字
    base = {"bash", "read_file", "write_file", "edit_file", "glob"}
    for path in CHAPTERS:
        if path.parent.name.startswith(("s01", "s16")):
            continue
        code = path.read_text(encoding="utf-8")
        names = set(re.findall(r'"name":\s*"([a-z_]+)"', code))
        assert base <= names, (path.parent.name, base - names)
