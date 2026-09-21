# 009：LangSmith 追踪

> 本篇对应当前项目中的 `app/config.py`、`app/main.py`、`app/ingest.py` 和 `.env`。
>
> 学习目标：理解 LangSmith 解决的是「看见一次调用内部发生了什么」，而不是再写一条业务链；分清 `Settings` 读配置和 LangSmith 读 `os.environ` 的差别；会在本 CLI 里打开追踪并到网页上对一次问答。

---

## 一、我们要解决什么问题？

到 `008` 为止，一次问答可能已经很深：

```text
用户问题
   ↓
拼 Prompt（系统提示 + 长期记忆 + 短期历史）
   ↓
模型决定调用工具（search / calculator / search_knowledge / subagent / MCP …）
   ↓
run_tool_loop 执行，把 ToolMessage 填回去
   ↓
可能再调模型、再调工具
   ↓
最终自然语言答案
```

终端里你通常只看到最终那句话。中间问这些事时，日志不够用：

- 模型为什么调了 `subagent` 而不是直接 `search`？
- 子智能体内部调了几次计算器，最终只回了一句「2」？
- RAG 检索到了哪几块，模型有没有真的引用？
- 这一轮花了多少 token、卡在哪一次 HTTP？

这些不是新功能，是**观测**。LangSmith 把每一次模型调用、工具调用收成一条可点开的 trace。

本项目**不**把 LangSmith 写进 `Settings` 字段，也**不**改 `chain.py` 的 LCEL。打开它只靠环境变量。

相关文件：

```text
.env                 LANGCHAIN_TRACING_V2 / LANGCHAIN_API_KEY / LANGCHAIN_PROJECT
app/config.py        load_runtime_env()：把 .env 写进进程环境
app/main.py          启动时 load_dotenv，并提示已启用追踪
app/ingest.py        入库同样加载，embedding 调用也能上报
app/rag/__main__.py  python -m app.rag 同样加载
app/chain.py         不用改；ChatOpenAI / 工具循环会自动打点
```

---

## 二、LangSmith 是什么？

LangSmith 是 LangChain 的观测和评测平台，不是另一种 Agent。常见用途：

| 用途 | 干什么 | 本篇做到哪 |
|---|---|---|
| **追踪调试** | 看 prompt、工具参数、返回、耗时、报错 | ✅ 本篇 |
| **线上监控** | 失败率、延迟、费用 | 开了追踪就有，本项目没有单独做告警 |
| **评测回归** | 用数据集对比 prompt / 模型 | ❌ 以后可以做 |
| **从线上攒数据** | 把真实对话收成 dataset | ❌ 以后可以做 |
| **Prompt 托管** | 在网页上改提示词 | ❌ 本项目提示词仍写在代码里 |

和本仓库已有能力的边界：

```text
003 工具循环     = 决策和执行
005 hook         = 失败重试、compact、事后写记忆
008 RAG          = 检索本地资料
009 LangSmith    = 把上面这些过程拍下来，拿到网页上翻
```

Hook 是进程内回调；LangSmith 是把运行记录送到云端（或自托管）查看。两者不互相替代。

---

## 三、为什么 Settings 读到了，追踪却没开？

这是本篇最容易踩的坑。

`pydantic-settings` 读 `.env`，是为了填 `Settings` 的字段：

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )
    openai_api_key: str | None = None
    # ……
```

`ChatOpenAI` 用的是我们显式传进去的 `settings.openai_api_key`，所以聊天能通。

LangSmith **不走这条路**。`langchain` / `langchain_core` 在真正发请求时检查的是**进程环境变量**：

```text
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=langchain-starter
```

`Settings` 的 `extra="ignore"` 会把这三项从 `.env` 读进来然后丢掉，**不会**写进 `os.environ`。只改 `.env`、不 `load_dotenv()`，CLI 能聊天，smith.langchain.com 上什么都没有。

所以入口必须多一步：

```python
from dotenv import load_dotenv

