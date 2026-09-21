# 001：认识 FastAPI 与最小应用

> 本篇从零写出第一个可访问的接口。
>
> 学习目标：理解 FastAPI 在一次 HTTP 请求里做了什么，会安装依赖、启动服务，并分清 `app`、路径操作、Uvicorn、自动文档这几块。

---

## 一、我们要解决什么问题？

前端、移动端、别的服务想要数据时，不会去读你的 Python 变量，而是发一条 HTTP 请求。后端要做的事可以概括成：

1. 监听某个端口。
2. 根据 URL 和方法找到对应函数。
3. 把请求里的参数解析成 Python 对象。
4. 执行业务逻辑。
5. 把结果编码成 JSON（或其他格式）返回。
6. 最好还能自动给出一份接口说明书，方便联调。

没有框架时，这些都要自己接。FastAPI 把第 2 到第 6 步标准化了，而且**主要靠函数参数上的类型注解**来完成解析、校验和文档。

本篇先搭一个最小服务：

```text
浏览器 / curl
    ↓
Uvicorn（ASGI 服务器）
    ↓
FastAPI app
    ↓
你写的路径函数
    ↓
JSON 响应
```

---

## 二、安装和最小代码

建议使用虚拟环境，避免和系统 Python 搅在一起：

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install "fastapi[standard]"
```

新建 `main.py`：

```python
from fastapi import FastAPI

app = FastAPI(title="图书管理 API", version="0.1.0")


@app.get("/")
def read_root():
    return {"message": "欢迎使用图书管理 API"}


@app.get("/health")
def health():
    return {"status": "ok"}
```

启动：

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

`main:app` 的含义是：**模块文件 `main.py` 里名为 `app` 的对象**。换文件名或换变量名，这里就要一起改。

`--reload` 只适合开发：它监视文件变化并重启进程。生产环境不要开。

访问 <http://127.0.0.1:8000/> 会看到：

```json
{"message": "欢迎使用图书管理 API"}
```

访问 <http://127.0.0.1:8000/health>：

```json
{"status": "ok"}
```

到这里，一个后端服务已经在跑了。后面所有篇都建立在这个 `app` 上。

---

## 三、这几行代码各自在干什么？

### 1. `app = FastAPI(...)`

`FastAPI()` 创建的是一个 **ASGI 应用**。你可以把它理解成“接口的总入口”：所有路径、依赖、异常处理最终都注册到这个对象上。

`title`、`version` 会出现在自动文档的标题栏里，不影响接口行为。还可以加 `description`，支持 Markdown。

一个进程里通常只有一个 `app`。后面拆路由时，也是把子路由 **include** 进这个对象，而不是再 new 很多个 FastAPI。

### 2. `@app.get("/")`

这是装饰器，作用是：把下面的函数登记为“当收到 `GET /` 时调用它”。

FastAPI 把这种函数叫做 **路径操作函数**（path operation function）：

| 概念 | 含义 | 例子 |
|---|---|---|
| 路径 path | URL 中主机名之后的部分 | `/health`、`/books/1` |
| 操作 operation | HTTP 方法 | GET / POST / PUT / PATCH / DELETE |
| 路径操作函数 | 处理这次请求的 Python 函数 | `def health(): ...` |

常用登记方式：

```python
@app.get(...)
@app.post(...)
@app.put(...)
@app.patch(...)
@app.delete(...)
```

同一个路径可以挂不同方法。`GET /books` 和 `POST /books` 是两个接口，不是冲突。

### 3. `return {"message": "..."}`

返回 `dict`、`list` 或 Pydantic 模型时，FastAPI 会把它序列化成 JSON，默认状态码是 `200`。

你 **不必** 自己 `json.dumps`，也不必设置 `Content-Type: application/json`。框架会做。

返回普通字符串也可以，那时内容类型是 `text/plain`。学习阶段请优先返回 JSON，和前后端联调习惯一致。

---

## 四、Uvicorn 是什么？为什么不直接 `python main.py`？

FastAPI 应用本身不会监听端口。它只是一份“收到请求后怎么处理”的说明。真正和操作系统、TCP 打交道的是 **ASGI 服务器**。

常用组合：

```text
客户端 HTTP 请求
    ↓
Uvicorn / Hypercorn / Daphne
    ↓
ASGI 协议
    ↓
