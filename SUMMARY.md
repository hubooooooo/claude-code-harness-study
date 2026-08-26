# 项目摘要

## 项目概览

**Learn Claude Code** —— 一个关于 **Harness Engineering（外部载体工程）** 的 0-to-1 教学仓库。

核心思想：**Agent 的自主性（Agency）来自模型训练，不来自外部代码编排；一个可用的 Agent 产品 = 模型 + Harness（外部操作环境）。** 本仓库教开发者为模型构建高效的"操作环境"（Harness），而非"制造智能"。

## Harness 五大核心组件

```
Harness = Tools + Knowledge + Observation + Action Interfaces + Permissions
```

| 组件 | 说明 |
|---|---|
| **工具 (Tools)** | 文件 I/O、shell、网络、数据库、浏览器 |
| **知识 (Knowledge)** | 产品文档、领域参考、API 规范、风格指南 |
| **观察 (Observation)** | git diff、错误日志、浏览器状态、传感器数据 |
| **动作 (Action)** | CLI 命令、API 调用、UI 交互 |
| **权限 (Permissions)** | 沙盒隔离、审批流程、信任边界 |

## 课程结构：17 个渐进式章节

| 阶段 | 章节 | 主题 | 核心机制 |
|---|---|---|---|
| 核心能力 | **[s01](./s01_agent_loop/)** | Agent Loop | messages / while True / tool_use |
| | **[s02](./s02_tool_use/)** | Tool Use | TOOL_HANDLERS / dispatch map |
| | **[s03](./s03_permission/)** | Permission System | PermissionRule / approval pipeline |
| | **[s04](./s04_hooks/)** | Hook System | PreToolUse / PostToolUse |
| 复杂工作 | **[s05](./s05_todo_write/)** | TodoWrite | TodoItem / plan-then-execute |
| | **[s06](./s06_subagent/)** | Subagent | fresh messages[] / 上下文隔离 |
| | **[s07](./s07_skill_loading/)** | Skill Loading | SkillLoader / 按需加载 |
| | **[s08](./s08_context_compact/)** | Context Compact | 四步压缩机制 |
| 记忆系统 | **[s09](./s09_memory/)** | Memory System | selection / extraction / consolidation |
| 长任务 | **[s10](./s10_task_system/)** | Task System | TaskRecord / blockedBy / 磁盘持久化 |
| | **[s11](./s11_background_tasks/)** | Background Tasks | 线程执行 / 通知队列 |
| | **[s12](./s12_cron_scheduler/)** | Cron Scheduler | 定时调度 |
| 多Agent协作 | **[s13](./s13_agent_teams/)** | Agent Teams | 团队协作 / 任务认领 / worktrees |
| 扩展与组装 | **[s14](./s14_mcp_plugin/)** | MCP Plugin | 外部工具接入 |
| | **[s15](./s15_integrated_harness/)** | Integrated Harness | 所有机制整合到单一循环 |
| 编排与闭环 | **[s16](./s16_workflow_runtime/)** | Workflow Runtime | 脚本编排 / journal 恢复 |
| | **[s17](./s17_goal_loop/)** | Goal Loop | 独立评估器决定何时停止 |

## 运行方式

- 命令行：`python run.py`（自动装依赖 + 引导配置 key + 菜单选择章节）
- 直接运行单章：`python s01_agent_loop/code.py`
- Web 平台：`cd web && npm install && npm run dev`（localhost:3000）

## 依赖（requirements.txt）

| 包 | 版本要求 | 用途 |
|---|---|---|
| **anthropic** | >=0.25.0 | Anthropic Claude API 客户端 |
| **python-dotenv** | >=1.0.0 | 加载环境变量（如 API key） |
| **pyyaml** | >=6.0 | YAML 解析（配置/技能文件） |

## 项目结构

```
learn-claude-code/
  s01_agent_loop/ ... s17_goal_loop/   # 每章节一个文件夹
    README.md / .zh.md / .ja.md        # 三语README
    code.py                            # 可运行代码
    images/                            # SVG 图示
  agents/                              # 旧版12课可运行代码
  docs/                                # 旧版12课文档（过渡期保留）
  web/                                 # 课程Web前端
  skills/                              # s07 使用的技能文件
  tests/
```

