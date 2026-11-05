# s11: Background Tasks — 慢操作放后台

s01 → ... → s09 → s10 → `s11` → [s12](../s12_cron_scheduler/) → s13 → ... → s16 → s17

> *"慢操作放后台，Agent Loop 继续运行"* — 后台线程执行命令，后续轮次收集完成结果。
>
> **Harness 层**: 后台 — 异步执行, 不阻塞主循环。

---

## 本章要学会的判断

- **它解决什么**：慢操作放到后台去跑，用户和 Agent 都不用干等。
- **什么时候需要它**：有跑报表、长查询、批量处理这类慢操作。
- **你要拍板的规则**：超过多久转到后台；完成后怎么通知；失败了谁兜底。

> 代码看不懂可以先跳过，到网页上看「回放」动画。详细的判断方法在本章末尾的「产品经理视角」。

### 本章新词

每章最多三个新词。看不懂的其他词，去[名词表](../guide/glossary.md)查。

| 词 | 意思 | 比喻 |
|---|---|---|
| 放后台 | 让一条慢命令在旁边跑，循环不等它 | 把饭放进电饭煲，转身去做别的 |
| 完成通知 | 后台跑完后，下一圈开始前塞进记录本的一句话 | 电饭煲「叮」的一声 |
| 线程 | 程序里能同时干活的一条小工 | 多请了一个帮手 |

---

## 问题

读一个文件、看一眼改动通常很快，当场等一下没感觉。但安装依赖、跑完整测试、打包项目可能要几分钟。命令没跑完，程序就没法处理这一圈里的下一个工具调用，也进不了下一圈。

如果后面的事并不依赖这条命令，干等就是浪费。比如 Agent 启动了完整测试，本来还能顺手检查文档、整理别的文件，但当场执行会让整个循环停在这一次命令上。

本章要解决的是：让耗时的命令在后台跑，循环继续处理别的事，后面的某一圈再把结果收回来。

---

## 解决方案

![Background Tasks Overview](images/background-tasks-overview.svg)

模型要跑命令时可以多说一句「放后台」。程序另开一条线程去跑，当场先回一句「已启动，编号 1」，循环继续；后台跑完后，下一圈问模型之前，把「编号 1 完成，结果是……」作为通知塞进记录本。

当场执行和放后台的区别：

| | 当场执行（s04） | 放后台（s11） |
|---|---|---|
| 慢命令 | 这一步卡住等它 | 另一条线程去跑 |
| 循环 | 等命令返回 | 拿到「已启动」就继续 |
| 结果 | 命令跑完直接回来 | 先回编号，之后某一圈收到完成通知 |
| 谁决定 | 没得选 | 模型在调用时标一个「放后台」 |

---

## 工作原理

### should_run_background: 显式请求

模型通过 bash 工具的 `run_in_background` 参数请求后台执行。只有参数明确为 `true`，并且工具是 bash 时，才会进入后台执行路径。其他调用仍然同步执行。

```python
def should_run_background(tool_name: str, tool_input: dict) -> bool:
    return (
        tool_name == "bash"
        and tool_input.get("run_in_background") is True
    )
```

不再根据 `install`、`build` 或 `test` 等关键词猜测。是否进入后台由工具调用明确决定。

### BackgroundManager: 后台执行与生命周期

`BackgroundManager` 保存任务状态和完成队列。`start()` 先登记任务，再启动 daemon 线程，并立即返回 `bg_id`：

```python
class BackgroundManager:
    def __init__(self):
        self.tasks = {}
        self.results = {}
        self._ready = []
        self._lock = threading.Lock()

    def start(self, block) -> str:
        # Register task, then run _run() in a daemon thread.
        ...

    def _run(self, task_id: str, command: str):
        output, exit_code = _run_bash_process(command)
        status = "completed" if exit_code == 0 else "failed"
        with self._lock:
            self.tasks[task_id]["status"] = status
            self.results[task_id] = _format_bash_result(output, exit_code)
            self._ready.append(task_id)
```

命令以非零状态退出或 worker 抛出异常时，任务会进入 `failed`。Shell 会在独立的进程组中启动；命令完成、超时，或 Agent 经正常路径、`SIGTERM` 退出时，运行时会停止原进程组。这只是生命周期清理，并不是沙箱；另建 session 的进程仍可能离开该进程组。

### collect_background_results: 通知收集

后续轮次开始时，`collect()` 从完成队列中取出结果，并格式化为 `<task_notification>` 通知：

```python
def collect_background_results() -> list[str]:
    return BACKGROUND.collect()
```

通知不复用原始 `tool_use_id`。原始 tool call 已经用占位 `tool_result` 回复了；后续收集完成结果时，会用 `task_notification` 格式把它作为独立事件加入对话。一个 `tool_use` 仍然只对应一个 `tool_result`。

### 循环中的集成

