// 实时运行：通过本地服务（web/live.py）在你的电脑上运行本课 code.py，边跑边展示。
(function () {
  "use strict";

  const { prepare, fromRaw, stepHtml, ctxHtml, esc, blockText, short } = window.TraceView;
  const Chat = window.ChatView;
  const sessions = {}; // 切换标签后回来还能接着看：lesson -> { id, raw }

  // 把一条运行事件画成群聊里的几条消息：谁对谁说了什么
  function chatStep(s, trace, llms) {
    const { message, divider } = Chat;
    if (s.t === "user") return message({ who: "you", to: "prog", text: s.text });
    if (s.t === "approval") {
      const yes = /^y/i.test(s.text);
      return message({ who: "you", to: "perm", text: s.text }) +
        message({ who: "perm", to: "prog", kind: yes ? "ok" : "deny", text: yes ? "放行，程序去执行" : "不执行。把「权限被拒绝」作为结果交回给模型" });
    }
    if (s.t === "console") {
      if (/\[blocked\]|\[已拦截\]/.test(s.text)) return message({ who: "perm", to: "prog", kind: "deny", text: s.text });
      if (/\[permission\]|\[权限\]/.test(s.text)) return message({ who: "perm", to: "you", kind: "ask", text: s.text });
      return message({ who: "prog", kind: "term", text: s.text, cls: "quiet" });
    }
    // 一次模型调用：先是上一轮工具的执行结果，然后程序把记录本发给模型，模型回复
    let html = "";
    for (const m of s.add || []) {
      const blocks = Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result") : [];
      for (const b of blocks) html += message({ who: "pc", to: "prog", kind: "result", text: short(blockText(b), 400) || "(no output)" });
    }
    const tools = trace.toolsets[s.tools] || [];
    html += divider(`第 ${s.n + 1} 次调用模型`);
    html += message({ who: "prog", to: "model", kind: "request",
      text: `记录本 messages ${s.msgs.length} 条（新增 ${(s.add || []).length} 条）＋ 工具清单：${tools.length ? tools.join("、") : "无"}` });
    const r = s.response || {};
    if (s.error) html += message({ who: "model", to: "prog", kind: "deny", text: `调用出错：${s.error}` });
    for (const b of r.content || []) {
      if (b.type === "thinking" && b.thinking) html += message({ who: "model", think: true, text: b.thinking });
      else if (b.type === "text" && b.text.trim()) html += message({ who: "model", to: "prog", kind: "text", text: b.text });
      else if (b.type === "tool_use") html += message({ who: "model", to: "prog", kind: "tool",
        html: `请调用工具 <b>${esc(b.name)}</b><pre class="ch-args">${esc(JSON.stringify(b.input, null, 2))}</pre>` });
    }
    const stop = r.stop_reason === "tool_use" ? "回复里有工具调用 → 先过权限检查，再去执行；结果写回记录本，再调用一次模型"
      : r.stop_reason ? "回复里没有工具调用 → 这一轮结束，把回答显示给你" : "";
    if (stop) html += message({ who: "prog", think: true, text: stop });
    html += `<details class="ch-detail"><summary>第 ${s.n + 1} 次调用的详细信息：tokens、耗时、完整请求</summary><div class="rp-step llm">${stepHtml(s, trace, llms)}</div></details>`;
    return html;
  }
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
      <div class="lv-bar">
        ${tips.length ? `<div class="lv-tips"><span>点一下就运行：</span>${tips.map((t) => `<button class="lv-tip" type="button">${esc(t)}</button>`).join("")}</div>` : ""}
        <div class="lv-status"><span class="lv-state off" id="lvState">未运行</span>
          <button type="button" class="lv-link" data-act="restart">重新开始</button>
          <button type="button" class="lv-link" data-act="reset" title="删掉这一课运行产生的文件（记忆、任务等）后重新开始">清空工作区</button></div>
      </div>
      <form class="lv-input lv-own" id="lvForm">
        <span class="lv-own-t">或者自己出一个任务：</span>
        <input id="lvText" autocomplete="off" placeholder="输入后回车发送">
        <button class="btn" type="submit">发送</button>
      </form>
      <p class="error" id="lvErr" hidden></p>
      <section class="lv-stream ch-area" id="lvStream">${Chat.members(["you", "prog", "model", "pc"])}
        <div class="ch-list" id="lvChat"><p class="loading">输入一个任务，程序会在你的电脑上运行本课的 code.py，这里像群聊一样显示谁对谁说了什么。<br>运行在一份临时副本里，不会改动你的项目文件。</p></div>
        <div class="ch-ask" id="lvApproval" hidden><div class="ch-ask-t">程序停下来问你：</div><pre id="lvAsk"></pre>
          <div class="lv-yn"><button class="btn primary" data-yn="y">允许</button><button class="btn" data-yn="n">拒绝</button></div></div>
      </section>
      <details class="lv-fold"><summary>模型的记录本 messages[]：每次发给模型的全部内容</summary>
        <aside class="rp-ctx lv-ctx" id="lvCtx"><p class="ctx-tip">运行后这里显示。</p></aside></details>`;

    const $ = (sel) => panel.querySelector(sel);
    const $stream = $("#lvStream"), $ctx = $("#lvCtx"), $state = $("#lvState");
    const $text = $("#lvText"), $form = $("#lvForm"), $err = $("#lvErr");
    const $approval = $("#lvApproval");
    let pending = null; // 程序还没启动时输入的任务，启动好了再发

    function showError(msg) { $err.hidden = !msg; $err.textContent = msg || ""; }

    function setState(s) {
      state = s;
      const [label, cls] = STATE[s] || ["未运行", "off"];
      $state.textContent = label;
      $state.className = `lv-state ${cls}`;
      const busy = s === "running" || s === "approval";
      $text.disabled = busy;
      $form.querySelector("button").disabled = busy;
      $approval.hidden = s !== "approval";
      if (s === "prompt" && document.activeElement !== $text) $text.focus({ preventScroll: true });
    }

    function draw() {
      const trace = fromRaw(sess.raw);
      const { llms, steps } = prepare(trace);
      if (!steps.length) return;
      const $chat = $("#lvChat");
      if (rendered === 0) $chat.innerHTML = "";
      // 最后一步可能还在增长（终端输出），从它开始重画
      const from = Math.max(0, rendered - 1);
      $chat.querySelectorAll(".ch-step").forEach((el, k) => { if (k >= from) el.remove(); });
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
      $chat.insertAdjacentHTML("beforeend", steps.slice(from).map((s) =>
        `<div class="ch-step">${chatStep(s, trace, llms)}</div>`).join(""));
      rendered = steps.length;
      // 群成员：出现过权限确认，就把「权限检查」请进群；最近一步说话的人亮起来
      const ids = ["you", "prog", "model", "pc"];
      if (steps.some((s) => s.t === "approval" || (s.t === "console" && /\[permission\]|\[blocked\]|\[权限\]|\[已拦截\]/.test(s.text)))) ids.push("perm");
      const lastStep = $chat.querySelector(".ch-step:last-child");
      const active = new Set([...(lastStep ? lastStep.querySelectorAll(".ch-av") : [])].map((a) => a.className.replace(/.*a-(\w+).*/, "$1")));
      $stream.querySelector(".ch-head").outerHTML = Chat.members(ids, active);
      $ctx.innerHTML = ctxHtml(steps, steps.length - 1);
      const list = $ctx.querySelector(".ctx-list");
      if (list) list.scrollTop = list.scrollHeight;
      if (atBottom) window.scrollTo(0, document.body.scrollHeight);
      const ask = [...steps].reverse().find((s) => s.t === "console");
      $("#lvAsk").textContent = ask ? ask.text.split("\n").filter((l) => !/Allow\?|允许执行吗/.test(l)).slice(-3).join("\n") : "";
    }

    async function poll() {
      if (!document.body.contains(panel)) return clearInterval(timer);
      if (!sess.id) return;
      try {
        const r = await api("GET", `/api/run/${sess.id}?from=${sess.raw.length}`);
        if (r.events.length) { sess.raw.push(...r.events); draw(); }
        setState(r.state);
        if (r.state === "exited") clearInterval(timer);
        if (r.state === "prompt" && pending) { const t = pending; pending = null; send(t); }
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
        $stream.querySelector(".ch-head").outerHTML = Chat.members(["you", "prog", "model", "pc"]);
        $("#lvChat").innerHTML = '<p class="loading">正在启动…</p>';
        setState("running");
        follow();
      } catch (e) {
        showError(e.message);
      }
    }

    // 程序没启动或已经退出时，先启动，启动好了再把任务发过去
    async function send(text) {
      showError("");
      if (!sess.id || state === "exited" || state === null) { pending = text; return start(false); }
      try {
        await api("POST", `/api/run/${sess.id}/input`, { text });
        setState("running");
        poll();
      } catch (e) {
        showError(e.message);
      }
    }

    panel.querySelector(".lv-status").addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "reset" && !confirm("会删掉这一课运行产生的文件（记忆、任务等），然后重新开始。继续吗？")) return;
      if (sess.id) await api("POST", `/api/run/${sess.id}/stop`, {}).catch(() => {});
      start(act === "reset");
    });
    $approval.addEventListener("click", (e) => {
      const yn = e.target.closest("[data-yn]")?.dataset.yn;
      if (yn) send(yn);
    });
    $form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $text.value.trim();
      if (!text || state === "running" || state === "approval") return;
      $text.value = "";
      send(text);
    });
    // 点一下示例就直接发送；程序正忙时只填进输入框
    panel.querySelectorAll(".lv-tip").forEach((b) => b.addEventListener("click", () => {
      $text.value = b.textContent;
      if (state === "running" || state === "approval") return;
      $form.requestSubmit();
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
