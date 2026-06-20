import fs from 'fs'
import path from 'path'
import { logger } from './logger'
import type { PluginManifest } from '../shared/types'

/**
 * 插件注册表
 *
 * 单一文件记录所有已安装插件的运行时状态和元数据。
 * 替代原先分散的 plugin-states.json + 启动时重新扫描 plugin.json。
 *
 * 数据结构:
 * ```json
 * {
 *   "version": 1,
 *   "plugins": {
 *     "reminder": {
 *       "enabled": true,
 *       "installedAt": 1700000000000,
 *       "updatedAt": 1700000000000
 *     }
 *   }
 * }
 * ```
 */
export class PluginRegistry {
  private registryPath: string
  private data: RegistryData = { version: 1, plugins: {} }
  private dirty = false
  private writeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(registryDir: string) {
    this.registryPath = path.join(registryDir, 'registry.json')
    this.load()
  }

  /** 从磁盘加载注册表 */
  private load(): void {
    if (fs.existsSync(this.registryPath)) {
      try {
        const raw = fs.readFileSync(this.registryPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.plugins) {
          this.data = parsed
        }
      } catch {
        logger.warn('PluginRegistry', `Failed to parse registry.json, starting fresh`)
        this.data = { version: 1, plugins: {} }
      }
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
      const dir = path.dirname(this.registryPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.registryPath, JSON.stringify(this.data, null, 2), 'utf-8')
      this.dirty = false
    } catch (e) {
      logger.error('PluginRegistry', `Failed to save registry: ${e}`)
    }
  }

  // ========== 查询 ==========

  /** 获取插件的运行时状态（无状态返回默认值） */
  getPluginState(pluginId: string): PluginState {
    return this.data.plugins[pluginId] ?? { enabled: true, installedAt: 0, updatedAt: 0 }
  }

  /** 获取所有插件的启用状态 */
  getAllEnabled(): Record<string, boolean> {
    const result: Record<string, boolean> = {}
    for (const [id, state] of Object.entries(this.data.plugins)) {
      result[id] = state.enabled
    }
    return result
  }

  /** 判断某个插件是否已注册 */
  hasPlugin(pluginId: string): boolean {
    return pluginId in this.data.plugins
  }

  /** 获取注册表中所有插件 ID */
  getPluginIds(): string[] {
    return Object.keys(this.data.plugins)
  }

  // ========== 变更 ==========

  /** 更新插件的启用状态 */
  setEnabled(pluginId: string, enabled: boolean): void {
    const existing = this.data.plugins[pluginId]
    if (existing) {
      existing.enabled = enabled
      existing.updatedAt = Date.now()
    } else {
      this.data.plugins[pluginId] = {
        enabled,
        installedAt: Date.now(),
        updatedAt: Date.now(),
      }
    }
    this.scheduleSave()
  }

  /** 批量更新启用状态 */
  setAllEnabled(states: Record<string, boolean>): void {
    for (const [id, enabled] of Object.entries(states)) {
      const existing = this.data.plugins[id]
      if (existing) {
        existing.enabled = enabled
        existing.updatedAt = Date.now()
      } else {
        this.data.plugins[id] = {
          enabled,
          installedAt: Date.now(),
          updatedAt: Date.now(),
        }
      }
    }
    this.scheduleSave()
  }

  /** 注册一个新安装的插件（使用默认 enabled=true）*/
  registerPlugin(pluginId: string, enabled = true): void {
    this.data.plugins[pluginId] = {
      enabled,
      installedAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.scheduleSave()
  }

  /** 移除一个已卸载的插件 */
  unregisterPlugin(pluginId: string): void {
    delete this.data.plugins[pluginId]
    this.scheduleSave()
  }

  /** 将 manifest 的 enabled 字段与 registry 状态合并 */
  applyToManifest(manifest: PluginManifest): PluginManifest {
    const state = this.getPluginState(manifest.id)
    return { ...manifest, enabled: state.enabled ?? manifest.enabled ?? true }
  }

  /** 将 registry 状态同步到一组 manifest，返回更新后的 manifests */
  applyToManifests(manifests: PluginManifest[]): PluginManifest[] {
    return manifests.map((m) => this.applyToManifest(m))
  }

  /** 清除所有注册记录 */
  clear(): void {
    this.data.plugins = {}
    this.scheduleSave()
  }
}

// ========== 类型 ==========

interface RegistryData {
  version: number
  plugins: Record<string, PluginState>
}

interface PluginState {
  enabled: boolean
  installedAt: number
  updatedAt: number
}