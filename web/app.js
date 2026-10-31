// 课程网页：直接读取仓库里的 README.md / images / code.py 渲染，不维护第二份内容。
(function () {
  "use strict";

  const ROOT = "../"; // 网页位于 web/，章节目录在仓库根目录
  const LESSONS = window.LESSONS;
  const STAGES = window.STAGES;
  const byId = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
  const GUIDES = window.GUIDES || [];
  const byGuide = Object.fromEntries(GUIDES.map((g) => [g.id, g]));
  const byGuideFile = Object.fromEntries(GUIDES.map((g) => [g.file.split("/").pop(), g]));
  // 侧栏和卡片已经有「案例」标签，标题里不再重复
  const guideName = (g) => g.zh.replace(/^案例：/, "");
  // 导读排在 s01 之前，其余文档排在 s17 之后
  const BEFORE = GUIDES.filter((g) => g.stage === "before");
  const AFTER = GUIDES.filter((g) => g.stage !== "before");
  const GROUP = { before: "开始之前", after: "学完之后 · 决策实战" };
  // 全站阅读顺序，底部翻页按它走
  const SEQ = [...BEFORE, ...LESSONS, ...AFTER];
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
    if (byGuide[parts[0]]) return { guide: byGuide[parts[0]] };
    const lesson = byId[parts[0]];
    if (!lesson) return { lesson: null };
    const tab = TABS.some((t) => t.id === parts[1]) ? parts[1] : "learn";
    return { lesson, tab };
  }

  async function route() {
    document.body.classList.remove("nav-open");
    slides = null;
    $slidebar.hidden = true;
    const { lesson, tab, guide } = parseHash();
    window.scrollTo(0, 0);
    if (guide) return renderGuide(guide);
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
  function tocGuides(list, label, activeId, sections) {
    if (!list.length) return "";
    let html = `<div class="toc-stage">${esc(label)}</div>`;
    for (const g of list) {
      const on = g.id === activeId;
      html += `<a class="toc-item${on ? " active" : ""}" href="#/${g.id}"><span class="num">${esc(g.tag)}</span><span>${esc(guideName(g))}</span></a>`;
      if (on && sections && sections.length) {
        html += `<div class="toc-sub">${sections.map((s) =>
          `<a href="#/${g.id}" data-sec="${s.id}">${esc(s.text)}</a>`).join("")}</div>`;
      }
    }
    return html;
  }

  function renderToc(activeId, sections) {
    let html = tocGuides(BEFORE, GROUP.before, activeId, sections);
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
    html += tocGuides(AFTER, GROUP.after, activeId, sections);
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
  function homeGuides(list, label) {
    return list.length ? `<section class="stage-block">
      <div class="stage-title">${esc(label)}</div>
      <div class="cards">${list.map((g) => `
        <a class="card" href="#/${g.id}">
          <div class="num">${esc(g.tag)}</div>
          <div class="zh">${esc(guideName(g))}</div>
          <div class="en">${esc(g.en)}</div>
          <div class="tip">${esc(g.tip)}</div>
        </a>`).join("")}</div></section>` : "";
  }

  function renderHome() {
    const stages = homeGuides(BEFORE, GROUP.before) + STAGES.map((st) => `<section class="stage-block">
      <div class="stage-title">${esc(st.label)}</div>
      <div class="cards">${LESSONS.slice(st.from - 1, st.to).map((l) => `
        <a class="card" href="#/${l.id}">
          <div class="num">${l.id.toUpperCase()}</div>
          <div class="zh">${esc(l.zh)}</div>
          <div class="en">${esc(l.en)}</div>
          <div class="tip">${esc(l.tip)}</div>
        </a>`).join("")}</div></section>`).join("") + homeGuides(AFTER, GROUP.after);
    $main.innerHTML = `<div class="home">
      <div class="hero"><div class="hero-watermark">17</div>
        <span class="pill">LEARN CLAUDE CODE</span>
        <h1>亲手造一遍 Agent&nbsp;Harness，学会做产品判断</h1>
        <p class="lead">写给 AI 零基础的同学和准 AI 产品经理。<strong>用自研的方式学</strong>：照着 Claude Code，从一个循环出发，把 16 个部件亲手造一遍，再在 s15 装成一个整体。<strong>学会的是判断</strong>：拿到一个需求，能说清楚该走哪条路、用哪些部件、规则怎么定。代码可以只看回放，每章末尾的<strong>「产品经理视角」</strong>是重点。第一次来，先读<a href="#/${BEFORE[0] ? BEFORE[0].id : "s01"}">第 0 课 · 导读</a>。</p>
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
      const g = /^\.\.\/guide\//.test(href) && byGuideFile[href.split("/").pop()];
      if (g) a.setAttribute("href", `#/${g.id}`);
      else if (m && byId[m[1]]) a.setAttribute("href", `#/${m[1]}`);
      else if (/^https?:/.test(href)) a.target = "_blank";
      else if (!href.startsWith("#")) a.setAttribute("href", `${ROOT}${lesson.dir}/${href}`);
    });
    article.querySelectorAll("pre code").forEach((el) => {
      const lang = (el.className.match(/language-(\w+)/) || [])[1];
      if (lang && hljs.getLanguage(lang)) hljs.highlightElement(el);
    });
    // 开头的「本章要学会的判断」和末尾的「产品经理视角」各自单独成块，和技术讲解区分开
    boxSection(article, "本章要学会的判断", "pm-brief");
    boxSection(article, "产品经理视角", "pm-view");
    tidyTables(article);
    const sections = [];
    article.querySelectorAll("h2, h3").forEach((h, i) => {
      h.id = `sec-${i}`;
      if (h.tagName === "H2") sections.push({ id: h.id, text: h.textContent });
    });
    renderToc(lesson.id, sections);
    if (teach) startSlides(article, lesson);
  }

  // 表格：外面套一层可以横向滑动的框，滑不到头时边缘显示阴影提示；
  // 记下列数（窄屏下列多的表保持最小宽度，横向滑动看）；
  // 同一页里表头相同的几张表统一列宽，上下对齐。
  function tidyTables(article) {
    const groups = new Map();
    article.querySelectorAll("table").forEach((t) => {
      const box = document.createElement("div");
      box.className = "table-box";
      box.innerHTML = '<div class="table-wrap"></div>';
      t.before(box);
      box.firstChild.append(t);
      box.firstChild.addEventListener("scroll", () => tableShadow(box), { passive: true });
      const heads = [...t.rows[0].cells].map((c) => c.textContent.trim());
      t.dataset.cols = heads.length >= 5 ? "many" : String(heads.length);
      // 第一列都是短标签（部件名、档位、方案名）时不折行；有整句话时照常折行
      if ([...t.rows].every((r) => r.cells[0] && r.cells[0].textContent.trim().length <= 12)) t.classList.add("key-first");
      const key = heads.join("|");
      groups.set(key, [...(groups.get(key) || []), t]);
    });
    for (const tables of groups.values()) {
      if (tables.length < 2) continue;
      const widths = [...tables[0].rows[0].cells].map(() => 0);
      for (const t of tables) [...t.rows[0].cells].forEach((c, i) => { widths[i] = Math.max(widths[i], c.getBoundingClientRect().width); });
      const total = widths.reduce((a, b) => a + b, 0);
      if (!total) continue;
      const cols = widths.map((w) => `<col style="width:${(w / total * 100).toFixed(2)}%">`).join("");
      tables.forEach((t) => { t.insertAdjacentHTML("afterbegin", `<colgroup>${cols}</colgroup>`); t.classList.add("aligned"); });
    }
    article.querySelectorAll(".table-box").forEach(tableShadow);
  }

  function tableShadow(box) {
    const w = box.firstChild;
    box.classList.toggle("more-left", w.scrollLeft > 2);
    box.classList.toggle("more-right", w.scrollLeft + w.clientWidth < w.scrollWidth - 2);
  }
  window.addEventListener("resize", () => document.querySelectorAll(".table-box").forEach(tableShadow), { passive: true });

  function boxSection(article, title, className) {
    const head = [...article.querySelectorAll("h2")].find((h) => h.textContent.trim() === title);
    if (!head) return;
    const box = document.createElement("section");
    box.className = className;
    head.before(box);
    box.append(head);
    // 收进下一个 h2 或分隔线之前的所有内容
    for (let n = box.nextSibling; n && !/^(H2|HR)$/.test(n.nodeName); n = box.nextSibling) box.append(n);
  }

  // 底部翻页：按 SEQ 找前后一篇，章节和文档之间也能接上
  function pager(item, tab) {
    const i = SEQ.indexOf(item);
    return `<nav class="pager">${pageLink(item, SEQ[i - 1], "prev", tab)}${pageLink(item, SEQ[i + 1], "next", tab)}</nav>`;
  }

  function pageLink(from, to, cls, tab) {
    if (!to) return cls === "prev"
      ? `<a class="prev" href="#/"><div class="dir">← 返回</div><div class="t">课程首页</div></a>`
      : `<span style="flex:1"></span>`;
    const isDoc = !!byGuide[to.id], fromDoc = !!byGuide[from.id];
    const href = isDoc ? `#/${to.id}` : `#/${to.id}/${tab || "learn"}`;
    const title = isDoc ? to.zh : `${to.id.toUpperCase()} ${to.zh}`;
    const dir = cls === "prev" ? (isDoc ? "← 上一篇" : "← 上一课")
      : isDoc ? (fromDoc ? "下一篇 →" : "学完了，接着读 →")
      : (fromDoc ? "开始上课 →" : "下一课 →");
    return `<a class="${cls}" href="${href}"><div class="dir">${dir}</div><div class="t">${esc(title)}</div></a>`;
  }

  // 导读、名词表这类「开始之前」的页面：表格变卡片，每节带序号，步骤带圆形数字，看起来不那么密
  function decorateIntro(article) {
    article.querySelectorAll("hr").forEach((h) => h.remove());
    // 整段加粗的话：第一段是大字引言，后面的是小节标题
    let leads = 0;
    article.querySelectorAll("p > strong:only-child").forEach((st) => {
      const para = st.parentElement;
      if (para.textContent.trim() !== st.textContent.trim()) return; // 段落里还有别的字，不算
      para.classList.add(leads++ ? "g-sub" : "g-lead");
    });
    // 列数不多的表格改成卡片
    article.querySelectorAll("table").forEach((t) => {
      const heads = [...t.rows[0].cells].map((c) => c.textContent.trim());
      if (heads.length > 4 || t.rows.length < 2) return;
      const grid = document.createElement("div");
      grid.className = `g-cards cols-${heads.length}`;
      for (const row of [...t.rows].slice(1)) {
        const cells = [...row.cells];
        const card = document.createElement("div");
        card.className = "g-card";
        card.innerHTML = `<div class="g-card-t">${cells[0].innerHTML}</div>` + cells.slice(1).map((c, k) =>
          `<div class="g-card-l">${heads.length > 2 && heads[k + 1] ? `<span>${esc(heads[k + 1])}</span>` : ""}${c.innerHTML}</div>`).join("");
        grid.append(card);
      }
      t.replaceWith(grid);
    });
    // 每个 h2 一节，带两位序号
    let sec = null, n = 0;
    for (const node of [...article.children]) {
      if (node.tagName === "H2") {
        n += 1;
        sec = document.createElement("section");
        sec.className = "g-sec" + (/三个问题/.test(node.textContent) ? " g-ask" : "");
        sec.dataset.n = String(n).padStart(2, "0");
        article.append(sec);
      }
      if (sec) sec.append(node);
    }
    // 结尾那句「从 s01 开始」做成按钮
    const cta = article.querySelector(".g-sec:last-child p:last-child a");
    if (cta) cta.classList.add("g-cta");
  }

  // ---------- 导读与决策实战（guide/ 下的文档） ----------
  async function renderGuide(guide) {
    document.title = `${guide.zh} · Agent Harness 课程`;
    renderToc(guide.id);
    const before = guide.stage === "before";
    $main.innerHTML = `<div class="hero"><div class="hero-watermark">${before ? "00" : "PM"}</div>
      <span class="pill">${esc(before ? GROUP.before : GROUP.after)}</span>
      <h1>${esc(guide.zh)}</h1>
      <div class="en"><b>${esc(guide.en)}</b> · ${esc(guide.tip)}</div></div>
      <div class="panel" id="panel"><p class="loading">加载中…</p></div>`;
    const panel = document.getElementById("panel");
    try {
      const md = await fetchText(`${ROOT}${guide.file}`);
      const body = md.replace(/^# .*\n/, "");
      panel.innerHTML = `<article class="prose guide${guide.stage === "before" ? " intro" : ""}">${marked.parse(body)}</article>${pager(guide, "learn")}`;
      const article = panel.querySelector(".prose");
      if (guide.stage === "before") decorateIntro(article);
      article.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href");
        const g = byGuideFile[href.split("/").pop()];
        const m = href.match(/(s\d\d)_[^/]*\/?$/);
        if (g) a.setAttribute("href", `#/${g.id}`);
        else if (m && byId[m[1]]) a.setAttribute("href", `#/${m[1]}`);
        else if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
      });
      tidyTables(article);
      const sections = [];
      article.querySelectorAll("h2, h3").forEach((h, i) => {
        h.id = `sec-${i}`;
        if (h.tagName === "H2") sections.push({ id: h.id, text: h.textContent });
      });
      renderToc(guide.id, sections);
      if (teach) startSlides(article, guide);
    } catch (e) {
      panel.innerHTML = loadError(e);
    }
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

  // ---------- 上课模式：大字号、收起代码、按小节一页一页讲 ----------
  // 每个 h2 / h3 开一页；带框的小节（本章要学会的判断、产品经理视角）翻到它的 h3 时，框标题跟着显示。
  // 讲到最后一页再往后翻，进入下一篇的第一页；往前翻则进入上一篇的最后一页。
  const TEACH_KEY = "course-teach-mode";
  const FOLD = /\blanguage-(python|bash|sh|json)\b/; // 程序代码默认收起；text 图示照常显示
  const $teachBtns = document.querySelectorAll("[data-teach]");
  const $slidebar = document.getElementById("slidebar");
  let teach = localStorage.getItem(TEACH_KEY) === "1";
  let slides = null;
  let enterAtEnd = false;

  function applyTeach() {
    document.body.classList.toggle("teach", teach);
    $teachBtns.forEach((b) => {
      b.textContent = teach ? "退出上课模式" : "上课模式";
      b.setAttribute("aria-pressed", String(teach));
    });
  }

  function startSlides(article, item) {
    article.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      if (!code || !FOLD.test(code.className)) return;
      const fold = document.createElement("details");
      fold.className = "code-fold";
      fold.innerHTML = "<summary>代码已收起，点开查看</summary>";
      pre.before(fold);
      fold.append(pre);
    });
    const units = [];
    for (const n of [...article.children]) {
      if (n.tagName === "SECTION") for (const c of [...n.children]) units.push({ node: c, box: n });
      else units.push({ node: n, box: null });
    }
    const pages = [[]];
    let boxHead = null;
    for (const { node, box } of units) {
      if (node.tagName === "HR") { node.hidden = true; continue; }
      if (/^H[23]$/.test(node.tagName)) {
        if (pages[pages.length - 1].length) pages.push([]);
        if (node.tagName === "H2") boxHead = box ? node : null;
        else if (box && boxHead) pages[pages.length - 1].push(boxHead);
      }
      pages[pages.length - 1].push(node);
    }
    // 开头没有标题的引言太短，并进下一页
    if (pages.length > 1 && !pages[0].some((n) => /^H[23]$/.test(n.tagName))) pages.splice(0, 2, [...pages[0], ...pages[1]]);
    const boxes = [...new Set(units.filter((u) => u.box).map((u) => u.box))];
    slides = { pages, boxes, item, all: units.map((u) => u.node).filter((n) => n.tagName !== "HR") };
    showSlide(enterAtEnd ? pages.length - 1 : 0);
    enterAtEnd = false;
  }

  function showSlide(i) {
    slides.i = i;
    const on = new Set(slides.pages[i]);
    slides.all.forEach((n) => { n.hidden = !on.has(n); });
    slides.boxes.forEach((b) => { b.hidden = ![...b.children].some((c) => on.has(c)); });
    window.scrollTo(0, 0);
    const { item, pages } = slides;
    const name = byGuide[item.id] ? item.zh : `${item.id.toUpperCase()} ${item.zh}`;
    $slidebar.innerHTML = `<button type="button" data-go="-1">← 上一页</button>
      <span class="where">${esc(name)} · ${i + 1} / ${pages.length}</span>
      <button type="button" data-go="1">下一页 →</button>`;
    $slidebar.hidden = false;
  }

  function go(step) {
    if (!slides) return;
    const j = slides.i + step;
    if (j >= 0 && j < slides.pages.length) return showSlide(j);
    const to = SEQ[SEQ.indexOf(slides.item) + step];
    if (!to) return;
    enterAtEnd = step < 0;
    location.hash = byGuide[to.id] ? `#/${to.id}` : `#/${to.id}/learn`;
  }

  $teachBtns.forEach((b) => b.addEventListener("click", () => {
    teach = !teach;
    localStorage.setItem(TEACH_KEY, teach ? "1" : "0");
    applyTeach();
    route();
  }));
  $slidebar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) go(Number(b.dataset.go));
  });
  document.addEventListener("keydown", (e) => {
    if (!slides || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    // 焦点在按钮或「展开代码」上时，空格留给它自己
    if (e.key === " " && /^(BUTTON|SUMMARY|A)$/.test(e.target.tagName)) return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
  });
  applyTeach();

  // ---------- 启动 ----------
  document.getElementById("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  document.getElementById("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  window.addEventListener("hashchange", route);
  route();
})();
