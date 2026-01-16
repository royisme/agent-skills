---
name: friendly-python
description: |
  Python coding standards and patterns for writing user-friendly and maintainer-friendly code.
  Use this skill when writing, reviewing, or refactoring Python code. It provides design principles,
  good/bad code examples, and a review checklist based on Frost Ming's "Friendly Python" series.
---

# Friendly Python

Python 工程实践规范，核心理念：**对使用者友好 + 对维护者友好**。

基于 [Frost Ming](https://frostming.com) 的 "Friendly Python" 系列文章整理。

## Overview

### When to Use
- 编写新的 Python 代码时
- 进行代码审查时
- 重构现有代码时
- 设计 Python API 时
- 将其他语言代码移植到 Python 时

### Core Philosophy
```
┌──────────────────────────────────────────────────────────┐
│           FRIENDLY PYTHON = 友好的 Python                │
├────────────────────────┬─────────────────────────────────┤
│   对使用者友好          │   对维护者友好                   │
│   ─────────────────    │   ─────────────────             │
│   • 合理默认值          │   • 单一改动点                   │
│   • 最少必填参数        │   • 注册中心替代 if-else         │
│   • 隐藏资源管理        │   • 显式优于魔法                 │
│   • 由简入繁            │   • 可读可调试                   │
└────────────────────────┴─────────────────────────────────┘
```

---

## Design Principles

### 1. 对使用者友好

- **优先提供合理默认值**：让 Quick Start 在不看文档时也能跑通
- **最少必填参数**：隐藏复杂对象的显式组装
- **资源管理透明化**：用上下文管理器或统一入口隐藏细节
- **由简入繁**：默认简单路径，复杂需求可显式扩展

### 2. 对维护者友好

- **单一改动点**：新增策略/命令/实现时，尽量收敛到一个改动点
- **注册中心替代 if-else**：用注册中心/插件表替代条件分支链
- **谨慎使用魔法**：自动扫描/动态导入需评估可读性与可调试性

### 3. 构造方式

- **避免半成品对象**：不推荐"实例化后再 load"；用 `classmethod` 构造
- **多来源多入口**：env/file/explicit 用不同构造入口而非 `__init__` flag
- **减少导入负担**：避免为"复用"暴露不必要的类或函数

### 4. 避免过度动态

- **不要 `__getattr__` 兜底**：会弱化可发现性、补全与类型约束
- **谨慎使用元类**：黑魔法若引入额外可见接口会污染用户心智模型
- **保持结构可见**：用描述符、显式字段或注册表

### 5. 生态扩展

- **优先使用官方扩展点**：hook/adapter/auth 等
- **避免属性复制**：不要自建 Request/Response 再转回去
- **最后才考虑继承/重载/monkey patch**

### 6. Python 范式

- **去掉其他语言的包袱**：不需要 builder 模式、过度回调
- **用 Python 自然范式**：关键字参数、上下文管理器、装饰器、生成器
- **自顶向下设计**：先设计调用方式，再决定实现细节

---

## Code Patterns

### Pattern 1: Registry vs If-Else

<details>
<summary>❌ Bad: 多处 if-else，新增实现要改多个位置</summary>

```python
class NewsGrabber:
    def get_news(self, source=None):
        if source is None:
            return chain(HNSource().iter_news(), V2Source().iter_news())
        if source == "HN":
            return HNSource().iter_news()
        if source == "V2":
            return V2Source().iter_news()
        raise ValueError(f"Unknown source: {source}")
```
</details>

<details>
<summary>✅ Good: 注册中心 + 单一改动点</summary>

```python
SOURCE_REGISTRY = {}

def register(cls):
    SOURCE_REGISTRY[cls.name] = cls()
    return cls

@register
class HNSource:
    name = "HN"

@register
class V2Source:
    name = "V2"

class NewsGrabber:
    def get_news(self, source=None):
        if source is None:
            return chain.from_iterable(s.iter_news() for s in SOURCE_REGISTRY.values())
        try:
            return SOURCE_REGISTRY[source].iter_news()
        except KeyError as exc:
            raise ValueError(f"Unknown source: {source}") from exc
```
</details>

---

### Pattern 2: Context Manager vs Manual Cleanup

<details>
<summary>❌ Bad: 强制拼装多个对象 + 手动关闭</summary>

```python
auth = AwesomeBasicAuth(user, password)
conn = AwesomeTCPConnection(host, port, timeout, retry_times, auth)
client = AwesomeClient(conn, type="test", scope="read")
print(client.get_resources())
conn.close()
```
</details>

<details>
<summary>✅ Good: 默认值 + 上下文管理器</summary>

```python
client = AwesomeClient(type="test", scope="read", auth=(user, password))
with client.connect():
    print(client.get_resources())
```
</details>

---

### Pattern 3: Classmethod Constructors vs Flag-based Init

<details>
<summary>❌ Bad: __init__ 用 flag 控制路径，参数互斥不透明</summary>

```python
class Settings:
    def __init__(self, **kwargs):
        if kwargs.get("from_env"):
            self._load_env()
        elif kwargs.get("from_file"):
            self._load_file(kwargs["from_file"])
        else:
            self._load_kwargs(kwargs)
```
</details>

<details>
<summary>✅ Good: 不同来源用 classmethod 构造</summary>

```python
class Settings:
    def __init__(self, db_user, db_password, db_host="localhost", db_port=3306):
        self.db_user = db_user
        self.db_password = db_password
        self.db_host = db_host
        self.db_port = db_port

    @classmethod
    def from_env(cls):
        return cls(
            db_user=os.getenv("DB_USER"),
            db_password=os.getenv("DB_PASSWORD"),
        )

    @classmethod
    def from_file(cls, path):
        data = load_config(path)
        return cls(**data)
```
</details>

---

### Pattern 4: Descriptors vs __getattr__ Catch-all

<details>
<summary>❌ Bad: __getattr__ 兜底所有字段，结构不可见</summary>

```python
class Settings:
    def __getattr__(self, name):
        return os.environ["CONFIG_" + name.upper()]
```
</details>

<details>
<summary>✅ Good: 描述符 + 显式字段</summary>

```python
class ConfigItem:
    def __set_name__(self, owner, name):
        self.name = name
        self.env_name = "CONFIG_" + name.upper()

    def __get__(self, instance, owner):
        if instance is None:
            return self
        return instance._data.get(self.name) or os.getenv(self.env_name)

class Settings:
    db_url = ConfigItem()
    db_password = ConfigItem()
```
</details>

---

### Pattern 5: Extension Points vs Custom Wrappers

<details>
<summary>❌ Bad: 自建 request 再转换回 requests</summary>

```python
req = CustomRequest(api_info, body)
SignerV4.sign(req, credentials)
url = req.build()
resp = requests.post(url, headers=req.headers, data=req.body)
```
</details>

<details>
<summary>✅ Good: 使用 requests.auth 作为签名扩展点</summary>

```python
class VolcAuth(requests.auth.AuthBase):
    def __init__(self, service_info, credentials):
        self.service_info = service_info
        self.credentials = credentials

    def __call__(self, r):
        sign_request(r, self.service_info, self.credentials)
        return r

resp = requests.post(url, json=payload, auth=VolcAuth(service_info, credentials))
```
</details>

---

### Pattern 6: Python Idioms vs Callback Style

<details>
<summary>❌ Bad: JS 回调式 API 直接翻译</summary>

```python
def download_file(url, on_success, on_error, on_complete):
    ...
```
</details>

<details>
<summary>✅ Good: Python 结构化控制流</summary>

```python
try:
    data = await download_file(url)
except Exception:
    handle_error()
finally:
    cleanup()
```
</details>

---

### Pattern 7: Argparse OOP Commands

<details>
<summary>❌ Bad: click 继承命令时只能 monkey patch callback</summary>

```python
def wrap_callback(cb):
    def new_cb(*args, **kwargs):
        if kwargs.get("verbose"):
            print("verbose")
        return cb(*args, **kwargs)
    return new_cb
```
</details>

<details>
<summary>✅ Good: argparse + Command 类 + set_defaults</summary>

```python
class Command:
    name = ""
    arguments = []

    def add_arguments(self, parser):
        for arg in self.arguments:
            arg.add_to_parser(parser)

    def handle(self, args):
        raise NotImplementedError

class Argument:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs

    def add_to_parser(self, parser):
        parser.add_argument(*self.args, **self.kwargs)

subparsers = parser.add_subparsers()
for cmd_cls in COMMANDS:
    cmd = cmd_cls()
    sub = subparsers.add_parser(cmd.name)
    sub.set_defaults(handle=cmd.handle)
    cmd.add_arguments(sub)
```
</details>

---

## Review Checklist

在代码审查或自检时，使用以下清单：

| 检查项 | 问题 |
|--------|------|
| 🔧 **扩展性** | 能否新增功能只改一个点？ |
| 🎯 **默认值** | API 是否有合理默认值？是否隐去不必要对象？ |
| 📈 **复杂度** | 复杂度是否"由简入繁"，默认路径最轻？ |
| 🔌 **扩展点** | 是否优先使用生态扩展点？ |
| 👁️ **显式性** | 是否为了炫技牺牲了显式性与可维护性？ |
| 🔄 **移植** | 移植代码是否重新设计了调用方式？ |

---

## Quick Reference

### 应该使用的模式

| 场景 | 推荐方案 |
|------|----------|
| 多种实现 | Registry 模式 + 装饰器注册 |
| 资源管理 | 上下文管理器 (`with`) |
| 多种输入来源 | `@classmethod` 构造器 |
| 配置字段 | 描述符 (Descriptor) |
| 扩展第三方库 | 官方扩展点 (hook/adapter/auth) |
| 异步操作 | async/await + try/except/finally |
| 命令行工具 | argparse + Command 类 |

### 应该避免的模式

| 反模式 | 问题 |
|--------|------|
| 大量 if-else 分支 | 新增功能需要修改多处 |
| `__init__` 中用 flag 控制路径 | 参数互斥不透明 |
| `__getattr__` 兜底 | 弱化可发现性和类型检查 |
| 过度元类 | 污染用户心智模型 |
| 自建 wrapper 转回原库 | 属性复制，维护负担 |
| JS 风格回调 | 非 Pythonic |

---

## References

- [Friendly Python 1](https://frostming.com/posts/2021/07-07/friendly-python-1/)
- [Friendly Python 2](https://frostming.com/posts/2021/07-23/friendly-python-2/)
- [Friendly Python OOP](https://frostming.com/posts/2022/friendly-python-oop/)
- [Friendly Python Reuse](https://frostming.com/posts/2024/friendly-python-reuse/)
- [Friendly Python Port](https://frostming.com/posts/2025/friendly-python-port/)
- [Advanced Argparse](https://frostming.com/posts/2021/11-23/advanced-argparse/)
