"""s09 的记忆存储：不调用模型的部分（筛选、校验、写盘、建索引、召回兜底）。"""

import tempfile
from pathlib import Path

import pytest

from lesson_loader import load_lesson


@pytest.fixture
def memory():
    with tempfile.TemporaryDirectory() as tmp:
        yield load_lesson("s09_memory", Path(tmp).resolve())


def record(**overrides):
    base = {
        "name": "Editor preference",
        "type": "user",
        "scope": "persistent",
        "description": "Prefers VS Code with two-space indentation",
        "body": "The user edits in VS Code and wants two-space indentation everywhere.",
    }
    return {**base, **overrides}


def test_frontmatter_round_trips_through_the_document_format(memory):
    text = memory.memory_document("Editor preference", "user", "desc here", "body here")
    metadata, body = memory.parse_frontmatter(text)
    assert metadata == {"name": "Editor preference", "description": "desc here", "type": "user"}
    assert body == "body here\n"
    assert memory.parse_frontmatter("no frontmatter") == ({}, "no frontmatter")
    assert memory.memory_slug("Editor preference!") == "editor-preference"


def test_only_persistent_durable_and_new_records_are_stored(memory):
    assert memory.should_store_memory(record(), [])
    assert not memory.should_store_memory(record(scope="current_task"), [])
    assert not memory.should_store_memory(record(type="scratch"), [])
    assert not memory.should_store_memory(record(body="Only for this session, use tabs."), [])
    assert not memory.should_store_memory(record(body="暂时先用 tab 缩进。"), [])
    # duplicates by slug, description or body are all rejected
    existing = [record()]
    assert not memory.should_store_memory(record(description="different", body="different"), existing)
    assert not memory.should_store_memory(record(name="Other", body="different"), existing)
    assert not memory.should_store_memory(record(name="Other", description="different"), existing)
    assert memory.should_store_memory(record(name="Other", description="different", body="different"), existing)


def test_validation_requires_fields_and_optionally_scope(memory):
    assert memory.validate_memory_record("not a dict") is None
    assert memory.validate_memory_record(record(body="")) is None
    assert memory.validate_memory_record(record(type="unknown")) is None
    assert memory.validate_memory_record(record(scope="whenever"), require_scope=True) is None
    validated = memory.validate_memory_record(record(scope=""))
    assert validated is not None and "scope" not in validated


def test_writing_a_memory_builds_the_index_and_lists_it(memory):
    path = memory.write_memory_file("Editor preference", "user", "VS Code, two spaces", "Body text")
    assert path.name == "editor-preference.md"
    assert memory.read_memory_index() == "- [Editor preference](editor-preference.md) - VS Code, two spaces"
    records = memory.list_memory_files()
    assert [r["filename"] for r in records] == ["editor-preference.md"]
    assert records[0]["type"] == "user" and records[0]["body"] == "Body text"
    assert memory.read_memory_file("editor-preference.md").startswith("---\n")
    with pytest.raises(ValueError):
        memory.write_memory_file("x", "user", "", "body")


def test_memory_paths_cannot_escape_the_store(memory):
    with pytest.raises(ValueError):
        memory.memory_path("../escape.md")
    with pytest.raises(ValueError):
        memory.memory_path("MEMORY.md")
    assert memory.read_memory_file("../escape.md") is None


def test_json_array_is_found_inside_model_prose(memory):
    assert memory.extract_json_array('Sure, here you go: [0, 2] and nothing else') == [0, 2]
    assert memory.extract_json_array('{"not": "an array"} [1]') == [1]
    assert memory.extract_json_array("no json here") == []


def test_keyword_fallback_ranks_by_overlap_in_both_languages(memory):
    records = [
        {"filename": "a.md", "name": "Deploy checklist", "description": "steps before release"},
        {"filename": "b.md", "name": "编辑器偏好", "description": "用 VS Code，两个空格缩进"},
        {"filename": "c.md", "name": "Unrelated", "description": "nothing here"},
    ]
    assert memory.keyword_memory_selection(records, "what are the deploy release steps", 5) == ["a.md"]
    # 中文按连续汉字串整段匹配，所以查询里要用空格或标点断开
    assert memory.keyword_memory_selection(records, "编辑器偏好 是什么", 5) == ["b.md"]
    assert memory.keyword_memory_selection(records, "zzz", 5) == []


def test_recall_falls_back_to_keywords_when_the_model_is_unavailable(memory):
    memory.write_memory_file("Deploy checklist", "project", "steps before release", "Run the smoke tests first.")
    messages = [{"role": "user", "content": "remind me of the deploy release steps"}]
    # the fake client raises, so select_relevant_memories must take the keyword path
    assert memory.select_relevant_memories(messages) == ["deploy-checklist.md"]
    loaded = memory.load_memories(messages)
    assert "deploy-checklist.md" in loaded and "smoke tests" in loaded
    assert "Memory catalog" in memory.build_system(loaded)
