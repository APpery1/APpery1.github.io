# 005：Compact 与 Hook

> 本篇对应当前项目中的 `app/hooks.py`、`app/chain.py` 和 `app/config.py`。
>
> 学习目标：理解 hook 是插在模型调用生命周期上的回调，而不是新的一种记忆；分清 compact 压缩的是短期上下文，长期记忆仍然按 `user_id` 落盘。

---

## 一、我们要解决什么问题？

到 `004` 为止，一次问答大致是：

```text
读长期记忆 → 拼 Prompt → 调模型（可能进工具循环）→ 写短期 context
```

这条主链能跑，但有三件“旁路工作”不适合继续堆进 `call_model`：

1. **模型请求失败**：网络抖动、429、5xx 时，直接把错误抛给用户太脆。
2. **上下文太长**：短期 `CONTEXT` 只增不减，接近模型窗口（本项目按 128k tokens）时会失败或变慢。
3. **模型没主动调用 `save_memory`**：用户说了“我叫小明”，助手口头答应了，但 JSON 里可能还是空的。

这三件事都发生在“调用模型”的前后，而不是业务链本身。把它们做成 **hook**，主链仍然只负责问答。



## 什么时候该用hook:

1.生命周期事件,不知道什么时候链开始跑、什么时候大模型返回,如LLM 输出完成自动记录 token 消耗、捕获异常告警。

2.事件触发时机不可预测,如键盘热键。

3.一次注册，多次自动触发，不用重复写调用代码。

---

## 二、Hook 是什么？

Hook 是生命周期回调：在固定时机插入一小段程序，默认什么都不做，需要时再覆盖。

本项目的钩子不是 LangChain 的 `BaseCallbackHandler`（那套更偏日志和 tracing）。这里是应用自己的生命周期：

| 时机 | 方法 | 本轮用它做什么 |
|---|---|---|
| 即将调用模型 | `before_model` | 上下文达到 128k 时 compact |
| 包住一次 `llm.invoke` | `around_model` | 失败则重试，最多 3 次 |
| 一轮问答已经得到答案 | `after_turn` | 判断要不要写入长期记忆 |

基类在 `app/hooks.py`：

```python
class Hook:
    def before_model(self, ctx: HookContext) -> None:
        return None

    def around_model(self, ctx: HookContext, call_next):
        return call_next(ctx)

    def after_turn(self, ctx: HookContext) -> None:
        return None
```

`HookContext` 是 hook 能看到的状态：即将发给模型的 `messages`、运行 `config`、短期 `history`、本轮 `question` / `answer`、长期记忆仓库。`messages` 可以被 compact 原地改写。

三个内置 hook 的执行顺序：

```text
CompactHook.before_model
        ↓
RetryHook.around_model
        ↓
    llm.invoke(...)     ← 真正的模型请求
        ↓
（得到本轮答案）
        ↓
MemoryHook.after_turn
```

`HookRunner` 负责按这个顺序执行。因此以后再加日志 hook 时，不必改 `run_tool_loop`。

---

## 三、它插在链的哪一段？

`app/chain.py` 的 `call_model` 现在是：

```text
Prompt 展开成 messages
        ↓
构造 HookContext
        ↓
run_tool_loop(..., invoke_model=hook_runner.call_model)
        ↓
把答案写进 ctx.answer
        ↓
hook_runner.after_turn(ctx)
```

`app/tool.py` 仍然不知道 hook 的存在。它只多了一个可选参数 `invoke_model`：有 hook 时走 hook，没有时直接 `llm.invoke`。工具循环里每一次模型请求都会经过 retry / compact，但 **after_turn 每轮问答只跑一次**，不会在每次 tool call 后都抽取记忆。

`RunnableWithMessageHistory` 仍然在整条链成功后，把本轮用户问题和最终答案写入短期历史。compact 改的是“已经在 history 里的旧消息”；本轮问答会在 compact 之后再追加。

---

## 四、RetryHook：模型请求失败重试三次

“重试三次”在这里表示 **一共尝试 3 次**：第一次失败 → 第二次 → 第三次仍失败则抛出。

```python
class RetryHook(Hook):
    name = "retry"

    def around_model(self, ctx, call_next):
        for attempt in range(1, self.max_attempts + 1):
            try:
                return call_next(ctx)
            except Exception as exc:
                if attempt >= self.max_attempts:
                    raise
                sleep(backoff * 2 ** (attempt - 1))
```

它只包住 **模型请求**，不包住工具函数本身。`save_memory` 写盘失败、`write_txt_file` 路径非法，仍然把错误作为 `ToolMessage` 送回模型，而不是在 hook 里重试。

