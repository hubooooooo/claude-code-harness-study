"""s02 的五个基础工具是后面每一章的底座，这里直接测它们的边界行为。"""

import tempfile
from pathlib import Path

import pytest

from lesson_loader import load_lesson


@pytest.fixture
def workspace():
    with tempfile.TemporaryDirectory() as tmp:
        yield Path(tmp).resolve()


def test_file_tools_stay_inside_the_workspace(workspace):
    lesson = load_lesson("s02_tool_use", workspace)
    with pytest.raises(ValueError):
        lesson.safe_path("../outside.txt")
    assert lesson.run_read("../outside.txt").startswith("Error:")
    assert lesson.run_write("../outside.txt", "x").startswith("Error:")
    assert "已写入" in lesson.run_write("notes/a.txt", "hello")
    assert lesson.run_read("notes/a.txt") == "hello"


def test_edit_replaces_exactly_one_occurrence(workspace):
    lesson = load_lesson("s02_tool_use", workspace)
    lesson.run_write("a.txt", "x = 1\nx = 1\n")
    assert "已修改" in lesson.run_edit("a.txt", "x = 1", "x = 2")
    assert lesson.run_read("a.txt") == "x = 2\nx = 1"
    assert "找不到" in lesson.run_edit("a.txt", "missing", "y")


def test_glob_never_lists_files_outside_the_workspace(workspace):
    lesson = load_lesson("s02_tool_use", workspace)
    lesson.run_write("src/a.py", "")
    outside = workspace.parent / "learn-claude-code-outside.py"
    outside.write_text("")
    try:
        assert lesson.run_glob("src/*.py") == "src/a.py"
        assert lesson.run_glob("../*.py") == "(没有匹配的文件)"
    finally:
        outside.unlink()


def test_bash_survives_output_that_is_not_valid_utf8(workspace):
    lesson = load_lesson("s02_tool_use", workspace)
    assert lesson.run_bash("true") == "(没有输出)"
    output = lesson.run_bash("printf 'ok\\377'")  # 0xff，不是合法的 UTF-8
    assert output.startswith("ok") and "�" in output
    assert lesson.run_bash("echo 中文") == "中文"


def test_s03_rules_flag_paths_outside_the_workspace(workspace):
    lesson = load_lesson("s03_permission", workspace)
    assert lesson.check_rules("write_file", {"path": "../escape.txt"}) == "要写工作区以外的文件"
    assert lesson.check_rules("write_file", {"path": "inside.txt"}) is None
