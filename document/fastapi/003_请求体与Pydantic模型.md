# 003：请求体与 Pydantic 模型

> 本篇解决“客户端 POST 一段 JSON，后端如何接收、校验、变成对象”。
>
> 学习目标：会定义 Pydantic 模型，分清路径 / 查询 / 请求体，理解 422 为什么发生，以及 `Field`、嵌套模型、创建模型与输出模型为什么要拆开。

---

## 一、我们要解决什么问题？

新增一本图书时，数据不再适合塞进 URL：

```text
POST /books
Content-Type: application/json

{
  "title": "FastAPI 入门",
  "author": "张三",
  "year": 2024,
  "price": 59.0
}
```

这段 JSON 叫做 **请求体 body**。后端需要：

1. 读出原始字节并按 JSON 解析。
2. 确认必填字段都在。
3. 类型不对时拒绝（`year` 不能是 `"今年"`）。
4. 业务约束：价格不能为负，年份不能是 3000。
5. 变成方便使用的 Python 对象：`payload.title`，而不是 `payload["title"]` 满天飞。

Pydantic 的 `BaseModel` 就是做这件事的。FastAPI 看到函数参数是一个模型类型、且不是简单的 `int`/`str`，就会把它当成 JSON 请求体。

---

## 二、最小 POST

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

BOOKS: list[dict] = []
next_id = 1


class BookCreate(BaseModel):
    title: str
    author: str
    year: int
    price: float


@app.post("/books")
def create_book(payload: BookCreate):
    global next_id
    book = {"id": next_id, **payload.model_dump()}
    BOOKS.append(book)
    next_id += 1
    return book
```

`payload: BookCreate` 没有默认值，也没有出现在路径里，类型又是模型 → FastAPI 从 body 里读 JSON，校验通过后构造 `BookCreate` 实例。

`payload.model_dump()` 是 Pydantic v2 把模型转成普通 dict 的方法。v1 里叫 `.dict()`，新代码不要用 `.dict()`。

用 curl 发送：

```bash
curl -X POST http://127.0.0.1:8000/books ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"FastAPI 入门\",\"author\":\"张三\",\"year\":2024,\"price\":59}"
```

Linux / macOS 把 `^` 换成 `\`，JSON 外面用单引号更方便。

在 `/docs` 里点 `POST /books` → Try it out，会根据模型自动生成示例 JSON。

---

## 三、模型字段怎么声明？

和普通类型注解一样：

```python
class BookCreate(BaseModel):
    title: str
    author: str
    year: int
    price: float
    in_stock: bool = True          # 有默认值 → 请求里可省略
    summary: str | None = None     # 可选，缺省为 None
```

规则：

| 写法 | 请求里 |
|---|---|
| `title: str` | 必填 |
| `in_stock: bool = True` | 可省略，默认 True |
| `summary: str \| None = None` | 可省略，默认 None |
| `tags: list[str] = []` | 能跑，但可变默认值有隐患，下一节用 `Field` |

缺字段、类型不对、JSON 都不是，都会 422，函数不执行。

例如少了 `title`：

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "title"],
      "msg": "Field required",
      "input": {"author": "张三", "year": 2024, "price": 59}
    }
  ]
}
```

`loc` 是 `["body", "title"]`。002 的路径错误是 `["path", "book_id"]`。看到 422 先看 `loc`，不要先怀疑路由没挂上。

多传未知字段时，Pydantic v2 默认 **忽略**。如果希望严格拒绝，可在模型上设置：

```python
from pydantic import BaseModel, ConfigDict

class BookCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    author: str
    year: int
    price: float
```

教学阶段用默认忽略即可；对外公开的 API 有时会改成 `forbid`，避免客户端以为某个拼错的字段生效了。

---

## 四、`Field`：约束、说明、默认值

```python
from pydantic import BaseModel, Field


class BookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100, description="书名")
    author: str = Field(min_length=1, max_length=50)
    year: int = Field(ge=1400, le=2100, examples=[2024])
    price: float = Field(gt=0, description="售价，必须大于 0")
    tags: list[str] = Field(default_factory=list)
    summary: str | None = Field(default=None, max_length=500)
```

`default_factory=list` 保证每次新建模型都是一份新列表，避免所有实例共享同一个 `[]`。

`Field` 的约束和 002 里 `Query`/`Path` 很像，但作用对象是 JSON 字段。它们最终都会反映到 OpenAPI 文档里。

自定义校验用 `field_validator`：

