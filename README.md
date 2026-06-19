# toolset

工具集 — 集成多种实用工具的桌面应用。

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

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run lint

# 运行测试
npm test
```

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