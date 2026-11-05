// 把 sources/*.json（Excalidraw 元素）渲染成各章 images/ 下的 SVG。
//
//   cd diagrams && npm install && npx playwright install chromium   # 只需一次
//   node render.js                 # 渲染全部
//   node render.js s01-agent-loop  # 只渲染一张（文件名去掉 .json）
//
// 每个源文件：{ "out": "s01_agent_loop/images/agent-loop.svg", "opts": {...}, "elements": [...] }
// 元素格式就是 Excalidraw 的「骨架」格式（带 label 的 rectangle / diamond / arrow / text），
// 和 Excalidraw 官方画板、Claude 的 Excalidraw 工具用的是同一套，可以互相粘贴。
// 渲染时会把用到的手写字体（Excalifont、中文的小赖字体）按字符子集嵌进 SVG，不依赖读者电脑上的字体。

const fs = require("fs");
const http = require("http");
const path = require("path");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const BUILD = path.join(HERE, ".build");
const BUNDLE = path.join(BUILD, "bundle.js");
const DIST = path.join(HERE, "node_modules/@excalidraw/excalidraw/dist/prod");

function buildBundle() {
  const esbuild = require("esbuild");
  fs.mkdirSync(BUILD, { recursive: true });
  esbuild.buildSync({
    entryPoints: [path.join(HERE, "entry.js")],
    bundle: true,
    format: "iife",
    minify: true,
    outfile: BUNDLE,
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".woff2": "file", ".css": "empty" },
    logLevel: "silent",
  });
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end('<!doctype html><html><head><meta charset="utf-8"></head><body>'
        + '<script>window.EXCALIDRAW_ASSET_PATH="/";</script><script src="/bundle.js"></script></body></html>');
    }
    const file = url === "/bundle.js" ? BUNDLE : path.join(DIST, url);
    if (!file.startsWith(DIST) && file !== BUNDLE) { res.statusCode = 403; return res.end(); }
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    if (file.endsWith(".woff2")) res.setHeader("content-type", "font/woff2");
    if (file.endsWith(".js")) res.setHeader("content-type", "text/javascript");
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function main() {
  const wanted = process.argv.slice(2);
  const sources = fs.readdirSync(path.join(HERE, "sources"))
    .filter((f) => f.endsWith(".json") && (!wanted.length || wanted.includes(f.replace(/\.json$/, ""))))
    .sort();
  if (!sources.length) throw new Error("没有找到要渲染的源文件");
  if (!fs.existsSync(BUNDLE)) buildBundle();

  const { chromium } = require("playwright");
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("页面错误：", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof window.renderSvg === "function");

  for (const file of sources) {
    const spec = JSON.parse(fs.readFileSync(path.join(HERE, "sources", file), "utf8"));
    if (!spec.out || !Array.isArray(spec.elements)) throw new Error(`${file} 缺少 out 或 elements`);
    const svg = await page.evaluate(
      ({ elements, opts }) => window.renderSvg(elements, opts || {}),
      { elements: spec.elements, opts: spec.opts },
    );
    const outPath = path.join(ROOT, spec.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, svg);
    console.log(`${file} -> ${spec.out} (${(svg.length / 1024).toFixed(0)} KB)`);
  }
  await browser.close();
  server.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
