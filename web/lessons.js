// 课程目录：章节编号、目录名、中文名、英文名、一句话要点，以及代码对比的默认基准章节。
// 默认基准按各章 README 的说法设定（例如 s10/s11/s12/s14/s17 都以 s04 为基础）。
window.LESSONS = [
  { id: "s01", dir: "s01_agent_loop",         zh: "智能体循环",     en: "Agent Loop",         tip: "一个循环 + Bash 就是一个 Agent",       base: null },
  { id: "s02", dir: "s02_tool_use",           zh: "工具调用",       en: "Tool Use",           tip: "新增工具 = 新增一个 handler",          base: "s01" },
  { id: "s03", dir: "s03_permission",         zh: "权限",           en: "Permission",         tip: "先定边界，再给自由",                   base: "s02" },
  { id: "s04", dir: "s04_hooks",              zh: "钩子",           en: "Hooks",              tip: "围绕循环挂扩展点，不改主循环",         base: "s03" },
  { id: "s05", dir: "s05_todo_write",         zh: "任务规划",       en: "TodoWrite",          tip: "先列计划再执行",                       base: "s04" },
  { id: "s06", dir: "s06_subagent",           zh: "子 Agent",       en: "Subagent",           tip: "给子任务一份全新 messages[]",          base: "s04" },
  { id: "s07", dir: "s07_skill_loading",      zh: "技能加载",       en: "Skill Loading",      tip: "按需加载知识，而非一次性塞入",         base: "s04" },
  { id: "s08", dir: "s08_context_compact",    zh: "上下文压缩",     en: "Context Compact",    tip: "上下文总会满，要有腾出空间的办法",     base: "s04" },
  { id: "s09", dir: "s09_memory",             zh: "记忆",           en: "Memory",             tip: "记住该记的，忘掉该忘的",               base: "s04" },
  { id: "s10", dir: "s10_task_system",        zh: "任务系统",       en: "Task System",        tip: "大目标拆成小任务，落盘持久化",         base: "s04" },
  { id: "s11", dir: "s11_background_tasks",   zh: "后台任务",       en: "Background Tasks",   tip: "慢操作进后台，Agent 继续思考",         base: "s04" },
  { id: "s12", dir: "s12_cron_scheduler",     zh: "定时调度",       en: "Cron Scheduler",     tip: "按时间自动触发，无需人工",             base: "s04" },
  { id: "s13", dir: "s13_agent_teams",        zh: "Agent 团队",     en: "Agent Teams",        tip: "太大就交给队友分工",                   base: "s10" },
  { id: "s14", dir: "s14_mcp_plugin",         zh: "MCP 插件",       en: "MCP Plugin",         tip: "能力不够？通过 MCP 外接工具",          base: "s04" },
  { id: "s15", dir: "s15_integrated_harness", zh: "Harness 集成",   en: "Integrated Harness", tip: "不加新部件，把前面 14 个部件装进一个循环", base: "s14" },
  { id: "s16", dir: "s16_workflow_runtime",   zh: "工作流运行时",   en: "Workflow Runtime",   tip: "固定编排写进代码，支持续跑",           base: "s04" },
  { id: "s17", dir: "s17_goal_loop",          zh: "目标循环",       en: "Goal Loop",          tip: "由目标决定循环何时停止",               base: "s04" },
];

// 侧栏分组（按章节顺序）。三段：部件篇 s01–s14 → 总装 s15 → 进阶 s16–s17。
// s16 是往 s15 总装好的系统里加工作流工具，所以总装排在它前面。
window.STAGES = [
  { label: "部件篇 · 基础：让 Agent 能动手", from: 1,  to: 4 },
  { label: "部件篇 · 复杂任务与上下文",     from: 5,  to: 9 },
  { label: "部件篇 · 长期运行",             from: 10, to: 12 },
  { label: "部件篇 · 协作与扩展",           from: 13, to: 14 },
  { label: "总装 · 把 s01–s14 装成一个系统", from: 15, to: 15 },
  { label: "进阶 · 在完整系统上再加两个部件", from: 16, to: 17 },
];

// 章节以外的文档：不是章节，没有代码和动画，只渲染 guide/ 下的文档。
// stage: "before" 排在 s01 之前（导读），"after" 排在 s17 之后（产品经理决策实战）。
window.GUIDES = [
  { id: "intro", file: "guide/intro.md", stage: "before", tag: "导读", zh: "第 0 课 · 导读", en: "Start Here", tip: "这门课要你学会什么，每章该重点看哪里" },
  { id: "glossary", file: "guide/glossary.md", stage: "before", tag: "查词", zh: "名词表", en: "Glossary", tip: "看不懂的词随时回来查" },
  { id: "guide", file: "guide/README.md", stage: "after", tag: "选型", zh: "选型篇", en: "Choosing Your Harness", tip: "走哪条路、用哪些部件、规则怎么定" },
  { id: "guide-case", file: "guide/case-knowledge-base.md", stage: "after", tag: "案例", zh: "案例：企业知识库助手", en: "Case · Knowledge Base", tip: "低代码验证，再换通用框架；只读 Agent" },
  { id: "guide-cs", file: "guide/case-customer-service.md", stage: "after", tag: "案例", zh: "案例：跨境电商售后客服", en: "Case · Customer Service", tip: "厂商开发包；Agent 要替公司退款" },
  { id: "guide-code", file: "guide/case-coding-agent.md", stage: "after", tag: "案例", zh: "案例：研发团队引入编程 Agent", en: "Case · Coding Agent", tip: "直接买成品；产品经理定配置" },
  { id: "guide-report", file: "guide/case-daily-report.md", stage: "after", tag: "案例", zh: "案例：竞品和舆情日报", en: "Case · Daily Report", tip: "大部分环节不该用 Agent" },
  { id: "practice", file: "guide/practice.md", stage: "after", tag: "练习", zh: "练习：拿到需求，做出判断", en: "Practice", tip: "7 道题：要不要 Agent、走哪条路、用哪些部件" },
  { id: "answers", file: "guide/practice-answers.md", stage: "after", tag: "答案", zh: "练习参考答案与评分要点", en: "Answer Key", tip: "先做题再看；老师批改也用这份" },
];
