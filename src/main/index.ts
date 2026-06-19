import { app, BrowserWindow, ipcMain, Menu, dialog, protocol, net, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { PLUGIN_IPC_CHANNELS } from './plugin-api'
import { PluginLoader } from './plugin-loader'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let pluginsDir = ''
let statesFile = ''

function createMainWindow() {
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: '工具集',
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    backgroundColor: '#0f172a',
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 窗口最大化/还原状态变化通知渲染进程
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false)
  })

  return mainWindow
}

// Generic IPC handlers (not plugin-specific)
function setupGenericIpcHandlers() {
  ipcMain.handle('app:get-version', () => '1.0.0')

  ipcMain.handle('app:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('app:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('app:is-maximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle('app:close', () => {
    mainWindow?.close()
  })
}

// 过滤复制插件目录（排除源码文件，只保留运行时需要的文件）
const IGNORE_PATTERNS = ['src', '.git', '.github', '.vscode', '__tests__', 'dist', 'node_modules']

function isIgnored(name: string): boolean {
  return IGNORE_PATTERNS.includes(name) ||
    name.startsWith('.') ||
    name.endsWith('.ts') ||
    name === 'package-lock.json' ||
    name === 'tsconfig.json' ||
    name === 'postcss.config.cjs' ||
    name === 'tailwind.config.cjs' ||
    name === 'vite.config.ts' ||
    name === 'vitest.config.ts'
}

function copyPluginFiles(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyPluginFiles(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Plugin loader
const pluginLoader = new PluginLoader()

// 注册自定义 plugin:// 协议（必须在 app.whenReady 前调用）
protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { supportFetchAPI: true, bypassCSP: true, stream: true } },
])

