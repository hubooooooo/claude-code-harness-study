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


def test_every_chapter_has_a_recorded_replay_without_local_paths():
    import json

    scenarios = json.loads((ROOT / "web" / "replay" / "scenarios.json").read_text(encoding="utf-8"))
    for lesson_id, chapter in [(c[:3], c) for c in CHAPTERS]:
        assert scenarios[lesson_id]["dir"] == chapter
        text = (ROOT / "web" / "replay" / "traces" / f"{lesson_id}.json").read_text(encoding="utf-8")
        trace = json.loads(text)
        assert any(e["t"] == "llm" for e in trace["events"])
        assert "/var/folders" not in text and "/Users/" not in text
