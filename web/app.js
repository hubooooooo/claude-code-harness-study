// 课程网页：直接读取仓库里的 README.md / images / code.py 渲染，不维护第二份内容。
(function () {
  "use strict";

  const ROOT = "../"; // 网页位于 web/，章节目录在仓库根目录
  const LESSONS = window.LESSONS;
  const STAGES = window.STAGES;
  const byId = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
  const TABS = [
    { id: "learn", label: "讲解" },
    { id: "code", label: "代码", note: "本章新增高亮" },
    { id: "replay", label: "回放", note: "动画看懂机制" },
    { id: "live", label: "运行", note: "在你的电脑上跑一次" },
  ];
  const CONTEXT = 3; // “只看改动”时，改动前后保留的上下文行数

  const $main = document.getElementById("main");
  const $toc = document.getElementById("toc");
  const cache = new Map();
  const codeState = {}; // 每章的对比基准与显示模式

  // ---------- 工具函数 ----------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  async function fetchText(url) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(r.status + " " + url);
        return r.text();
      }));
    }
    try {
      return await cache.get(url);
    } catch (e) {
      cache.delete(url);
      throw e;
    }
  }

  function loadError(e) {
    const local = location.protocol === "file:";
    return `<p class="error">内容加载失败：${esc(e.message)}</p>` +
      (local ? `<p class="loading">直接双击打开 HTML 文件时浏览器不允许读取本地文件，请在项目目录运行 <code>python3 run.py web</code> 打开课程网页。</p>` : "");
  }

  function index(id) {
    return LESSONS.findIndex((l) => l.id === id);
  }

  // ---------- 路由：#/  #/s03  #/s03/code ----------
  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const lesson = byId[parts[0]];
    if (!lesson) return { lesson: null };
    const tab = TABS.some((t) => t.id === parts[1]) ? parts[1] : "learn";
    return { lesson, tab };
  }

  async function route() {
    document.body.classList.remove("nav-open");
    const { lesson, tab } = parseHash();
    window.scrollTo(0, 0);
    if (!lesson) {
      renderToc(null);
      renderHome();
      document.title = "Learn Claude Code · Agent Harness 课程";
      return;
    }
    document.title = `${lesson.id.toUpperCase()} ${lesson.zh} · Agent Harness 课程`;
    renderToc(lesson.id);
    $main.innerHTML = `<div class="hero"><div class="hero-watermark">${lesson.id.slice(1)}</div>
      <span class="pill">${lesson.id.toUpperCase()} · 第 ${index(lesson.id) + 1} 课</span>
      <h1 id="lessonTitle">${esc(lesson.zh)}</h1>
      <div class="en"><b>${esc(lesson.en)}</b> · ${esc(lesson.tip)}</div>
      <nav class="tabs">${TABS.map((t) =>
        `<a class="tab${t.id === tab ? " active" : ""}" href="#/${lesson.id}/${t.id}">${t.label}${t.note ? `<small>${t.note}</small>` : ""}</a>`).join("")}
      </nav></div><div class="panel" id="panel"><p class="loading">加载中…</p></div>`;
    const panel = document.getElementById("panel");
    fetchText(`${ROOT}${lesson.dir}/README.md`).then((md) => {
      const title = (md.match(/^# (.*)$/m) || [])[1] || "";
      const sub = title.replace(/^s\d\d[:：]\s*/i, "").split(/\s+—\s+|：/).pop();
      const h1 = document.getElementById("lessonTitle");
      if (h1 && sub && sub !== title) h1.textContent = `${lesson.zh}：${sub}`;
    }).catch(() => {});
    try {
      if (tab === "code") await renderCode(lesson, panel);
      else if (tab === "replay") await window.renderReplay(lesson, panel);
      else if (tab === "live") await window.renderLive(lesson, panel, fetchText);
      else await renderLearn(lesson, panel);
    } catch (e) {
      panel.innerHTML = loadError(e);
    }
  }

  // ---------- 侧栏 ----------
  function renderToc(activeId, sections) {
    let html = "";
    for (const st of STAGES) {
      html += `<div class="toc-stage">${esc(st.label)}</div>`;
      for (const l of LESSONS.slice(st.from - 1, st.to)) {
        const on = l.id === activeId;
        html += `<a class="toc-item${on ? " active" : ""}" href="#/${l.id}"><span class="num">${l.id.toUpperCase()}</span><span>${esc(l.zh)}</span></a>`;
        if (on && sections && sections.length) {
          html += `<div class="toc-sub">${sections.map((s) =>
            `<a href="#/${l.id}" data-sec="${s.id}">${esc(s.text)}</a>`).join("")}</div>`;
        }
      }
    }
    $toc.innerHTML = html;
    const active = $toc.querySelector(".toc-item.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  $toc.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-sec]");
    if (!a) return;
    e.preventDefault();
    document.body.classList.remove("nav-open");
    const el = document.getElementById(a.dataset.sec);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 讲解页滚动时同步高亮当前小节
  let spyFrame = 0;
  window.addEventListener("scroll", () => {
    cancelAnimationFrame(spyFrame);
    spyFrame = requestAnimationFrame(() => {
      const links = $toc.querySelectorAll(".toc-sub a");
      if (!links.length) return;
      let current = links[0].dataset.sec;
      for (const a of links) {
        const el = document.getElementById(a.dataset.sec);
        if (el && el.getBoundingClientRect().top < 140) current = a.dataset.sec;
      }
      links.forEach((a) => a.classList.toggle("active", a.dataset.sec === current));
    });
  }, { passive: true });

  // ---------- 首页 ----------
  function renderHome() {
    const stages = STAGES.map((st) => `<section class="stage-block">
      <div class="stage-title">${esc(st.label)}</div>
      <div class="cards">${LESSONS.slice(st.from - 1, st.to).map((l) => `
        <a class="card" href="#/${l.id}">
          <div class="num">${l.id.toUpperCase()}</div>
          <div class="zh">${esc(l.zh)}</div>
          <div class="en">${esc(l.en)}</div>
          <div class="tip">${esc(l.tip)}</div>
        </a>`).join("")}</div></section>`).join("");
    $main.innerHTML = `<div class="home">
      <div class="hero"><div class="hero-watermark">17</div>
        <span class="pill">LEARN CLAUDE CODE</span>
        <h1>从一个循环开始，造一个 Agent Harness</h1>
        <p class="lead">17 节课，从一个 <strong>while 循环</strong>出发，一步步加上工具、权限、钩子、规划、记忆、任务、团队和 MCP，最后拼成完整的 Agent 运行框架。每节课都有<strong>讲解</strong>、<strong>图示</strong>和<strong>本章新增代码对比</strong>。</p>
      </div>
      <div class="panel">${stages}</div></div>`;
  }

  // ---------- 讲解（README） ----------
  async function renderLearn(lesson, panel) {
    const md = await fetchText(`${ROOT}${lesson.dir}/README.md`);
    const lines = md.split("\n");
    if (/^# /.test(lines[0])) lines.shift(); // 标题已显示在页头
    // 去掉章节间的文字导航行（侧栏和底部翻页已经提供）
    const body = lines.filter((ln) => !(/→/.test(ln) && /^\s*(`?s\d\d`?|\[s\d\d\])/.test(ln))).join("\n");

    panel.innerHTML = `<article class="prose">${marked.parse(body)}</article>${pager(lesson, "learn")}`;
    const article = panel.querySelector(".prose");

    article.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src && !/^(https?:|data:|\/)/.test(src)) img.src = `${ROOT}${lesson.dir}/${src}`;
      img.loading = "lazy";
    });
    article.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      const m = href.match(/^\.\.\/(s\d\d)_[^/]*\/?$/) || href.match(/^\.\/(s\d\d)_[^/]*\/?$/);
      if (m && byId[m[1]]) a.setAttribute("href", `#/${m[1]}`);
      else if (/^https?:/.test(href)) a.target = "_blank";
      else if (!href.startsWith("#")) a.setAttribute("href", `${ROOT}${lesson.dir}/${href}`);
    });
    article.querySelectorAll("pre code").forEach((el) => {
      const lang = (el.className.match(/language-(\w+)/) || [])[1];
      if (lang && hljs.getLanguage(lang)) hljs.highlightElement(el);
    });
    const sections = [];
    article.querySelectorAll("h2, h3").forEach((h, i) => {
      h.id = `sec-${i}`;
      if (h.tagName === "H2") sections.push({ id: h.id, text: h.textContent });
    });
    renderToc(lesson.id, sections);
  }

  function pager(lesson, tab) {
    const i = index(lesson.id);
    const prev = LESSONS[i - 1], next = LESSONS[i + 1];
    const link = (l, cls, dir) => l
      ? `<a class="${cls}" href="#/${l.id}/${tab}"><div class="dir">${dir}</div><div class="t">${l.id.toUpperCase()} ${esc(l.zh)}</div></a>`
      : `<span style="flex:1"></span>`;
    return `<nav class="pager">${link(prev, "prev", "← 上一课")}${link(next, "next", "下一课 →")}</nav>`;
  }

  // ---------- 代码（与基准章节对比） ----------
  // 把 highlight.js 的整段输出拆成逐行 HTML，跨行的 span 在每行重新开合。
  function highlightLines(code) {
    const html = hljs.highlight(code, { language: "python", ignoreIllegals: true }).value;
    const lines = [];
    const open = [];
    let cur = "";
    for (const tok of html.match(/<span[^>]*>|<\/span>|\n|[^<\n]+/g) || []) {
      if (tok.startsWith("<span")) { open.push(tok); cur += tok; }
      else if (tok === "</span>") { open.pop(); cur += tok; }
      else if (tok === "\n") { lines.push(cur + "</span>".repeat(open.length)); cur = open.join(""); }
      else cur += tok;
    }
    lines.push(cur);
    return lines;
  }

  function diffRows(oldCode, newCode) {
    const newLines = highlightLines(newCode);
    if (oldCode == null) return newLines.map((html, i) => ({ t: "same", n: i + 1, html }));
    const oldLines = highlightLines(oldCode);
    const rows = [];
    let oi = 0, ni = 0;
    for (const part of Diff.diffLines(oldCode, newCode)) {
      for (let k = 0; k < part.count; k++) {
        if (part.added) { rows.push({ t: "add", n: ni + 1, html: newLines[ni] }); ni++; }
        else if (part.removed) { rows.push({ t: "del", o: oi + 1, html: oldLines[oi] }); oi++; }
        else { rows.push({ t: "same", n: ni + 1, html: newLines[ni] }); oi++; ni++; }
      }
    }
    return rows;
  }

  // “只看改动”：未改动且离改动较远的连续行折叠成一行
  function foldRows(rows) {
    const keep = rows.map(() => false);
    rows.forEach((r, i) => {
      if (r.t === "same") return;
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = true;
    });
    const out = [];
    let run = [];
    const flush = () => {
      if (run.length) out.push(run.length > 1 ? { t: "fold", rows: run } : run[0]);
      run = [];
    };
    rows.forEach((r, i) => {
      if (keep[i]) { flush(); out.push(r); } else run.push(r);
    });
    flush();
    return out;
  }

  function rowHtml(r, idx) {
    if (r.t === "fold") return `<tr class="fold" data-fold="${idx}"><td colspan="3">⋯ 未改动的 ${r.rows.length} 行（点击展开）</td></tr>`;
    const mark = r.t === "add" ? "+" : r.t === "del" ? "−" : "";
    const ln = r.t === "del" ? "" : r.n;
    return `<tr class="${r.t}"><td class="ln">${ln}</td><td class="mk">${mark}</td><td class="src">${r.html || " "}</td></tr>`;
  }

  async function renderCode(lesson, panel) {
    const st = codeState[lesson.id] || (codeState[lesson.id] = { base: lesson.base, mode: lesson.base ? "changes" : "full" });
    const i = index(lesson.id);
    const [cur, old] = await Promise.all([
      fetchText(`${ROOT}${lesson.dir}/code.py`),
      st.base ? fetchText(`${ROOT}${byId[st.base].dir}/code.py`) : Promise.resolve(null),
    ]);
    const rows = diffRows(old, cur);
    const adds = rows.filter((r) => r.t === "add").length;
    const dels = rows.filter((r) => r.t === "del").length;
    let shown = st.base && st.mode === "changes" ? foldRows(rows) : rows;

    const options = [`<option value="">不对比，只看代码</option>`].concat(
      LESSONS.slice(0, i).map((l) => `<option value="${l.id}"${l.id === st.base ? " selected" : ""}>${l.id.toUpperCase()} ${esc(l.zh)}${l.id === lesson.base ? "（推荐）" : ""}</option>`));

    const note = !lesson.base
      ? "这是第一课，下面的代码全部是新的。从下一课开始，这里会高亮每一课相对基准章节新增的代码。"
      : st.base
        ? `绿色是 <b>${lesson.id.toUpperCase()}</b> 相对 <b>${st.base.toUpperCase()} ${esc(byId[st.base].zh)}</b> 新增或改写的行，红色是删掉的行。` +
          (st.base === lesson.base ? "" : `（本课 README 以 ${lesson.base.toUpperCase()} 为基础，推荐用它对比。）`)
        : "当前不做对比，显示本课完整代码。";

    panel.innerHTML = `
      <div class="code-toolbar">
        <label>对比基准 <select id="baseSel"${lesson.base ? "" : " disabled"}>${options.join("")}</select></label>
        ${st.base ? `<span class="seg"><button data-mode="changes" class="${st.mode === "changes" ? "on" : ""}">只看改动</button><button data-mode="full" class="${st.mode === "full" ? "on" : ""}">完整代码</button></span>
        <span><span class="stat-add">+${adds}</span> / <span class="stat-del">−${dels}</span> 行</span>
        <span class="legend"><i class="a"></i>新增</span><span class="legend"><i class="d"></i>删除</span>` : ""}
        <span><code>${lesson.dir}/code.py</code> · 共 ${cur.split("\n").length} 行</span>
      </div>
      <p class="code-note">${note}</p>
      <div class="code-view"><table><tbody id="codeBody"></tbody></table></div>
      ${pager(lesson, "code")}`;

    const tbody = panel.querySelector("#codeBody");
    const draw = () => { tbody.innerHTML = shown.map(rowHtml).join(""); };
    draw();

    tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.fold");
      if (!tr) return;
      const k = Number(tr.dataset.fold);
      shown = shown.slice(0, k).concat(shown[k].rows, shown.slice(k + 1));
      draw();
    });
    panel.querySelector("#baseSel").addEventListener("change", (e) => {
      st.base = e.target.value || null;
      if (st.base && !st.mode) st.mode = "changes";
      renderCode(lesson, panel);
    });
    panel.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      st.mode = b.dataset.mode;
      renderCode(lesson, panel);
    }));
  }

  // ---------- 启动 ----------
  document.getElementById("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  document.getElementById("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  window.addEventListener("hashchange", route);
  route();
})();
