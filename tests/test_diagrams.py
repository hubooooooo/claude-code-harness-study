"""diagrams/sources/*.json 是各章 SVG 的源文件：源文件要合法，产物要存在且确实是 Excalidraw 导出的。"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = sorted((ROOT / "diagrams" / "sources").glob("*.json"))


def test_every_source_has_a_rendered_excalidraw_svg() -> None:
    assert SOURCES, "diagrams/sources 下至少要有一张图"
    for source in SOURCES:
        spec = json.loads(source.read_text(encoding="utf-8"))
        assert isinstance(spec.get("elements"), list) and spec["elements"], source.name
        out = ROOT / spec["out"]
        assert out.is_file(), f"{source.name} 的产物 {spec['out']} 不存在，运行 diagrams/render.js"
        svg = out.read_text(encoding="utf-8")
        assert "svg-source:excalidraw" in svg, spec["out"]
        assert "@font-face" in svg, f"{spec['out']} 没有内嵌字体，读者电脑上会变成普通字体"


def test_diagram_text_follows_the_plain_language_rule() -> None:
    # 图里的字和 README 人话层一样：不出现代码词（下划线命名、函数调用），英文只能在中文说明后的括号里
    for source in SOURCES:
        spec = json.loads(source.read_text(encoding="utf-8"))
        for element in spec["elements"]:
            text = element.get("text") or (element.get("label") or {}).get("text") or ""
            assert not re.search(r"\w+_\w+|\w+\(\)", text), (source.name, text)


def test_every_rendered_svg_is_referenced_by_its_chapter_readme() -> None:
    for source in SOURCES:
        spec = json.loads(source.read_text(encoding="utf-8"))
        chapter_dir, rel = spec["out"].split("/", 1)
        readme = (ROOT / chapter_dir / "README.md").read_text(encoding="utf-8")
        assert f"({rel})" in readme, (chapter_dir, rel)
