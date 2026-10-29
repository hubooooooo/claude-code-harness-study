// 实时运行：通过本地服务（web/live.py）在你的电脑上运行本课 code.py，边跑边展示。
(function () {
  "use strict";

  const { prepare, fromRaw, stepHtml, ctxHtml, esc } = window.TraceView;
  const sessions = {}; // 切换标签后回来还能接着看：lesson -> { id, raw }
  const STATE = {
    running: ["运行中…", "run"],
    prompt: ["等你输入", "wait"],
    approval: ["等你确认权限", "ask"],
    exited: ["程序已退出", "off"],
  };

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* 静态托管没有 /api */ }
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  }

  async function suggestions(lesson, fetchText) {
    try {
      const all = JSON.parse(await fetchText("live_prompts.json"));
      const sc = all[lesson.id];
      return sc ? sc.runs.flatMap((r) => r.steps.filter((s) => s.send).map((s) => s.send)) : [];
    } catch (e) {
      return [];
    }
  }

  window.renderLive = async function (lesson, panel, fetchText) {
    let st;
    try {
      st = await api("GET", "/api/status");
    } catch (e) {
      panel.innerHTML = `<div class="prose"><p>实时运行需要在你自己的电脑上打开课程网页。</p>
        <p>Mac：双击项目里的「启动.command」，在菜单里输入 <code>web</code> 回车；或在项目目录运行 <code>python3 run.py web</code>。</p></div>`;
      return;
    }
    if (!st.venv) {
      panel.innerHTML = `<div class="prose"><p>还没有安装运行所需的依赖。</p>
        <p>请先双击「启动.command」（或运行 <code>python3 run.py</code>）完成首次安装，再回到这里刷新页面。</p></div>`;
      return;
    }
    if (!st.key) return renderKeyForm(lesson, panel, fetchText);

    const tips = await suggestions(lesson, fetchText);
    const sess = sessions[lesson.id] || (sessions[lesson.id] = { id: null, raw: [] });
    let state = sess.id ? "running" : null;
    let rendered = 0;
    let timer = null;

    panel.innerHTML = `
      <div class="lv-head">
        <p class="lv-intro">在你的电脑上运行 <code>${lesson.dir}/code.py</code>，每一步都会显示在下面。
          运行在一份临时的项目副本里，模型执行的命令不会改动你的项目文件；同一课多次运行共用这份副本。</p>
        <div class="lv-actions">
          <button class="btn primary" data-act="start">▶ 开始运行</button>
          <button class="btn" data-act="stop">■ 停止</button>
          <button class="btn" data-act="reset" title="删除这一课的临时副本（包括记忆、任务等文件）后重新开始">重置工作区</button>
          <span class="lv-state off" id="lvState">未运行</span>
        </div>
      </div>
      <div class="lv-approval" id="lvApproval" hidden>
        <div><b>程序请求权限</b><pre id="lvAsk"></pre></div>
        <div class="lv-yn"><button class="btn primary" data-yn="y">允许（y）</button><button class="btn danger" data-yn="n">拒绝（n）</button></div>
      </div>
      <form class="lv-input" id="lvForm">
        <input id="lvText" autocomplete="off" placeholder="先点「开始运行」，然后在这里输入要交给 Agent 的任务">
        <button class="btn primary" type="submit">发送</button>
      </form>
      ${tips.length ? `<div class="lv-tips"><span>试试：</span>${tips.map((t) => `<button class="lv-tip" type="button">${esc(t)}</button>`).join("")}</div>` : ""}
      <p class="error" id="lvErr" hidden></p>
      <div class="rp-grid">
        <section class="lv-stream" id="lvStream"><p class="loading">还没有开始运行。</p></section>
        <aside class="rp-ctx" id="lvCtx"><div class="ctx-k">messages[]</div><p class="ctx-tip">运行后这里显示每次发给模型的消息列表。</p></aside>
      </div>`;

    const $ = (sel) => panel.querySelector(sel);
    const $stream = $("#lvStream"), $ctx = $("#lvCtx"), $state = $("#lvState");
    const $text = $("#lvText"), $form = $("#lvForm"), $err = $("#lvErr");
    const $approval = $("#lvApproval");

    function showError(msg) { $err.hidden = !msg; $err.textContent = msg || ""; }

    function setState(s) {
      state = s;
      const [label, cls] = STATE[s] || ["未运行", "off"];
      $state.textContent = label;
      $state.className = `lv-state ${cls}`;
      $text.disabled = s !== "prompt";
      $form.querySelector("button").disabled = s !== "prompt";
      $approval.hidden = s !== "approval";
      if (s === "prompt") $text.placeholder = "输入任务后回车，例如下面的提示";
      if (s === "prompt" && document.activeElement !== $text) $text.focus({ preventScroll: true });
    }

    function draw() {
      const trace = fromRaw(sess.raw);
      const { llms, steps } = prepare(trace);
      if (!steps.length) return;
      if (rendered === 0) $stream.innerHTML = "";
      // 最后一张卡片可能还在增长（终端输出），从它开始重画
      const from = Math.max(0, rendered - 1);
      $stream.querySelectorAll(".rp-step").forEach((el, k) => { if (k >= from) el.remove(); });
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
      $stream.insertAdjacentHTML("beforeend", steps.slice(from).map((s) =>
        `<div class="rp-step ${s.t}">${stepHtml(s, trace, llms)}</div>`).join(""));
      rendered = steps.length;
      $ctx.innerHTML = ctxHtml(steps, steps.length - 1);
      const list = $ctx.querySelector(".ctx-list");
      if (list) list.scrollTop = list.scrollHeight;
      if (atBottom) window.scrollTo(0, document.body.scrollHeight);
      const ask = [...steps].reverse().find((s) => s.t === "console");
      $("#lvAsk").textContent = ask ? ask.text.split("\n").filter((l) => !/Allow\?/.test(l)).slice(-3).join("\n") : "";
    }

    async function poll() {
      if (!document.body.contains(panel)) return clearInterval(timer);
      if (!sess.id) return;
      try {
        const r = await api("GET", `/api/run/${sess.id}?from=${sess.raw.length}`);
        if (r.events.length) { sess.raw.push(...r.events); draw(); }
        setState(r.state);
        if (r.state === "exited") clearInterval(timer);
      } catch (e) {
        clearInterval(timer);
        setState("exited");
        showError(e.message);
      }
    }

    function follow() {
      clearInterval(timer);
      timer = setInterval(poll, 700);
      poll();
    }

    async function start(reset) {
      showError("");
      try {
        const r = await api("POST", "/api/run", { lesson: lesson.id, reset });
        sess.id = r.id;
        sess.raw = [];
        rendered = 0;
        $stream.innerHTML = `<p class="loading">正在启动…</p>`;
        setState("running");
        follow();
      } catch (e) {
        showError(e.message);
      }
    }

    async function send(text) {
      if (!sess.id) return;
      showError("");
      try {
        await api("POST", `/api/run/${sess.id}/input`, { text });
        setState("running");
        poll();
      } catch (e) {
        showError(e.message);
      }
    }

    panel.querySelector(".lv-actions").addEventListener("click", async (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act === "start") start(false);
      if (act === "reset") {
        if (confirm("会删除这一课的临时副本（包括记忆、任务等运行产生的文件），然后重新开始。继续吗？")) start(true);
      }
      if (act === "stop" && sess.id) {
        await api("POST", `/api/run/${sess.id}/stop`, {}).catch(() => {});
        poll();
      }
    });
    $approval.addEventListener("click", (e) => {
      const yn = e.target.closest("[data-yn]")?.dataset.yn;
      if (yn) send(yn);
    });
    $form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $text.value.trim();
      if (!text || state !== "prompt") return;
      $text.value = "";
      send(text);
    });
    panel.querySelectorAll(".lv-tip").forEach((b) => b.addEventListener("click", () => {
      $text.value = b.textContent;
      if (state === "prompt") $text.focus();
    }));

    setState(state);
    if (sess.id) { draw(); follow(); }
  };

  function renderKeyForm(lesson, panel, fetchText) {
    panel.innerHTML = `<div class="lv-key">
      <h3>先设置 API Key</h3>
      <p>实时运行要调用大模型。课程默认使用 DeepSeek：在 <a href="https://platform.deepseek.com/" target="_blank" rel="noopener">platform.deepseek.com</a> 注册登录，创建 API Key 并复制，粘贴到下面。</p>
      <form id="keyForm"><input id="keyInput" type="password" autocomplete="off" placeholder="粘贴你的 API Key">
        <button class="btn primary" type="submit">保存</button></form>
      <p class="loading">Key 只保存在你电脑上项目目录的 <code>.env</code> 文件里，不会上传。</p>
      <p class="error" id="keyErr" hidden></p></div>`;
    panel.querySelector("#keyForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = panel.querySelector("#keyErr");
      try {
        await api("POST", "/api/key", { key: panel.querySelector("#keyInput").value });
        window.renderLive(lesson, panel, fetchText);
      } catch (x) {
        err.hidden = false;
        err.textContent = x.message;
      }
    });
  }
})();