def load_runtime_env() -> None:
    """把 .env 写入进程环境，供 LangSmith 等只读 os.environ 的库使用。"""
    load_dotenv()
```

`python-dotenv` 默认不覆盖已经存在的环境变量。你在 shell 里 `set LANGCHAIN_TRACING_V2=false` 时，仍然以进程为准。

较新的文档也会写 `LANGSMITH_TRACING` / `LANGSMITH_API_KEY`。本项目依赖是 `langchain>=0.3,<1.0`，用 `LANGCHAIN_TRACING_V2` 这一套即可。

---

## 四、为什么不写进 Settings 字段？

可以加三个字段，然后在 `build_chain` 里 `os.environ[...] = ...`。本项目故意不加。

原因：

1. **测试会误伤。** `Settings` 默认 `env_file=".env"`。测试里 `Settings(openai_api_key="test-key")` 仍会读到真实的 LangSmith Key。若 `build_chain` 据此打开追踪，单测会把 mock 对话打到云端。
2. **LangSmith 的设计就是环境变量。** 官方接入不要求改业务代码。
3. **密钥不应进对象、进日志。** 终端只打印项目名，不打印 Key。

因此只在 **CLI 入口** 调用 `load_runtime_env()`：

| 入口 | 会不会 load_dotenv | 会不会上报 |
|---|---|---|
| `python -m app.main` | 会 | 会（追踪开了且有 Key） |
| `python -m app.ingest` | 会 | embedding 调用会 |
| `python -m app.rag` | 会 | 同上 |
| `pytest` | 不会 | 不会 |

`tests/` 里构造 `Settings(...)`、patch `ChatOpenAI`，不经过 `main()`。

---

## 五、一次调用在网页上长什么样？

打开追踪后，不必改 `run_tool_loop`。`ChatOpenAI`、LCEL、工具 invoke 会通过回调自动上报。

以这句为例：

```bash
python -m app.main "用计算器算 (3+5)*12"
```

大致会看到一层套一层的 run：

```text
RunnableWithMessageHistory
  └─ 本轮 chain
       ├─ ChatOpenAI          第一次：返回 tool_calls=[calculator]
       ├─ calculator          输入 (3+5)*12，输出 96
       └─ ChatOpenAI          第二次：看到 ToolMessage，回答「结果是 96」
```

若模型调用了 `subagent`，子智能体内部的 `run_tool_loop` 也会出现在同一条 trace 里，通常是嵌套的子 run。这正好对应「主管只看到最终结论、中间步骤被裁掉」：网页上仍能翻到子智能体用过哪些工具，用户对话里不会出现那些中间句。

RAG 开了之后，还能看到 `search_knowledge` 的 query 和返回的块。入库命令则会看到 embedding 请求。

点开一条模型调用，通常有：

- 完整 messages（system / history / human / tool）
- 模型名、base_url
- 输入输出 token、耗时
- 报错栈（若失败）

这比 `005` 的 retry 日志具体：retry 只知道「失败了再试」；trace 能看见每一次尝试的请求体。

---

## 六、本项目怎么接入？

### 1. 申请 Key

到 [smith.langchain.com](https://smith.langchain.com) 注册，创建一个 API Key（`lsv2_` 开头）。`.env` 已在 `.gitignore` 里，不要把 Key 写进 `DOCUMENT/` 或提交到 git。

### 2. 写 `.env`

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=langchain-starter
```

`LANGCHAIN_PROJECT` 只是网页上的项目名，用来把本仓库的 run 和别的实验分开。不填则落到默认项目。

聊天模型和 embedding 仍用原来的 `OPENAI_API_KEY` / `OPENAI_BASE_URL`。LangSmith Key **不能**拿去调 Routin / OpenAI。

### 3. 启动时加载

`app/main.py`：

```python
def main() -> None:
    load_runtime_env()
    # ...
    tracing = os.getenv("LANGCHAIN_TRACING_V2", "").lower() in {"1", "true", "yes"}
    if tracing and os.getenv("LANGCHAIN_API_KEY"):
        project = os.getenv("LANGCHAIN_PROJECT") or "default"
        print(f"已启用 LangSmith 追踪（项目：{project}）。")
```

