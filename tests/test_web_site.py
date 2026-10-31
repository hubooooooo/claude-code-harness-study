import http.client
import importlib.util
import re
import threading
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHAPTERS = sorted(p.name for p in ROOT.glob("s[0-9][0-9]_*"))


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def web_lessons():
    src = (ROOT / "web" / "lessons.js").read_text()
    return re.findall(r'id: "(s\d\d)", dir: "([^"]+)".*?base: (null|"s\d\d")', src)


def test_web_lessons_match_chapter_folders_and_run_menu():
    lessons = web_lessons()
    assert [d for _, d, _ in lessons] == CHAPTERS
    run = load_module("run_launcher", ROOT / "run.py")
    assert [(i, d) for i, d, _ in lessons] == [(num, folder) for num, folder, _t, _d in run.LESSONS]


def test_web_diff_bases_point_to_earlier_chapters():
    for i, (lesson_id, _dir, base) in enumerate(web_lessons()):
        if base == "null":
            assert i == 0
        else:
            assert base.strip('"') < lesson_id


def test_web_server_serves_course_files_but_hides_dotfiles():
    server = load_module("course_web_server", ROOT / "web" / "server.py")
    httpd = server.http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        def status(path):
            conn = http.client.HTTPConnection("127.0.0.1", httpd.server_address[1])
            conn.request("GET", path)
            code = conn.getresponse().status
            conn.close()
            return code

        assert status("/web/") == 200
        assert status("/s01_agent_loop/README.md") == 200
        assert status("/") == 302
        assert status("/.env.example") == 404
        assert status("/.git/HEAD") == 404
        assert status("/web/%2e%2e/.env.example") == 404
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_live_api_rejects_requests_from_other_sites():
    server = load_module("course_web_server_api", ROOT / "web" / "server.py")
    httpd = server.http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        def status(method, path, headers, body=None):
            conn = http.client.HTTPConnection("127.0.0.1", port)
            conn.request(method, path, body=body, headers=headers)
            code = conn.getresponse().status
            conn.close()
            return code

        own = f"http://127.0.0.1:{port}"
        assert status("GET", "/api/status", {"Host": "evil.example:80"}) == 403
        assert status("GET", "/api/status", {"Origin": "http://evil.example"}) == 403
        assert status("POST", "/api/key", {"Origin": "http://evil.example", "Content-Type": "application/json"}, "{}") == 403
        # 跨站表单只能发 text/plain，不能触发写入
        assert status("POST", "/api/key", {"Origin": own, "Content-Type": "text/plain"}, "{}") == 403
        assert status("POST", "/api/run/000000000000/stop", {"Origin": own, "Content-Type": "application/json"}, "{}") == 404
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_every_chapter_has_live_prompts_and_an_animation():
    import json

    prompts = json.loads((ROOT / "web" / "live_prompts.json").read_text(encoding="utf-8"))
    viz = (ROOT / "web" / "viz.js").read_text(encoding="utf-8")
    for lesson_id, chapter in [(c[:3], c) for c in CHAPTERS]:
        assert prompts[lesson_id]["dir"] == chapter
        assert any(step.get("send") for run in prompts[lesson_id]["runs"] for step in run["steps"])
        assert f"VIZ.{lesson_id} = {{" in viz



def test_teach_mode_controls_exist():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    # 开关在侧栏底部和顶栏各一个
    assert html.count("data-teach") == 2 and 'id="slidebar"' in html
    # 讲解页和导读、决策实战页都支持按小节翻页
    assert app.count("if (teach) startSlides(article,") == 2


def test_story_replays_are_well_formed_and_quote_real_code():
    import json

    stories = sorted((ROOT / "web" / "story").glob("s[0-9][0-9].json"))
    assert stories, "至少要有一章回放"
    for path in stories:
        story = json.loads(path.read_text(encoding="utf-8"))
        chapter = next(c for c in CHAPTERS if c.startswith(path.stem))
        assert story["file"] == f"{chapter}/code.py", path.name
        source = (ROOT / story["file"]).read_text(encoding="utf-8")
        assert story["task"] and story["steps"], path.name
        for k, step in enumerate(story["steps"], 1):
            where = f"{path.name} 第 {k} 步"
            assert step["title"] and step["desc"], where
            for role, text in step.get("add", []):
                assert role in ("user", "assistant", "tool", "prog") and text, where
            code = step.get("code")
            if code:
                # 回放里展示的每一行代码，都必须原样出现在本章 code.py 里
                for line in code["lines"]:
                    assert line.strip() in source, f"{where}：code.py 里找不到 {line!r}"
                for i in code.get("hi", []):
                    assert 0 <= i < len(code["lines"]), where


def test_live_page_renders_runs_as_group_chat():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    live = (ROOT / "web" / "live.js").read_text(encoding="utf-8")
    assert html.index('src="chat.js"') < html.index('src="live.js"')
    for kind in ("user", "approval", "console", "tool_result", "tool_use"):
        assert kind in live, kind
