# Toolset 项目分析文档

## 项目概览

**名称**: 工具集 (toolset)  
**版本**: 1.0.0  
**描述**: 集成多种实用工具的桌面应用  
**技术栈**: Electron + React 18 + TypeScript + Vite 6 + TailwindCSS + Zustand  
**构建工具**: vite-plugin-electron + electron-builder  
**测试**: Vitest  

## 架构设计

### 进程架构

```
主进程 (src/main/)
  ├── index.ts          — 窗口管理、IPC 处理、插件安装/卸载
  ├── plugin-loader.ts  — 插件加载器、生命周期管理、托盘
  ├── plugin-api.ts     — IPC 通道常量定义
  └── logger.ts         — 文件日志系统

预加载脚本 (src/preload/)
  └── index.ts          — contextBridge 暴露 Electron API

渲染进程 (src/renderer/)
  ├── App.tsx           — 路由调度、插件页面加载
  ├── components/
  │   ├── layout/AppLayout.tsx  — 侧边栏 + 标题栏布局
  │   ├── ErrorBoundary.tsx     — 错误边界
  │   └── ToastContainer.tsx    — 通知容器
  ├── pages/
  │   ├── ToolLauncher.tsx      — 首页（工具启动器）
  │   ├── PluginManager.tsx     — 插件管理页
  │   └── SystemSettings.tsx    — 系统设置页
  ├── stores/
  │   ├── pluginStore.ts        — 插件状态管理
  │   └── toastStore.ts         — 通知状态管理
  ├── lib/utils.ts              — 工具函数
  ├── styles/globals.css        — 全局样式
  └── types/electron.d.ts       — 类型声明

共享类型 (src/shared/)
  └── types.ts          — PluginManifest、PluginMainContext 等
```

### 数据流

```
用户操作 → React 组件 → Zustand Store → IPC invoke → 主进程处理 → 响应返回 → 更新 UI
                                                                     ↓
                                                             文件系统持久化
```

## 核心功能分析

### 1. 插件系统

插件系统是工具集的核心，采用主进程 + 渲染进程双层架构：

#### 插件加载流程

```
app.whenReady()
  → 初始化日志、注册 plugin:// 协议
  → 创建主窗口
  → PluginLoader.loadAll(pluginsDir)
    → 遍历 plugins 目录下的每个子目录
    → 读取 plugin.json → 解析 manifest
    → 加载 main/index.js → 调用 register(ctx)
    → 创建插件上下文 ctx → 注册 IPC/协议/生命周期
  → 应用已保存的启用状态
  → 通知渲染进程 plugins:loaded
```

#### 插件上下文 (PluginMainContext)

插件通过 `register(ctx)` 接收上下文，包含：

| API | 说明 |
|------|------|
| `app` | Electron App 实例 |
| `getMainWindow()` | 获取主窗口 |
| `getToolsetPreloadPath()` | 获取预加载脚本路径 |
| `registerIpcHandler(channel, handler)` | 注册 IPC 处理器 |
| `registerProtocol(scheme, handler)` | 注册自定义协议 |
| `onAppReady(callback)` | 应用就绪回调 |
| `onBeforeQuit(callback)` | 退出前回调 |
| `onWindowAllClosed(callback)` | 窗口关闭回调 |
| `logger` | 日志接口 |
| `updateTrayMenu(template)` | 更新托盘菜单 |
| `addTrayClickHandler(handler)` | 添加托盘点击处理 |

#### 安装流程

```
用户点击"安装插件"
  → dialog.showOpenDialog 选择目录
  → 验证目录包含 plugin.json
  → 读取 manifest 获取插件 ID
  → copyPluginFiles() 复制到 pluginsDir/{id}/
    → 排除 src、.git、dist、.ts 等源文件
  → PluginLoader.loadAll() 重新加载
  → 通知渲染进程更新列表
```

#### 渲染进程加载

```
pluginStore.loadPlugins()
  → plugin:get-loaded → 获取 manifests
  → plugin:load-states → 恢复启用状态
  → plugin:get-renderer-scripts → 获取脚本路径
  → loadRendererScript() → 动态创建 <link>/<script> 标签
    → plugin://{id}/renderer/index.css
    → plugin://{id}/renderer/index.js
  → IIFE 执行 → window.__PLUGIN_REGISTRY__[id] = { pages }
```

### 2. 页面路由

```
App.tsx 路由调度：
  page === 'home'                    → ToolLauncher
  page === '_system:manager'         → PluginManagerPage
  page === '_system:settings'        → SystemSettings
  page === '{pluginId}:{pageId}'     → __PLUGIN_REGISTRY__[pluginId][pageId]
```

### 3. 窗口管理

- macOS 使用 `hiddenInset` 标题栏样式
- 非 macOS 使用无框窗口 + 自定义标题栏
- 关闭时隐藏而非退出（托盘常驻）
- 窗口状态实时通知渲染进程

### 4. 插件协议 (plugin://)

```
registerSchemesAsPrivileged → protocol.handle('plugin', request)
  → URL: plugin://{pluginId}/{path}
  → 映射到: pluginsDir/{pluginId}/{path}
  → 通过 net.fetch 加载本地文件
```

## 已修复问题

### 1. CSP 限制导致插件无法加载

- **问题**: `index.html` 的 CSP `default-src 'self'` 阻止了从 `plugin://` 协议加载脚本和样式
- **修复**: 扩展 CSP 添加 `plugin:` 协议到 `default-src`、`script-src`、`style-src`、`img-src`、`media-src`

### 2. 插件 Toast 消息不显示

- **问题**: 插件的 toastStore 与工具集的 toastStore 是不同实例，插件触发的 Toast 不会在工具集 UI 显示
- **修复**: 工具集 App 组件暴露 `window.__showToast` 全局函数，插件改用此函数显示消息

## 潜在问题与建议

### 1. 插件重复注册 IPC

当插件目录变更后调用 `loadAll()`，原有的 IPC 处理器未注销，可能导致同频道名重复注册报错。建议在 `clearAll()` 和 `loadAll()` 时跟踪已注册的 IPC 频道。

### 2. 渲染进程热更新

开发模式下插件 IIFE 加载后，Vite 热更新不会重新加载插件脚本。需要在插件变更时手动刷新。

### 3. 插件状态持久化时机

`togglePlugin` 在状态更新后异步保存，未等保存完成即返回。高频率切换可能导致状态不一致。

### 4. 缺失插件渲染进程样式隔离

`[data-plugin]` 选择器在 globals.css 中定义但未在插件容器上使用。建议在动态加载插件组件时添加 `data-plugin={pluginId}` 属性。

## 构建与开发

```bash
npm install          # 安装依赖
npm run dev          # 启动开发模式
npm run build        # 构建
npm run lint         # 类型检查
npm test             # 运行测试
npm run dist         # electron-builder 打包
```