import { app, BrowserWindow, ipcMain, Menu, dialog, protocol, net, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import AdmZip from 'adm-zip'
import { PLUGIN_IPC_CHANNELS } from './plugin-api'
import { PluginLoader } from './plugin-loader'
import { loadThemeConfig, saveThemeConfig } from './theme-config'
import { checkUpdateFromPackage, getUpdateSourceDir } from './plugin-updater'
import { PluginRegistry } from './plugin-registry'
import { ShortcutManager } from './shortcut-manager'
import { eventBus } from './event-bus'
import { logger, getLogs, clearLogs } from './logger'
import { SYSTEM_EVENTS } from '../shared/types'
import { PerformanceMonitor } from './performance-monitor'
import { checkAllDependencies, resolveDependencies } from './plugin-dependency-resolver'
import { ConfigBackupManager } from './config-backup'
import { AppConfig } from './app-config'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// ========== 原生弹窗辅助（使用 dialog.showMessageBox） ==========
async function showMessageBox(options: {
  type?: 'info' | 'question' | 'warning' | 'error'
  title: string
  message: string
  detail?: string
  buttons: string[]
  cancelId?: number
}): Promise<number> {
  if (!mainWindow) return options.cancelId ?? 0
  const result = await dialog.showMessageBox(mainWindow, {
    type: options.type,
    title: options.title,
    message: options.message,
    detail: options.detail,
    buttons: options.buttons,
    cancelId: options.cancelId ?? 0,
  })
  return result.response
}

let pluginsDir = ''
let pluginRegistry: PluginRegistry
let shortcutManager: ShortcutManager
let configBackupManager: ConfigBackupManager
let performanceMonitor: PerformanceMonitor
const appConfig = new AppConfig()

function resolveAssetPath(relativePath: string): string | undefined {
  const candidates = [
    path.join(__dirname, '..', relativePath),       // dist/assets/icon.png (prod)
    path.join(__dirname, '..', '..', relativePath),  // project-root/assets/icon.png (dev)
  ]
  return candidates.find((p) => fs.existsSync(p))
}

function createMainWindow() {
  const isMac = process.platform === 'darwin'
  const iconPath = resolveAssetPath('assets/icon.png')

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: '工具集',
    icon: iconPath,
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

  // Theme config IPC
  ipcMain.handle('theme:load-config', () => {
    return loadThemeConfig()
  })

  ipcMain.handle('theme:save-config', (_event, config) => {
    saveThemeConfig(config)
  })

  // 渲染进程调用原生弹窗
  ipcMain.handle('dialog:show-message-box', async (_event, options) => {
    if (!mainWindow) return { response: -1 }
    return await dialog.showMessageBox(mainWindow, options)
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

/** 递归复制整个目录（用于插件迁移，无过滤） */
function copyRecursiveSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/** 安全解压 ZIP，防止 ZIP Slip 路径穿越攻击 */
function extractZipSafely(zip: AdmZip, targetDir: string) {
  const resolvedTarget = path.resolve(targetDir)
  fs.mkdirSync(resolvedTarget, { recursive: true })
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const entryPath = path.resolve(targetDir, entry.entryName)
    if (!entryPath.startsWith(resolvedTarget)) {
      throw new Error(`安全错误: ZIP 条目 "${entry.entryName}" 尝试路径穿越`)
    }
    const dir = path.dirname(entryPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(entryPath, entry.getData())
  }
}

/** 校验插件目录完整性 */
function validatePluginDir(dir: string): { valid: boolean; error?: string } {
  const manifestPath = path.join(dir, 'plugin.json')
  if (!fs.existsSync(manifestPath)) return { valid: false, error: '缺少 plugin.json' }
  let manifest: any
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) }
  catch { return { valid: false, error: 'plugin.json 格式无效' } }
  if (!manifest.id || typeof manifest.id !== 'string') return { valid: false, error: '插件 ID 缺失或无效' }
  if (!manifest.name) return { valid: false, error: '插件名称缺失' }
  if (!manifest.version) return { valid: false, error: '插件版本缺失' }
  return { valid: true }
}

/** 保存插件旧配置，删除目录后再恢复 */
function replacePluginDirPreservingConfig(targetPath: string, sourcePath: string): { success: boolean; error?: string } {
  let oldConfig: Record<string, any> | null = null
  if (fs.existsSync(targetPath)) {
    const configPath = path.join(targetPath, 'config.json')
    if (fs.existsSync(configPath)) {
      try { oldConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch {}
    }
    try {
      fs.rmSync(targetPath, { recursive: true, force: true })
    } catch (e) {
      return { success: false, error: `清理旧插件目录失败: ${(e as Error).message}` }
    }
  }
  try {
    copyPluginFiles(sourcePath, targetPath)
  } catch (e) {
    return { success: false, error: `复制插件文件失败: ${(e as Error).message}` }
  }
  // 恢复旧配置
  if (oldConfig) {
    try {
      fs.writeFileSync(path.join(targetPath, 'config.json'), JSON.stringify(oldConfig, null, 2), 'utf-8')
    } catch (e) {
      logger.warn('Plugin', `Failed to copy config.json: ${(e as Error).message || e}`)
    }
  }
  return { success: true }
}

/** 读取插件 manifest 并弹出安装确认对话框。用户取消时返回 false */
async function confirmPluginInstall(mainWindow: BrowserWindow, manifestPath: string): Promise<boolean> {
  const raw = fs.readFileSync(manifestPath, 'utf-8')
  const manifest = JSON.parse(raw)
  const permissions = manifest.permissions?.length ? manifest.permissions.join(', ') : '无'

  const detail = [
    `描述: ${manifest.description || '无'}`,
    `权限: ${permissions}`,
    manifest.builtIn ? '\n此插件为内置插件。' : '',
  ].filter(Boolean).join('\n')

  const result = await showMessageBox({
    title: '安装插件',
    message: `${manifest.name}  v${manifest.version}`,
    detail,
    buttons: ['取消', '确认安装'],
    type: 'info',
  })
  return result === 1
}

// Plugin loader
const pluginLoader = new PluginLoader()

// 注册自定义 protocol 协议（必须在 app.whenReady 前调用）
protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { supportFetchAPI: true, bypassCSP: true, stream: true } },
])