FastAPI
```

ASGI 是异步 Python Web 的标准接口，类似于当年 WSGI 之于 Flask。Flask 传统上跑在 WSGI（如 gunicorn + sync worker）上；FastAPI 从一开始就按 ASGI 设计，所以能自然地写 `async def`，也能在一次请求里 await 数据库、HTTP 客户端。

开发时用：

```bash
uvicorn main:app --reload
```

等价于在代码里：

```python
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
```

教学上更推荐命令行启动，和以后部署时的启动方式一致。

---

## 五、自动文档是怎么来的？

启动服务后打开 <http://127.0.0.1:8000/docs>，会看到 Swagger UI：每个接口的路径、方法、参数、示例请求都可以点“Try it out”直接发。

<http://127.0.0.1:8000/redoc> 是同一份接口的另一种排版，适合阅读，不适合点按钮调试。

这两页都不是 FastAPI 手写的 HTML 页面，而是读了：

```text
GET /openapi.json
```

这份 JSON 遵循 OpenAPI 规范。FastAPI 在加载应用时，根据：

- 路径装饰器
- 函数参数名和类型注解
- 默认值
- 返回值注解 / `response_model`

自动生成它。

所以你给参数写了 `book_id: int`，文档里这个参数就会显示为 integer，并且试出来传 `abc` 时会先被校验拦住。**文档和校验同源**：都来自类型注解。这是 FastAPI 相对 Flask 最明显的差别。

一个对照：

```python
# Flask：框架不知道 id 应该是 int，文档也不会自动出现
@app.get("/books/<id>")
def get_book(id):
    ...

# FastAPI：id 是 int，校验和文档一起有了
@app.get("/books/{book_id}")
def get_book(book_id: int):
    ...
```

---

## 六、一次请求在框架内部怎么走？

以 `GET /health` 为例：

```text
1. 浏览器发出 GET http://127.0.0.1:8000/health
2. Uvicorn 接收 TCP，按 ASGI 把请求交给 app
3. FastAPI 用方法和路径匹配到 health 函数
4. 解析路径参数、查询参数、请求头、请求体（本例都没有）
5. 按类型注解做校验；失败则直接 422，不进函数
6. 调用 health()
7. 把返回值编码为 JSON
8. 加上状态码和响应头，交回 Uvicorn
9. Uvicorn 写回 HTTP 响应
```

第 5 步很关键：非法请求进不了你的业务函数。后面 002、003 会反复用到这一点。

如果函数里抛了未处理异常，默认会变成 `500 Internal Server Error`，响应体是：

```json
{"detail": "Internal Server Error"}
```

007 再讲如何把它变成对前端友好的统一错误格式。

---

## 七、`def` 还是 `async def`？

两种都可以：

```python
@app.get("/sync")
def sync_hello():
    return {"mode": "sync"}


@app.get("/async")
async def async_hello():
    return {"mode": "async"}
```

规则可以先记这三条：

1. 函数体里 **没有** `await`，用普通 `def` 完全没问题。FastAPI 会把它放到线程池，避免堵住事件循环。
2. 函数体里要 `await` 异步库（如 `httpx.AsyncClient`、异步 Redis、SQLAlchemy 的 async session），就必须 `async def`。
3. **不要** 在 `async def` 里写 `time.sleep()`、同步的 `requests.get()` 这类会堵住事件循环的调用。要用 `asyncio.sleep()`、`httpx` 异步客户端。

学习前几篇全部用 `def` 即可。等 008 接触数据库、010 接触真实并发时，再决定要不要全面改成 async。混用本身允许，但一个项目里风格统一更好读。

---

## 八、用 curl / httpie 验证，不要只靠浏览器

浏览器地址栏只能方便地发 GET。POST 从 003 开始会用到，建议现在就习惯命令行：

```bash
curl http://127.0.0.1:8000/health
```

PowerShell：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

`/docs` 里点 Try it out 也行，而且能看到实际发出的 Request URL 和响应状态码。调试 422 时，文档页往往比自己猜字段名更快。

---

## 九、一个稍完整的“欢迎页”示例

把项目信息也返回出去，方便后面确认服务是否启动到正确版本：

```python
from fastapi import FastAPI

app = FastAPI(
    title="图书管理 API",
    description="FastAPI 学习示例：从内存到数据库，再到登录。",
    version="0.1.0",
)


@app.get("/")
def read_root():
    return {
        "name": "book-api",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
```

函数返回值仍然是 dict。FastAPI 不会执行你没写的魔法：没有数据库、没有鉴权、没有跨域配置。那些都是后面一篇一篇加进去的。

---

## 十、本篇小结

最小 FastAPI 服务可以概括为：

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}
```

启动：

```bash
uvicorn main:app --reload
```

需要掌握的核心概念：

- `app` 是 ASGI 应用，路径都注册在它上面。
- `@app.get` / `@app.post` 把函数变成接口。
- Uvicorn 负责监听端口，FastAPI 负责处理请求。
- 返回 dict 会自动变成 JSON。
- `/docs` 和 `/openapi.json` 来自类型注解，不是手写文档。
- 校验发生在业务函数之前。
- 没有 `await` 时用 `def` 即可。

下一篇开始给 URL 加变量：`/books/{book_id}`，以及 `?author=张三` 这种查询参数。
