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
        assert not re.search(r"17 ?个(组件|部件|零件)", doc.read_text()), doc


# 人话层：这几节写给零基础读者，不许出现代码词；每章最多三个新词。
# 已改造的章节逐步加进来，最终覆盖 s01～s17。
PLAIN_SECTIONS = ("本章要学会的判断", "问题", "解决方案", "产品经理视角", "接下来")
PLAIN_LANGUAGE_CHAPTERS = ("s01_agent_loop", "s02_tool_use", "s03_permission", "s04_hooks")


def _section(text: str, title: str) -> str:
    import re

    match = re.search(rf"^## {re.escape(title)}\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    assert match, f"缺少 ## {title}"
    return match.group(1)


def test_plain_language_sections_have_no_code_words() -> None:
    for name in PLAIN_LANGUAGE_CHAPTERS:
        text = (ROOT / name / "README.md").read_text(encoding="utf-8")
        for title in PLAIN_SECTIONS:
            body = _section(text, title)
            assert "`" not in body, f"{name} 的「{title}」里有代码词：{body[body.index('`') - 30:body.index('`') + 40]!r}"


def test_plain_language_chapters_introduce_at_most_three_new_words() -> None:
    for name in PLAIN_LANGUAGE_CHAPTERS:
        text = (ROOT / name / "README.md").read_text(encoding="utf-8")
        brief = _section(text, "本章要学会的判断")
        assert "### 本章新词" in brief, name
        table = brief.split("### 本章新词", 1)[1]
        rows = [line for line in table.splitlines() if line.startswith("| ") and not line.startswith("| 词 ")]
        assert 1 <= len(rows) <= 3, (name, len(rows))
        for row in rows:
            assert row.count("|") == 4, (name, row)  # 词 | 意思 | 比喻


def test_plain_language_chapters_give_prompts_in_chinese() -> None:
    # 「试一下」里让学生输入的句子要是中文，零基础读者不该先翻译一遍英文
    import re

    for name in PLAIN_LANGUAGE_CHAPTERS:
        text = (ROOT / name / "README.md").read_text(encoding="utf-8")
        body = _section(text, "试一下")
        prompts = re.findall(r"^\d+\. `([^`]+)`", body, re.M)
        assert prompts, name
        for prompt in prompts:
            assert re.search(r"[一-鿿]", prompt), (name, prompt)