`ingest.py` 和 `app/rag/__main__.py` 同样先 `load_runtime_env()`，否则入库时的 embedding 请求不会出现在 LangSmith。

### 4. 跑一次并对照网页

```bash
python -m app.main "用一句话介绍 LangChain"
```

终端应出现：

```text
已启用 LangSmith 追踪（项目：langchain-starter）。
```

然后打开 [smith.langchain.com](https://smith.langchain.com) → 项目 `langchain-starter` → 最新一条 run。没有这条提示，先检查：

1. `.env` 是否在项目根目录。
2. `LANGCHAIN_TRACING_V2` 是否为 `true`（不是 `True` 以外的乱七八糟大小写也行，代码按小写比）。
3. 是否走了 `python -m app.main`，而不是在测试里直接 `build_chain`。

---

## 七、配置一览

LangSmith 相关项**不是** `Settings` 字段，只存在于进程环境：

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `LANGCHAIN_TRACING_V2` | 无 | `true` 时开启追踪 |
| `LANGCHAIN_API_KEY` | 无 | LangSmith 的 Key，不是聊天模型的 Key |
| `LANGCHAIN_PROJECT` | `default` | 网页上的项目名 |

和聊天 / embedding 的分工：

| | 聊天 / 工具 | embedding | 追踪 |
|---|---|---|---|
| Key | `OPENAI_API_KEY` | 同一个 | `LANGCHAIN_API_KEY` |
| 地址 | `OPENAI_BASE_URL` | 同一个 | LangSmith 云（默认） |
| 模型名 | `MODEL_NAME` | `EMBEDDING_MODEL` | 无 |

关掉追踪：把 `LANGCHAIN_TRACING_V2` 改成 `false`，或删掉 `LANGCHAIN_API_KEY`。不必改 Python。

---

## 八、测试覆盖了什么？

本篇**没有**单独的 `tests/test_langsmith.py`。

原因和 `007` 不测真实 embedding 账单一样：上报依赖外网和真实 Key。单测要保证的是：

- 不调用 `load_runtime_env()`，避免 pytest 污染 `os.environ`。
- `build_chain` / `get_tools` 在没有这两项环境变量时行为与 `008` 之前相同。

若以后要测「CLI 打印了已启用追踪」，应 mock `os.getenv`，不要打到真实 LangSmith。

---

## 九、以后可以怎么换？

第一版只打开自动追踪。还可以：

1. **评测集**：把 `DOCUMENT/` 里的问答题做成 dataset，对比改 prompt 前后。
2. **给 run 打 metadata**：在 `chain.invoke(..., config={"metadata": {"user_id": ...}})` 里带上 `user_id` / `session_id`，网页上按用户过滤。
3. **采样**：生产环境不必 100% 上报，可按比例或只上报失败。
4. **自托管**：不走 smith.langchain.com，改 endpoint。本项目用默认云。
5. **和 `005` 的 retry 对照**：trace 里连续两次 ChatOpenAI 失败，能看见 hook 重试了没有。

不要把 LangSmith 当长期记忆或日志仓库。记忆仍是 `004` 的 JSON；短期历史仍是进程内的 `InMemoryChatMessageHistory`。

---

## 十、本篇小结

```text
.env  写上 TRACING + API_KEY + PROJECT
        ↓
CLI 入口 load_runtime_env()  →  os.environ
        ↓
ChatOpenAI / 工具 / embedding 自动打点
        ↓
smith.langchain.com 上按项目翻 trace
```

记住：

- LangSmith 是观测，不替代工具循环、hook、RAG。
- `Settings` 读 `.env` 只填自己的字段；追踪必须进 `os.environ`。
- 只在 `main` / `ingest` / `app.rag` 里 `load_dotenv`，pytest 保持安静。
- 终端只提示项目名，Key 留在 `.env`。
