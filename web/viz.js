// 机制动画：每章一张专门画的 SVG 场景，分 6～7 步讲清一个机制。
// 场景里的元素用 data-* 属性声明自己在第几步出现、高亮、移动到哪里，引擎只负责按步切换。
//   data-s="2-5"   第 2～5 步可见（"3-" 表示第 3 步起一直可见，"4" 表示只在第 4 步）
//   data-hi="3,5"  这几步高亮（也可写成范围 "3-5"）
//   data-xy="2:100,40;5:300,40"  从第 2 步起平移到 (100,40)，第 5 步起移到 (300,40)
//   data-sx="1:0.1;3:0.6"        横向伸长比例（进度条、时间条用）
(function () {
  const VIZ = (window.VIZ = {});

  // ----- 画图小工具 -----
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const at = (a) => Object.entries(a || {}).map(([k, v]) => ` data-${k}="${v}"`).join("");
  function node(x, y, w, h, t, sub, a, cls = "") {
    return `<g class="vz-node ${cls}"${at(a)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
      <text class="vz-t" x="${x + w / 2}" y="${y + h / 2 + (sub ? -3 : 5)}">${esc(t)}</text>
      ${sub ? `<text class="vz-sub" x="${x + w / 2}" y="${y + h / 2 + 16}">${esc(sub)}</text>` : ""}</g>`;
  }
  // 连线：平时是灰色细线；高亮时变成流动的黑色虚线，并有绿色圆点沿线移动（参考 React Flow 的 animated edge）
  function edge(d, a, label, lx, ly, anchor = "middle") {
    return `<g class="vz-edge"${at(a)}><path class="base" d="${d}"/>
      <circle class="dot" r="4"><animateMotion dur="1.6s" repeatCount="indefinite" path="${d}"/></circle>
      ${label ? `<text x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(label)}</text>` : ""}</g>`;
  }
  // messages[] 里的一条：左边一个角色标签，role 决定颜色
  const ROLE = { user: "你", assistant: "模型", tool: "工具结果", fold: "已折叠", sum: "摘要", note: "通知", task: "任务", ask: "单独调用" };
  function chip(x, y, w, role, text, a, h = 40) {
    const pw = ROLE[role].length * 12 + 16;
    const cy = y + h / 2;
    return `<g class="vz-chip r-${role}"${at(a)}><rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
      <rect class="pill" x="${x + 8}" y="${cy - 11}" width="${pw}" height="22" rx="11"/>
      <text class="vz-role" x="${x + 8 + pw / 2}" y="${cy + 4.5}">${ROLE[role]}</text>
      <text class="vz-ct" x="${x + pw + 18}" y="${cy + 5}">${esc(text)}</text></g>`;
  }
  const label = (x, y, t, a, cls = "vz-lbl", anchor = "start") =>
    `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}"${at(a)}>${esc(t)}</text>`;
  const badge = (x, y, w, t, kind, a) => `<g class="vz-badge b-${kind}"${at(a)}><rect x="${x}" y="${y}" width="${w}" height="26" rx="13"/>
      <text x="${x + w / 2}" y="${y + 17.5}">${esc(t)}</text></g>`;
  const panel = (x, y, w, h, t, a) => `<g class="vz-panel"${at(a)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
      <text class="vz-ptitle" x="${x + 14}" y="${y + 23}">${esc(t)}</text></g>`;
  // 标出「现在执行到哪了」的小圆点
  const token = (xy, a = {}) => `<g class="vz-token"${at(Object.assign({ xy }, a))}><circle r="15" class="halo"/><circle r="7"/></g>`;

  // ===== s01 智能体循环 =====
  VIZ.s01 = {
    title: "Agent 循环",
    steps: [
      ["一个 while 循环", "每个 Agent 都是一个循环：不停地调用模型，直到模型不再要求用工具。右边的 messages[] 是模型能看到的全部内容，现在还是空的。"],
      ["你提出任务", "你说：「写一个 hello.py 并运行它」。这句话成为 messages[] 的第 1 条，循环开始。"],
      ["调用模型", "程序把整个 messages[] 发给模型。模型自己不能动手，它回复：「请帮我运行这条 bash 命令」。这条回复也追加进 messages[]。"],
      ["有工具调用吗？有 → 继续", "程序检查模型的回复：里面有工具调用，说明活还没干完。循环继续，走向「执行工具」。"],
      ["程序执行工具", "真正运行命令的是程序，不是模型。bash 在你的电脑上执行，输出 Hello, World!"],
      ["结果写回，再转一圈", "输出作为 tool_result 追加进 messages[]。然后回到「调用模型」，把变长了的 messages[] 再发一次。"],
      ["没有工具调用 → 结束", "这次模型直接给出回答，没有再要工具。程序据此退出循环，把回答显示给你。整个 Agent 就是这么一个循环。"],
    ],
    svg: () => [
      node(30, 26, 170, 50, "你的问题", "", { hi: "2" }),
      node(30, 116, 170, 60, "调用模型", "发送整个 messages[]", { hi: "3,6" }),
      `<g class="vz-node vz-dia"${at({ hi: "4,7" })}><path d="M115,206 L200,246 L115,286 L30,246 Z"/>
        <text class="vz-t" x="115" y="251">有工具调用吗</text></g>`,
      node(290, 216, 170, 60, "执行工具", "程序在电脑上运行 bash", { hi: "5" }),
      node(290, 116, 170, 60, "追加结果", "tool_result → messages[]", { hi: "6" }),
      node(30, 330, 170, 50, "结束：显示回答", "", { hi: "7" }, "end"),
      edge("M115,76 L115,112", { hi: "2" }),
      edge("M115,176 L115,202", { hi: "3,7" }),
      edge("M200,246 L286,246", { hi: "4" }, "有", 243, 238),
      edge("M375,216 L375,180", { hi: "5" }),
      edge("M290,146 L204,146", { hi: "6" }, "再转一圈", 247, 138),
      edge("M115,286 L115,326", { hi: "7" }, "没有", 124, 312, "start"),
      badge(212, 290, 60, "第 1 圈", "round", { s: "3-6" }),
      badge(212, 290, 60, "第 2 圈", "round", { s: "7" }),
      panel(500, 20, 262, 360, "messages[]"),
      label(631, 200, "[ 空 ]", { s: "1" }, "vz-empty", "middle"),
      chip(514, 54, 234, "user", "写一个 hello.py 并运行", { s: "2-" }),
      chip(514, 102, 234, "assistant", "请帮我运行 bash 命令", { s: "3-" }),
      chip(514, 150, 234, "tool", "Hello, World!", { s: "6-" }),
      chip(514, 198, 234, "assistant", "已创建并运行成功", { s: "7-" }),
      label(514, 362, "模型每次看到的，就是这整张列表", { s: "3-" }, "vz-note"),
      token("1:30,51;2:30,51;3:30,146;4:30,246;5:290,246;6:290,146;7:30,355", { s: "2-" }),
    ].join(""),
  };

  // ===== s06 子 Agent =====
  const S06_CHILD = ["调用 bash：列出目录", "一长串文件列表…", "调用 read_file：requirements.txt", "anthropic, python-dotenv…", "调用 read_file：test.yml", "pytest tests -q …"];
  VIZ.s06 = {
    title: "子 Agent：隔离上下文",
    steps: [
      ["主 Agent 的记录", "主 Agent 的 messages[] 里已经有一些对话。现在它要查一件又杂又长的事：这个项目用什么测试框架？"],
      ["派出子 Agent", "主 Agent 调用 task 工具。程序新开一个子 Agent，给它一本全新的 messages[]，里面只有一条任务说明。"],
      ["子 Agent 独立干活", "子 Agent 自己跑一个完整的循环：列目录、读文件……这些长长的结果，都只写进它自己的 messages[]。"],
      ["得出结论", "子 Agent 不再调用工具时，它的最后一段回答就是结论：「主要用 pytest，也有 unittest」。"],
      ["只有总结交回来", "这段结论作为 task 工具的结果，追加进主 Agent 的 messages[]。子 Agent 的整本记录被丢弃。"],
      ["主 Agent 依然干净", "主 Agent 只多了两条消息，就拿到了答案。子 Agent 读到的上千行内容，一行都没进主 Agent 的上下文。"],
    ],
    svg: () => [
      panel(20, 20, 330, 360, "主 Agent 的 messages[]"),
      chip(34, 54, 302, "user", "这个项目用什么测试框架？"),
      chip(34, 102, 302, "assistant", "调用 task：去查测试框架", { s: "2-", hi: "2" }),
      chip(34, 150, 302, "tool", "主要用 pytest，也有 unittest", { s: "5-", hi: "5-6" }),
      chip(34, 198, 302, "assistant", "这个项目主要用 pytest", { s: "6-" }),
      badge(34, 340, 160, "只有 4 条", "ok", { s: "6" }),
      panel(430, 20, 330, 360, "子 Agent 的 messages[]（全新）", { s: "2-4" }),
      `<g class="vz-gone"${at({ s: "5-" })}><rect x="430" y="20" width="330" height="360" rx="14"/>
        <text x="595" y="190" text-anchor="middle">子 Agent 的记录</text><text x="595" y="216" text-anchor="middle">用完就丢弃</text></g>`,
      chip(444, 54, 302, "task", "查清楚用了什么测试框架", { s: "2-4", hi: "2" }),
      S06_CHILD.map((t, k) => chip(444, 100 + k * 38, 302, k % 2 ? "tool" : "assistant", t, { s: "3-4" }, 34)).join(""),
      chip(444, 342, 302, "sum", "主要用 pytest，也有 unittest", { s: "4", hi: "4" }, 32),
      edge("M350,122 C390,122 390,74 440,74", { s: "2", hi: "2" }, "只带任务说明", 395, 92),
      edge("M440,358 C380,358 400,170 352,170", { s: "5", hi: "5" }, "只交回总结", 428, 262, "end"),
      token("2:434,74;3:434,200;4:434,358;5:24,170;6:24,218", { s: "2-" }),
    ].join(""),
  };

  // ===== s11 后台任务 =====
  const X0 = 150, XW = 590;
  const lane = (y, t) => `<g class="vz-lane"><rect x="${X0}" y="${y}" width="${XW}" height="46" rx="8"/>
      <text x="${X0 - 12}" y="${y + 28}" text-anchor="end">${esc(t)}</text></g>`;
  const bar = (x, y, w, t, kind, sx, s) => `<g class="vz-bar k-${kind}"${at({ s, sx })} style="transform-origin:${x}px ${y}px">
      <rect x="${x}" y="${y + 6}" width="${w}" height="34" rx="6"/></g>
      <text class="vz-bart" x="${x + 10}" y="${y + 28}"${at({ s })}>${esc(t)}</text>`;
  VIZ.s11 = {
    title: "后台任务",
    steps: [
      ["主循环和后台", "Agent 有一个主循环。慢命令可以交给后台线程去跑，主循环不必干等。"],
      ["慢命令丢进后台", "模型请求在后台运行 sleep 3 && echo done。工具马上返回「已启动 bg_0001」，不等它跑完。"],
      ["主循环接着干活", "后台在跑的同时，主循环处理下一件事：列出所有 Markdown 文件，并回答你。"],
      ["后台完成，进通知队列", "3 秒后命令结束，输出 done。结果先放进通知队列。这时模型还看不到它。"],
      ["调用模型前取出通知", "你又问了一句。程序在调用模型之前先查队列，把通知作为 <task_notification> 塞进 messages[]。"],
      ["模型看到了后台结果", "模型从 messages[] 里读到通知，回答：「跑完了，输出是 done」。"],
    ],
    svg: () => [
      label(X0, 26, "时间 →", {}, "vz-axis"),
      lane(40, "主循环"),
      lane(110, "后台线程"),
      lane(180, "通知队列"),
      bar(X0 + 6, 40, 560, "回答第一个问题", "main", "1:0.06;2:0.2;3:0.62;4:0.62;5:0.62", "1-"),
      bar(X0 + 380, 40, 172, "回答第二个问题", "main2", "5:0.3;6:1", "5-"),
      bar(X0 + 118, 110, 260, "sleep 3 && echo done", "bg", "2:0.12;3:0.75;4:1", "2-"),
      label(X0 + 384, 138, "done ✓", { s: "4-" }, "vz-done"),
      edge(`M${X0 + 118},86 L${X0 + 118},112`, { s: "2-", hi: "2" }),
      badge(X0 + 130, 74, 140, "立刻返回 bg_0001", "ok", { s: "2-3" }),
      edge(`M${X0 + 378},156 L${X0 + 378},182`, { s: "4-", hi: "4" }),
      chip(X0 + 330, 183, 200, "note", "bg_0001 完成：done", { s: "4" }, 40),
      edge(`M${X0 + 430},180 L${X0 + 430},90`, { s: "5", hi: "5" }, "取出", X0 + 440, 140, "start"),
      panel(150, 250, 590, 136, "下一次发给模型的 messages[]", { s: "5-" }),
      chip(164, 286, 270, "user", "后台命令跑完了吗？", { s: "5-" }),
      chip(446, 286, 280, "note", "<task_notification> done", { s: "5-", hi: "5" }),
      chip(164, 336, 562, "assistant", "跑完了，输出是 done", { s: "6", hi: "6" }),
    ].join(""),
  };

  // 字典的一行：左边名字（等宽），右边说明
  function row(x, y, w, k, v, a, h = 36) {
    return `<g class="vz-row"${at(a)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>
      <text class="vz-rk" x="${x + 12}" y="${y + h / 2 + 5}">${esc(k)}</text>
      <text class="vz-rv" x="${x + w - 12}" y="${y + h / 2 + 5}" text-anchor="end">${esc(v)}</text></g>`;
  }
  const hiOf = (h) => (h ? { hi: h } : {});
  // 任务卡片：标题 + 一行小字
  function card(x, y, w, h, t, a) {
    return `<g class="vz-node vz-tcard"${at(a)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
      <text class="vz-tct" x="${x + 14}" y="${y + 30}">${esc(t)}</text></g>`;
  }
  const TODO = { p: "待办", d: "进行中", c: "完成" };
  const todoIcon = (x, y, st) => st === "c"
    ? `<circle class="ic-c" cx="${x}" cy="${y}" r="10"/><path class="ic-ck" d="M${x - 4.5},${y} l3.2,3.2 l6,-6.4"/>`
    : st === "d" ? `<circle class="ic-d" cx="${x}" cy="${y}" r="10"/><circle class="ic-dd" cx="${x}" cy="${y}" r="4"/>`
      : `<circle class="ic-p" cx="${x}" cy="${y}" r="10"/>`;
  const todo = (x, y, w, t, st, s) => `<g class="vz-todo t-${st}"${at({ s })}><rect x="${x}" y="${y}" width="${w}" height="46" rx="6"/>
      ${todoIcon(x + 24, y + 23, st)}<text class="vz-tt" x="${x + 46}" y="${y + 28}">${esc(t)}</text>
      <text class="vz-tst" x="${x + w - 14}" y="${y + 28}" text-anchor="end">${TODO[st]}</text></g>`;
  // 一排标签：按字数估算宽度依次排开
  function tags(x, y, list, s) {
    let cx = x;
    return list.map(([t, kind]) => {
      const w = t.length * 14 + 28;
      const g = badge(cx, y, w, t, kind || "plain", { s });
      cx += w + 10;
      return g;
    }).join("");
  }

  // ===== s02 工具调用 =====
  const S02 = [["bash", "运行命令", "run_bash"], ["read_file", "读文件", "run_read"], ["write_file", "写文件", "run_write"],
    ["edit_file", "改文件", "run_edit"], ["glob", "找文件", "run_glob"]];
  VIZ.s02 = {
    title: "工具分发",
    steps: [
      ["一份工具清单", "程序每次调用模型，都附上一份工具清单：每个工具的名字、用途和参数。模型只能从清单里挑。"],
      ["模型点名 write_file", "模型回复：调用 write_file，参数 path=test.py，content=print(\"hello\")。"],
      ["按名字查表", "程序拿着名字 write_file 去 TOOL_HANDLERS 字典里查，找到函数 run_write，把参数传进去。"],
      ["结果写回", "run_write 写好文件，返回「Wrote 15 bytes」，作为 tool_result 追加进 messages[]。"],
      ["换一个工具，同一段代码", "下一轮模型点名 read_file。还是同一段分发代码：查表找到 run_read，读出文件内容。"],
      ["加工具只加一行", "循环代码一行没改。想加新工具，只要在清单里写上说明，再往字典里加一行「名字 → 函数」。"],
    ],
    svg: () => [
      panel(20, 20, 220, 300, "发给模型的工具清单", hiOf("1")),
      S02.map(([n, d], k) => row(34, 52 + k * 46, 192, n, d, hiOf({ write_file: "2", read_file: "5" }[n]), 38)).join(""),
      label(34, 300, "模型只能从这里挑", {}, "vz-note"),
      label(375, 30, "模型的请求", { s: "2-" }, "vz-lbl", "middle"),
      node(270, 40, 210, 70, "write_file", "path=test.py", { s: "2-4", hi: "2" }),
      node(270, 40, 210, 70, "read_file", "path=test.py", { s: "5-", hi: "5" }),
      edge("M375,110 L375,166", { s: "2-", hi: "3,5" }),
      node(270, 170, 210, 64, "按名字查表", "TOOL_HANDLERS[name](**args)", { hi: "3,5" }),
      panel(520, 20, 240, 300, "TOOL_HANDLERS 字典"),
      S02.map(([n, , f], k) => row(534, 52 + k * 46, 212, n, "→ " + f, hiOf({ write_file: "3-4", read_file: "5" }[n]), 38)).join(""),
      row(534, 282, 212, "my_tool", "→ run_my_tool", { s: "6", hi: "6" }, 30),
      badge(560, 334, 180, "新工具 = 加一行", "ok", { s: "6" }),
      edge("M480,202 C505,202 505,163 530,163", { s: "3-4", hi: "3-4" }),
      edge("M480,202 C505,202 505,117 530,117", { s: "5", hi: "5" }),
      edge("M375,234 L375,286", { s: "4-", hi: "4-5" }),
      chip(270, 290, 210, "tool", "Wrote 15 bytes", { s: "4", hi: "4" }),
      chip(270, 290, 210, "tool", 'print("hello")', { s: "5-", hi: "5" }),
      label(375, 352, "作为 tool_result 写回 messages[]", { s: "4-" }, "vz-note", "middle"),
      token("2:270,40;3:270,170;4:270,290;5:270,170", { s: "2-5" }),
    ].join(""),
  };

  // ===== s03 权限 =====
  VIZ.s03 = {
    title: "权限：三道关卡",
    steps: [
      ["执行前先过关卡", "模型请求的每个工具调用，真正执行之前，都要先经过三道关卡。"],
      ["普通操作：直接放行", "写 test.txt：不在黑名单里，也不匹配危险规则，直接执行。"],
      ["删文件：命中规则", "模型请求 rm test.txt。命令里有「rm 」，命中「可能有破坏性」这条规则。"],
      ["停下来问你", "程序暂停，问你：「允许吗？[y/N]」。你回答 n。"],
      ["拒绝也会告诉模型", "工具没有执行。程序把「被拒绝」作为工具结果交给模型，模型据此回复你。"],
      ["黑名单：直接拦下", "sudo、rm -rf / 这类命令在黑名单里，连问都不问，直接拦截。"],
    ],
    svg: () => [
      label(85, 108, "模型的请求", {}, "vz-lbl", "middle"),
      node(20, 120, 130, 80, "write_file", "test.txt", { s: "1-2" }, "keep"),
      node(20, 120, 130, 80, "bash", "rm test.txt", { s: "3-5" }, "keep"),
      node(20, 120, 130, 80, "bash", "sudo rm -rf /", { s: "6" }, "keep"),
      node(190, 120, 120, 80, "① 黑名单", "sudo、rm -rf /…", { hi: "1,6" }),
      node(350, 120, 120, 80, "② 危险规则", "rm 、chmod 777…", { hi: "1,3" }),
      node(510, 120, 110, 80, "③ 问你", "允许吗？[y/N]", { hi: "1,4" }),
      node(660, 120, 100, 80, "执行", "", { hi: "2" }),
      edge("M150,160 L186,160", { hi: "2-6" }),
      edge("M310,160 L346,160", { hi: "2-5" }, "不在", 328, 150),
      edge("M410,120 C410,70 710,70 710,116", { hi: "2" }, "没命中 → 直接放行", 560, 78),
      edge("M470,160 L506,160", { hi: "3-4" }, "命中", 488, 150),
      edge("M620,160 L656,160", {}, "允许", 638, 150),
      badge(510, 214, 110, "你：n", "warn", { s: "4-5" }),
      edge("M565,240 L565,276", { s: "5", hi: "5" }, "拒绝", 575, 262, "start"),
      edge("M250,200 L250,276", { s: "6", hi: "6" }, "直接拦截", 260, 242, "start"),
      edge("M710,200 L710,276", { s: "2", hi: "2" }),
      chip(470, 280, 290, "tool", "Wrote 0 bytes to test.txt", { s: "2", hi: "2" }),
      chip(400, 280, 330, "tool", "Permission denied by user", { s: "5", hi: "5" }),
      chip(85, 280, 330, "tool", "Blocked: 'sudo' 在黑名单里", { s: "6", hi: "6" }),
      label(85, 346, "这条结果会交给模型，模型据此回复你。", { s: "6" }, "vz-note"),
      label(400, 346, "这条结果会交给模型，模型据此回复你。", { s: "5" }, "vz-note"),
      token("1:20,120;2:660,120;3:350,120;4:510,120;5:400,280;6:190,120"),
    ].join(""),
  };

  // ===== s04 钩子 =====
  const S04_REG = [["UserPromptSubmit", "context_inject_hook", "1,2"], ["PreToolUse", "permission_hook · log_hook", "1,3,5"],
    ["PostToolUse", "large_output_hook", "1,4"], ["Stop", "summary_hook", "1,6"]];
  const S04_LOG = ["[HOOK] UserPromptSubmit: working in …", "[HOOK] read_file(README.md)", "PostToolUse：结果不长，不提醒",
    "[permission] rm requirements.txt → n", "[HOOK] Stop: session used 2 tool calls"];
  VIZ.s04 = {
    title: "钩子",
    steps: [
      ["循环上的 4 个插口", "主循环本身不变，只在四个固定时机调用 trigger_hooks(事件)。每个时机挂哪些小程序，登记在钩子表里。"],
      ["收到提问时", "你提问之后、调用模型之前，触发 UserPromptSubmit：context_inject_hook 补充当前工作目录等信息。"],
      ["执行工具前", "模型要 read_file。执行之前触发 PreToolUse：permission_hook 检查权限，log_hook 记一条日志。"],
      ["执行工具后", "工具跑完，触发 PostToolUse：large_output_hook 检查结果是不是太长。"],
      ["钩子可以否决", "模型要 rm requirements.txt。permission_hook 问你，你回答 n，钩子返回「拒绝」，工具不执行。"],
      ["一轮结束时", "模型不再要工具时触发 Stop：summary_hook 统计这次用了几次工具。加功能只要往表里登记，循环一行不改。"],
    ],
    svg: () => [
      node(20, 40, 92, 60, "你的问题", ""),
      node(131, 40, 120, 60, "收到提问", "UserPromptSubmit", { hi: "1,2" }, "hook"),
      node(270, 40, 100, 60, "调用模型", ""),
      node(389, 40, 120, 60, "执行工具前", "PreToolUse", { hi: "1,3,5" }, "hook"),
      node(528, 40, 92, 60, "执行工具", ""),
      node(639, 40, 121, 60, "执行工具后", "PostToolUse", { hi: "1,4" }, "hook"),
      node(260, 150, 120, 56, "一轮结束", "Stop", { hi: "1,6" }, "hook"),
      node(120, 150, 120, 56, "结束", "显示回答"),
      edge("M112,70 L127,70"), edge("M251,70 L266,70"), edge("M370,70 L385,70"), edge("M509,70 L524,70", { hi: "3-4" }),
      edge("M620,70 L635,70"),
      edge("M699,40 C699,6 320,6 320,36", {}, "下一轮", 510, 14),
      edge("M320,100 L320,146", { hi: "6" }), edge("M260,178 L244,178", { hi: "6" }),
      badge(394, 110, 110, "拒绝执行", "warn", { s: "5" }),
      panel(20, 236, 400, 148, "钩子登记表"),
      S04_REG.map(([ev, fn, h], k) => row(34, 272 + k * 27, 372, ev, fn, { hi: h }, 23)).join(""),
      panel(440, 236, 320, 148, "终端日志"),
      S04_LOG.map((t, k) => label(454, 286 + k * 21, t, { s: `${k + 2}-`, hi: `${k + 2}` }, "vz-log")).join(""),
      token("2:131,40;3:389,40;4:639,40;5:389,40;6:260,150", { s: "2-" }),
    ].join(""),
  };

  // ===== s05 待办清单 =====
  const S05_ITEMS = [["实现数单词的函数和命令行", { p: "1", d: "2", c: "3-" }], ["写测试", { p: "1-2", d: "3-5", c: "6-" }],
    ["只运行新写的测试", { p: "1-5", d: "6", c: "7" }]];
  const S05_SAY = [["1", "调用 todo_write：写下 3 项计划"], ["2", "调用 write_file：写 wordcount.py"], ["3", "调用 todo_write：第 1 项打勾"],
    ["4", "调用 bash：跑测试……连续 3 轮没碰清单"], ["5", "（这一轮的工具结果后面，附上了提醒）"], ["6", "调用 todo_write：更新清单"], ["7", "全部完成，向你汇报"]];
  VIZ.s05 = {
    title: "待办清单",
    steps: [
      ["先列计划", "任务有好几步。模型第一件事是调用 todo_write，写下一张待办清单，每项都先是「待办」。"],
      ["开始第一项", "同一时间只能有一项「进行中」。模型把第 1 项标成进行中，然后去写代码。"],
      ["做一项，勾一项", "第 1 项做完，模型再调用 todo_write：第 1 项打勾，第 2 项进行中。"],
      ["计数器在涨", "程序记着：已经连续几轮没更新清单了。模型忙着跑测试，计数器涨到了 3。"],
      ["自动提醒", "连续 3 轮没更新，程序在工具结果后面附一句 <reminder>Update your todos.</reminder>。"],
      ["模型更新清单", "模型看到提醒，更新清单：第 2 项完成，第 3 项进行中。计数器归零。"],
      ["全部完成", "三项都打勾。有一份看得见的计划，长任务就不容易做着做着跑偏。"],
    ],
    svg: () => [
      panel(20, 20, 440, 250, "待办清单（todo_write）"),
      S05_ITEMS.map(([t, st], k) => Object.entries(st).map(([code, s]) => todo(34, 52 + k * 58, 412, t, code, s)).join("")).join(""),
      [["1-2", "完成 0 / 3"], ["3-5", "完成 1 / 3"], ["6", "完成 2 / 3"], ["7", "完成 3 / 3 ✓"]].map(([s, t]) => label(34, 250, t, { s }, "vz-lbl")).join(""),
      panel(490, 20, 270, 250, "连续没更新清单的轮数"),
      [0, 1, 2].map((k) => `<circle class="vz-slot" cx="${550 + k * 75}" cy="120" r="24"/>`).join(""),
      [["2,4-5", 0], ["4-5", 1], ["4-5", 2]].map(([s, k]) => `<circle class="vz-slot on" cx="${550 + k * 75}" cy="120" r="24"${at({ s })}/>`).join(""),
      [["1,3,6-", "0 轮"], ["2", "1 轮"], ["4-5", "3 轮"]].map(([s, t]) => label(625, 200, t, { s }, "vz-big", "middle")).join(""),
      label(625, 240, "满 3 轮就提醒", {}, "vz-note", "middle"),
      chip(20, 290, 740, "note", "<reminder>Update your todos.</reminder>", { s: "5", hi: "5" }),
      S05_SAY.map(([s, t]) => chip(20, 342, 740, "assistant", t, { s })).join(""),
    ].join(""),
  };

  // ===== s07 技能加载 =====
  const S07 = [["code-review", "审查代码"], ["agent-builder", "搭 Agent"], ["mcp-builder", "写 MCP 服务"], ["pdf", "处理 PDF"]];
  VIZ.s07 = {
    title: "按需加载技能",
    steps: [
      ["system prompt 里只有目录", "程序启动时扫描 skills/ 文件夹，只把每个技能的名字和一句话简介放进 system prompt。很短，一直都在。"],
      ["任务需要某个技能", "你说：「用 code-review 技能审查 agent_loop」。模型在目录里看到了 code-review。"],
      ["模型要来全文", "模型调用 load_skill(\"code-review\")。"],
      ["全文作为工具结果进来", "程序读出完整的 SKILL.md，作为 tool_result 追加进 messages[]，而不是塞进 system prompt。"],
      ["照着说明干活", "模型照着技能里写的步骤：读文件、找问题、按规定的格式报告。"],
      ["两层结构", "目录：小，一直都在。全文：用到才加载。技能再多，平时也只占几行。"],
    ],
    svg: () => [
      panel(20, 20, 200, 250, "skills/ 文件夹"),
      S07.map(([n], k) => row(34, 54 + k * 48, 172, n, "", hiOf(n === "code-review" ? "3-4" : ""), 38)).join(""),
      panel(250, 20, 230, 250, "system prompt", hiOf("1,6")),
      label(264, 70, "你是一个编程 Agent……", {}, "vz-mono"),
      label(264, 100, "可用技能：", {}, "vz-mono"),
      S07.map(([n, d], k) => label(274, 126 + k * 22, `· ${n}：${d}`, n === "code-review" ? { hi: "2" } : {}, "vz-mono")).join(""),
      badge(264, 200, 202, "目录：几行字，一直都在", "ok", { s: "1-" }),
      badge(264, 232, 202, "全文：用到才加载", "wait", { s: "4-" }),
      panel(510, 20, 250, 360, "messages[]"),
      chip(524, 54, 222, "user", "用 code-review 审查…", { s: "2-", hi: "2" }),
      chip(524, 102, 222, "assistant", "调用 load_skill", { s: "3-", hi: "3" }),
      chip(524, 150, 222, "tool", "SKILL.md 全文", { s: "4-", hi: "4" }, 90),
      chip(524, 250, 222, "assistant", "调用 read_file", { s: "5-" }),
      chip(524, 296, 222, "tool", "code.py 的内容", { s: "5-" }, 34),
      chip(524, 338, 222, "assistant", "按格式报告 3 个问题", { s: "5-", hi: "5" }, 34),
      edge("M206,73 C236,73 236,372 320,372 L440,372 C490,372 490,195 520,195", { s: "4-", hi: "4" }, "load_skill 读出全文", 380, 364, "middle"),
    ].join(""),
  };

  // ===== s08 上下文压缩 =====
  const S08_ROWS = [["1-2", "3-5"], ["1-3", "4-5"], ["2-5", ""], ["2-5", ""], ["4-5", ""]];
  VIZ.s08 = {
    title: "上下文压缩",
    steps: [
      ["记录越来越长", "每读一个文件，完整内容都追加进 messages[]。发给模型的内容一路变长。"],
      ["读到第 4 个", "已经有 4 个工具结果了，每个都有几千字。"],
      ["第一层：微压缩", "每次调用模型前，程序只保留最近 3 个工具结果的全文，更早的换成一句 [Earlier tool result omitted.]。"],
      ["接着干活", "读第 5 个文件，又一个旧结果被折叠。模型仍知道自己读过哪些文件，只是看不到旧全文。"],
      ["第二层：超过上限就整体摘要", "如果总长度还是超过 5 万字符，程序先把完整记录存到磁盘，再让模型把整段历史写成一段摘要。"],
      ["只剩一条摘要", "之后 messages[] 里只剩这一条摘要，接着干活。上下文一下子腾出了空间。"],
      ["第三层：出错补救", "万一请求还是太长被 API 拒绝，程序压缩较早的历史、保留最近几条，再重试一次。"],
    ],
    svg: () => [
      panel(20, 20, 430, 360, "messages[]"),
      chip(34, 54, 402, "user", "逐个读 5 个 README，比较标题", { s: "1-5" }),
      S08_ROWS.map(([full, fold], k) => {
        const y = 100 + k * 46;
        return chip(34, y, 402, "tool", `读 s0${k + 1} README → 全文 3,000+ 字`, { s: full }) +
          (fold ? chip(34, y, 402, "fold", `读 s0${k + 1} → [Earlier tool result omitted.]`, { s: fold, hi: k === 0 ? "3" : "4" }) : "");
      }).join(""),
      chip(34, 54, 402, "sum", "摘要：已读 5 个 README，标题都是 sNN: …", { s: "6-", hi: "6" }, 60),
      badge(34, 340, 402, "完整记录已存到磁盘 .transcripts/", "wait", { s: "5-" }),
      badge(34, 300, 402, "API：太长了 ✗ → 压缩后重试 ✓", "warn", { s: "7" }),
      label(480, 46, "上下文长度", {}, "vz-lbl"),
      `<rect class="vz-meter" x="480" y="56" width="270" height="26" rx="6"/>`,
      `<g class="vz-bar k-meter"${at({ sx: "1:0.25;2:0.6;3:0.4;4:0.5;5:0.5;6:0.08" })} style="transform-origin:480px 0"><rect x="480" y="56" width="270" height="26" rx="6"/></g>`,
      `<g class="vz-bar k-over"${at({ s: "5", sx: "5:1" })} style="transform-origin:480px 0"><rect x="480" y="56" width="270" height="26" rx="6"/></g>`,
      `<line class="vz-limit" x1="709" y1="50" x2="709" y2="88"/>`,
      label(709, 104, "5 万字符上限", {}, "vz-note", "middle"),
      node(480, 124, 280, 66, "① 微压缩", "只留最近 3 个工具结果的全文", { hi: "3-4" }),
      node(480, 210, 280, 66, "② 自动摘要", "超过上限 → 存盘 + 整段摘要", { hi: "5-6" }),
      node(480, 296, 280, 66, "③ 出错补救", "API 报太长 → 压缩后重试一次", { hi: "7" }),
    ].join(""),
  };

  // ===== s09 记忆 =====
  VIZ.s09 = {
    title: "跨会话记忆",
    steps: [
      ["顺口说了一句偏好", "你说：「顺便说一下，我写代码都喜欢用 Tab 缩进。2+3 等于几？」模型回答 5。"],
      ["回合结束：提取记忆", "回答完之后，程序单独调用一次模型：「这段对话里，有什么值得以后长期记住的？」"],
      ["写进记忆文件", "模型挑出 1 条：用户写代码喜欢用 Tab 缩进。程序把它存成 .memory/ 里的一个文件，并更新目录 MEMORY.md。"],
      ["程序重启", "关掉程序再打开：messages[] 清空了，但 .memory/ 文件夹还在硬盘上。"],
      ["新的问题", "你问：「我喜欢哪种缩进方式？」"],
      ["挑出相关记忆", "回答之前，程序把记忆目录交给模型挑：哪几条和这个问题有关？选中的那条被放进 system prompt。"],
      ["想起来了", "模型回答：「你喜欢用 Tab 缩进。」这条信息跨过了程序重启。"],
    ],
    svg: () => [
      panel(20, 20, 360, 200, "会话 A"),
      chip(34, 54, 332, "user", "我喜欢 Tab 缩进。2+3=?", { hi: "1" }),
      chip(34, 102, 332, "assistant", "5"),
      chip(34, 150, 332, "ask", "有什么值得长期记住？", { s: "2-", hi: "2" }),
      `<g class="vz-gone"${at({ s: "4-" })}><rect x="20" y="20" width="360" height="200" rx="14"/>
        <text x="200" y="114" text-anchor="middle">会话 A 结束</text><text x="200" y="140" text-anchor="middle">messages[] 已清空</text></g>`,
      badge(320, 224, 140, "程序重启", "round", { s: "4" }),
      panel(400, 20, 360, 200, "会话 B（重启之后）", { s: "4-" }),
      chip(414, 54, 332, "user", "我喜欢哪种缩进方式？", { s: "5-", hi: "5" }),
      chip(414, 102, 332, "ask", "记忆目录里哪条相关？", { s: "6-", hi: "6" }),
      chip(414, 150, 332, "assistant", "你喜欢用 Tab 缩进", { s: "7", hi: "7" }),
      panel(20, 256, 740, 128, ".memory/ 文件夹（存在硬盘上）"),
      label(390, 330, "（还没有任何记忆）", { s: "1-2" }, "vz-empty", "middle"),
      row(34, 290, 360, "MEMORY.md", "目录：每条记忆一行", { s: "3-", hi: "6" }, 38),
      row(34, 336, 360, "tabs-indentation.md", "喜欢用 Tab 缩进", { s: "3-", hi: "3,7" }, 38),
      label(746, 372, "程序重启也不会丢", { s: "4-" }, "vz-lbl", "end"),
      edge("M330,190 C330,240 300,246 300,286", { s: "3", hi: "3" }, "存成文件", 340, 244, "start"),
      edge("M394,355 C600,355 590,250 590,224", { s: "6-", hi: "6" }, "放进 system prompt", 604, 262, "start"),
    ].join(""),
  };

  // ===== s10 任务系统 =====
  const s10card = (x, y, t, h, states) => card(x, y, 210, 84, t, hiOf(h)) +
    states.map(([s, text, kind]) => badge(x + 104, y + 48, 96, text, kind, { s })).join("");
  VIZ.s10 = {
    title: "任务板和依赖",
    steps: [
      ["建任务", "模型调用 4 次 create_task。每个任务存成 .tasks/ 下的一个 JSON 文件，状态都是「待办」。"],
      ["连上依赖", "update_task 写上 blockedBy：API 要等数据库，测试要等 API，文档要等数据库。"],
      ["谁能开始？", "只有不被卡住的任务能认领。现在只有「搭数据库结构」可以开始。"],
      ["认领", "claim_task：状态变成「进行中」，记上负责人。"],
      ["完成并解锁", "complete_task：数据库完成了。依赖它的「写 API 接口」「写文档」随之解锁。"],
      ["存在磁盘上", "任务都存在文件里。程序重启、换一个 Agent，任务板都还在。这是后面团队协作的基础。"],
    ],
    svg: () => [
      s10card(30, 150, "搭数据库结构", "3-5", [["1-2", "待办", "plain"], ["3", "可开始", "ok"], ["4", "进行中", "wait"], ["5-", "完成 ✓", "ok"]]),
      s10card(290, 40, "写 API 接口", "5", [["1", "待办", "plain"], ["2-4", "卡住", "warn"], ["5-", "可开始", "ok"]]),
      s10card(290, 260, "写文档", "5", [["1", "待办", "plain"], ["2-4", "卡住", "warn"], ["5-", "可开始", "ok"]]),
      s10card(550, 40, "写测试", "", [["1", "待办", "plain"], ["2-", "卡住", "warn"]]),
      label(44, 254, "负责人：agent", { s: "4-" }, "vz-note"),
      edge("M240,180 C265,180 265,82 286,82", { s: "2-", hi: "5" }, "解锁", 256, 116, "end"),
      edge("M240,204 C265,204 265,302 286,302", { s: "2-", hi: "5" }, "解锁", 256, 276, "end"),
      edge("M500,82 L546,82", { s: "2-" }),
      panel(550, 160, 210, 220, ".tasks/（磁盘）", hiOf("6")),
      ["task_2fadd820.json", "task_735b956d.json", "task_2e56f485.json", "task_a49f95ba.json"]
        .map((f, k) => label(564, 210 + k * 30, f, {}, "vz-mono")).join(""),
      label(564, 350, "重启后还在", { s: "6" }, "vz-done"),
    ].join(""),
  };

  // ===== s12 定时调度 =====
  VIZ.s12 = {
    title: "定时调度",
    steps: [
      ["登记一个定时任务", "你说：「每分钟执行一次 run date」。模型调用 schedule_cron，登记时间规则 * * * * * 和要执行的 prompt。"],
      ["调度线程在后台看表", "一个后台线程每隔一会儿看一次时间，检查有没有任务到点。"],
      ["到点了", "时间走到下一分钟，规则匹配。调度线程把 prompt 放进 cron_queue 队列。"],
      ["Agent 空闲时取出", "主循环在等你输入的空档检查队列，把「run date」当成一条新的提问来处理。"],
      ["自动执行", "模型调用 bash 运行 date，输出当前时间。整个过程没有人开口。"],
      ["每分钟一次", "下一分钟又触发一次。用 cancel_cron 取消之后，就不再触发了。"],
    ],
    svg: () => [
      panel(20, 20, 230, 180, "定时任务表"),
      row(34, 56, 202, "* * * * *", "run date", { hi: "1,3" }, 40),
      label(34, 124, "每分钟一次 · 只在本次会话", {}, "vz-note"),
      badge(34, 150, 190, "cancel_cron 后删除", "plain", { s: "6" }),
      node(20, 220, 230, 160, "", "", { hi: "2" }),
      [["1-2", "02:17:59"], ["3-5", "02:18:00"], ["6", "02:19:00"]].map(([s, t]) => label(135, 300, t, { s }, "vz-clock", "middle")).join(""),
      label(135, 340, "调度线程每秒看一次表", {}, "vz-note", "middle"),
      edge("M135,220 L135,204", { s: "2-", hi: "2" }),
      panel(280, 20, 200, 360, "cron_queue 队列"),
      label(380, 200, "（空）", { s: "1-2,5" }, "vz-empty", "middle"),
      chip(294, 56, 172, "note", "run date", { s: "3-4,6", hi: "3,6" }),
      edge("M236,76 L290,76", { s: "3", hi: "3" }, "到点", 263, 68),
      panel(510, 20, 250, 360, "Agent 主循环"),
      badge(524, 52, 222, "空闲，等你输入…", "plain", { s: "1-3" }),
      chip(524, 92, 222, "user", "[定时] run date", { s: "4-", hi: "4" }),
      chip(524, 140, 222, "assistant", "调用 bash：date", { s: "5-" }),
      chip(524, 188, 222, "tool", "02:18:40 CST 2026", { s: "5-", hi: "5" }),
      chip(524, 246, 222, "user", "[定时] run date", { s: "6", hi: "6" }),
      edge("M466,76 C494,76 494,112 520,112", { s: "4", hi: "4" }, "取出", 494, 70),
      token("2:20,220;3:294,56;4:524,92;5:524,188;6:294,56", { s: "2-" }),
    ].join(""),
  };

  // ===== s13 Agent 团队 =====
  const s13task = (y, t, states) => card(204, y, 302, 50, t) +
    states.map(([s, text, kind]) => badge(386, y + 12, 110, text, kind, { s })).join("");
  VIZ.s13 = {
    title: "Agent 团队",
    steps: [
      ["主控拆任务", "你把一个功能交给主控 lead。它在共享任务板上建了 3 个任务：配置、核心实现、测试（测试要等前两项）。"],
      ["招队友", "lead 调用 spawn_teammate 招了两个队友。每个队友在自己的线程里跑完整的 Agent 循环，有自己的 messages[]。"],
      ["认领任务，同时干活", "两个队友各认领一项。核心实现在独立的 worktree 里改代码，和别人互不干扰。两人同时干。"],
      ["通过邮箱汇报", "队友干完就 complete_task，并往 lead 的邮箱文件里写一条结果消息。"],
      ["解锁下一项", "前两项都完成，「测试」解锁。一个队友认领它，写测试、运行。"],
      ["队友之间发消息", "测试负责人发现核心代码还在 worktree 里，用 send_message 提醒 lead 同步。lead 合并后回信。"],
      ["汇总、收工", "测试通过。lead 读邮箱、汇总结果交给你，并通知队友收工。"],
    ],
    svg: () => [
      node(20, 150, 140, 80, "主控 lead", "拆任务、汇总", { hi: "1,6,7" }),
      panel(190, 20, 330, 215, "共享任务板 .tasks/", hiOf("1")),
      s13task(56, "配置 config.py", [["1-2", "待办", "plain"], ["3", "进行中", "wait"], ["4-", "完成 ✓", "ok"]]),
      s13task(116, "核心 wordcount.py", [["1-2", "待办", "plain"], ["3", "进行中", "wait"], ["4-", "完成 ✓", "ok"]]),
      s13task(176, "测试 test_wordcount", [["1-4", "等前两项", "warn"], ["5-6", "进行中", "wait"], ["7", "完成 ✓", "ok"]]),
      node(560, 20, 200, 70, "队友 config-agent", "自己的循环和 messages[]", { s: "2-", hi: "3-5" }),
      node(560, 120, 200, 70, "队友 core-agent", "在 worktree 里改代码", { s: "2-", hi: "3-4" }),
      edge("M90,150 C90,0 650,0 660,16", { s: "2-", hi: "2" }, "spawn_teammate", 370, 6),
      edge("M560,55 L510,81", { s: "3-", hi: "3,5" }, "认领", 536, 56),
      edge("M560,155 L510,141", { s: "3-", hi: "3" }, "认领", 536, 168),
      edge("M160,180 L200,140", { hi: "1" }),
      panel(190, 255, 570, 130, "邮箱 .mailboxes/"),
      chip(204, 288, 270, "note", "config-agent：配置完成", { s: "4-", hi: "4" }),
      chip(486, 288, 262, "note", "core-agent：核心完成", { s: "4-", hi: "4" }),
      chip(204, 336, 544, "note", "测试负责人 → lead：核心还在 worktree，请同步", { s: "6", hi: "6" }),
      chip(204, 336, 544, "note", "lead → 队友：结果已汇总，请收工", { s: "7", hi: "7" }),
      edge("M740,190 L740,284", { s: "4-", hi: "4" }, "写邮箱", 730, 240, "end"),
      edge("M200,320 C120,320 90,300 90,234", { s: "4-", hi: "4,6" }, "lead 读邮箱", 28, 344, "start"),
    ].join(""),
  };

  // ===== s14 MCP =====
  const S14_BUILTIN = ["bash", "read_file", "write_file", "edit_file", "glob", "connect_mcp"];
  VIZ.s14 = {
    title: "MCP：外接工具",
    steps: [
      ["只有内置工具", "一开始，模型的工具清单里只有内置的 bash、read_file、write_file 等，外加一个 connect_mcp。"],
      ["需要外部能力", "你说：「连接 docs server，搜索 agent hooks」。内置工具做不到。"],
      ["连接服务器", "模型调用 connect_mcp(\"docs\")。程序连上服务器，问它：你有哪些工具？（tools/list）"],
      ["新工具上架", "服务器报来 search、get_version。程序加上前缀，变成 mcp__docs__search 等，放进工具清单。"],
      ["像普通工具一样用", "下一次请求，模型直接调用 mcp__docs__search。程序把调用转发给服务器（tools/call），结果作为 tool_result 返回。"],
      ["危险操作照样要确认", "MCP 工具也走同样的权限检查。比如 deploy 服务器的「触发部署」，执行前要你点头；「查状态」直接放行。"],
    ],
    svg: () => [
      panel(20, 20, 300, 360, "发给模型的工具清单"),
      S14_BUILTIN.map((n, k) => row(34, 52 + k * 40, 272, n, n === "connect_mcp" ? "连接外部服务" : "内置", hiOf(n === "connect_mcp" ? "3" : ""), 34)).join(""),
      row(34, 300, 272, "mcp__docs__search", "外部", { s: "4-", hi: "4-5" }, 32),
      row(34, 340, 272, "mcp__docs__get_version", "外部", { s: "4-", hi: "4" }, 32),
      panel(460, 20, 300, 180, "MCP 服务器：docs", { s: "1-5" }),
      label(610, 120, "未连接", { s: "1-2" }, "vz-empty", "middle"),
      row(474, 56, 272, "search", "搜索文档", { s: "3-5", hi: "5" }, 38),
      row(474, 102, 272, "get_version", "查 API 版本", { s: "3-5" }, 38),
      panel(460, 20, 300, 180, "MCP 服务器：deploy", { s: "6" }),
      row(474, 56, 272, "status", "查状态 · 放行", { s: "6" }, 38),
      row(474, 102, 272, "trigger", "触发部署 · 要确认", { s: "6", hi: "6" }, 38),
      edge("M306,269 C390,269 400,150 456,150", { s: "3", hi: "3" }, "tools/list", 392, 232),
      edge("M456,180 C400,180 380,316 324,316", { s: "4", hi: "4" }, "加前缀，放进清单", 396, 272),
      edge("M306,316 C400,316 400,75 470,75", { s: "5", hi: "5" }, "tools/call", 392, 214),
      chip(460, 220, 300, "user", "连接 docs，搜 agent hooks", { s: "2", hi: "2" }),
      chip(460, 220, 300, "tool", "Found 3 results", { s: "5", hi: "5" }),
      badge(460, 227, 300, "trigger 执行前要你确认", "warn", { s: "6" }),
    ].join(""),
  };

  // ===== s15 Harness 集成 =====
  const S15_TAGS = [
    ["1", [["钩子 UserPromptSubmit"]]],
    ["2", [["记忆召回", "ok"], ["技能目录", "ok"], ["当前工具清单", "ok"]]],
    ["3", [["待办清单 todo_write", "wait"], ["MCP 工具", "wait"]]],
    ["4", [["权限检查", "warn"], ["钩子 PreToolUse"]]],
    ["5", [["内置工具 / MCP 转发", "wait"], ["钩子 PostToolUse"], ["大结果压缩"]]],
    ["6", [["Agent 循环", "round"]]],
    ["7", [["钩子 Stop"], ["记忆提取", "ok"]]],
  ];
  VIZ.s15 = {
    title: "一次完整的回合",
    steps: [
      ["收到提问", "你说：「从已连接的文档里查一下 agent loop 的说明」。UserPromptSubmit 钩子先记一笔。"],
      ["组装上下文", "调用模型前，程序拼好 system prompt：基础说明 + 和问题相关的记忆 + 技能目录 + 当前工具清单（含 MCP 工具）。"],
      ["模型列计划、要工具", "模型先用 todo_write 列计划，再请求 connect_mcp 和 mcp__docs__search。"],
      ["守门", "每个工具调用先过 PreToolUse：权限检查、记日志。安全的放行，危险的问你。"],
      ["执行", "内置工具在本机执行，MCP 工具转发给外部服务器。结果再过 PostToolUse，太长的会被压缩。"],
      ["循环直到完成", "结果写回 messages[]，再调用模型……一圈一圈，直到模型不再要工具。"],
      ["收尾", "Stop 钩子统计这一轮；程序再单独调用一次模型提取记忆。前面所有章节的机制，都挂在同一个循环上。"],
    ],
    svg: () => [
      node(20, 40, 170, 64, "① 收到提问", "钩子记一笔", { hi: "1" }),
      node(210, 40, 170, 64, "② 组装上下文", "记忆 · 技能 · 工具清单", { hi: "2" }),
      node(400, 40, 170, 64, "③ 调用模型", "", { hi: "3,6" }),
      node(590, 40, 170, 64, "⑦ 收尾", "Stop 钩子 · 提取记忆", { hi: "7" }, "end"),
      node(590, 190, 170, 64, "④ 守门", "权限 · PreToolUse", { hi: "4" }),
      node(400, 190, 170, 64, "⑤ 执行", "内置工具 / MCP", { hi: "5" }),
      node(210, 190, 170, 64, "⑥ 写回", "结果 → messages[]", { hi: "6" }),
      edge("M190,72 L206,72", { hi: "2" }), edge("M380,72 L396,72", { hi: "3" }),
      edge("M570,72 L586,72", { hi: "7" }, "不再要工具", 578, 30),
      edge("M540,104 C570,150 660,140 675,186", { hi: "4" }, "要工具", 640, 140),
      edge("M590,222 L574,222", { hi: "5" }), edge("M400,222 L384,222", { hi: "6" }),
      edge("M295,190 C310,140 420,140 440,108", { hi: "6" }, "再转一圈", 330, 146),
      panel(20, 280, 740, 104, "这一步用到的机制"),
      S15_TAGS.map(([s, list]) => tags(34, 326, list, s)).join(""),
      token("1:20,72;2:210,72;3:400,72;4:590,222;5:400,222;6:210,222;7:590,72"),
    ].join(""),
  };

  // ===== s16 工作流 =====
  const S16_AREAS = ["安全", "风格", "性能", "正确性"];
  VIZ.s16 = {
    title: "工作流运行时",
    steps: [
      ["只调用一次工具", "模型只调用一次 Workflow 工具：运行保存好的 review-changes，把改动说明当参数传进去。"],
      ["阶段 1：并行审查", "工作流脚本按写好的步骤，同时派出 4 个审查员：安全、风格、性能、正确性。每个都是一次独立的模型调用。"],
      ["阶段 2：逐条核实", "审查员报出的每个问题，脚本再派一个核查员反过来挑刺，判断是不是真的。"],
      ["每一步记进日志", "每次子 Agent 调用的输入和结果，都追加进 journal 日志文件。"],
      ["中途失败", "「正确性」审查员的输出太长被截断，汇总时格式校验失败，工作流报错返回给模型。"],
      ["续跑：命中缓存", "模型用 resume_from_run_id 续跑。已完成的调用直接从 journal 取结果，不再调用模型；只重跑失败的那一步。"],
      ["汇总交回", "工作流返回核实过的问题清单。主模型只看到这份汇总，再用中文总结给你。"],
    ],
    svg: () => [
      node(20, 140, 130, 80, "主模型", "只调用一次", { hi: "1,5,7" }),
      panel(180, 20, 420, 320, "Workflow：review-changes"),
      label(200, 64, "阶段 1：并行审查", {}, "vz-lbl"),
      label(410, 64, "阶段 2：逐条核实", { s: "3-" }, "vz-lbl"),
      S16_AREAS.map((a, k) => row(200, 76 + k * 52, 180, "审查员", a, { s: "2-", hi: a === "正确性" ? "2,5-6" : "2" }, 44)).join(""),
      S16_AREAS.map((a, k) => row(410, 76 + k * 52, 170, "核查", a + "问题", { s: "3-", hi: "3" }, 44)).join(""),
      edge("M380,180 L406,180", { s: "3-" }),
      badge(200, 290, 380, "汇总时格式校验失败 → 报错返回", "warn", { s: "5" }),
      badge(200, 290, 380, "续跑：已完成的步骤直接用缓存", "wait", { s: "6" }),
      panel(620, 20, 140, 320, "journal 日志", hiOf("4,6")),
      Array.from({ length: 9 }, (_, k) => label(634, 64 + k * 26, `agent #${k + 1} ✓`, { s: "4-" }, "vz-mono")).join(""),
      label(690, 320, "↺ 命中缓存", { s: "6" }, "vz-done", "middle"),
      edge("M150,166 L176,166", { hi: "1" }),
      edge("M176,196 L150,196", { s: "5-", hi: "5,7" }),
      chip(180, 352, 580, "sum", "确认 10 个问题：高危 4 · 中危 3 · 低危 2 …", { s: "7", hi: "7" }, 36),
    ].join(""),
  };

  // ===== s17 目标循环 =====
  VIZ.s17 = {
    title: "目标循环",
    steps: [
      ["设定目标", "你输入 /goal：「当前目录下存在 hello.py，并且运行 python3 hello.py 输出 Hello, Goal!」"],
      ["照常干活", "模型照常循环：查看目录、写 hello.py、运行它。"],
      ["模型想收工", "模型不再调用工具，说：「做好了」。普通 Agent 到这里就结束了。"],
      ["裁判上场", "目标模式下，Stop 钩子拦住这一步：程序单独调用一次模型当裁判，把目标和对话记录交给它判断。"],
      ["没达标就打回去", "如果裁判说「还没达成」，理由会作为一条新消息追加进 messages[]，模型接着干。（这次录制里一次就达标了。）"],
      ["达标才真正结束", "裁判判断：达成了，hello.py 运行输出 Hello, Goal!。循环这才真正结束。"],
    ],
    svg: () => [
      chip(20, 20, 740, "task", "存在 hello.py，运行 python3 hello.py 输出 Hello, Goal!", { hi: "1" }),
      node(20, 110, 170, 64, "调用模型", "", { hi: "2,3" }),
      node(20, 250, 170, 64, "执行工具", "看目录 · 写文件 · 运行", { hi: "2" }),
      edge("M80,174 L80,246", { hi: "2" }), edge("M130,246 L130,178", { hi: "2" }),
      label(140, 216, "照常循环", {}, "vz-note"),
      `<g class="vz-node vz-dia"${at({ hi: "3" })}><path d="M330,106 L400,142 L330,178 L260,142 Z"/>
        <text class="vz-t" x="330" y="147">想停下</text></g>`,
      edge("M190,142 L256,142", { hi: "3" }),
      label(330, 204, "普通 Agent：到此结束", { s: "3" }, "vz-lbl", "middle"),
      node(470, 110, 170, 64, "裁判", "单独调用一次模型", { hi: "4-6" }),
      edge("M400,142 L466,142", { hi: "4" }, "Stop 钩子", 433, 132),
      edge("M555,110 C555,70 105,70 105,106", { s: "5", hi: "5" }, "没达成：理由写回 messages[]", 330, 98),
      node(470, 250, 170, 64, "真正结束", "把结果给你", { hi: "6" }, "end"),
      edge("M555,174 L555,246", { hi: "6" }, "达成", 565, 214, "start"),
      badge(660, 129, 100, "未达成 ✗", "warn", { s: "5" }),
      badge(660, 129, 100, "达成 ✓", "ok", { s: "6" }),
      token("1:20,110;2:20,250;3:260,142;4:470,110;5:20,110;6:470,250", { s: "2-" }),
    ].join(""),
  };

  // ----- 引擎 -----
  function ranges(spec) {
    return String(spec).split(",").map((p) => {
      const [a, b] = p.split("-");
      return [Number(a), b === undefined ? Number(a) : b === "" ? Infinity : Number(b)];
    });
  }
  const inRange = (spec, s) => ranges(spec).some(([a, b]) => s >= a && s <= b);
  function keyed(spec, s) {
    let hit = null;
    for (const part of String(spec).split(";")) {
      const [k, v] = part.split(":");
      if (Number(k) <= s) hit = v;
      else if (hit === null) hit = v;
    }
    return hit;
  }

  // 按场景里所有步骤的元素算出内容范围，四周留同样的边，横向居中；宽度固定，保证各章字号一致
  const FIT_W = 800, FIT_PAD = 26;
  function fit(svg) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of svg.querySelector(".vz-scene").children) {
      if (el.classList.contains("vz-token")) continue;
      const b = el.getBBox();
      if (!b.width && !b.height) continue;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
    }
    if (x1 === Infinity) return;
    const w = Math.max(FIT_W, x2 - x1 + 2 * FIT_PAD);
    const h = y2 - y1 + 2 * FIT_PAD;
    svg.setAttribute("viewBox", `${x1 - (w - (x2 - x1)) / 2} ${y1 - FIT_PAD} ${w} ${h}`);
  }

  // 整张卡片（标题栏 + 示意图 + 说明 + 按钮）要放进一屏：从标签栏到窗口底部还剩多少，示意图就最多占多高，
  // 超出时等比例缩小；首次打开时如果卡片底部在屏幕外，把页面滚到标签栏的位置
  function fitScreen(root, svg, first) {
    const tabs = document.querySelector(".tabs");
    const anchor = tabs && tabs.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING ? tabs : root;
    const bar = document.querySelector(".topbar");
    const top = (bar && bar.offsetHeight) || 0;
    svg.style.maxHeight = "none";
    const chrome = root.offsetHeight - svg.getBoundingClientRect().height;
    const above = root.getBoundingClientRect().top - anchor.getBoundingClientRect().top;
    svg.style.maxHeight = `${Math.max(240, innerHeight - top - 8 - above - chrome - 16)}px`;
    if (first && root.getBoundingClientRect().bottom > innerHeight) {
      scrollTo({ top: anchor.getBoundingClientRect().top + scrollY - top - 8, behavior: "instant" });
    }
  }

  const PLAY_MS = 4200;
  window.renderViz = function (lessonId, mount) {
    const def = VIZ[lessonId];
    if (!def) return false;
    const steps = def.steps;
    let cur = 0;
    let timer = null;
    mount.innerHTML = `<section class="vz">
      <header class="vz-head"><span class="vz-id">${esc(lessonId.toUpperCase())}</span>
        <span class="vz-name">${esc(def.title)}</span><span class="vz-n" id="vzN"></span></header>
      <div class="vz-stage"><svg viewBox="0 0 780 400" class="vz-svg" role="img" aria-label="${esc(def.title)}">
        <defs>
          <marker id="vzArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b1b1b7"/></marker>
          <marker id="vzArrOn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#111"/></marker>
        </defs>
        <g class="vz-scene">${def.svg()}</g></svg></div>
      <div class="vz-foot">
        <div class="vz-step"><span class="vz-num" id="vzNum"></span>
          <div><div class="vz-st" id="vzTitle"></div><div class="vz-sd" id="vzDesc"></div></div></div>
        <div class="vz-ctl">
          <button data-act="reset" class="icon" title="从头开始" aria-label="从头开始">↺</button>
          <button data-act="prev" title="上一步（←）">‹ 上一步</button>
          <button data-act="next" class="next" title="下一步（→）">下一步 ›</button>
          <button data-act="play" title="自动播放（空格）">▶ 自动播放</button>
          <div class="vz-bars">${steps.map((_, k) => `<button data-go="${k}" aria-label="第 ${k + 1} 步"><i></i></button>`).join("")}</div>
        </div>
      </div>
    </section>`;
    const root = mount.querySelector(".vz");
    const svg = mount.querySelector("svg");
    const $t = mount.querySelector("#vzTitle");
    const $d = mount.querySelector("#vzDesc");
    const $n = mount.querySelector("#vzN");
    const $num = mount.querySelector("#vzNum");
    const $play = mount.querySelector("[data-act=play]");
    const bars = [...mount.querySelectorAll(".vz-bars button")];

    fit(svg);

    function show(i) {
      cur = Math.max(0, Math.min(steps.length - 1, i));
      const s = cur + 1;
      svg.querySelectorAll("[data-s]").forEach((el) => el.classList.toggle("off", !inRange(el.dataset.s, s)));
      svg.querySelectorAll("[data-hi]").forEach((el) => el.classList.toggle("hi", inRange(el.dataset.hi, s)));
      // 有高亮时，其余节点和连线变淡，视线自然落在这一步的重点上
      svg.classList.toggle("spot", !!svg.querySelector(".hi:not(.off)"));
      svg.querySelectorAll("[data-xy]").forEach((el) => {
        const [x, y] = keyed(el.dataset.xy, s).split(",");
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      svg.querySelectorAll("[data-sx]").forEach((el) => { el.style.transform = `scaleX(${keyed(el.dataset.sx, s)})`; });
      $num.textContent = s;
      $t.textContent = steps[cur][0];
      $d.textContent = steps[cur][1];
      $n.textContent = `第 ${s} / ${steps.length} 步`;
      bars.forEach((b, k) => { b.className = k === cur ? "on" : k < cur ? "past" : ""; });
    }
    function stop() { clearInterval(timer); timer = null; $play.textContent = "▶ 自动播放"; root.classList.remove("playing"); }
    function play() {
      if (cur >= steps.length - 1) show(0);
      $play.textContent = "❚❚ 暂停";
      root.classList.add("playing");
      show(cur);
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
      if (!document.body.contains(svg)) { document.removeEventListener("keydown", onKey); return stop(); }
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === "ArrowRight") { stop(); show(cur + 1); }
      else if (e.key === "ArrowLeft") { stop(); show(cur - 1); }
      else if (e.key === " ") { e.preventDefault(); timer ? stop() : play(); }
    };
    document.addEventListener("keydown", onKey);
    // 第一步直接摆好，不播放淡出和移动的过渡，避免打开时闪一下
    svg.classList.add("vz-init");
    show(0);
    void svg.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove("vz-init")));
    // 按说明文字最长的那一步留出底部高度，切换步骤时卡片不会长出屏幕
    const longest = steps.reduce((a, b) => (b[1].length > a[1].length ? b : a));
    [$t.textContent, $d.textContent] = longest;
    fitScreen(root, svg, true);
    [$t.textContent, $d.textContent] = steps[0];
    const onResize = () => (document.body.contains(svg) ? fitScreen(root, svg) : removeEventListener("resize", onResize));
    addEventListener("resize", onResize);
    return true;
  };

  window.renderReplay = async function (lesson, panel) {
    // 有新版（具体任务 + 角色泳道 + 真实代码）的章节先用新版
    if (window.renderStory && (await window.renderStory(lesson, panel))) return;
    if (!renderViz(lesson.id, panel)) panel.innerHTML = '<p class="loading">这一课的动画还没有做好。</p>';
  };
})();