```python
from pydantic import BaseModel, Field, field_validator


class BookCreate(BaseModel):
    title: str
    author: str
    year: int = Field(ge=1400, le=2100)
    price: float = Field(gt=0)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("书名不能全是空格")
        return stripped
```

校验器返回的是**清洗后的值**。这里顺便 `strip()`，后面业务就不用到处去空格。

---

## 五、三种参数同时出现

一次请求可以同时有路径、查询、body：

```python
from typing import Annotated

from fastapi import FastAPI, Query
from pydantic import BaseModel

app = FastAPI()


class BookCreate(BaseModel):
    title: str
    author: str
    year: int
    price: float


@app.post("/authors/{author_id}/books")
def create_book_for_author(
    author_id: int,
    payload: BookCreate,
    notify: Annotated[bool, Query(description="是否发通知")] = False,
):
    return {
        "author_id": author_id,
        "notify": notify,
        "book": payload.model_dump(),
    }
```

```text
POST /authors/9/books?notify=true
Body: {"title": "...", "author": "...", "year": 2024, "price": 59}
```

FastAPI 的判断规则：

```text
参数类型是 int/str/bool/float 等单值
    → 名字在路径 {} 中：路径参数
    → 否则：查询参数

参数类型是 Pydantic 模型（或能当 body 的复杂类型）
    → 请求体
```

所以 **不要用模型去接 query**。分页仍然用 `limit: int = 10`，不要搞一个 `class QueryParams(BaseModel)` 当函数唯一参数——它会被当成 body。若确实想用模型收 query，要用 FastAPI 的专用方式（较新版本可用 `Query()` 依赖一整颗模型），学习阶段分开写更清楚。

---

## 六、一个请求里两个模型？

少见，但要知道默认行为：两个 `BaseModel` 参数会被嵌进同一个 JSON，用**参数名**当键：

```python
class BookCreate(BaseModel):
    title: str
    author: str


class StoreInfo(BaseModel):
    shop: str
    shelf: str


@app.post("/books")
def create_book(payload: BookCreate, store: StoreInfo):
    ...
```

客户端必须发：

```json
{
  "payload": {"title": "FastAPI 入门", "author": "张三"},
  "store": {"shop": "总店", "shelf": "A-1"}
}
```

而不是把字段平铺。这往往不是你想要的。实务上更常见的是：

- 合成一个模型；或
- 一个做 body，另一个其实该是路径 / 查询 / Header。

单模型、扁平 JSON，联调成本最低。

---

## 七、嵌套模型

一本图书带出版信息：

```python
class Publisher(BaseModel):
    name: str
    city: str


class BookCreate(BaseModel):
    title: str
    author: str
    year: int
    price: float
    publisher: Publisher | None = None
```

对应 JSON：

```json
{
  "title": "FastAPI 入门",
  "author": "张三",
  "year": 2024,
  "price": 59,
  "publisher": {"name": "人民邮电", "city": "北京"}
}
```

访问用属性：`payload.publisher.name`。嵌套同样走校验，内层缺 `city` 时 `loc` 会是 `["body", "publisher", "city"]`。

列表：

```python
class BookCreate(BaseModel):
    title: str
    author: str
    year: int
    price: float
    tags: list[str] = Field(default_factory=list)
```

```json
{"title": "FastAPI 入门", "author": "张三", "year": 2024, "price": 59, "tags": ["python", "web"]}
```

---

## 八、创建模型和对外模型为什么要分开？

客户端创建图书时 **不应该自己传 id**（id 由服务端生成）。返回时却一定有 id。另外以后会有 `password` 这类绝不能原样返回的字段。

所以从现在起养成拆模型的习惯：

```python
class BookCreate(BaseModel):
    title: str
    author: str
    year: int
    price: float


class BookUpdate(BaseModel):
    title: str | None = None
    author: str | None = None
    year: int | None = None
    price: float | None = None


class BookRead(BaseModel):
    id: int
    title: str
    author: str
    year: int
    price: float
```

| 模型 | 方向 | 有没有 id | 用途 |
|---|---|---|---|
| `BookCreate` | 入 | 无 | POST |
| `BookUpdate` | 入 | 无，字段全可选 | PATCH |
| `BookRead` | 出 | 有 | 响应 |

004 会用 `response_model=BookRead` 强制出口形状。现在先在函数里手动组装 dict 也可以。

Pydantic v2 里模型之间转换：

