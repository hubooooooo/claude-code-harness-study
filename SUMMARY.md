# 项目摘要

## 项目名称
**Learn Claude Code -- 真正的 Agent Harness 工程**

## 项目定位
这是一个从 0 到 1 的 **Agent Harness（代理运行环境/载具）** 工程教学仓库。核心哲学是：**Agency（智能）来自模型训练，Agent 产品 = 模型 + Harness（载具）**。学校教你如何构建让模型能够感知、推理和行动的"载具"，而不是训练模型本身。

## 核心理念
- **模型是驾驶者，Harness 是载具** —— 智能来自模型，环境提供行动空间
- **反对"提示词水管工"** —— 批判用 if-else、节点图等过程式逻辑拼凑 LLM 的做法，认为那不是真正的 Agent
- **Harness 组成**：Tools（工具）+ Knowledge（知识）+ Observation（观察）+ Action Interfaces（行动接口）+ Permissions（权限）

## 教学内容：17 个递进式课程

| 阶段 | 章节 | 主题 |
|---|---|---|
| 基础能力 | s01–s04 | Agent Loop、Tool Use、Permission、Hooks |
| 复杂任务 | s05–s08 | TodoWrite、Subagent、Skill Loading、Context Compact |
| 跨会话记忆 | s09 | Memory |
| 长期运行 | s10–s12 | Task System、Background Tasks、Cron Scheduler |
| 团队协作 | s13 | Agent Teams |
| 外部扩展 | s07, s14–s15 | Skill Loading、MCP Plugin、集成 Harness |
| 编排闭环 | s16–s17 | Workflow Runtime、Goal Loop |

## 依赖（requirements.txt）
- `anthropic>=0.25.0` — Anthropic API 客户端，用于调用 Claude 模型
- `python-dotenv>=1.0.0` — 环境变量管理（加载 `.env` 文件）
- `pyyaml>=6.0` — YAML 解析，用于配置/技能文件

## 项目结构
- `s01_agent_loop/` ~ `s17_goal_loop/` — 17 章主线，每章含英文/中文/日文 README、可运行 code.py 和 SVG 图示
- `skills/` — s07 使用的技能文件
- `tests/` — 测试

## 快速开始
```sh
git clone https://github.com/<你的用户名>/<你的仓库名>
python3 run.py                # 自动装依赖 + 引导填 key + 选择章节
python run.py 3               # 直接运行指定章节
```

## 愿景
将 Agent Harness 模式泛化到所有领域（农业、医疗、制造、教育…），"用真正的 Agent 铺满宇宙"。

## 许可证
MIT
