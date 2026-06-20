import fs from 'fs'
import path from 'path'
import type { PluginConfigAPI } from '../shared/types'

type ChangeCallback = (changes: Record<string, any>) => void

/**
 * 插件配置管理器
 *
 * 为每个插件提供独立的 JSON 文件持久化配置。
 * 支持 get/set/update/reset 操作，以及变更监听。
 */
export class PluginConfig implements PluginConfigAPI {
  private configPath: string
  private cache: Record<string, any> = {}
  private changeListeners = new Set<ChangeCallback>()
  private loaded = false
  private dirty = false
  private writeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(baseDir: string) {
    this.configPath = path.join(baseDir, 'config.json')
  }

  /** 加载配置文件（惰性加载） */
  private load(): void {
    if (this.loaded) return
    this.loaded = true
    // 如果尚有未刷新的写入，先刷盘再读
    if (this.dirty) this.flush()

    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        this.cache = JSON.parse(raw)
      } catch (e) {
        console.error('[PluginConfig] Failed to parse config:', (e as Error).message || e)
        this.cache = {}
      }
    } else {
      this.cache = {}
    }
  }

  /** 防抖写盘 */
  private scheduleSave(): void {
    this.dirty = true
    if (this.writeTimer) return
    this.writeTimer = setTimeout(() => {
      this.flush()
      this.writeTimer = null
    }, 200)
  }

  /** 立即写盘 */
  flush(): void {
    if (!this.dirty) return
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.cache, null, 2), 'utf-8')
      this.dirty = false
    } catch (e) {
      console.error('[PluginConfig] Failed to save config:', e)
    }
  }

  /** 通知变更监听器 */
  private notify(changes: Record<string, any>): void {
    for (const cb of this.changeListeners) {
      try {
        cb(changes)
      } catch (e) {
        console.error('[PluginConfig] Change listener error:', e)
      }
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    this.load()
    return key in this.cache ? (this.cache[key] as T) : (defaultValue as T)
  }

  set<T>(key: string, value: T): void {
    this.load()
    const oldValue = this.cache[key]
    if (oldValue === value) return
    this.cache[key] = value
    this.scheduleSave()
    this.notify({ [key]: value })
  }

  getAll(): Record<string, any> {
    this.load()
    return { ...this.cache }
  }

  update(partial: Record<string, any>): void {
    this.load()
    const changes: Record<string, any> = {}
    for (const [key, value] of Object.entries(partial)) {
      if (this.cache[key] !== value) {
        this.cache[key] = value
        changes[key] = value
      }
    }
    if (Object.keys(changes).length > 0) {
      this.scheduleSave()
      this.notify(changes)
    }
  }

  reset(key?: string): void {
    this.load()
    if (key) {
      if (key in this.cache) {
        delete this.cache[key]
        this.scheduleSave()
        this.notify({ [key]: undefined })
      }
    } else {
      const keys = Object.keys(this.cache)
      if (keys.length > 0) {
        this.cache = {}
        this.scheduleSave()
        const resetChanges: Record<string, any> = {}
        for (const k of keys) {
          resetChanges[k] = undefined
        }
        this.notify(resetChanges)
      }
    }
  }

  onChanged(callback: ChangeCallback): () => void {
    this.changeListeners.add(callback)
    return () => {
      this.changeListeners.delete(callback)
    }
  }

  /** 销毁：清除定时器并立即写盘，防止插件卸载后残留写入 */
  destroy(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    this.flush()
  }
}