## 相关项目

- **Kode Agent CLI**：开源编码 Agent 命令行工具（`npm i -g @shareai-lab/kode`）
- **Kode Agent SDK**：将 Agent 能力嵌入应用的库
- **claw0**：姊妹教学仓库，讲解"始终在线"个人AI助手（heartbeat + cron + IM + 记忆 + Soul）

## 版本状态（Version Status）

仓库包含两条教学轨道：

- **当前轨道：根目录 `s01-s17`**（22 个章节，规范版本，含三语 README + 可运行 code.py）
- **旧版过渡轨道：`docs/` 和 `agents/`**（保留旧的 12 课版本供老读者和旧链接使用）

新旧章节编号不完全对应，避免混用两轨编号。旧版 12 课 → 当前 17 课的映射：

| 旧版 (Legacy) | 新版 (Current) | 主题 |
|---|---|---|
| old s01 | new s01 | Agent Loop |
| old s02 | new s02 | Tool Use |
| old s03 | new s05 | TodoWrite |
| old s04 | new s06 | Subagent |
| old s05 | new s07 | Skill Loading |
| old s06 | new s08 | Context Compact |
| old s07 | new s10 | Task System |
| old s08 | new s11 | Background Tasks |
| old s09 | new s13 | Agent Teams |
| old s10 | new s13 | Team Protocols |
| old s11 | new s13 | Autonomous task claiming |
| old s12 | new s13 | Task-bound worktrees |
| 仅新版 | s03, s04, s09, s12, s14, s15, s16, s17 | Permission, Hooks, Memory, Cron, MCP, Integrated, Workflow, Goal |

## 核心模式（Agent Loop）

```python
def agent_loop(messages):
    while True:
        response = client.messages.create(
            model=MODEL, system=SYSTEM,
            messages=messages, tools=TOOLS,
        )
        messages.append({"role": "assistant", "content": response.content})

        tool_calls = [
            block for block in response.content if block.type == "tool_use"
        ]
        if not tool_calls:
            return

        results = []
        for block in tool_calls:
            output = TOOL_HANDLERS[block.name](**block.input)
            results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": output,
            })
        messages.append({"role": "user", "content": results})
```

模型决定何时调用工具、何时停止；代码只负责执行模型请求的动作。每课围绕此循环隔离一个 harness 机制。

## 项目结构（完整）

```
learn-claude-code/
  s01_agent_loop/          # 每章一个文件夹
    README.md              #   英文默认 README
    README.zh.md           #   中文翻译
    README.ja.md           #   日文翻译
    code.py                #   独立可运行代码
    images/                #   SVG 图示
  s02_tool_use/ ... s17_goal_loop/  # 后续章节（s17 为终点章）
  agents/                  # 旧版 12 个可运行副本 + s_full.py
  skills/                  # s07 使用的技能文件
  docs/                    # 旧版 12 课文档（过渡期保留）
  web/                     # 从根课程生成的 Web 前端
  tests/
```

## 相关产品与组件

**Claude Code 的本质**（Harness 化繁为简）：

```
Claude Code = 一个 agent 循环
            + 工具（bash, read, write, edit, glob, grep, browser...）
            + 按需技能加载（Skill Loading）
            + 上下文压缩（Context Compact）
            + 子代理（Subagent）
            + 带依赖图的任务系统
            + 异步邮箱团队协调
            + 任务绑定的 worktrees 并行编辑
            + 权限治理（Permission）
            + hooks 扩展系统
            + 记忆持久化（Memory）
            + MCP 外部能力路由
```

## 核心理念总结

> *"Agency comes from the model. The harness gives agency a place to land. Build the harness well, and the model will do the rest."*
>
> （自主性来自模型。外部载体给自主性落地的空间。把外部载体构建好，模型自然会做到剩下的一切。）

> *"This is not 'copy the source code.' This is 'grasp the key designs and build it yourself.'"*
>
> （这不是"复制源代码"，而是"掌握关键设计并自己构建"。）
