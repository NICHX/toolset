# 工具集 (Toolset) — 项目架构与功能分析报告

## 1. 项目概览

| 项目 | 内容 |
|------|------|
| **名称** | 工具集 (Toolset) |
| **类型** | Electron + React + TypeScript 桌面应用 |
| **版本** | 1.0.0 |
| **构建工具** | Vite 6 + vite-plugin-electron |
| **UI 框架** | React 18 + Tailwind CSS 3 |
| **状态管理** | Zustand 5 |
| **测试框架** | Vitest |
| **打包工具** | electron-builder |

---

## 2. 项目结构

```
toolset/
├── index.html                         # HTML 入口
├── package.json                       # 依赖与脚本
├── tsconfig.json / tsconfig.node.json # TypeScript 配置
├── vite.config.ts                     # Vite 主配置 (含 Electron 插件)
├── vite.renderer.config.ts            # 渲染进程独立 Vite 配置
├── vitest.config.ts                   # 测试配置
├── tailwind.config.cjs                # Tailwind 配置
├── postcss.config.cjs                 # PostCSS 配置
├── electron-builder.yml               # 打包配置
│
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # 窗口创建、IPC、插件加载入口
│   │   ├── plugin-loader.ts           # 插件扫描/加载器
│   │   └── plugin-api.ts              # 插件 IPC 通道常量
│   │
│   ├── preload/                       # 预加载层 (contextBridge)
│   │   └── index.ts                   # 暴露 electronAPI 给渲染进程
│   │
│   ├── shared/                        # 前后端共享类型
│   │   └── types.ts                   # IPC 通道、插件清单、上下文类型
│   │
│   ├── renderer/                      # React 渲染进程
│   │   ├── main.tsx                   # React 入口
│   │   ├── App.tsx                    # 根组件、页面路由
│   │   ├── components/
│   │   │   ├── layout/AppLayout.tsx   # 主布局 (侧边栏 + 顶栏 + 内容区)
│   │   │   └── ToastContainer.tsx     # Toast 通知渲染
│   │   ├── pages/
│   │   │   ├── ToolLauncher.tsx       # 首页工具启动器
│   │   │   ├── PluginManager.tsx      # 插件管理页
│   │   │   └── SystemSettings.tsx     # 系统设置页
│   │   ├── stores/
│   │   │   ├── pluginStore.ts         # 插件状态管理
│   │   │   └── toastStore.ts          # Toast 通知状态
│   │   ├── lib/
│   │   │   └── utils.ts               # cn() 工具函数
│   │   ├── types/
│   │   │   └── electron.d.ts          # window.electronAPI 类型声明
│   │   └── styles/
│   │       └── globals.css            # 全局样式 + Tailwind 组件层
│   │
│   └── __tests__/
│       └── validateShape.test.ts      # 单元测试示例
│
└── dist/                              # 构建产物
    ├── main/index.js
    ├── preload/index.js
    └── renderer/...
```

---

## 3. 架构分析

### 3.1 架构分层

