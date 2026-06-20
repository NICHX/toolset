import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from './logger'

interface AppConfigData {
  /** 用户自定义插件安装目录（为空时使用默认路径） */
  customPluginsDir?: string
}

const DEFAULT_CONFIG: AppConfigData = {}

/**
 * 应用级配置管理器
 *
 * 持久化存储应用的全局设置（如自定义插件目录），存储在 app.getPath('userData') 下。
 */
export class AppConfig {
  private configPath: string
  private data: AppConfigData = { ...DEFAULT_CONFIG }

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'app-config.json')
    this.load()
  }

  private load(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          this.data = { ...DEFAULT_CONFIG, ...parsed }
        }
      } catch (e) {
        logger.warn('AppConfig', `Failed to parse app-config.json: ${e}`)
      }
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (e) {
      logger.error('AppConfig', `Failed to save app-config.json: ${e}`)
    }
  }

  /** 获取用户自定义插件目录，未设置时返回空字符串 */
  getCustomPluginsDir(): string {
    return this.data.customPluginsDir || ''
  }

  /** 设置用户自定义插件目录，传入空字符串恢复默认 */
  setCustomPluginsDir(dir: string): void {
    this.data.customPluginsDir = dir || undefined
    this.save()
  }

  /** 获取最终有效的插件目录 */
  getEffectivePluginsDir(): string {
    return this.data.customPluginsDir || path.join(app.getPath('userData'), 'plugins')
  }
}