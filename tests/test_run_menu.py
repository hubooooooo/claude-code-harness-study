import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def load_run_launcher():
    spec = importlib.util.spec_from_file_location("run_launcher", ROOT / "run.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1", "s01"),
        ("2", "s02"),
        ("9", "s09"),
        ("10", "s10"),
        ("01", "s01"),
        ("s1", "s01"),
        ("s2", "s02"),
        ("s01", "s01"),
        ("S01", "s01"),
        ("s 1", "s01"),
        ("３", "s03"),
        ("ｓ１", "s01"),
        ("agent_loop", "s01"),
        ("s01_agent_loop", "s01"),
        ("Agent Loop", "s01"),
    ],
)
def test_find_lesson_accepts_student_inputs(raw, expected):
    launcher = load_run_launcher()
    lesson = launcher.find_lesson(raw)
    assert lesson is not None
    assert lesson[0] == expected


@pytest.mark.parametrize("raw", ["0", "18", "s0", "s18", ""])
def test_find_lesson_rejects_out_of_range(raw):
    launcher = load_run_launcher()
    assert launcher.find_lesson(raw) is None