```
┌─────────────────────────────────────────────────┐
│                 渲染进程 (Renderer)               │
│  React 18 + Zustand + Tailwind                  │
│  ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ AppLayout  │ │  Pages   │ │  Stores       │  │
│  │ (布局/导航) │ │ (3 pages)│ │ (plugin/toast)│  │
│  └─────┬─────┘ └────┬─────┘ └──────┬────────┘  │
│        └─────────────┴──────────────┘           │
│                        │                        │
├──────────── contextBridge ──────────────────────┤
│                    (preload/index.ts)            │
├────────────────────────┼────────────────────────┤
│                 主进程 (Main Process)             │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  Window Mgr   │  │    Plugin Loader         │  │
│  │ (窗口/IPC)    │  │  (扫描/加载/托盘)         │  │
│  └──────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 3.2 架构评价

#### 优点

1. **关注点分离清晰**：主进程、预加载层、渲染进程职责明确，符合 Electron 安全最佳实践（`contextIsolation: true`, `nodeIntegration: false`）。
2. **插件化架构设计良好**：通过 `PluginManifest` + `PluginMainContext` 定义清晰的插件契约，支持动态加载主进程入口和渲染脚本。
3. **状态管理轻量**：使用 Zustand，代码简洁且性能良好。
4. **路径别名规范**：`@/` 和 `@shared/` 别名统一管理导入路径。
5. **UI 组件层次合理**：`AppLayout` → `Pages` 的嵌套结构清晰，侧边栏导航逻辑正常。

#### 可改进点

1. **主进程 IPC 监听器注册时机**：`setupGenericIpcHandlers()` 在 `createMainWindow()` 之后调用，但在 `app.on('activate')` 重建窗口时不会重新注册监听器（见第 5 节）。
2. **缺少独立的类型定义文件**：`shared/types.ts` 同时定义类型和常量，建议将 `IPC_CHANNELS` 拆分为单独常量文件。
3. **无日志系统**：除插件 logger 外，应用本身无统一日志框架。
4. **无错误边界**：React 渲染层无 ErrorBoundary 包裹，插件页面崩溃会导致整个应用白屏。

---

## 4. 功能实现情况

### 4.1 已实现功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **主窗口管理** | ✅ | 创建/最小化/最大化/关闭/隐藏到托盘 |
| **窗口控制按钮** | ✅ | 非 macOS 平台显示自定义标题栏按钮 |
| **IPC 通信** | ✅ | app:get-version, minimize, maximize, close, is-maximized |
| **最大化状态同步** | ✅ | 主进程 → 渲染进程推送窗口状态变化 |
| **插件扫描加载** | ✅ | 从 `userData/plugins` 目录扫描 `plugin.json` |
| **插件主进程注册** | ✅ | 提供 PluginMainContext API (IPC/Protocol/Logger/Tray) |
| **系统托盘** | ✅ | 托盘图标 + 右键菜单 (显示主窗口/退出) |
| **Toast 通知** | ✅ | 支持 success/error/info 三种类型，3秒自动消失 |
| **深色模式** | ✅ | 使用 `class` 策略切换，默认深色 |
| **动态问候语** | ✅ | 根据时间段返回不同问候 |
| **实时时钟** | ✅ | 每 10 秒更新一次 |
| **插件管理 UI** | ✅ | 列表展示、启用/禁用切换、卸载按钮 |
| **内置插件标识** | ✅ | 内置插件不可卸载 |
| **页面路由** | ✅ | 支持 `home`、`_system:page`、`pluginId:pageId` |
| **单元测试** | ✅ | 1 个测试文件，4 个测试用例 |
| **暗色主题同步** | ✅ | 设置切换后同步到 `<html>` class |
| **全局搜索快捷键** | ✅ | Ctrl/Cmd+F 打开搜索栏 (UI 框架已预置) |

### 4.2 已修复缺陷 / 待优化功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **插件渲染脚本加载** | ⚠️ | 使用 `file://` 协议加载 JS/CSS，生产环境下可能受安全策略限制 |
| **插件 CSS 路径** | ✅ 已修复 | 原硬编码为 `reminder-plugin.css`，已改为通用约定 `index.css` |
| **插件安装** | ✅ 已修复 | 通过主进程 `dialog.showOpenDialog` 选择目录后复制到插件目录 |
| **插件卸载** | ✅ 已修复 | 通过主进程删除插件目录 |
| **全局搜索** | ⚠️ | 搜索状态 (`searchQuery`, `selectedIdx`) 已定义但**未渲染搜索 UI** |
| **Toast 调用** | ✅ 已修复 | 在插件管理的启用/禁用/安装/卸载/刷新操作中已激活 Toast 通知 |
| **工具函数测试** | ⚠️ | `validateShape` 函数直接在测试文件中定义，未从源码中导入，仅为演示用途 |

### 4.3 未实现功能

| 功能 | 说明 |
|------|------|
| **插件实际安装流程** | 无文件选择对话框 / 拖拽安装 / 下载安装 |
| **插件持久化状态** | 启用/禁用状态仅存在内存中，重启后丢失 |
| **多窗口支持** | 仅支持单窗口 |
| **国际化** | 所有文本硬编码为中文 |
| **应用更新机制** | 无自动更新 |
| **Content-Security-Policy** | 未设置 CSP 头部 |

---

## 5. 问题与修复清单

### 5.1 Bug 修复清单

