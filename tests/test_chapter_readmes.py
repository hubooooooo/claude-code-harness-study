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


def test_every_chapter_opens_with_the_judgment_brief() -> None:
    import re

    for chapter in CHAPTERS:
        text = (chapter / "README.md").read_text()
        assert text.count("## 本章要学会的判断") == 1, chapter.name
        assert re.findall(r"^## .*$", text, re.M)[0] == "## 本章要学会的判断", chapter.name


def test_guide_pages_listed_on_the_site_exist_and_link_to_each_other() -> None:
    import re

    src = (ROOT / "web" / "lessons.js").read_text()
    files = re.findall(r'file: "(guide/[^"]+)", stage: "(before|after)"', src)
    before = [f for f, stage in files if stage == "before"]
    after = [f for f, stage in files if stage == "after"]
    # 导读、名词表在 s01 之前；选型篇打头的决策实战在 s17 之后
    assert before[:2] == ["guide/intro.md", "guide/glossary.md"]
    assert after[0] == "guide/README.md" and "guide/practice.md" in after
    for f in before + after:
        assert (ROOT / f).is_file(), f
    index = (ROOT / "guide" / "README.md").read_text()
    intro = (ROOT / "guide" / "intro.md").read_text()
    for f in after[1:]:
        assert f"]({Path(f).name})" in index, f
        assert f"]({Path(f).name})" in intro, f
    assert "](README.md)" in intro and "](glossary.md)" in intro


def test_s15_is_counted_as_assembly_not_a_component() -> None:
    import re

    docs = [ROOT / "README.md", ROOT / "SUMMARY.md", *ROOT.glob("guide/*.md"), *ROOT.glob("s[0-9][0-9]_*/README.md")]
    for doc in docs:
        assert not re.search(r"17 ?个(部件|零件)", doc.read_text()), doc