app.whenReady().then(() => {
  // 初始化文件日志
  try { logger.init() } catch { /* app 初始化阶段 */ }

  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
  }

  // Disable GPU on macOS
  if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('disable-gpu')
  }

  // 注册 plugin:// 协议处理器，将 plugin://plugin-id/path 映射到本地文件
  protocol.handle('plugin', (request) => {
    const url = new URL(request.url)
    const pluginId = url.hostname
    // 解码路径，移除开头的 /
    const filePath = path.join(pluginsDir, pluginId, decodeURIComponent(url.pathname))
    return net.fetch(`file://${filePath}`)
  })

  createMainWindow()
  setupGenericIpcHandlers()

  // 加载所有已安装的插件
  if (mainWindow) {
    pluginLoader.setMainWindow(mainWindow)
    // 从插件目录加载
    pluginsDir = path.join(app.getPath('userData'), 'plugins')
    statesFile = path.join(app.getPath('userData'), 'plugin-states.json')
    pluginLoader.loadAll(pluginsDir)

    // 应用已保存的插件启用状态
    try {
      if (fs.existsSync(statesFile)) {
        const states = JSON.parse(fs.readFileSync(statesFile, 'utf-8')) as Record<string, boolean>
        pluginLoader.applyStates(states)
      }
    } catch (e) {
      logger.warn('Main', 'Failed to load plugin states:', e)
    }
  }

  // 通知渲染进程插件已加载
  if (mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('plugins:loaded')
    })
  }

  // IPC: 获取已加载的插件列表
  ipcMain.handle('plugin:get-loaded', () => {
    return pluginLoader.getManifests()
  })

  // IPC: 获取已加载插件的主进程 API
  ipcMain.handle(PLUGIN_IPC_CHANNELS.GET_MAIN_API, () => {
    return { loaded: pluginLoader.getPluginIds() }
  })

  // IPC: 获取插件 renderer 脚本路径
  ipcMain.handle('plugin:get-renderer-scripts', () => {
    return pluginLoader.getRendererScripts()
  })

  // IPC: 安装插件 — 用户选择目录后复制到插件目录
  ipcMain.handle('plugin:install', async () => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪' }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择插件目录',
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消' }
    }

    const sourcePath = result.filePaths[0]
    const manifestPath = path.join(sourcePath, 'plugin.json')

    if (!fs.existsSync(manifestPath)) {
      return { success: false, error: '所选目录不包含 plugin.json' }
    }

    // 读取 manifest 获取插件 ID
    let pluginId: string
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8')
      pluginId = JSON.parse(raw).id
      if (!pluginId) throw new Error('插件 ID 为空')
    } catch (e) {
      return { success: false, error: `无效的 plugin.json: ${(e as Error).message}` }
    }

    // 确保插件目录存在且是有效目录
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
    } else if (!fs.statSync(pluginsDir).isDirectory()) {
      // pluginsDir 存在但不是一个目录，删除后重建
      fs.rmSync(pluginsDir, { recursive: true, force: true })
      fs.mkdirSync(pluginsDir, { recursive: true })
    }

    const targetPath = path.join(pluginsDir, pluginId)
    if (fs.existsSync(targetPath)) {
      logger.info('Plugin Install', `Plugin "${pluginId}" directory exists, removing before re-install`)
      try {
        fs.rmSync(targetPath, { recursive: true, force: true })
      } catch (e) {
        return { success: false, error: `清理旧的插件目录失败: ${(e as Error).message}` }
      }
    }

    try {
      copyPluginFiles(sourcePath, targetPath)
    } catch (e) {
      return { success: false, error: `复制插件目录失败: ${(e as Error).message}` }
    }

    // 重新加载插件
    try {
      pluginLoader.loadAll(pluginsDir)
    } catch (e) {
      return { success: false, error: `加载插件失败: ${(e as Error).message}` }
    }

    return { success: true }
  })

  // IPC: 卸载插件 — 删除插件目录
  ipcMain.handle('plugin:uninstall', async (_event, pluginId: string) => {
    const targetPath = path.join(pluginsDir, pluginId)
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `插件 "${pluginId}" 不存在` }
    }

    try {
      fs.rmSync(targetPath, { recursive: true, force: true })
      // 重新加载插件
      pluginLoader.loadAll(pluginsDir)
      return { success: true }
    } catch (e) {
      return { success: false, error: `删除插件目录失败: ${(e as Error).message}` }
    }
  })

  // IPC: 保存插件启用状态
  ipcMain.handle('plugin:save-states', (_event, states: Record<string, boolean>) => {
    try {
      fs.writeFileSync(statesFile, JSON.stringify(states, null, 2), 'utf-8')
      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  // IPC: 加载插件启用状态
  ipcMain.handle('plugin:load-states', () => {
    try {
      if (fs.existsSync(statesFile)) {
        return JSON.parse(fs.readFileSync(statesFile, 'utf-8'))
      }
      return {}
    } catch (e) {
      logger.warn('Main', 'Failed to load plugin states:', e)
      return {}
    }
  })

  // IPC: 清除所有已安装插件
  ipcMain.handle('plugin:clear-all', () => {
    if (!pluginsDir || !fs.existsSync(pluginsDir)) {
      return { success: true }
    }
    try {
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          fs.rmSync(path.join(pluginsDir, entry.name), { recursive: true, force: true })
        }
      }
      // 删除状态文件
      if (fs.existsSync(statesFile)) {
        fs.rmSync(statesFile, { force: true })
      }
      // 重新加载插件
      pluginLoader.clearAll()
      if (mainWindow) {
        pluginLoader.setMainWindow(mainWindow)
        pluginLoader.loadAll(pluginsDir)
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  // IPC: 在文件管理器中打开插件目录
  ipcMain.handle('plugin:open-dir', async () => {
    if (!pluginsDir) return { success: false, error: '插件目录未初始化' }
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
    }
    await shell.openPath(pluginsDir)
    return { success: true }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  pluginLoader.beforeQuit()
})

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
  } else {
    createMainWindow()
  }
})