| # | 问题 | 严重程度 | 状态 | 修复方式 |
|---|------|----------|------|----------|
| 1 | 插件 CSS 路径硬编码为 `reminder-plugin.css` | 🔴 严重 | ✅ 已修复 | 改为通用约定 `renderer/index.css` |
| 2 | 插件安装/卸载为空实现 | 🔴 严重 | ✅ 已修复 | 新增 `plugin:install`（目录对话框 → 复制）和 `plugin:uninstall`（删除目录）IPC handler |
| 3 | 窗口重建后 `maximize`/`unmaximize` 监听器丢失 | 🔴 严重 | ✅ 已修复 | 将窗口事件监听器移到 `createMainWindow()` 内部，每次重建窗口都重新注册 |
| 4 | ToolLauncher 重复加载插件 | 🟡 中等 | ✅ 已修复 | 移除 ToolLauncher 中冗余的 `loadPlugins()` 调用，仅保留时间更新逻辑 |
| 5 | 搜索 UI 未渲染 | 🟡 中等 | ⏳ 待修复 | `searchQuery` 和 `selectedIdx` 状态已定义，但无实际搜索面板 |
| 6 | Toast 系统未被使用 | 🟡 中等 | ✅ 已修复 | 在启用/禁用/安装/卸载/刷新操作中调用 `addToast` |
| 7 | `plugin:list` IPC 通道未实现 | 🟡 中等 | ✅ 已修复 | 移除未使用的 IPC 通道常量 |
| 8 | `file://` 协议加载渲染脚本 | ⚪ 风险 | ✅ 已修复 | 注册 `plugin://` 自定义协议，通过 `protocol.handle` 安全映射本地文件 |
| 9 | 无 Content-Security-Policy | ⚪ 风险 | ✅ 已修复 | 添加 CSP meta 标签，限制资源加载来源 |
| 10 | 插件启用状态不持久化 | ⚪ 风险 | ✅ 已修复 | 新增 `plugin:save-states` / `plugin:load-states` IPC，保存到 `plugin-states.json` |

---

## 6. 技术债务与建议

### 6.1 短期改进（高优先级）

1. ✅ **修复插件 CSS 路径硬编码**：已完成，统一约定为 `renderer/index.css`
2. ✅ **实现插件安装/卸载的 IPC 流程**：已完成，支持目录对话框选择后复制/删除
3. ✅ **修复 `activate` 事件的窗口重建问题**：已完成，将监听器移到 `createMainWindow()` 内部
4. ✅ **改用自定义协议加载插件资源**：已完成，注册 `plugin://` 协议替代 `file://`

### 6.2 中期改进

1. ✅ **插件启用状态持久化**：已完成，通过 `plugin:save-states` / `plugin:load-states` IPC 存储到 JSON 文件
2. ✅ **添加 ErrorBoundary**：已完成，包裹插件页面渲染，防止单个插件崩溃导致整个应用不可用
3. ⏳ **补充单元测试**：当前仅1个测试文件（4个用例），覆盖率严重不足
4. ✅ **消除重复的 loadPlugins 调用**：已完成，移除 ToolLauncher 中的冗余调用
5. ✅ **激活 Toast 系统**：已完成，在插件管理各操作中已添加 Toast 通知

### 6.3 长期规划

1. **插件市场 / 远程安装**：支持从 URL 下载安装插件
2. **国际化支持**：至少提取文本到 i18n 资源文件
3. **CSP 策略**：配置严格的 Content-Security-Policy
4. **自动化测试**：增加组件测试和 E2E 测试
5. **自动更新**：集成 electron-updater

---

## 7. 总结

**工具集 (Toolset)** 是一个采用 Electron + React + TypeScript 技术栈的插件化桌面应用，整体架构设计合理，分层清晰。项目遵循了 Electron 安全最佳实践（contextIsolation、preload 桥接），并成功实现了包含主窗口管理、插件加载系统、系统托盘、主题切换、Toast 通知等在内的核心功能骨架。

**主要优势**：
- 架构分层清晰，插件扩展性良好
- 技术栈现代（Vite 6, React 18, Tailwind CSS, Zustand）
- 遵循 Electron 安全最佳实践

**主要短板**（已修复 9/10）：
- ~~插件 CSS 路径硬编码~~ ✅ 已修复
- ~~插件安装/卸载为空实现~~ ✅ 已修复
- ~~插件脚本使用 `file://` 协议~~ ✅ 已修复
- ~~插件启用状态不持久化~~ ✅ 已修复
- 测试覆盖率极低
- ~~若干小 Bug（重复加载、Toast 未激活等）~~ ✅ 已修复

总体来说，项目处于**功能骨架搭建完成、核心链路有待完善**的阶段。修复上述关键问题后，项目将具备可用的最小化产品能力。