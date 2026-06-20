import { globalShortcut, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from './logger'

interface ShortcutBinding {
  id: string
  pluginId: string
  label: string
  accelerator: string
  action: () => void
  registered: boolean
}

/**
 * 全局快捷键管理器
 *
 * 支持快捷键注册、冲突检测、运行时切换，所有状态持久化到 JSON 文件。
 */
export class ShortcutManager {
  private bindings: Map<string, ShortcutBinding> = new Map()
  private dataPath: string
  private mainWindow: BrowserWindow | null = null

  constructor(dataDir: string) {
    this.dataPath = path.join(dataDir, 'shortcuts.json')
    this.load()
  }

  setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  // ========== 持久化 ==========

  private load(): void {
    if (fs.existsSync(this.dataPath)) {
      try {
        const raw = fs.readFileSync(this.dataPath, 'utf-8')
        const saved = JSON.parse(raw) as Record<string, string>
        // 恢复保存的快捷键绑定（仅加速器映射）
        for (const [id, accelerator] of Object.entries(saved)) {
          const binding = this.bindings.get(id)
          if (binding) {
            binding.accelerator = accelerator
          }
        }
      } catch (e) {
        logger.warn('ShortcutManager', `Failed to load shortcuts: ${e}`)
      }
    }
  }

  private save(): void {
    const data: Record<string, string> = {}
    for (const [id, binding] of this.bindings) {
      data[id] = binding.accelerator
    }
    try {
      const dir = path.dirname(this.dataPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      logger.error('ShortcutManager', `Failed to save shortcuts: ${e}`)
    }
  }

  // ========== 注册 ==========

  /**
   * 注册一个快捷键
   * @returns 注册成功返回 null，冲突返回冲突的绑定信息
   */
  register(
    id: string,
    pluginId: string,
    label: string,
    accelerator: string,
    action: () => void,
  ): { conflict: true; existing: { pluginId: string; label: string } } | { conflict: false } {
    // 冲突检测
    for (const [, existing] of this.bindings) {
      if (existing.accelerator === accelerator && existing.id !== id) {
        return {
          conflict: true,
          existing: { pluginId: existing.pluginId, label: existing.label },
        }
      }
    }

    // 注销旧绑定
    const old = this.bindings.get(id)
    if (old && old.registered) {
      globalShortcut.unregister(old.accelerator)
    }

    // 注册新绑定
    const binding: ShortcutBinding = { id, pluginId, label, accelerator, action, registered: false }
    this.bindings.set(id, binding)

    // 如果已启用窗口，立即注册
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.registerAccelerator(binding)
    }

    this.save()
    return { conflict: false }
  }

  private registerAccelerator(binding: ShortcutBinding): void {
    try {
      binding.registered = globalShortcut.register(binding.accelerator, () => {
        binding.action()
      })
      if (!binding.registered) {
        logger.warn('ShortcutManager', `Failed to register accelerator: ${binding.accelerator}`)
      }
    } catch (e) {
      logger.error('ShortcutManager', `Error registering accelerator ${binding.accelerator}: ${e}`)
      binding.registered = false
    }
  }

  /** 批量注册所有已保存的快捷键（窗口创建后调用） */
  registerAll(): void {
    for (const [, binding] of this.bindings) {
      this.registerAccelerator(binding)
    }
  }

  // ========== 查询 ==========

  getBindings(): Array<{ id: string; pluginId: string; label: string; accelerator: string }> {
    return Array.from(this.bindings.values()).map((b) => ({
      id: b.id,
      pluginId: b.pluginId,
      label: b.label,
      accelerator: b.accelerator,
    }))
  }

  getBinding(id: string): ShortcutBinding | undefined {
    return this.bindings.get(id)
  }

  // ========== 修改 ==========

  /** 更新快捷键的加速器 */
  updateAccelerator(id: string, newAccelerator: string): { conflict: true; existing: { pluginId: string; label: string } } | { conflict: false } {
    const binding = this.bindings.get(id)
    if (!binding) return { conflict: false }

    // 冲突检测
    for (const [, existing] of this.bindings) {
      if (existing.accelerator === newAccelerator && existing.id !== id) {
        return {
          conflict: true,
          existing: { pluginId: existing.pluginId, label: existing.label },
        }
      }
    }

    // 注销旧的
    if (binding.registered) {
      globalShortcut.unregister(binding.accelerator)
      binding.registered = false
    }

    binding.accelerator = newAccelerator

    // 重新注册
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.registerAccelerator(binding)
    }

    this.save()
    return { conflict: false }
  }

  /** 移除指定快捷键 */
  unregister(id: string): void {
    const binding = this.bindings.get(id)
    if (!binding) return

    if (binding.registered) {
      globalShortcut.unregister(binding.accelerator)
    }
    this.bindings.delete(id)
    this.save()
  }

  /** 移除某个插件的所有快捷键 */
  unregisterPlugin(pluginId: string): void {
    const toRemove: string[] = []
    for (const [id, binding] of this.bindings) {
      if (binding.pluginId === pluginId) {
        if (binding.registered) {
          globalShortcut.unregister(binding.accelerator)
        }
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.bindings.delete(id)
    }
    this.save()
  }

  /** 销毁所有快捷键 */
  destroy(): void {
    globalShortcut.unregisterAll()
    this.bindings.clear()
  }
}

/** 常用加速器列表（供 UI 选择） */
export const COMMON_ACCELERATORS = [
  { label: 'Ctrl+Shift+A', value: 'CmdOrCtrl+Shift+A' },
  { label: 'Ctrl+Shift+B', value: 'CmdOrCtrl+Shift+B' },
  { label: 'Ctrl+Shift+C', value: 'CmdOrCtrl+Shift+C' },
  { label: 'Ctrl+Shift+D', value: 'CmdOrCtrl+Shift+D' },
  { label: 'Ctrl+Shift+E', value: 'CmdOrCtrl+Shift+E' },
  { label: 'Ctrl+Shift+F', value: 'CmdOrCtrl+Shift+F' },
  { label: 'Ctrl+Shift+G', value: 'CmdOrCtrl+Shift+G' },
  { label: 'Ctrl+Shift+H', value: 'CmdOrCtrl+Shift+H' },
  { label: 'Ctrl+Shift+1', value: 'CmdOrCtrl+Shift+1' },
  { label: 'Ctrl+Shift+2', value: 'CmdOrCtrl+Shift+2' },
  { label: 'Ctrl+Alt+A', value: 'CmdOrCtrl+Alt+A' },
  { label: 'Ctrl+Alt+B', value: 'CmdOrCtrl+Alt+B' },
  { label: 'Ctrl+Alt+1', value: 'CmdOrCtrl+Alt+1' },
  { label: 'Ctrl+Alt+2', value: 'CmdOrCtrl+Alt+2' },
  { label: 'Alt+Shift+A', value: 'Alt+Shift+A' },
  { label: 'Alt+Shift+B', value: 'Alt+Shift+B' },
  { label: 'F1', value: 'F1' },
  { label: 'F2', value: 'F2' },
  { label: 'F3', value: 'F3' },
  { label: 'F4', value: 'F4' },
  { label: 'F5', value: 'F5' },
  { label: 'F6', value: 'F6' },
  { label: 'F7', value: 'F7' },
  { label: 'F8', value: 'F8' },
  { label: 'F9', value: 'F9' },
  { label: 'F10', value: 'F10' },
  { label: 'F11', value: 'F11' },
  { label: 'F12', value: 'F12' },
] as const