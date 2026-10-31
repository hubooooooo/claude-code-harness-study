// 回放：用一个具体任务，一步一步讲清机制。每一步三样东西：说明、这一步运行的代码、记录本 messages 的变化。
// 数据在 web/story/sXX.json，每章一份：
//   task    这次演示的任务
//   steps   每一步：title、desc、round（第几圈，可选）
//           code：这一步正在运行的代码（每行都必须原样出现在本章 code.py 里，测试会检查）
//           add：这一步追加进记录本 messages 的内容
// 真实的「谁对谁说了什么」在「运行」页里看：学生自己输入任务，看真跑出来的群聊记录。
(function () {
  "use strict";

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ROLE = { user: "你", assistant: "模型", tool: "工具结果", prog: "程序" };
  // 记录本里 role 只有 user/assistant 两种；prog 是程序替用户塞进去的内容（提醒、摘要、记忆、目标反馈），对模型来说它仍是 user 消息
  const PLAY_MS = 7000;

  function codeHtml(code, file) {
    if (!code) return '<div class="sq-code-empty">这一步不涉及新的代码。</div>';
    const hi = new Set(code.hi || code.lines.map((_, k) => k));
    const lines = code.lines.map((ln, k) => {
      const html = window.hljs ? hljs.highlight(ln, { language: "python", ignoreIllegals: true }).value : esc(ln);
      return `<div class="sq-ln${hi.has(k) ? " on" : ""}">${html || " "}</div>`;
    }).join("");
    return `<div class="sq-fn"><span>${esc(file)}</span><b>${esc(code.fn)}</b></div>
      <pre class="sq-pre"><code>${lines}</code></pre>${code.note ? `<p class="sq-cnote">${esc(code.note)}</p>` : ""}`;
  }

  function render(def, lessonId, mount) {
    const { steps } = def;
    mount.innerHTML = `<section class="vz sq">
      <header class="vz-head"><span class="vz-id">${esc(lessonId.toUpperCase())}</span>
        <span class="vz-name">${esc(def.title)}</span><span class="vz-n" id="sqN"></span></header>
      <div class="sq-task"><span>这次的任务</span>${esc(def.task)}</div>
      <div class="sq-body">
        <div class="sq-step"><span class="vz-num" id="sqNum"></span>
          <div><div class="vz-st"><span id="sqTitle"></span><em class="sq-round" id="sqRound" hidden></em></div><div class="vz-sd" id="sqDesc"></div></div></div>
        <div class="sq-grid">
          <div class="sq-box"><div class="sq-h">这一步运行的代码</div><div id="sqCode"></div></div>
          <div class="sq-box"><div class="sq-h">模型的记录本 messages：这一步之后模型看到的全部内容</div><ol class="sq-msgs" id="sqMsgs"></ol></div>
        </div>
        <p class="sq-hint">想看真实运行时「谁对谁说了什么」，到「运行」标签里自己输入一个任务试试。</p>
      </div>
      <div class="vz-foot"><div class="vz-ctl">
        <button data-act="reset" class="icon" title="从头开始" aria-label="从头开始">↺</button>
        <button data-act="prev" title="上一步（←）">‹ 上一步</button>
        <button data-act="next" class="next" title="下一步（→）">下一步 ›</button>
        <button data-act="play" title="自动播放（空格）">▶ 自动播放</button>
        <div class="vz-bars">${steps.map((_, k) => `<button data-go="${k}" aria-label="第 ${k + 1} 步"><i></i></button>`).join("")}</div>
      </div></div>
    </section>`;

    const root = mount.querySelector(".sq");
    const $ = (id) => mount.querySelector(`#${id}`);
    const $play = mount.querySelector("[data-act=play]");
    const bars = [...mount.querySelectorAll(".vz-bars button")];
    let cur = 0;
    let timer = null;

    function show(i) {
      cur = Math.max(0, Math.min(steps.length - 1, i));
      const st = steps[cur];
      $("sqNum").textContent = cur + 1;
      $("sqTitle").textContent = st.title;
      $("sqRound").hidden = !st.round;
      $("sqRound").textContent = st.round ? `第 ${st.round} 圈` : "";
      $("sqDesc").textContent = st.desc;
      $("sqN").textContent = `第 ${cur + 1} / ${steps.length} 步`;
      $("sqCode").innerHTML = codeHtml(st.code, def.file);
      // 记录本：到这一步为止追加过的所有内容，这一步新加的高亮
      const msgs = steps.slice(0, cur + 1).flatMap((s, k) => (s.add || []).map((m) => ({ m, fresh: k === cur })));
      $("sqMsgs").innerHTML = msgs.length
        ? msgs.map(({ m: [role, text], fresh }) => `<li class="r-${role}${fresh ? " fresh" : ""}"><b>${ROLE[role]}</b><span>${esc(text)}</span></li>`).join("")
        : '<li class="sq-empty">还是空的</li>';
      // 记录本太长时只显示一段，滚到这一步新加的内容
      const fresh = $("sqMsgs").querySelector(".fresh");
      if (fresh) $("sqMsgs").scrollTop = Math.max(0, fresh.offsetTop - 40);
      bars.forEach((b, k) => { b.className = k === cur ? "on" : k < cur ? "past" : ""; });
    }
    function stop() { clearInterval(timer); timer = null; $play.textContent = "▶ 自动播放"; root.classList.remove("playing"); }
    function play() {
      if (cur >= steps.length - 1) show(0);
      $play.textContent = "❚❚ 暂停";
      root.classList.add("playing");
      timer = setInterval(() => (cur >= steps.length - 1 ? stop() : show(cur + 1)), PLAY_MS);
    }
    mount.querySelector(".vz-foot").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.go) { stop(); return show(Number(b.dataset.go)); }
      const act = b.dataset.act;
      if (act === "play") return timer ? stop() : play();
      stop();
      show({ reset: 0, prev: cur - 1, next: cur + 1 }[act]);
    });
    const onKey = (e) => {
      if (!document.body.contains(root)) { document.removeEventListener("keydown", onKey); return stop(); }
      if (document.body.classList.contains("teach") && document.querySelector("#slidebar:not([hidden])")) return;
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === "ArrowRight") { stop(); show(cur + 1); }
      else if (e.key === "ArrowLeft") { stop(); show(cur - 1); }
      else if (e.key === " ") { e.preventDefault(); timer ? stop() : play(); }
    };
    document.addEventListener("keydown", onKey);
    // 每一步内容多少不一样，先把所有步都量一遍，按最高的那一步定卡片高度，翻步时卡片不会跳
    const body = root.querySelector(".sq-body");
    function equalize() {
      const keep = cur;
      body.style.minHeight = "";
      let max = 0;
      for (let i = 0; i < steps.length; i++) { show(i); max = Math.max(max, body.offsetHeight); }
      show(keep);
      body.style.minHeight = `${max}px`;
    }
    let resizeTimer = 0;
    const onResize = () => {
      if (!document.body.contains(root)) return removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(equalize, 150);
    };
    addEventListener("resize", onResize);
    equalize();
  }

  // 有新版数据的章节用新版；没有的退回旧版的机制动画
  window.renderStory = async function (lesson, mount) {
    let def;
    try {
      const r = await fetch(`story/${lesson.id}.json`);
      if (!r.ok) return false;
      def = await r.json();
    } catch (e) {
      return false;
    }
    render(def, lesson.id, mount);
    return true;
  };
})();
