import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import type { PluginMainContext, PluginMainEntry, PluginManifest } from '../shared/types'
import { logger } from './logger'

interface LoadedPlugin {
  manifest: PluginManifest
  entry: PluginMainEntry
  baseDir: string
}

export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private customTrayHandlers: (() => void)[] = []

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  loadAll(pluginsDir: string) {
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
      return
    }

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      // 读取 manifest
      const manifestPath = path.join(pluginsDir, entry.name, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8')
        const manifest = JSON.parse(raw) as PluginManifest
        manifest.enabled = manifest.enabled ?? true

        // 确保插件加入 map（即使 main entry 加载失败也能在列表中显示）
        const baseDir = path.join(pluginsDir, entry.name)
        const addDummy = (errMsg?: string) => {
          this.plugins.set(manifest.id, { manifest, entry: { name: manifest.name, version: manifest.version, register: () => {} }, baseDir })
          if (errMsg) logger.warn('PluginLoader', `Plugin "${manifest.id}" added with dummy entry: ${errMsg}`)
        }

        // 加载主进程入口
        const mainEntryPath = path.join(pluginsDir, entry.name, 'main', 'index.js')
        if (fs.existsSync(mainEntryPath)) {
          try {
            const pluginMain = require(mainEntryPath) as PluginMainEntry
            this.plugins.set(manifest.id, { manifest, entry: pluginMain, baseDir })

            // 创建插件上下文
            const ctx = this.createPluginContext(manifest)
            pluginMain.register(ctx)
            logger.info('PluginLoader', `Loaded plugin: ${manifest.id} (${manifest.name})`)
          } catch (loadErr) {
            addDummy(`main entry load failed: ${(loadErr as Error).message || loadErr}`)
          }
        } else {
          logger.info('PluginLoader', `No main entry for plugin: ${manifest.id}, skipping main process`)
          addDummy()
        }
      } catch (err) {
        logger.error('PluginLoader', `Failed to load plugin from ${manifestPath}:`, err)
      }
    }

    // 创建系统托盘
    this.createTray()
  }

  private createPluginContext(manifest: PluginManifest): PluginMainContext {
    return {
      app,
      getMainWindow: () => this.mainWindow,
      getToolsetPreloadPath: () => path.join(__dirname, '../preload/index.js'),
      registerIpcHandler: (channel, handler) => {
        ipcMain.handle(channel, handler)
      },
      registerProtocol: (scheme, handler) => {
        try {
          protocol.handle(scheme, handler)
        } catch (e) {
          logger.warn('PluginLoader', `Protocol ${scheme} already registered`)
        }
      },
      onAppReady: (callback) => {
        if (app.isReady()) {
          callback()
        } else {
          app.on('ready', callback)
        }
      },
      onBeforeQuit: (callback) => {
        app.on('before-quit', callback)
      },
      onWindowAllClosed: (callback) => {
        app.on('window-all-closed', callback)
      },
      logger: {
        info: (tag, message) => logger.info(`${manifest.name}:${tag}`, message),
        warn: (tag, message) => logger.warn(`${manifest.name}:${tag}`, message),
        error: (tag, message) => logger.error(`${manifest.name}:${tag}`, message),
      },
      updateTrayMenu: (menuTemplate) => {
        if (this.tray) {
          const contextMenu = Menu.buildFromTemplate(menuTemplate)
          this.tray.setContextMenu(contextMenu)
        }
      },
      addTrayClickHandler: (handler) => {
        this.customTrayHandlers.push(handler)
      },
    }
  }

  private createTray() {
    let iconPath: string | undefined
    const paths = [
      path.join(__dirname, '../../assets/tray-icon.png'),
      path.join(__dirname, '../assets/tray-icon.png'),
      path.join(process.resourcesPath || '', 'assets/tray-icon.png'),
    ]

    for (const p of paths) {
      if (fs.existsSync(p)) {
        iconPath = p
        break
      }
    }

    const icon = iconPath
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty()

    if (process.platform === 'darwin') {
      icon.setTemplateImage(true)
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('工具集')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.show()
            this.mainWindow.focus()
          }
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.tray?.destroy()
          this.tray = null
          app.quit()
        },
      },
    ])
    this.tray.setContextMenu(contextMenu)

    if (process.platform === 'darwin') {
      this.tray.on('mouse-down', () => this.onTrayClick())
    } else {
      this.tray.on('click', () => this.onTrayClick())
    }
  }

  private onTrayClick() {
    for (const handler of this.customTrayHandlers) {
      handler()
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  getManifests(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((p) => p.manifest)
  }

  getPluginIds(): string[] {
    return Array.from(this.plugins.keys())
  }

  getRendererScripts(): { id: string; jsPath: string; cssPath: string }[] {
    return Array.from(this.plugins.entries()).map(([id, plugin]) => ({
      id,
      jsPath: `plugin://${id}/renderer/index.js`,
      cssPath: `plugin://${id}/renderer/index.css`,
    }))
  }

  getPlugin(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id)
  }

  applyStates(states: Record<string, boolean>) {
    for (const [id, plugin] of this.plugins) {
      if (id in states) {
        plugin.manifest.enabled = states[id]
      }
    }
  }

  beforeQuit() {
    // Cleanup handled by individual plugin before-quit hooks
  }

  clearAll() {
    this.plugins.clear()
    this.customTrayHandlers = []
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