```python
book_in_db = {"id": 1, "title": "FastAPI 入门", "author": "张三", "year": 2024, "price": 59.0}
read = BookRead.model_validate(book_in_db)
```

或从另一个模型：

```python
# 若字段是超集/子集关系，可用
BookRead.model_validate({**payload.model_dump(), "id": 1})
```

---

## 九、JSON 不是唯一的 body

表单、文件上传也是请求体，但 **不是 JSON**。

```python
from typing import Annotated

from fastapi import FastAPI, File, Form, UploadFile

app = FastAPI()


@app.post("/login-form")
def login_form(
    username: Annotated[str, Form()],
    password: Annotated[str, Form()],
):
    return {"username": username}


@app.post("/covers")
def upload_cover(file: Annotated[UploadFile, File()]):
    return {"filename": file.filename, "content_type": file.content_type}
```

`Form()` / `File()` 对应 `Content-Type: application/x-www-form-urlencoded` 或 `multipart/form-data`。

注意：同一个函数里 **JSON body 和 Form 不能混用**，浏览器的表单也不会发 JSON。登录接口如果给网页 form 用，用 `Form`；给 SPA / 移动端用，用 Pydantic JSON。009 的 OAuth2 密码模式会用表单，那是协议要求，不是因为 JSON 不好。

`UploadFile` 是文件流，大文件不要 `await file.read()` 一次读进内存后再说，应分段写磁盘。本系列不展开文件存储。

---

## 十、PUT / PATCH 的 body

```python
@app.put("/books/{book_id}")
def replace_book(book_id: int, payload: BookCreate):
    """全量替换：客户端应传完整字段。"""
    ...


@app.patch("/books/{book_id}")
def patch_book(book_id: int, payload: BookUpdate):
    """部分更新：只传要改的字段。"""
    stored = BOOKS.get(book_id)
    if stored is None:
        return {"error": "未找到图书"}
    data = payload.model_dump(exclude_unset=True)
    stored.update(data)
    return stored
```

`exclude_unset=True` 只导出客户端**真正传了**的字段。否则 PATCH `{"title": "新书名"}` 也会把 `author`、`year` 变成 `None`。

这是 PATCH 里最容易踩的坑。记住：部分更新必须 `exclude_unset=True`。

---

## 十一、本篇可运行示例

```python
from pydantic import BaseModel, Field, field_validator
from fastapi import FastAPI

app = FastAPI(title="图书管理 API")

BOOKS: dict[int, dict] = {}
next_id = 1


class BookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    author: str = Field(min_length=1, max_length=50)
    year: int = Field(ge=1400, le=2100)
    price: float = Field(gt=0)

    @field_validator("title", "author")
    @classmethod
    def strip_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("不能为空")
        return stripped


class BookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    author: str | None = Field(default=None, min_length=1, max_length=50)
    year: int | None = Field(default=None, ge=1400, le=2100)
    price: float | None = Field(default=None, gt=0)


@app.post("/books")
def create_book(payload: BookCreate):
    global next_id
    book = {"id": next_id, **payload.model_dump()}
    BOOKS[next_id] = book
    next_id += 1
    return book


@app.get("/books/{book_id}")
def get_book(book_id: int):
    return BOOKS.get(book_id, {"error": "未找到图书"})


@app.patch("/books/{book_id}")
def patch_book(book_id: int, payload: BookUpdate):
    stored = BOOKS.get(book_id)
    if stored is None:
        return {"error": "未找到图书"}
    stored.update(payload.model_dump(exclude_unset=True))
    return stored
```

先 POST 一本，再 PATCH 只改价格，再 GET 看是否只变了价格。

---

## 十二、本篇小结

接收 JSON 的最小形状：

```python
class BookCreate(BaseModel):
    title: str
    author: str
    year: int
    price: float

@app.post("/books")
def create_book(payload: BookCreate):
    return payload.model_dump()
```

需要掌握的核心概念：

- 函数参数是 Pydantic 模型时，FastAPI 从 JSON body 构造它。
- 校验失败是 422，看 `detail[].loc`。
- 用 `Field` 写约束；可变默认值用 `default_factory`。
- 入参模型和出参模型分开：创建不要让客户端传 id。
- PATCH 用全可选模型 + `model_dump(exclude_unset=True)`。
- `model_dump()` 是 v2 方法，不要用 `.dict()`。
- JSON 和 Form/File 不要混在同一个接口里。

下一篇处理“返回什么、状态码是多少”，并补上 DELETE，得到内存版完整 CRUD。
