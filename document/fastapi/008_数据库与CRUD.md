# 008：数据库与 CRUD

> 本篇把内存字典换成真正的表。重启服务后数据还在。
>
> 学习目标：会用 SQLAlchemy 2.0 声明模型、用 `yield` 依赖提供 Session、在 service 里完成 CRUD，并理解 Session、commit、rollback 各自该在哪一层。

---

## 一、我们要解决什么问题？

004–006 的 `BOOKS: dict[int, dict]` 有三个硬伤：

1. 进程一停，数据消失。
2. 开两个 Uvicorn worker 就是两份内存，互相看不见。
3. 没法做并发安全的唯一约束，只能自己扫一遍书名。

后端把结构化数据交给数据库。本篇用 **SQLite + SQLAlchemy 2.0**。SQLite 是一个文件，不用单独安装数据库服务，适合学习和小工具。SQLAlchemy 的写法换 PostgreSQL 时主要改连接字符串。

不使用 SQLModel。SQLModel 是 FastAPI 作者做的薄封装，入门可以，但工作里更常见的是 SQLAlchemy 模型与 Pydantic schema **分开**。006 已经把它们分开了，这里顺着往下。

安装：

```bash
pip install sqlalchemy
```

本篇仍用同步 Session。异步引擎（`create_async_engine` + `asyncpg`/`aiosqlite`）概念相同，只是处处 `await`。先把同步链路走顺。

---

## 二、三层对象不要混

| 层 | 是什么 | 文件 |
|---|---|---|
| ORM 模型 | 表怎么映射成 Python 类 | `app/models/book.py` |
| Pydantic schema | HTTP 进出的 JSON 形状 | `app/schemas/book.py` |
| Session | 一次请求里的数据库句柄 | `app/db.py` + `deps.py` |

常见错误：让 FastAPI 直接 `response_model=ORM类`，再把 ORM 当 schema 用。短期能跑，长期会把表结构泄漏到接口，也会碰到懒加载、Session 已关闭还访问属性等问题。

正确方向：

```text
请求 JSON → BookCreate（Pydantic）
         → service 用 Session 写 Book 表（ORM）
         → 再校验成 BookRead（Pydantic）
         → 响应 JSON
```

---

## 三、引擎、Session、建表

`app/db.py`：

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = "sqlite:///./book.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite + FastAPI 需要
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

解释：

- `sqlite:///./book.db` 表示当前工作目录下的 `book.db` 文件。三个斜杠是 SQLite URL 的写法。
- `check_same_thread=False`：SQLite 默认限制连接只能在创建它的线程用。FastAPI 同步 `def` 可能跑在别的线程，必须关掉这个限制。换成 PostgreSQL 后删掉 `connect_args`。
- `autoflush=False`：需要查询刚 add 还没 commit 的对象时再手动 `session.flush()`，避免隐式 flush 让人看不懂 SQL 顺序。
- `get_db` 的 `yield` 就是 005 讲过的清理依赖。路径函数成功返回则 `commit`；中途异常则 `rollback`；无论成败都 `close`。

建表放在 lifespan，不要放在导入时：

```python
# app/main.py 的 lifespan
from app.db import Base, engine
from app.models import book as book_model  # 确保模型被 import，否则 create_all 看不到表


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()
```

`create_all` **不会**做迁移：你给表加了一列，旧数据库文件不会自动 ALTER。学习阶段删掉 `book.db` 重启即可。工作中用 Alembic。本篇末尾会提一下，不展开命令。

---

## 四、声明 ORM 模型

`app/models/book.py`：

```python
from sqlalchemy import String, Integer, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Book(Base):
    __tablename__ = "books"
    __table_args__ = (UniqueConstraint("title", name="uq_books_title"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    author: Mapped[str] = mapped_column(String(50), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
```

这是 SQLAlchemy 2.0 的 `Mapped` 写法。不要再抄网上大量的 `Column(Integer, primary_key=True)` 旧式，除非维护老项目。

`UniqueConstraint` 让数据库保证书名唯一。比在 Python 里 `any(b.title == ...)` 可靠：并发两个 POST 时，数据库会拒绝第二个，而内存扫描会双双成功。

Pydantic 的 `BookRead` 字段名和 ORM 一致，转换就很顺：

```python
BookRead.model_validate(book, from_attributes=True)
```

`from_attributes=True` 表示从对象属性读，而不是从 dict 键读。也可以在 `BookRead` 上写：

```python
class BookRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    author: str
    year: int
    price: float
```

推荐写在模型上，service 里每次少传一个参数。

---

## 五、把 `get_db` 挂进依赖

`app/deps.py` 增加：

```python
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db import get_db as _get_db

DbSession = Annotated[Session, Depends(_get_db)]
```

路径函数就可以写：

```python
def create_book(payload: BookCreate, db: DbSession):
    ...
```

`DbSession` 这种别名能少写很多 `Annotated`。注意：别名是给**路径函数参数**用的。在别的依赖函数里如果还需要 Session，继续 `db: Session = Depends(_get_db)` 或同样用 `DbSession`。

---

## 六、service 改成操作 Session

`app/services/book_service.py` 不再自己保存 `BOOKS`：