每次调用 LLM 前，Agent Loop 先收集已经完成的后台结果。`execute_tool()` 仍然在主线程执行 `PreToolUse`，然后再选择同步或后台执行：

```python
while True:
    inject_background_results(messages)
    response = client.messages.create(...)

def execute_tool(block) -> str:
    blocked = trigger_hooks("PreToolUse", block)
    if blocked is not None:
        return str(blocked)
    if should_run_background(block.name, block.input):
        task_id = start_background_task(block)
        output = f"[Background task {task_id} started]"
    else:
        output = call_tool(block)
    trigger_hooks("PostToolUse", block, output)
    return output
```

慢操作先返回一个带 `bg_id` 的占位 tool_result。后台结果不会主动唤醒 Agent；下一次进入 Agent Loop 时，`inject_background_results()` 才会收集已经完成的结果。

### 合起来跑

```
Turn 1:
  LLM → bash "npm install" (run_in_background=true)
  → start_background_task → bg_0001
  → tool_result: "[Background task bg_0001 started]..."
  → LLM: "OK, I'll check later. Let me also read the config."

Turn 2:
  LLM → read_file "package.json" (fast, sync)
  → tool_result: file content

Turn 3:
  → collect bg_0001 as <task_notification>
  → LLM sees: config file + install notification in one message
```

npm install 在后台运行时，Agent Loop 继续执行了 read_file。

---

## 本章新增了什么

| 组件 | S04 Kernel | S11 |
|------|-----------|-----------|
| 执行模型 | 全部同步 | 慢操作后台线程 + 通知注入 |
| bash schema | `command` | `command` + `run_in_background` |
| 新函数 | — | `should_run_background`, `start_background_task`, `collect_background_results`, `inject_background_results` |
| 新类型 | — | `BackgroundManager` |
| 通知格式 | — | `<task_notification>`（不复用 tool_use_id） |
| 循环行为 | 工具同步执行 | 显式后台执行，后续轮次收集完成结果 |
| 工具 | 5 | 5（bash schema 增加一个参数） |

---

## 试一下

```sh
cd claude-code-harness-study
python s11_background_tasks/code.py
```

试试这些话：

1. `在后台列出已安装的 Python 包，同时找出当前目录所有的 Python 文件`
2. `在后台执行一条要等 20 秒的命令，等待期间读一下 README.md`
3. `在后台跑一遍测试，跑的时候列出所有 Markdown 文件`

观察重点：模型有没有把命令送到后台？是不是马上拿到一个「已启动，编号 1」的回复？后面哪一圈收到了完成通知？

---

## 产品经理视角

> 慢活放到后台，Agent 和用户都不用干等。产品经理要定的是「多慢算慢」和「做完了怎么通知」。

### 什么信号说明需要它

- 有耗时几分钟以上的操作：跑报表、批量处理、长时间的测试、深度调研。
- 等待期间用户什么都做不了，或者干脆关掉页面走了。
- 慢操作进行的同时，其实还有别的事可以做。

### 代价

- **结果回来的时机不好控制**：Agent 可能正在做别的事，要处理「中途插进来的结果」。
- **失败了容易没人知道**：需要通知和兜底。
- **要控制总量**：同时跑的后台任务多了，资源和费用都要管。

### 先试试更便宜的办法

- 让用户等，但显示进度和预计时间。
- 把大任务拆小，让每一块都很快。

### 你要拍板的规则

| 规则 | 示例 |
|---|---|
| 多慢算慢 | 预计超过 30 秒的操作转到后台 |
| 做完怎么通知 | 界面提示加消息推送；用户已经离开的，发站内信或邮件 |
| 失败谁兜底 | 自动重试一次，还失败就通知用户，并说明原因 |
| 同时最多跑几个 | 每个用户最多 3 个后台任务 |

### 怎么衡量

- 用户的等待时长。
- 后台任务的失败率；失败以后，用户知道的比例。
- 等待期间的用户流失率。

### 真实产品里的样子

- ChatGPT 的深度研究一次要跑好几分钟，用户可以先离开，做完再回来看。
- OpenAI Codex 的云端任务、Cursor 的云端 Agent，把整个编程任务放到云端去跑，做完交给用户一份结果。
- Claude Code 可以把耗时的命令放到后台运行，自己接着处理别的事。

### 面试题

**「生成一份报告要 5 分钟，用户体验很差，怎么办？」**

答题要点：

- 先看能不能变快：拆小、并行。
- 实在快不了就转后台：立刻告诉用户「已经开始，预计 5 分钟」。
- 做完主动通知；失败要有兜底和说明。
- 用等待期间的流失率来衡量。

> 16 个组件的判断卡放在一起比较，见 [选型篇](../guide/README.md)。

---

## 接下来

后台任务解决了「慢操作不卡住」。但如果想定时做某件事呢？比如「每天早上 9 点跑测试」「每 5 分钟看一眼服务器状态」。

s12 定时（Cron Scheduler）→ 给 Agent 装一个闹钟。
