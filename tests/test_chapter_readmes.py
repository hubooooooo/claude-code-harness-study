import py_compile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHAPTERS = sorted(ROOT.glob("s[0-9][0-9]_*"))


def test_every_chapter_has_only_the_chinese_readme() -> None:
    assert len(CHAPTERS) == 17

    for chapter in CHAPTERS:
        assert (chapter / "README.md").is_file()
        assert not (chapter / "README.zh.md").exists()
        assert not (chapter / "README.ja.md").exists()
        assert not (chapter / "README.en.md").exists()


def test_every_chapter_script_compiles_on_python_311() -> None:
    for chapter in CHAPTERS:
        _ = py_compile.compile(str(chapter / "code.py"), doraise=True)


def test_every_chapter_ends_with_a_pm_view_before_next_steps() -> None:
    for chapter in CHAPTERS:
        text = (chapter / "README.md").read_text()
        assert text.count("## 产品经理视角") == 1, chapter.name
        if "## 接下来" in text:
            assert text.index("## 产品经理视角") < text.index("## 接下来"), chapter.name


def test_guide_pages_listed_on_the_site_exist_and_link_to_each_other() -> None:
    import re

    src = (ROOT / "web" / "lessons.js").read_text()
    files = re.findall(r'file: "(guide/[^"]+)"', src)
    assert files[0] == "guide/README.md" and len(files) >= 2
    for f in files:
        assert (ROOT / f).is_file(), f
    index = (ROOT / "guide" / "README.md").read_text()
    for f in files[1:]:
        assert f"]({Path(f).name})" in index, f