app.whenReady().then(async () => {
  // 初始化文件日志
  try { logger.init() } catch { /* app 初始化阶段 */ }

  // 设置 macOS Dock 图标
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = resolveAssetPath('assets/icon.png')
    if (iconPath) {
      app.dock.setIcon(iconPath)
    }
  }

  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
  }

  // Disable GPU on macOS
  if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('disable-gpu')
  }

  // 注册 plugin:// 协议处理器，将 plugin://plugin-id/path 映射到本地文件
  protocol.handle('plugin', async (request) => {
    const url = new URL(request.url)
    const pluginId = url.hostname
    // 解码路径，移除开头的 /
    const filePath = path.join(pluginsDir, pluginId, decodeURIComponent(url.pathname))
    const response = await net.fetch(`file://${filePath}`)
    // 添加防缓存头，确保覆盖安装后 renderer script 能获取最新内容
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    headers.set('Pragma', 'no-cache')
    headers.set('Expires', '0')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  })

  // ★ 先注册所有 IPC handler（必须在 createMainWindow 之前，
  //    否则渲染进程可能在插件加载完成前发起 IPC 调用，
  //    导致 "No handler registered for 'plugin:get-loaded'" 错误）
  ipcMain.handle('plugin:get-loaded', () => {
    return pluginLoader.getManifests()
  })
  ipcMain.handle(PLUGIN_IPC_CHANNELS.GET_MAIN_API, () => {
    return { loaded: pluginLoader.getPluginIds() }
  })
  ipcMain.handle('plugin:get-renderer-scripts', () => {
    return pluginLoader.getRendererScripts()
  })

  createMainWindow()
  setupGenericIpcHandlers()

  // 加载所有已安装的插件
  if (mainWindow) {
    pluginLoader.setMainWindow(mainWindow)
    // 初始化注册表并注入 PluginLoader
    pluginsDir = appConfig.getEffectivePluginsDir()
    pluginRegistry = new PluginRegistry(pluginsDir)
    pluginLoader.setRegistry(pluginRegistry)
    // 初始化快捷键管理器
    shortcutManager = new ShortcutManager(pluginsDir)
    shortcutManager.setMainWindow(mainWindow)
    // 注入到 PluginLoader 上下文
    pluginLoader.setShortcutManager(shortcutManager)
    // 初始化配置备份管理器
    configBackupManager = new ConfigBackupManager(pluginsDir)
    await pluginLoader.loadAll(pluginsDir)
    // 加载后注册所有快捷键
    shortcutManager.registerAll()

    // 初始化性能监控并注册所有已加载插件
    performanceMonitor = new PerformanceMonitor()
    const manifests = pluginLoader.getManifests()
    for (const m of manifests) {
      if (m.id) performanceMonitor.registerPlugin(m.id)
    }
    performanceMonitor.start()
  }

  // 通知渲染进程插件已加载
  if (mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('plugins:loaded')
    })
  }

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

    // 校验插件目录完整性
    const validation = validatePluginDir(sourcePath)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // 读取 manifest 获取插件 ID
    let pluginId: string
    try {
      const raw = fs.readFileSync(path.join(sourcePath, 'plugin.json'), 'utf-8')
      pluginId = JSON.parse(raw).id
    } catch (e) {
      return { success: false, error: `无效的 plugin.json: ${(e as Error).message}` }
    }

    // 弹出安装确认对话框
    const confirmed = await confirmPluginInstall(mainWindow, path.join(sourcePath, 'plugin.json'))
    if (!confirmed) return { success: false, error: '用户取消' }

    // 确保插件目录存在且是有效目录
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
    } else if (!fs.statSync(pluginsDir).isDirectory()) {
      fs.rmSync(pluginsDir, { recursive: true, force: true })
      fs.mkdirSync(pluginsDir, { recursive: true })
    }

    // 复制文件并保留旧配置
    const targetPath = path.join(pluginsDir, pluginId)
    const copyResult = replacePluginDirPreservingConfig(targetPath, sourcePath)
    if (!copyResult.success) return copyResult

    logger.info('Plugin Install', `Installed plugin "${pluginId}" from ${sourcePath}`)

    // 加载插件
    try {
      pluginLoader.removePlugin(pluginId)
      await pluginLoader.loadSingle(pluginsDir, pluginId)
      pluginLoader.triggerInstall(pluginId)
      eventBus.emit(SYSTEM_EVENTS.PLUGIN_INSTALLED, { pluginId })
      logger.info('Plugin Install', `Loaded plugin "${pluginId}"`)
    } catch (e) {
      return { success: false, error: `加载插件失败: ${(e as Error).message}` }
    }

    return { success: true }
  })

  // IPC: 从文件安装插件（支持 .plugin.zip / .zip）
  ipcMain.handle('plugin:install-from-file', async () => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪' }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择插件包',
      filters: [
        { name: '插件包', extensions: ['zip'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '用户取消' }
    }

    const filePath = result.filePaths[0]

    // 解压到临时目录（try-finally 确保清理）
    const tempDir = path.join(app.getPath('temp'), `plugin-install-${Date.now()}`)
    try {
      const zip = new AdmZip(filePath)
      extractZipSafely(zip, tempDir)

      // 查找 plugin.json（可能在解压根目录或子目录中）
      const findManifest = (dir: string): string | null => {
        const manifestPath = path.join(dir, 'plugin.json')
        if (fs.existsSync(manifestPath)) return manifestPath
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const found = findManifest(path.join(dir, entry.name))
            if (found) return found
          }
        }
        return null
      }

      const manifestPath = findManifest(tempDir)
      if (!manifestPath) {
        return { success: false, error: '插件包中未找到 plugin.json' }
      }

      // 校验插件目录完整性
      const pluginSourceDir = path.dirname(manifestPath)
      const validation = validatePluginDir(pluginSourceDir)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // 弹出安装确认对话框
      const confirmed = await confirmPluginInstall(mainWindow, manifestPath)
      if (!confirmed) return { success: false, error: '用户取消' }

      // 读取 manifest 获取插件 ID
      let pluginId: string
      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8')
        pluginId = JSON.parse(raw).id
        if (!pluginId) throw new Error('插件 ID 为空')
      } catch (e) {
        return { success: false, error: `无效的 plugin.json: ${(e as Error).message}` }
      }

      // 目标：pluginsDir/{pluginId}
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true })
      }
      const targetPath = path.join(pluginsDir, pluginId)

      // 复制文件并保留旧配置
      const copyResult = replacePluginDirPreservingConfig(targetPath, pluginSourceDir)
      if (!copyResult.success) return copyResult

      logger.info('Plugin Install', `Installed plugin "${pluginId}" from ${filePath}`)

      // 加载插件
      try {
        pluginLoader.removePlugin(pluginId)
        pluginLoader.loadSingle(pluginsDir, pluginId)
        pluginLoader.triggerInstall(pluginId)
        eventBus.emit(SYSTEM_EVENTS.PLUGIN_INSTALLED, { pluginId })
        logger.info('Plugin Install', `Loaded plugin "${pluginId}" from zip`)
      } catch (e) {
        return { success: false, error: `加载插件失败: ${(e as Error).message}` }
      }

      return { success: true }
    } finally {
      // 确保临时目录总是被清理
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    }
  })

  // IPC: 统一安装 — 自动识别文件（ZIP）或目录，安装插件
  ipcMain.handle('plugin:install-unified', async () => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪' }

    // 选择安装来源类型
    const choiceResult = await showMessageBox({
      title: '安装插件',
      message: '请选择安装来源',
      detail: '从 ZIP 文件安装：本地已下载的插件压缩包\n从插件目录安装：本地已解压的插件文件夹',
      buttons: ['从 ZIP 文件安装', '从插件目录安装', '取消'],
      cancelId: 2,
      type: 'question',
    })

    if (choiceResult === 2) {
      return { success: false, error: '用户取消' }
    }

    const isFileInstall = choiceResult === 0

    if (isFileInstall) {
      // 文件安装：选择 ZIP 文件
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择插件包',
        filters: [{ name: '插件包', extensions: ['zip'] }],
        properties: ['openFile'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消' }
      }

      const filePath = result.filePaths[0]

      // 解压到临时目录（try-finally 确保清理）
      const tempDir = path.join(app.getPath('temp'), `plugin-install-${Date.now()}`)
      try {
        const zip = new AdmZip(filePath)
        extractZipSafely(zip, tempDir)

        const findManifest = (dir: string): string | null => {
          const mp = path.join(dir, 'plugin.json')
          if (fs.existsSync(mp)) return mp
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const e of entries) {
            if (e.isDirectory()) {
              const found = findManifest(path.join(dir, e.name))
              if (found) return found
            }
          }
          return null
        }

        const manifestPath = findManifest(tempDir)
        if (!manifestPath) {
          return { success: false, error: '插件包中未找到 plugin.json' }
        }

        const pluginSourceDir = path.dirname(manifestPath)
        const validation = validatePluginDir(pluginSourceDir)
        if (!validation.valid) {
          return { success: false, error: validation.error }
        }

        const confirmed = await confirmPluginInstall(mainWindow, manifestPath)
        if (!confirmed) return { success: false, error: '用户取消' }

        let pluginId: string
        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8')
          pluginId = JSON.parse(raw).id
          if (!pluginId) throw new Error('插件 ID 为空')
        } catch (e) {
          return { success: false, error: `无效的 plugin.json: ${(e as Error).message}` }
        }

        if (!fs.existsSync(pluginsDir)) {
          fs.mkdirSync(pluginsDir, { recursive: true })
        }
        const targetPath = path.join(pluginsDir, pluginId)
        const copyResult = replacePluginDirPreservingConfig(targetPath, pluginSourceDir)
        if (!copyResult.success) return copyResult

        logger.info('Plugin Install', `Installed plugin "${pluginId}" from ${filePath}`)

        try {
          pluginLoader.removePlugin(pluginId)
          await pluginLoader.loadSingle(pluginsDir, pluginId)
          pluginLoader.triggerInstall(pluginId)
          eventBus.emit(SYSTEM_EVENTS.PLUGIN_INSTALLED, { pluginId })
          logger.info('Plugin Install', `Loaded plugin "${pluginId}"`)
        } catch (e) {
          return { success: false, error: `加载插件失败: ${(e as Error).message}` }
        }

        return { success: true }
      } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
      }
    } else {
      // 目录安装：选择插件目录
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择插件目录',
        properties: ['openDirectory'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消' }
      }

      const sourcePath = result.filePaths[0]

      const validation = validatePluginDir(sourcePath)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      let pluginId: string
      try {
        const raw = fs.readFileSync(path.join(sourcePath, 'plugin.json'), 'utf-8')
        pluginId = JSON.parse(raw).id
      } catch (e) {
        return { success: false, error: `无效的 plugin.json: ${(e as Error).message}` }
      }

      const confirmed = await confirmPluginInstall(mainWindow, path.join(sourcePath, 'plugin.json'))
      if (!confirmed) return { success: false, error: '用户取消' }

      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true })
      } else if (!fs.statSync(pluginsDir).isDirectory()) {
        fs.rmSync(pluginsDir, { recursive: true, force: true })
        fs.mkdirSync(pluginsDir, { recursive: true })
      }

      const targetPath = path.join(pluginsDir, pluginId)
      const copyResult = replacePluginDirPreservingConfig(targetPath, sourcePath)
      if (!copyResult.success) return copyResult

      logger.info('Plugin Install', `Installed plugin "${pluginId}" from ${sourcePath}`)

      try {
        pluginLoader.removePlugin(pluginId)
        await pluginLoader.loadSingle(pluginsDir, pluginId)
        pluginLoader.triggerInstall(pluginId)
        eventBus.emit(SYSTEM_EVENTS.PLUGIN_INSTALLED, { pluginId })
        logger.info('Plugin Install', `Loaded plugin "${pluginId}"`)
      } catch (e) {
        return { success: false, error: `加载插件失败: ${(e as Error).message}` }
      }

      return { success: true }
    }
  })

  // IPC: 检查插件更新 — 选择更新包文件并与已安装版本比较
  ipcMain.handle('plugin:check-update', async () => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪', updateInfo: null }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择插件更新包',
      filters: [
        { name: '插件包', extensions: ['zip'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消', updateInfo: null }
    }

    const packagePath = result.filePaths[0]
    const installedPlugins = pluginLoader.getManifests()
    const updateInfo = checkUpdateFromPackage(packagePath, installedPlugins)

    if (!updateInfo) {
      return { success: false, error: '未检测到可用的更新（包无效或版本不高于已安装版本）', updateInfo: null }
    }

    return { success: true, updateInfo, packagePath }
  })

  // IPC: 执行插件更新 — 从已检查的更新包执行更新
  ipcMain.handle('plugin:apply-update', async (_event, pluginId: string, packagePath: string) => {
    const sourceDir = getUpdateSourceDir(packagePath)
    if (!sourceDir) {
      return { success: false, error: '无法读取更新包内容' }
    }

    try {
      // 使用保留配置的替换逻辑
      const targetPath = path.join(pluginsDir, pluginId)
      const copyResult = replacePluginDirPreservingConfig(targetPath, sourceDir)
      if (!copyResult.success) return copyResult

      logger.info('Plugin Update', `Updated plugin "${pluginId}"`)

      // 重新加载插件
      try {
        pluginLoader.removePlugin(pluginId)
        await pluginLoader.loadSingle(pluginsDir, pluginId)
        eventBus.emit(SYSTEM_EVENTS.PLUGIN_INSTALLED, { pluginId })
        logger.info('Plugin Update', `Reloaded plugin "${pluginId}" after update`)
      } catch (e) {
        return { success: false, error: `重载插件失败: ${(e as Error).message}` }
      }

      return { success: true }
    } finally {
      // 如果是临时解压目录，清理
      if (sourceDir.startsWith(path.join(path.dirname(packagePath), '.update-src-'))) {
        try { fs.rmSync(sourceDir, { recursive: true, force: true }) } catch {}
      }
    }
  })

  // IPC: 卸载插件 — 删除插件目录
  ipcMain.handle('plugin:uninstall', async (_event, pluginId: string) => {
    const targetPath = path.join(pluginsDir, pluginId)
    if (!fs.existsSync(targetPath)) {
      // 目录已不存在，但内存中可能还有残留，清理后再返回
      pluginLoader.removePlugin(pluginId)
      return { success: false, error: `插件 "${pluginId}" 不存在` }
    }

    try {
      // 先触发卸载回调，再删除目录
      pluginLoader.triggerUninstall(pluginId)
      fs.rmSync(targetPath, { recursive: true, force: true })
      // 从内存和注册表中移除
      pluginLoader.unregisterPlugin(pluginId)
      eventBus.emit(SYSTEM_EVENTS.PLUGIN_UNINSTALLED, { pluginId })

      return { success: true }
    } catch (e) {
      return { success: false, error: `删除插件目录失败: ${(e as Error).message}` }
    }
  })

  // IPC: 保存插件启用状态
  ipcMain.handle('plugin:save-states', (_event, states: Record<string, boolean>) => {
    try {
      // 更新内存状态并触发生命周期回调
      const oldManifests = pluginLoader.getManifests()
      for (const manifest of oldManifests) {
        if (manifest.id in states && manifest.enabled !== states[manifest.id]) {
          if (states[manifest.id]) {
            pluginLoader.triggerEnable(manifest.id)
            eventBus.emit(SYSTEM_EVENTS.PLUGIN_ENABLED, { pluginId: manifest.id })
          } else {
            pluginLoader.triggerDisable(manifest.id)
            eventBus.emit(SYSTEM_EVENTS.PLUGIN_DISABLED, { pluginId: manifest.id })
          }
        }
      }
      // 应用新状态到内存和注册表（registry 自动持久化）
      pluginLoader.applyStates(states)
      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  // IPC: 加载插件启用状态（从 registry 读取）
  ipcMain.handle('plugin:load-states', () => {
    try {
      return pluginRegistry.getAllEnabled()
    } catch (e) {
      logger.warn('Main', 'Failed to load plugin states:', e)
      return {}
    }
  })

  // IPC: 清除所有已安装插件
  ipcMain.handle('plugin:clear-all', async () => {
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
      // 重新加载插件（clearAll 自动清理 registry 和内存）
      pluginLoader.clearAll()
      if (mainWindow) {
        pluginLoader.setMainWindow(mainWindow)
        pluginLoader.setRegistry(pluginRegistry)
        await pluginLoader.loadAll(pluginsDir)
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

  // ========== 插件配置 API IPC ==========

  ipcMain.handle(PLUGIN_IPC_CHANNELS.CONFIG_GET, (_event, pluginId: string, key: string, defaultValue?: any) => {
    return pluginLoader.getPluginConfig(pluginId)?.get(key, defaultValue)
  })

  ipcMain.handle(PLUGIN_IPC_CHANNELS.CONFIG_SET, (_event, pluginId: string, key: string, value: any) => {
    pluginLoader.getPluginConfig(pluginId)?.set(key, value)
  })

  ipcMain.handle(PLUGIN_IPC_CHANNELS.CONFIG_GET_ALL, (_event, pluginId: string) => {
    return pluginLoader.getPluginConfig(pluginId)?.getAll()
  })

  ipcMain.handle(PLUGIN_IPC_CHANNELS.CONFIG_UPDATE, (_event, pluginId: string, partial: Record<string, any>) => {
    pluginLoader.getPluginConfig(pluginId)?.update(partial)
  })

  ipcMain.handle(PLUGIN_IPC_CHANNELS.CONFIG_RESET, (_event, pluginId: string, key?: string) => {
    pluginLoader.getPluginConfig(pluginId)?.reset(key)
  })

  // ========== 插件事件总线 IPC（渲染 → 主） ==========

  ipcMain.handle(PLUGIN_IPC_CHANNELS.EVENTS_EMIT, (_event, eventName: string, data?: any) => {
    eventBus.emit(eventName, data)
  })

  // ========== 插件元信息 IPC ==========

  ipcMain.handle(PLUGIN_IPC_CHANNELS.META_GET_PLUGIN, (_event, pluginId: string) => {
    return pluginLoader.getPlugin(pluginId)?.manifest ?? null
  })

  ipcMain.handle(PLUGIN_IPC_CHANNELS.META_GET_ALL, () => {
    return pluginLoader.getManifests()
  })

  ipcMain.handle(PLUGIN_IPC_CHANNELS.META_IS_ENABLED, (_event, pluginId: string) => {
    return pluginLoader.getPlugin(pluginId)?.manifest.enabled ?? false
  })

  // ========== 插件错误报告 ==========

  ipcMain.handle('plugin:report-error', (_event, data: { pluginId: string; error: { message: string; stack?: string }; componentStack: string }) => {
    logger.error('PluginRender', `[${data.pluginId}] ${data.error.message}`)
    if (data.error.stack) {
      logger.error('PluginRender', `[${data.pluginId}] Stack: ${data.error.stack.split('\n').slice(0, 3).join(' | ')}`)
    }
  })

  // ========== 全局快捷键管理 ==========

  ipcMain.handle('shortcut:get-all', () => {
    return shortcutManager?.getBindings() ?? []
  })

  ipcMain.handle('shortcut:update', (_event, id: string, newAccelerator: string) => {
    const result = shortcutManager?.updateAccelerator(id, newAccelerator)
    return result ?? { conflict: false }
  })

  ipcMain.handle('shortcut:reset', (_event, id: string) => {
    shortcutManager?.unregister(id)
  })

  // ========== 插件依赖管理 IPC ==========

  ipcMain.handle('dep:check-all', () => {
    const manifests = pluginLoader.getManifests()
    return checkAllDependencies(manifests)
  })

  ipcMain.handle('dep:resolve', (_event, pluginId: string) => {
    const manifests = pluginLoader.getManifests()
    return resolveDependencies(manifests, pluginId)
  })

  // ========== 日志查看器 IPC ==========

  ipcMain.handle('log:get', (_event, filter?: { module?: string; level?: string; search?: string; limit?: number; offset?: number }) => {
    return getLogs(filter)
  })

  ipcMain.handle('log:clear', () => {
    clearLogs()
  })

  // ========== 性能监控 IPC ==========

  ipcMain.handle('perf:get-stats', () => {
    return {
      pluginStats: performanceMonitor.getStats(),
      overallStats: performanceMonitor.getOverallStats(),
    }
  })

  ipcMain.handle('perf:get-overall', () => {
    return performanceMonitor.getOverallStats()
  })

  // ========== 配置备份/恢复 ==========

  ipcMain.handle('config-backup:export', async () => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪', filePath: undefined }
    return configBackupManager.exportBackup(mainWindow)
  })

  ipcMain.handle('config-backup:import', async () => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪', restored: 0, errors: ['主窗口未就绪'] }
    return configBackupManager.importBackup(mainWindow)
  })

  ipcMain.handle('config-backup:collect', () => {
    return configBackupManager.collectPluginConfigs()
  })

  // ========== 插件目录配置 IPC ==========

  ipcMain.handle('plugin-dir:get', () => {
    return {
      customDir: appConfig.getCustomPluginsDir(),
      effectiveDir: appConfig.getEffectivePluginsDir(),
      defaultDir: path.join(app.getPath('userData'), 'plugins'),
    }
  })

  ipcMain.handle('plugin-dir:select', async () => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪', path: '' }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择插件安装目录',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '用户取消', path: '' }
    }

    return { success: true, path: result.filePaths[0] }
  })

  ipcMain.handle('plugin-dir:set', async (_event, newDir: string) => {
    if (!mainWindow) return { success: false, error: '主窗口未就绪' }

    // 空字符串表示恢复默认
    if (!newDir) {
      appConfig.setCustomPluginsDir('')
      // 使用新目录重新加载
      await reloadPlugins()
      return { success: true }
    }

    // 校验目录是否有效
    const resolved = path.resolve(newDir)
    if (!fs.existsSync(resolved)) {
      // 目录不存在时询问是否创建
      const confirmResult = await showMessageBox({
        title: '创建目录',
        message: `目录 "${resolved}" 不存在，是否创建？`,
        buttons: ['取消', '创建'],
        type: 'question',
      })
      if (confirmResult === 0) {
        return { success: false, error: '用户取消' }
      }
      try {
        fs.mkdirSync(resolved, { recursive: true })
      } catch (e) {
        return { success: false, error: `创建目录失败: ${(e as Error).message}` }
      }
    }

    if (!fs.statSync(resolved).isDirectory()) {
      return { success: false, error: '路径不是有效的目录' }
    }

    // 记录旧目录并更新配置
    const oldDir = appConfig.getEffectivePluginsDir()
    appConfig.setCustomPluginsDir(resolved)

    // 如果旧目录存在且有插件，询问是否迁移
    if (oldDir !== resolved && fs.existsSync(oldDir)) {
      const entries = fs.readdirSync(oldDir, { withFileTypes: true })
      const hasPlugins = entries.some((e) => e.isDirectory())
      if (hasPlugins) {
        const migrateResult = await showMessageBox({
          title: '迁移插件',
          message: '检测到旧插件目录中有已安装的插件，是否将其迁移到新目录？',
          detail: `从: ${oldDir}\n到: ${resolved}`,
          buttons: ['不迁移', '迁移'],
          type: 'question',
        })
        if (migrateResult === 1) {
          try {
            copyRecursiveSync(oldDir, resolved)
            logger.info('PluginDir', `Migrated plugins from ${oldDir} to ${resolved}`)
          } catch (e) {
            logger.error('PluginDir', `Migration failed: ${e}`)
            // 迁移失败不阻止切换，用户可手动复制
          }
        }
      }
    }

    // 使用新目录重新加载
    await reloadPlugins()

    return { success: true }
  })

  async function reloadPlugins() {
    if (!mainWindow) return
    const newDir = appConfig.getEffectivePluginsDir()
    pluginsDir = newDir

    // 重新创建注册表和快捷键管理器
    pluginRegistry = new PluginRegistry(newDir)
    pluginLoader.setRegistry(pluginRegistry)
    shortcutManager = new ShortcutManager(newDir)
    shortcutManager.setMainWindow(mainWindow)
    pluginLoader.setShortcutManager(shortcutManager)
    configBackupManager = new ConfigBackupManager(newDir)

    // 清空并重新加载所有插件
    pluginLoader.clearAll()
    pluginLoader.setMainWindow(mainWindow)
    pluginLoader.setRegistry(pluginRegistry)
    await pluginLoader.loadAll(newDir)

    // 通知渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('plugins:reloaded')
    }
  }

  // ========== 系统事件桥接（主 → 渲染） ==========

  // 窗口最大化/还原事件 → 事件总线
  mainWindow?.on('maximize', () => {
    eventBus.emit(SYSTEM_EVENTS.WINDOW_STATE_CHANGED, { maximized: true })
  })
  mainWindow?.on('unmaximize', () => {
    eventBus.emit(SYSTEM_EVENTS.WINDOW_STATE_CHANGED, { maximized: false })
  })

  // 事件总线 → 渲染进程桥接（将主进程事件转发给渲染进程）
  function bridgeEventToRenderer(eventName: string, data: any) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('plugin:event', eventName, data)
    }
  }

  // 订阅所有系统事件并桥接到渲染进程
  const systemEventNames: string[] = Object.values(SYSTEM_EVENTS)
  for (const name of systemEventNames) {
    eventBus.on(name, (data: any) => bridgeEventToRenderer(name, data))
  }

  // 包装 eventBus.emit：
  // - 系统事件已通过 eventBus.on 订阅桥接到渲染进程（见上方 for 循环）
  // - 此处仅桥接非系统事件，避免双重发送
  const originalEmit = eventBus.emit.bind(eventBus)
  eventBus.emit = (eventName: string, data?: any) => {
    originalEmit(eventName, data)
    if (mainWindow && !mainWindow.isDestroyed() && !systemEventNames.includes(eventName)) {
      mainWindow.webContents.send('plugin:event', eventName, data)
    }
  }
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
