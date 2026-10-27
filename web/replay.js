// 运行回放：播放 web/replay/traces/<章节>.json（由 web/replay/record.py 录制）。
(function () {
  "use strict";

  // 常见调用位置的中文说明；没列到的显示函数名
  const CALLERS = {
    agent_loop: "主循环", run_agent_turn_locked: "主循环", submit: "主循环", run_turn: "主循环",
    run_subagent: "子 Agent", subagent_loop: "子 Agent",
    compact_history: "历史摘要", summarize: "历史摘要", reactive_compact: "出错后补救压缩",
    select_memories: "记忆选择", extract_memories: "记忆提取", consolidate_memories: "记忆整理", consolidate: "记忆整理",
    evaluate: "目标判断器", evaluate_after_turn: "目标判断器",
    teammate_loop: "队友", run_teammate: "队友", work: "队友",
    run_cli: "主循环", run: "工作流子 Agent",
    summarize_history: "历史摘要", select_relevant_memories: "记忆选择", remember_after_turn: "记忆提取", _evaluate_sync: "目标判断器",
  };
  const ROLE = { user: "用户", assistant: "模型" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  const short = (s, n) => { s = String(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
  const num = (n) => Number(n || 0).toLocaleString("zh-CN");

  function callerLabel(chain) {
    for (const name of chain || []) if (CALLERS[name]) return `${CALLERS[name]} · ${name}()`;
    const named = (chain || []).find((n) => !n.startsWith("<"));
    return named ? `${named}()` : "主循环（在后台线程中调用）";
  }

  function blockText(b) {
    if (typeof b === "string") return b;
    if (b.type === "text") return b.text || "";
    if (b.type === "thinking") return `（思考）${b.thinking || ""}`;
    if (b.type === "redacted_thinking") return "（思考内容已隐藏）";
    if (b.type === "tool_use") return `${b.name}(${JSON.stringify(b.input)})`;
    if (b.type === "tool_result") {
      const c = b.content;
      return Array.isArray(c) ? c.map(blockText).join("\n") : String(c == null ? "" : c);
    }
    return JSON.stringify(b);
  }

  function msgChars(m) {
    const c = m.content;
    return (typeof c === "string" ? c : (c || []).map(blockText).join("")).length;
  }

  // 一条消息在右侧 messages[] 里的样子
  function msgItem(m, i, isNew) {
    const c = m.content;
    let kind = ROLE[m.role] || m.role;
    let preview;
    if (typeof c === "string") preview = c;
    else {
      const blocks = c || [];
      if (blocks.length && blocks.every((b) => b.type === "tool_result")) kind = "工具结果";
      // 预览里不显示思考过程，点开后的完整内容里才有
      preview = blocks.filter((b) => !/thinking/.test(b.type)).map((b) =>
        b.type === "tool_use" ? `🔧 ${b.name}` : b.type === "tool_result" ? `↩ ${blockText(b)}` : blockText(b)).join("  ");
    }
    const full = typeof c === "string" ? c : (c || []).map((b) =>
      b.type === "tool_use" ? `[tool_use] ${b.name} ${JSON.stringify(b.input, null, 2)}` :
      b.type === "tool_result" ? `[tool_result ${b.tool_use_id || ""}]\n${blockText(b)}` : blockText(b)).join("\n\n");
    return `<details class="msg ${m.role}${isNew ? " new" : ""}">
      <summary><span class="idx">${i}</span><span class="role">${esc(kind)}</span><span class="pv">${esc(short(preview, 70))}</span></summary>
      <pre>${esc(full)}</pre></details>`;
  }

  const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

  function cleanConsole(text) {
    return text.replace(ANSI, "").split("\n")
      .filter((ln) => !/^\s*\S*\s?>>\s*$/.test(ln) && !/^\s*Allow\? \[y\/N\]\s*$/.test(ln))
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // 录制文件（base/keep/add 去重格式）或实时事件 → 播放用的 steps；每个 llm 步骤带完整 msgs
  function prepare(trace) {
    const llms = trace.events.filter((e) => e.t === "llm");
    llms.forEach((e, n) => {
      if (!e.msgs) e.msgs = (e.base >= 0 ? llms[e.base].msgs.slice(0, e.keep) : []).concat(e.add || []);
      e.n = n;
    });
    const steps = trace.events
      .map((e) => (e.t === "console" ? { ...e, text: cleanConsole(e.text) } : e))
      .filter((e) => e.t !== "console" || e.text);
    return { llms, steps };
  }

  // 本地实时运行时 hook 写出的原始事件 → 与录制文件同结构的 trace
  function fromRaw(raw) {
    const trace = { systems: [], toolsets: [], events: [] };
    const seen = [];
    const key = (x) => JSON.stringify(x);
    for (const ev of raw) {
      const last = trace.events[trace.events.length - 1];
      if (ev.type === "console") {
        if (last && last.t === "console" && last.thread === ev.thread) last.text += ev.text;
        else trace.events.push({ t: "console", thread: ev.thread, text: ev.text });
      } else if (ev.type === "input") {
        trace.events.push({ t: ev.kind, thread: ev.thread, text: ev.text, prompt: (ev.prompt || "").replace(ANSI, "") });
      } else if (ev.type === "llm") {
        const req = ev.request || {};
        const msgs = req.messages || [];
        const sk = key(req.system), tk = key(req.tools || []);
        let si = seen.indexOf("s" + sk); if (si < 0) { seen.push("s" + sk); trace.systems.push(req.system); }
        let ti = seen.indexOf("t" + tk); if (ti < 0) { seen.push("t" + tk); trace.toolsets.push(req.tools || []); }
        const prevs = trace.events.filter((e) => e.t === "llm");
        let base = -1, keep = 0;
        prevs.forEach((p, n) => {
          const k = p.msgs.length;
          if (k > keep && k <= msgs.length && key(msgs.slice(0, k)) === key(p.msgs)) { base = n; keep = k; }
        });
        trace.events.push({
          t: "llm", thread: ev.thread, caller: ev.caller || [], model: req.model,
          system: trace.systems.findIndex((x) => key(x) === sk),
          tools: trace.toolsets.findIndex((x) => key(x) === tk),
          base, keep, add: msgs.slice(keep), msgs, response: ev.response, error: ev.error, ms: ev.ms,
        });
      }
    }
    return trace;
  }

  function stepHtml(s, trace, llms) {
    if (s.t === "user") {
      return `<div class="card-k">学生输入</div><div class="rp-user">${esc(s.text)}</div>`;
    }
    if (s.t === "approval") {
      const yes = /^y/i.test(s.text);
      return `<div class="card-k">权限确认</div>
        <p>程序在执行工具前停下来问人：<code>${esc(s.prompt || "Allow? [y/N]")}</code></p>
        <div class="rp-answer ${yes ? "yes" : "no"}">回答 ${esc(s.text)} · ${yes ? "允许执行" : "拒绝执行"}</div>`;
    }
    if (s.t === "console") {
      return `<div class="card-k">终端输出${s.thread && s.thread !== "MainThread" ? ` · 线程 ${esc(s.thread)}` : ""}</div>
        <pre class="rp-term">${esc(s.text)}</pre>`;
    }
    const msgs = s.msgs;
    const prevSame = llms.slice(0, s.n).reverse().find((e) => (e.caller || [])[0] === (s.caller || [])[0]);
    const rebuilt = s.base < 0 && prevSame;
    const tools = trace.toolsets[s.tools] || [];
    const system = trace.systems[s.system];
    const sysLen = typeof system === "string" ? system.length : JSON.stringify(system || "").length;
    const r = s.response || {};
    const blocks = (r.content || []).map((b) => {
      if (b.type === "text") return `<div class="rp-text">${esc(b.text)}</div>`;
      if (b.type === "tool_use") return `<div class="rp-tool"><div class="nm">🔧 调用工具 <code>${esc(b.name)}</code></div><pre>${esc(JSON.stringify(b.input, null, 2))}</pre></div>`;
      if (b.type === "thinking") return `<details class="rp-think"><summary>模型思考过程</summary><pre>${esc(b.thinking || "")}</pre></details>`;
      return `<pre>${esc(JSON.stringify(b, null, 2))}</pre>`;
    }).join("");
    const stop = r.stop_reason === "tool_use"
      ? `<span class="badge go">stop_reason = tool_use</span> 模型要用工具：执行后把结果追加进 messages[]，循环继续`
      : r.stop_reason
        ? `<span class="badge end">stop_reason = ${esc(r.stop_reason)}</span> 模型不再调用工具，这一轮结束`
        : "";
    return `<div class="card-k">第 ${s.n + 1} 次调用模型 · ${esc(callerLabel(s.caller))}${s.thread && s.thread !== "MainThread" ? ` · 线程 ${esc(s.thread)}` : ""}</div>
      <div class="rp-req">
        <span>发送 <b>messages[] ${msgs.length} 条</b>（约 ${num(msgs.reduce((a, m) => a + msgChars(m), 0))} 字符）</span>
        <span>其中新增 <b>${(s.add || []).length}</b> 条</span>
        <span>system prompt ${num(sysLen)} 字符</span>
        <details class="rp-tools"><summary>可用工具 ${tools.length} 个</summary><code>${tools.map(esc).join("  ")}</code></details>
      </div>
      ${rebuilt ? `<div class="rp-warn">这次请求没有沿用上一次的消息历史：messages[] 被压缩或重新构建了，对比右侧条数变化。</div>` : ""}
      ${s.error ? `<div class="rp-warn">调用出错：${esc(s.error)}</div>` : ""}
      <div class="rp-resp-k">模型返回</div>
      <div class="rp-resp">${blocks || "<p class='loading'>（无内容）</p>"}</div>
      <div class="rp-stop">${stop}</div>
      ${r.usage ? `<div class="rp-usage">输入 ${num(r.usage.input_tokens)} tokens · 输出 ${num(r.usage.output_tokens)} tokens${s.ms ? ` · 耗时 ${(s.ms / 1000).toFixed(1)} 秒` : ""}</div>` : ""}`;
  }

  // 到第 i 步为止最近一次模型调用时的 messages[]
  function ctxHtml(steps, i) {
    let last = null;
    for (let k = i; k >= 0; k--) if (steps[k].t === "llm") { last = steps[k]; break; }
    if (!last) return `<div class="ctx-k">messages[]</div><p class="ctx-tip">还没有调用模型。</p>`;
    return `<div class="ctx-k">messages[] · ${last.msgs.length} 条 <small>第 ${last.n + 1} 次调用时</small></div>
      <div class="ctx-tip">绿色是本次新增的消息，点开可看完整内容。</div>
      <div class="ctx-list">${last.msgs.map((m, k) => msgItem(m, k, k >= last.keep)).join("")}</div>`;
  }

  window.Replay = { prepare, fromRaw, stepHtml, ctxHtml, esc };

  window.renderReplay = async function (lesson, panel, fetchText, startStep) {
    let trace;
    try {
      trace = JSON.parse(await fetchText(`replay/traces/${lesson.id}.json`));
    } catch (e) {
      panel.innerHTML = `<div class="prose"><p>这一课的运行回放还没有录制。</p>
        <p class="loading">录制方法：在项目根目录准备好 <code>.env</code>，运行 <code>.venv/bin/python web/replay/record.py ${lesson.id}</code>。</p></div>`;
      return;
    }

    const { llms, steps } = prepare(trace);

    let cur = 0;
    let timer = null;

    panel.innerHTML = `
      <div class="rp-head">
        <div><div class="rp-title">${esc(trace.title || "运行回放")}</div>
          <div class="rp-note">${esc(trace.note || "")}</div></div>
        <div class="rp-meta">真实运行录制 · ${esc(trace.recorded || "")} · ${llms.length} 次模型调用</div>
      </div>
      <div class="rp-controls">
        <button data-act="first" title="回到开头">⏮</button>
        <button data-act="prev" title="上一步（←）">◀</button>
        <button data-act="play" class="play" title="播放 / 暂停（空格）">▶ 播放</button>
        <button data-act="next" title="下一步（→）">▶</button>
        <button data-act="last" title="跳到结尾">⏭</button>
        <span class="rp-count" id="rpCount"></span>
      </div>
      <div class="rp-timeline" id="rpTimeline">${steps.map((s, i) =>
        `<button class="dot ${s.t}" data-i="${i}" title="${i + 1}"></button>`).join("")}</div>
      <div class="rp-grid">
        <section class="rp-step" id="rpStep"></section>
        <aside class="rp-ctx" id="rpCtx"></aside>
      </div>
      <div class="rp-legend"><span class="dot user"></span>学生输入 <span class="dot llm"></span>模型调用
        <span class="dot console"></span>终端输出 <span class="dot approval"></span>权限确认</div>`;

    const $step = panel.querySelector("#rpStep");
    const $ctx = panel.querySelector("#rpCtx");
    const $count = panel.querySelector("#rpCount");
    const $play = panel.querySelector("[data-act=play]");
    const dots = panel.querySelectorAll("#rpTimeline .dot");

    function show(i) {
      cur = Math.max(0, Math.min(steps.length - 1, i));
      const s = steps[cur];
      $step.className = `rp-step ${s.t}`;
      $step.innerHTML = stepHtml(s, trace, llms);
      $ctx.innerHTML = ctxHtml(steps, cur);
      $count.textContent = `第 ${cur + 1} / ${steps.length} 步`;
      dots.forEach((d, k) => { d.classList.toggle("on", k === cur); d.classList.toggle("past", k < cur); });
      // 只滚动右侧列表，让最新的消息可见，不带动整个页面
      const list = $ctx.querySelector(".ctx-list");
      if (list) list.scrollTop = list.scrollHeight;
    }

    function stop() { clearInterval(timer); timer = null; $play.textContent = "▶ 播放"; }
    function play() {
      if (cur >= steps.length - 1) show(0);
      $play.textContent = "⏸ 暂停";
      timer = setInterval(() => (cur >= steps.length - 1 ? stop() : show(cur + 1)), 1800);
    }

    panel.querySelector(".rp-controls").addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (!act) return;
      if (act === "play") return timer ? stop() : play();
      stop();
      show({ first: 0, prev: cur - 1, next: cur + 1, last: steps.length - 1 }[act]);
    });
    panel.querySelector("#rpTimeline").addEventListener("click", (e) => {
      const d = e.target.closest(".dot");
      if (d) { stop(); show(Number(d.dataset.i)); }
    });
    const onKey = (e) => {
      if (!document.body.contains(panel) || !panel.querySelector("#rpStep")) {
        document.removeEventListener("keydown", onKey);
        return stop();
      }
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === "ArrowRight") { stop(); show(cur + 1); }
      else if (e.key === "ArrowLeft") { stop(); show(cur - 1); }
      else if (e.key === " ") { e.preventDefault(); timer ? stop() : play(); }
    };
    document.addEventListener("keydown", onKey);
    show(startStep || 0);
  };
})();
