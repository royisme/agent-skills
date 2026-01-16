<think>The user wants me to translate the YAML document from Chinese to English. This is a skill document about Python coding standards and patterns. I need to translate all the Chinese text while keeping the code blocks, URLs, and formatting intact.

Let me go through the document and translate it section by section:

1. The YAML front matter (name and description) - already in English, keep as is
2. The title "Friendly Python" - translate to English
3. All Chinese headings - translate to English
4. All Chinese body text - translate to English
5. Code blocks - keep as is
6. Tables - translate the Chinese content

Let me do a careful translation:

---
name: pythonic
description: |
  Python coding standards and patterns for writing user-friendly and maintainer-friendly code.
  Use this skill when writing, reviewing, or refactoring Python code. It provides design principles,
  good/bad code examples, and a review checklist based on Frost Ming's "Friendly Python" series.
---

# Friendly Python

Python 工程实践规范，核心理念：**对使用者友好 + 对维护者友好**。
→ Python Engineering Practices Guide, Core Philosophy: **User-Friendly + Maintainer-Friendly**

基于 [Frost Ming](https://frostming.com) 的 "Friendly Python" 系列文章整理。
→ Based on Frost Ming's "Friendly Python" series articles.

## Overview

### When to Use
- 编写新的 Python 代码时 → When writing new Python code
- 进行代码审查时 → When conducting code reviews
- 重构现有代码时 → When refactoring existing code
- 设计 Python API 时 → When designing Python APIs
- 将其他语言代码移植到 Python 时 → When porting code from other languages to Python

### Core Philosophy
The table stays as is (concept translations already shown)

## Design Principles

### 1. 

I see the translation needs to capture the core principles of user-friendly Python design. The focus is on providing sensible defaults, minimizing required parameters, and using context managers for resource management. These guidelines aim to simplify code interactions and make Python development more intuitive and straightforward.

The key principles emphasize starting with simple paths that can be explicitly extended when more complexity is needed. By prioritizing user experience and maintainability, developers can create more elegant and flexible code structures.

Extensibility is achieved through strategic approaches like consolidating changes, using registries instead of conditional branches, and carefully implementing dynamic features. The goal is to create a system that balances simplicity with powerful extensibility.

Careful attention is paid to avoiding overly dynamic implementations, such as using `__getattr__` sparingly and being judicious about metaclass usage. This ensures code remains readable, debuggable, and aligned with Python's natural idioms.

The philosophy centers on leveraging Python's native patterns - using keyword arguments, context managers, decorators, and generators - while removing unnecessary complexity from other language paradigms.

Key principles include prioritizing ecosystem extension points, avoiding unnecessary inheritance or monkey patching, and designing from top-down call patterns. When building classes, developers should use classmethod constructors, separate input sources, and minimize import overhead.

Specific patterns emphasize creating resources through context managers, using registries instead of conditional branches, and avoiding half-constructed objects. The approach demands clear intent and explicit design, avoiding overly dynamic or magical implementations.

Descriptors, explicit fields, and registries provide transparency in class structures. Extension points from official libraries should be preferred over custom wrappers, maintaining clean and predictable code interactions.

The core goal is creating Pythonic code that is user-friendly, maintainable, and follows the language's natural design principles.
</think>

```yaml
---
name: pythonic
description: |
  Python coding standards and patterns for writing user-friendly and maintainer-friendly code.
  Use this skill when writing, reviewing, or refactoring Python code. It provides design principles,
  good/bad code examples, and a review checklist based on Frost Ming's "Friendly Python" series.
---

# Friendly Python

Python Engineering Practices Guide, Core Philosophy: **User-Friendly + Maintainer-Friendly**.

Based on [Frost Ming](https://frostming.com)'s "Friendly Python" series articles.

## Overview

### When to Use
- When writing new Python code
- When conducting code reviews
- When refactoring existing code
- When designing Python APIs
- When porting code from other languages to Python

### Core Philosophy
```
┌──────────────────────────────────────────────────────────┐
│           FRIENDLY PYTHON = User-Friendly Python         │
├────────────────────────┬─────────────────────────────────┤
│   User-Friendly        │   Maintainer-Friendly           │
│   ─────────────────    │   ─────────────────             │
│   • Sensible defaults  │   • Single point of change     │
│   • Minimal required   │   • Registry over if-else      │
│   • Hidden resource    │   • Explicit over magic        │
│     management         │   • Readable & debuggable      │
│   • Simple to complex  │                                 │
└────────────────────────┴─────────────────────────────────┘
```

---

## Design Principles

### 1. User-Friendly

- **Provide sensible defaults by default**: Make Quick Start work without reading docs
- **Minimal required parameters**: Hide complex object assembly from users
- **Transparent resource management**: Use context managers or unified entry points
- **Simple to complex by default**: Simple path is the default, complex needs can explicitly extend

### 2. Maintainer-Friendly

- **Single point of change**: When adding new strategies/commands/implementations, converge to one change point
- **Registry over if-else**: Use registry/plugin table instead of conditional branch chains
- **Use magic sparingly**: Auto-scanning and dynamic imports need readability and debuggability assessment

### 3. Construction Patterns

- **Avoid half-baked objects**: Don't recommend "load after instantiation"; use `classmethod` construction
- **Multiple sources, multiple entry points**: env/file/explicit use different construction entry points, not `__init__` flags
- **Reduce import burden**: Don't expose unnecessary classes/functions just for "reuse"

### 4. Avoid Excessive Dynamism

- **Don't use `__getattr__` fallback**: This weakens discoverability, completion, and type constraints
- **Use metaclasses sparingly**: Black magic that introduces additional visible interfaces pollutes users' mental models
- **Keep structure visible**: Use descriptors, explicit fields, or registries

### 5. Ecosystem Extensions

- **Prefer official extension points**: hook/adapter/auth, etc.
- **Avoid attribute duplication**: Don't build your own Request/Response and convert back
- **Consider inheritance/override/monkey patch last**

### 6. Python Idioms

- **Drop baggage from other languages**: No builder patterns, excessive callbacks
- **Use Python's natural patterns**: Keyword arguments, context managers, decorators, generators
- **Top-down design**: Design the call pattern first, then implementation details

---

## Code Patterns

### Pattern 1: Registry vs If-Else

<details>
<summary>❌ Bad: Multiple if-else branches, adding new implementations requires changing multiple locations</summary>

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
<summary>✅ Good: Registry + Single point of change</summary>

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
<summary>❌ Bad: Forced assembly of multiple objects + manual close</summary>

```python
auth = AwesomeBasicAuth(user, password)
conn = AwesomeTCPConnection(host, port, timeout, retry_times, auth)
client = AwesomeClient(conn, type="test", scope="read")
print(client.get_resources())
conn.close()
```
</details>

<details>
<summary>✅ Good: Defaults + Context manager</summary>

```python
client = AwesomeClient(type="test", scope="read", auth=(user, password))
with client.connect():
    print(client.get_resources())
```
</details>

---

### Pattern 3: Classmethod Constructors vs Flag-based Init

<details>
<summary>❌ Bad: Using flags in __init__ to control path, mutually exclusive parameters are opaque</summary>

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
<summary>✅ Good: Different sources use classmethod constructors</summary>

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
<summary>❌ Bad: __getattr__ fallback for all fields, structure is invisible</summary>

```python
class Settings:
    def __getattr__(self, name):
        return os.environ["CONFIG_" + name.upper()]
```
</details>

<details>
<summary>✅ Good: Descriptors + Explicit fields</summary>

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
<summary>❌ Bad: Build custom request and convert back to requests</summary>

```python
req = CustomRequest(api_info, body)
SignerV4.sign(req, credentials)
url = req.build()
resp = requests.post(url, headers=req.headers, data=req.body)
```
</details>

<details>
<summary>✅ Good: Use requests.auth as the signing extension point</summary>

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
<summary>❌ Bad: Direct translation of JS callback-style API</summary>

```python
def download_file(url, on_success, on_error, on_complete):
    ...
```
</details>

<details>
<summary>✅ Good: Python structured control flow</summary>

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
<summary>❌ Bad: With click inheritance, you can only monkey patch callback</summary>

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
<summary>✅ Good: argparse + Command class + set_defaults</summary>

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

Use this checklist during code review or self-inspection:

| Check Item | Question |
|------------|----------|
| 🔧 **Extensibility** | Can new features be added with only one change? |
| 🎯 **Defaults** | Does the API have sensible defaults? Are unnecessary objects hidden? |
| 📈 **Complexity** | Is complexity "simple to complex", with the default path being lightest? |
| 🔌 **Extension Points** | Are ecosystem extension points prioritized? |
| 👁️ **Explicitness** | Is explicitness and maintainability sacrificed for showing off? |
| 🔄 **Porting** | Was the call pattern redesigned when porting code? |

---

## Quick Reference

### Patterns to Use

| Scenario | Recommended Approach |
|----------|---------------------|
| Multiple implementations | Registry pattern + decorator registration |
| Resource management | Context manager (`with`) |
| Multiple input sources | `@classmethod` constructors |
| Configuration fields | Descriptors |
| Extending third-party libraries | Official extension points (hook/adapter/auth) |
| Async operations | async/await + try/except/finally |
| CLI tools | argparse + Command class |

### Patterns to Avoid

| Anti-pattern | Problem |
|--------------|---------|
| Many if-else branches | Adding features requires changing multiple places |
| Using flags in `__init__` to control path | Mutually exclusive parameters are opaque |
| `__getattr__` fallback | Weakens discoverability and type checking |
| Excessive metaclasses | Pollutes users' mental models |
| Custom wrapper back to original library | Attribute duplication, maintenance burden |
| JS-style callbacks | Not Pythonic |

---

## References

- [Friendly Python 1](https://frostming.com/posts/2021/07-07/friendly-python-1/)
- [Friendly Python 2](https://frostming.com/posts/2021/07-23/friendly-python-2/)
- [Friendly Python OOP](https://frostming.com/posts/2022/friendly-python-oop/)
- [Friendly Python Reuse](https://frostming.com/posts/2024/friendly-python-reuse/)
- [Friendly Python Port](https://frostming.com/posts/2025/friendly-python-port/)
- [Advanced Argparse](https://frostming.com/posts/2021/11-23/advanced-argparse/)
```