默认退避是 0.2s、0.4s。配置项：

```env
RETRY_ATTEMPTS=3
```

适合重试的典型失败：超时、连接断开、429、5xx。业务错误（缺 API Key、输出不是 JSON）会在进模型之前或解析阶段失败，不会被这个 hook 吃掉。

示意：

```text
llm.invoke  第 1 次  → ConnectionError
等待 0.2s
llm.invoke  第 2 次  → 429
等待 0.4s
llm.invoke  第 3 次  → 成功，返回 AIMessage
```

三次都失败，错误原样抛给 CLI。`after_turn` 不会执行，避免把一次失败问答写进长期记忆。

---

## 五、Compact：压缩短期上下文，不是另一种记忆

### 1. 为什么需要 compact？

`002` 的短期历史是完整消息队列。对话越长，每次请求带上的 `context` 越大。模型有上下文窗口；本项目把触发线设在 **128k tokens**（`128000`），和常见长窗口模型的量级一致。

超过窗口会怎样？

- 请求被服务商拒绝。
- 或者即使勉强塞进去，费用和延迟都会上去。
- 更早的闲聊对当前问题往往没有帮助。

所以要在 **发给模型之前** 把旧对话收短。这就是 compact。

### 2. Compact 和长期记忆有什么不同？

这是本篇最容易混的一点。

| | Compact | 长期记忆 |
|---|---|---|
| 处理对象 | 当前 session 的短期 `CONTEXT` | 按 `user_id` 保存的事实卡片 |
| 目的 | 腾出上下文窗口，让对话还能继续 | 换会话、重启进程后还记得用户 |
| 存在哪 | 仍然在进程内存的 `InMemoryChatMessageHistory` | `data/long_term_memory.json` |
| 进程退出 | 摘要一起丢失 | 保留 |
| 触发 | 估算 token ≥ 128k | 模型调用 `save_memory`，或 `after_turn` 判断需要写 |

Compact 之后，短期历史从：

```text
Human  问题1
AI     回答1
... 中间几十轮 ...
Human  问题N
AI     回答N
```

变成：

```text
AI     [对话摘要]
       更早的对话被收成一段话……
Human  最近的问题
AI     最近的回答
```

下一轮 Prompt 仍然是：

```text
system（含长期记忆）
+ 压缩后的 history
+ 当前问题
```

用户的姓名如果只出现在被压缩掉的旧消息里、又没有写入长期记忆，摘要里可能还在，也可能被概括漏掉。所以 **稳定事实要靠 memory，不靠 compact 的摘要**。

### 3. 什么时候触发？

`CompactHook.before_model` 先粗估当前 `messages` 的 token：

```python
def estimate_message_tokens(messages) -> int:
    total_chars = sum(len(message_text(m)) for m in messages)
    return max(1, (total_chars + 1) // 2)
```

这是教学用估算：中英混合大约按 2 个字符 ≈ 1 token。它不是 tiktoken，也不保证和账单一致，只用来判断“该不该压缩”。

当估算值 **≥ `compact_token_limit`（默认 128000）** 时触发。低于阈值完全不改 history。

另外两种情况不 compact：

- 本轮已经在工具循环中（消息里出现了 `ToolMessage`）。压缩会丢掉 `tool_call_id` 配对，模型会糊涂。
- 短期 history 里只剩 1 条或 0 条。再压也腾不出窗口。

### 4. 压缩算法

```text
history.messages = [旧1, 旧2, …, 旧k, 最近1, 最近2, …]
                              │
                              ▼
              送给 summarizer / 模型，得到一段摘要
                              │
                              ▼
history.messages = [AIMessage("[对话摘要] …"), 最近1, 最近2, …]
```

默认保留最近 6 条短期消息（`COMPACT_KEEP_RECENT=6`），更早的全部进入摘要。然后 **原地改写** 即将发送的 `ctx.messages`：

```text
system 消息（含长期记忆）
+ 压缩后的 history
+ 当前这一轮的 HumanMessage
```

摘要优先调用同一个聊天模型生成；模型不可用或调用失败时，退回占位句：

```text
更早的 N 条对话已压缩。请依据长期记忆和最近对话继续。
```

配置：

```env
COMPACT_TOKEN_LIMIT=128000
COMPACT_KEEP_RECENT=6
```

测试里会把阈值改成很小的数字，并用假的 `token_estimator` / `summarizer`，避免真的造 128k 上下文。

---

