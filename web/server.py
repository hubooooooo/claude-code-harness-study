"""
web/server.py — 课程网页的本地服务（只用 Python 标准库）

    python run.py web          # 推荐：启动并自动打开浏览器
    python web/server.py       # 同上

只监听本机 127.0.0.1；以仓库根目录为站点根，网页本身在 /web/。
以 "." 开头的路径（.env、.venv、.git 等）一律拒绝访问。
/api/ 是「实时运行」接口（见 web/live.py），只接受本机课程网页发来的请求。
"""

import http.server
import json
import re
import socket
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
HOST = "127.0.0.1"
DEFAULT_PORT = 8765
_live = None


def live_module():
    """按文件路径加载 web/live.py（不依赖 sys.path），第一次用到实时运行时才加载。"""
    global _live
    if _live is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location("course_live", Path(__file__).resolve().parent / "live.py")
        _live = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_live)
    return _live


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path.startswith("/api/"):
            self.handle_api("GET", path)
            return
        if path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", "/web/")
            self.end_headers()
            return
        if any(part.startswith(".") for part in path.split("/") if part):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        path = unquote(urlsplit(self.path).path)
        if not path.startswith("/api/"):
            self.send_error(405)
            return
        self.handle_api("POST", path)

    # ---------- 实时运行接口 ----------
    def same_origin(self) -> bool:
        """防止其他网站借浏览器调用本机接口（CSRF / DNS 重绑定）。"""
        port = self.server.server_address[1]
        allowed = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if self.headers.get("Host") not in allowed:
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin not in {f"http://{h}" for h in allowed}:
            return False
        if self.command == "POST":
            if origin is None and self.headers.get("Sec-Fetch-Site") != "same-origin":
                return False
            if not (self.headers.get("Content-Type") or "").startswith("application/json"):
                return False
        return True

    def send_json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, method: str, path: str):
        if not self.same_origin():
            self.send_json(403, {"error": "forbidden"})
            return
        try:
            live = live_module()
            body = {}
            if method == "POST":
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}") if length else {}
            m = re.fullmatch(r"/api/run/([0-9a-f]{12})(/input|/stop)?", path)
            if method == "GET" and path == "/api/status":
                self.send_json(200, live.status())
            elif method == "POST" and path == "/api/key":
                self.send_json(200, live.save_key(body.get("key", "")))
            elif method == "POST" and path == "/api/run":
                self.send_json(200, live.start(body.get("lesson", ""), bool(body.get("reset"))))
            elif m and method == "GET" and not m.group(2):
                start = int((parse_qs(urlsplit(self.path).query).get("from") or ["0"])[0])
                self.send_json(200, live.get(m.group(1)).poll(start))
            elif m and method == "POST" and m.group(2) == "/input":
                live.get(m.group(1)).send(str(body.get("text", "")))
                self.send_json(200, {"ok": True})
            elif m and method == "POST" and m.group(2) == "/stop":
                live.get(m.group(1)).stop()
                self.send_json(200, {"ok": True})
            else:
                self.send_json(404, {"error": "not found"})
        except KeyError:
            self.send_json(404, {"error": "这次运行已经结束，请重新开始。"})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})

    def end_headers(self):
        # 课程文件改了刷新就能看到，不走浏览器缓存
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def find_port(start: int) -> int:
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex((HOST, port)) != 0:
                return port
    raise RuntimeError("找不到可用端口")


def start(open_browser: bool = True, port: int = DEFAULT_PORT):
    """在后台线程启动服务，返回 (httpd, url)。"""
    port = find_port(port)
    httpd = http.server.ThreadingHTTPServer((HOST, port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://{HOST}:{port}/web/"
    if open_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    return httpd, url


def serve(open_browser: bool = True, port: int = DEFAULT_PORT) -> int:
    httpd, url = start(open_browser, port)
    print(f"课程网页已启动：{url}")
    print("关闭这个窗口或按 Ctrl+C 停止。")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\n已停止课程网页。")
    finally:
        httpd.shutdown()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(serve(open_browser="--no-browser" not in sys.argv))