```python
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import Page
from app.models.book import Book
from app.schemas.book import BookCreate, BookUpdate


class DuplicateTitleError(Exception):
    pass


def list_books(db: Session, author: str | None, q: str | None, page: Page) -> list[Book]:
    stmt = select(Book)
    if author:
        stmt = stmt.where(Book.author == author)
    if q:
        stmt = stmt.where(Book.title.contains(q))
    stmt = stmt.offset(page.offset).limit(page.limit)
    return list(db.scalars(stmt))


def get_book(db: Session, book_id: int) -> Book | None:
    return db.get(Book, book_id)


def create_book(db: Session, payload: BookCreate) -> Book:
    book = Book(**payload.model_dump())
    db.add(book)
    try:
        db.flush()  # 立刻拿到 id，并触发唯一约束
    except IntegrityError as exc:
        raise DuplicateTitleError from exc
    db.refresh(book)
    return book


def replace_book(db: Session, book_id: int, payload: BookCreate) -> Book | None:
    book = db.get(Book, book_id)
    if book is None:
        return None
    for key, value in payload.model_dump().items():
        setattr(book, key, value)
    db.flush()
    db.refresh(book)
    return book


def patch_book(db: Session, book_id: int, payload: BookUpdate) -> Book | None:
    book = db.get(Book, book_id)
    if book is None:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(book, key, value)
    db.flush()
    db.refresh(book)
    return book


def delete_book(db: Session, book_id: int) -> bool:
    book = db.get(Book, book_id)
    if book is None:
        return False
    db.delete(book)
    db.flush()
    return True
```

要点：

- 查询用 `select(Book)` + `db.scalars(stmt)`，这是 2.0 风格。不要用已过时的 `db.query(Book).filter_by(...)` 当新代码模板。
- `db.get(Book, book_id)` 按主键取。
- `flush()` 把 SQL 发到数据库，但还没提交事务。id 会生成。唯一约束冲突在 flush 时就会抛 `IntegrityError`。
- 真正的 `commit` 仍在 `get_db` 的 yield 之后。这样 router 里多次调用 service，只要还在同一次请求、同一个 Session，就是同一事务。
- `refresh` 让 Python 对象和数据库当前值对齐。

router 只增加 `db` 参数，把 Session 传给 service：

```python
@router.post("", response_model=BookRead, status_code=201)
def create_book(payload: BookCreate, db: DbSession):
    try:
        book = book_service.create_book(db, payload)
    except book_service.DuplicateTitleError:
        raise HTTPException(status_code=409, detail="书名已存在")
    return book
```

`BookRead` 已设置 `from_attributes=True` 时，直接 return ORM 实例即可，FastAPI 会按响应模型过滤。

---

## 七、一次请求一条 Session

不要在模块全局放一个 `session = SessionLocal()` 长期复用。Session 不是连接池里的连接那么廉价且线程安全，它还带着事务状态。正确粒度是 **一次 HTTP 请求一个 Session**，正好由 `Depends(get_db)` 保证。

也不要在 service 内部自己 `SessionLocal()`。否则 router 的 Session 和 service 的 Session 不是同一个，commit 时机错乱，刚插入的行在同一次请求里可能读不到。

数据流：

```text
请求
  ↓
get_db() yield session
  ↓
router(db=session)
  ↓
service(..., db=session)
  ↓
路径函数返回
  ↓
get_db 里 session.commit()
  ↓
session.close()
```

---

## 八、过滤、分页不要在 Python 里做完再切

内存版可以 `items[offset:offset+limit]`。表大了必须让 SQL 做：

```python
stmt = stmt.offset(page.offset).limit(page.limit)
```

作者筛选同样下推到 `where`。否则你是把整表拉进内存再丢弃。

需要总数做分页页码时，另开一条 `select(func.count())`，不要把所有行 `list()` 再 `len()`。

---

## 九、配置不要写死在代码里

`DATABASE_URL` 最终应来自环境变量。最小做法：

```python
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./book.db")
```

更规范是用 `pydantic-settings`（LangChain 那份 001 用过）：

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./book.db"


settings = Settings()
```

测试里可以换成 `sqlite:///:memory:`，每个测试进程一份内存库，不碰你的 `book.db`。010 会用到。

PostgreSQL 示例：

```env
DATABASE_URL=postgresql+psycopg://user:pass@127.0.0.1:5432/book
```

安装 `psycopg`（或 `psycopg2`）后，SQLAlchemy 模型代码几乎不用改。这就是 ORM 的好处之一。

---

## 十、Alembic 是什么？（知道即可）

`create_all` 只适合空库。真实项目改表结构用迁移工具 Alembic：

```text
改 models/book.py
    ↓
生成迁移脚本（upgrade / downgrade）
    ↓
在每个环境执行 alembic upgrade head
```

它会记录已经执行到哪一版，避免手工 ALTER。等你的表超过两三张、要和别人共用数据库时再引入。现在靠删 SQLite 文件重置，注意力放在 Session 和分层上。

---

## 十一、本篇小结

数据库接入的最小闭环：

```python
def get_db():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

book = Book(**payload.model_dump())
db.add(book)
db.flush()
```

需要掌握的核心概念：

- ORM 模型描述表，Pydantic 描述接口，不要合成一个类长期使用。
- 一次请求一个 Session，用 `yield` 依赖提供。
- 2.0 用 `select()` / `db.get()` / `Mapped`。
- `flush` 触发 SQL 和约束，`commit` 在请求成功结束时做。
- 唯一性交给数据库，捕获 `IntegrityError` 再翻译成 409。
- 过滤和分页下推到 SQL。
- 连接字符串走环境变量；换 PostgreSQL 主要换 URL。

下一篇给写操作加上登录：谁在调用，用 JWT 证明。
