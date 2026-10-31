// 群聊视图：把「谁对谁说了什么」画成大家都熟悉的群聊记录。「运行」页用它展示真实运行的每一步。
(function () {
  "use strict";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 线条图标（24×24，描边），和课件整体的黑白绿风格一致
  const PATHS = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    wrench: '<path d="M14.5 4.5a4.5 4.5 0 0 0-5.3 5.9L3 16.6V21h4.4l6.2-6.2a4.5 4.5 0 0 0 5.9-5.3L16.5 12 12 7.5z"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    check: '<path d="M5 12l4 4L19 6"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
    think: '<path d="M8 15a4 4 0 0 1 .5-8A5 5 0 0 1 18 8a3.5 3.5 0 0 1-1 6.9H8z"/><circle cx="7" cy="19" r="1"/><circle cx="4.5" cy="21.5" r=".7"/>',
    send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  };
  const icon = (name) => `<svg class="ch-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.chat}</svg>`;

  // 群成员
  const ACTORS = {
    you: { name: "你", icon: "user", sub: "在网页里输入任务" },
    prog: { name: "程序", icon: "cpu", sub: "Harness，也就是本课的 code.py" },
    model: { name: "模型", icon: "sparkles", sub: "DeepSeek / Claude" },
    pc: { name: "你的电脑", icon: "terminal", sub: "真正执行命令、读写文件的地方" },
    perm: { name: "权限检查", icon: "shield", sub: "执行工具前先过的那道门" },
  };
  // 消息类型的小标签：让小白一眼看出这条是「要求用工具」还是「执行结果」
  const KIND = {
    request: ["send", "发给模型的内容"], tool: ["wrench", "要求调用工具"], result: ["file", "执行结果"], text: ["chat", "回答"],
    ok: ["check", "权限通过"], deny: ["alert", "没有通过"], ask: ["alert", "需要你确认"], term: ["terminal", "终端输出"],
  };

  // 一条消息：{ who, to, kind, text | html, think, cls, after }
  function message(m) {
    const who = ACTORS[m.who];
    const to = m.to ? ACTORS[m.to] : null;
    const k = m.kind && KIND[m.kind];
    const body = m.html != null ? m.html : esc(m.text).replace(/\n/g, "<br>");
    const label = m.think ? `<span class="ch-kind">${icon("think")}${esc(who.name)}在想</span>`
      : k ? `<span class="ch-kind">${icon(k[0])}${esc(k[1])}</span>` : "";
    return `<div class="ch-m${m.who === "you" ? " me" : ""}${m.think ? " think" : ""}${m.cls ? ` ${m.cls}` : ""}">
      <div class="ch-av a-${esc(m.who)}">${icon(who.icon)}</div>
      <div class="ch-mb"><div class="ch-who"><b>${esc(who.name)}</b>${to ? `<span class="ch-to">→ ${esc(to.name)}</span>` : ""}</div>
        <div class="ch-bubble${m.think ? " ch-think" : k ? ` k-${m.kind}` : ""}">${label}${body}</div>${m.after || ""}</div></div>`;
  }

  const divider = (text) => `<div class="ch-sys"><span>${esc(text)}</span></div>`;

  function members(ids, active = new Set()) {
    return `<div class="ch-head"><b>Agent 工作群</b><span>${ids.length} 位成员</span>
      <div class="ch-members">${ids.map((id) => {
        const a = ACTORS[id];
        return `<span class="ch-member${active.has(id) ? " on" : ""}" title="${esc(a.sub)}"><i class="ch-av a-${id}">${icon(a.icon)}</i>${esc(a.name)}</span>`;
      }).join("")}</div></div>`;
  }

  window.ChatView = { esc, icon, ACTORS, message, divider, members };
})();
