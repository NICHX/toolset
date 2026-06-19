# toolset

<p>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow.svg" />
</p>

工具集 — 集成多种实用工具的桌面应用，基于 Electron + React 构建，支持动态插件加载。

## 功能

- **插件管理** — 动态加载和管理内置/外部插件
- **工具启动器** — 快速访问各类工具
- **系统设置** — 应用配置管理
- **通知系统** — 统一的 Toast 通知组件

## 技术栈

- **框架**: React 18 + TypeScript
- **构建**: Vite 6 + vite-plugin-electron
- **样式**: TailwindCSS + PostCSS
- **状态管理**: Zustand
- **图标**: Lucide React
- **桌面**: Electron
- **测试**: Vitest
- **打包**: electron-builder

## 开发

### 环境要求

- **Node.js** >= 18
- **npm** >= 9

```bash
# 安装依赖
npm install

# 启动开发模式（Vite + Electron 热重载）
npm run dev

# 构建
npm run build

# 类型检查
npm run lint

# 运行测试
npm test

# 监听模式测试
npm run test:watch

# 打包为桌面安装包
npm run dist
```

## 架构

toolset 采用 **Electron 主进程 + React 渲染进程** 的双进程架构：

```
Electron 应用
├── 主进程 (main/)
│   ├── 窗口管理
│   ├── IPC 通信层
│   ├── 插件加载器 (plugin-loader.ts)
│   └── 日志系统 (logger.ts)
├── 预加载脚本 (preload/)
│   └── contextBridge 暴露安全 API
└── 渲染进程 (renderer/)
    ├── App 路由
    ├── 插件管理页面
    ├── 工具启动器
    ├── 系统设置
    └── 共享组件
```

### 插件系统

toolset 支持通过 IIFE 模式动态加载外部插件。插件需实现统一的注册接口：

1. 在主进程中通过 `plugin-loader.ts` 扫描并加载插件目录
2. 插件通过 `__PLUGIN_REGISTRY__` 全局注册自身
3. 渲染进程通过 IPC 与插件主进程通信

参考 [reminder-plugin](../reminder-plugin) 了解插件开发详情。

## 项目结构

```
toolset/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # 预加载脚本
│   ├── renderer/       # 渲染进程 (React UI)
│   └── shared/         # 共享类型
├── dist/               # 编译输出
├── release/            # electron-builder 打包输出
├── index.html          # 入口 HTML
├── electron-builder.yml # 打包配置
├── vitest.config.ts    # 测试配置
└── vite.config.ts      # Vite 配置
```

## 许可

MIT