# [项目名] - 项目上下文引导

> **自动生成时间**: YYYY-MM-DD HH:MM
> **技术栈**: TypeScript, React, etc.

---

## 目录

- [强制执行规则](#-强制执行规则)
- [项目目录结构](#-项目目录结构)
- [编码规范](#-编码规范)
- [文档维护规则](#-文档维护规则)
- [目录文档索引](#-目录文档索引)

---

## ⚠️ 强制执行规则

**每次操作前，必须执行以下步骤：**

1. **阅读相关目录的 TECH_INFO.md** - 了解该目录下各文件的功能和依赖关系
2. **遵循下方的编码规范** - 确保代码符合项目标准
3. **修改完成后更新文档** - 同步更新 TECH_INFO.md 和文件头注释

---

## 📁 项目目录结构

```
project-name/
├── src/
│   ├── components/  # UI 组件
│   │   └── TECH_INFO.md
│   ├── pages/       # 页面组件/路由
│   │   └── TECH_INFO.md
│   ├── services/    # 业务服务层
│   │   └── TECH_INFO.md
│   ├── utils/       # 通用工具函数
│   │   └── TECH_INFO.md
│   └── types/       # 类型定义
│       └── TECH_INFO.md
├── public/          # 公共静态文件
└── USERAGENTS.md    # 本引导文件
```

---

## 📋 编码规范

以下规范必须严格遵守：

1. 禁止直接使用原生 fetch，必须通过封装的 HTTP 工具类发起请求
2. 禁止硬编码敏感信息（API keys、密码等）
3. 禁止提交 .env 等配置文件到 git
4. 所有异步操作必须有适当的错误处理
5. [根据技术栈添加更多规范...]

---

## 📝 文档维护规则

### TECH_INFO.md 维护

每个目录必须包含 `TECH_INFO.md` 文件，内容包括：

```markdown
# [目录名] 技术文档

## 文件清单

| 文件名 | 功能描述 | 入参 | 出参 | 依赖 |
|--------|----------|------|------|------|
| xxx.ts | 描述功能 | 类型 | 类型 | 依赖文件 |

## 最近变更

- [日期] [变更内容]
```

### 文件头注释规范

每个代码文件必须包含头部注释：

```typescript
/**
 * @file 文件名
 * @description 功能描述
 * @module 所属模块
 * @dependencies 依赖的其他文件
 * @lastModified YYYY-MM-DD
 */
```

### 强制更新时机

在以下情况下，**必须**更新相关文档：

1. ✅ 新增文件 → 更新 TECH_INFO.md 文件清单
2. ✅ 修改文件功能 → 更新文件头注释和 TECH_INFO.md
3. ✅ 删除文件 → 从 TECH_INFO.md 移除
4. ✅ 修改依赖关系 → 更新依赖说明
5. ✅ 新增目录 → 创建新的 TECH_INFO.md

---

## 🔗 目录文档索引

- [src/components](src/components/TECH_INFO.md) - UI 组件
- [src/pages](src/pages/TECH_INFO.md) - 页面组件/路由
- [src/services](src/services/TECH_INFO.md) - 业务服务层
- [src/utils](src/utils/TECH_INFO.md) - 通用工具函数
- [src/types](src/types/TECH_INFO.md) - 类型定义