## 六、MemoryHook：一轮结束后再判断一次

`004` 已经让模型在对话中调用 `save_memory`。那是“模型自己想到了就记”。

但模型经常只是口头说“好的，我记住了”，并不发起工具调用。`MemoryHook.after_turn` 是第二道网：

```text
本轮 question + answer + 已有记忆
        ↓
让模型（或测试注入的 extract_facts）判断
        ↓
只返回 JSON：{"facts": ["用户叫小明"]} 或 {"facts": []}
        ↓
有新事实才 store.add(user_id, fact)
```

它 **判断** 而不是无脑保存：

- 闲聊、一次性问题、工具过程 → `facts: []`
- 已有完全相同的内容 → `store.add` 去重，不会再写一条
- 抽取失败或返回不是 JSON → 本轮不写，也不打断用户已经看到的答案

和 `save_memory` 工具的分工：

| | `save_memory` 工具 | `MemoryHook` |
|---|---|---|
| 何时 | 本轮中间，模型主动调工具 | 本轮已经结束 |
| 谁决定 | 对话模型 | 记忆管家（另一次短调用，或测试注入的函数） |
| 失败影响 | 作为 ToolMessage 回给模型 | 只打日志，用户答案已经生成 |

“一轮会话结束”在本项目里指 **一次 `chain.invoke` 成功返回之后**，也就是一轮问答，不是用户输入 `exit` 才抽取。用户中途关掉程序时，至少已经结束的那些轮次有机会落盘。

---

## 七、一次完整调用看起来像什么？

假设 alice 已经聊了很多轮，短期历史接近 128k，本轮又说“我叫小明，喜欢绿茶”：

```text
invoke({question: "我叫小明，喜欢绿茶"}, config={user_id, session_id})
        │
        ▼
读长期记忆，注入 system
拼上 history + 当前问题
        │
        ▼
CompactHook：token ≥ 128k
  旧消息 → [对话摘要]
  保留最近 6 条
        │
        ▼
RetryHook：llm.invoke
  失败则最多 3 次
  模型也可能在这一轮调用 save_memory
        │
        ▼
StrOutputParser → 返回给 CLI
RunnableWithMessageHistory 追加本轮 Q/A
        │
        ▼
MemoryHook.after_turn
  若工具没记下“用户叫小明，喜欢绿茶”
  这里再写进 data/long_term_memory.json
```

下一轮即使换了 `session_id`，长期记忆仍在系统提示里。同一 `session_id` 里看到的短期历史，则是摘要 + 最近几轮，而不是最初那一长串原文。

---

## 八、配置与扩展

`app/config.py` 新增：

| Python 字段 | 环境变量 | 默认 | 作用 |
|---|---|---|---|
| `retry_attempts` | `RETRY_ATTEMPTS` | `3` | 模型请求最多尝试次数 |
| `compact_token_limit` | `COMPACT_TOKEN_LIMIT` | `128000` | 触发 compact 的粗估 token 阈值 |
| `compact_keep_recent` | `COMPACT_KEEP_RECENT` | `6` | compact 后保留的最近消息条数 |

以后要加第四个 hook，只要实现 `Hook` 的某个方法，再放进 `build_default_hooks` 的列表。测试可以把 `hooks=HookRunner([...])` 传给 `build_chain`，只启用其中一种，避免三个 hook 互相干扰。

---

## 九、测试覆盖了什么？

- 失败两次后第三次成功；三次都失败则放弃。
- 低于阈值不 compact；超过阈值时旧消息变成 `[对话摘要]`，当前问题仍在末尾。
- 工具循环进行中不 compact。
- `after_turn` 抽到事实才写入，且按 `user_id` 隔离；没有事实则不写。
- 三条 hook 都能通过 `build_chain(..., hooks=...)` 接到真实调用路径上。

---

## 十、以后可以怎么换？

1. token 估算换成 tiktoken / 服务商返回的 `usage`。
2. compact 的摘要写入单独的“会话笔记”，而不是伪装成一条 `AIMessage`。
3. retry 只捕获超时和 429，避免把 `OutputParserException` 之类的业务错误也重试。
4. 记忆抽取改成嵌入去重，而不是精确字符串相等。

对学习阶段，先记住这三句话：

- **Hook** 是调用前后的插件，不改变“Prompt | 模型 | 解析器”这条主链。
- **Compact** 压缩的是当前会话的短期上下文，进程一退仍然没有。
- **Memory** 才是跨会话的事实；一轮结束后再判断一次，是为了补上模型没调 `save_memory` 的漏网之鱼。
