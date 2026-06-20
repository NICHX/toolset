import path from 'path'
import { logger } from './logger'
import type { PluginManifest } from '../shared/types'

// ========== 沙箱配置 ==========

export interface SandboxConfig {
  /** 插件可以读/写的文件路径列表。['*'] 表示允许所有路径 */
  allowedPaths: string[]
  /** 插件可以连接的网络主机列表。['*'] 表示允许所有主机 */
  allowedNetworkHosts: string[]
  /** 插件禁止调用的 IPC 通道列表 */
  deniedIPCChannels: string[]
  /** CPU 使用率上限（百分比，0-100），不设置则不限制 */
  maxCPUPercent?: number
  /** 内存使用上限（MB），不设置则不限制 */
  maxMemoryMB?: number
}

/** 完全开放策略（内置插件用） */
const FULL_ACCESS_CONFIG: SandboxConfig = {
  allowedPaths: ['*'],
  allowedNetworkHosts: ['*'],
  deniedIPCChannels: [],
}

/** 空策略（无任何权限时使用） */
const RESTRICTED_CONFIG: SandboxConfig = {
  allowedPaths: [],
  allowedNetworkHosts: [],
  deniedIPCChannels: [],
}

// ========== 根据 manifest permissions 构建默认策略 ==========

/**
 * 根据插件 manifest 中的声明式权限，构建默认沙箱策略。
 *
 * 映射规则：
 *  - `filesystem` → 可访问插件自身目录
 *  - `network`    → 仅限 localhost
 *  - `shortcut`   → 无文件/网络限制，但 IPC 不受影响
 *  - `tray`       → 无文件/网络限制
 *  - `builtIn`    → 完全开放（等同于 `['*']`）
 */
export function buildDefaultPolicy(manifest: PluginManifest): SandboxConfig {
  // 内置插件获得完全访问权限
  if (manifest.builtIn) {
    return { ...FULL_ACCESS_CONFIG }
  }

  const perms = manifest.permissions ?? []
  const allowedPaths: string[] = []
  const allowedNetworkHosts: string[] = []
  const deniedIPCChannels: string[] = []

  if (perms.includes('filesystem')) {
    // filesystem 权限允许访问插件自身所在目录
    // 实际路径在 setPolicy 时由调用方传入 pluginsBaseDir 进行解析
    allowedPaths.push('<plugin-dir>')
  }

  if (perms.includes('network')) {
    allowedNetworkHosts.push('localhost', '127.0.0.1', '::1')
  }

  // shortcut、tray 无额外文件/网络限制

  return {
    allowedPaths,
    allowedNetworkHosts,
    deniedIPCChannels,
  }
}

// ========== 沙箱管理器 ==========

export class SandboxManager {
  /** pluginId → SandboxConfig */
  private policies = new Map<string, SandboxConfig>()

  /** 所有插件的基础目录，用于解析 <plugin-dir> 占位符 */
  private pluginsBaseDir: string = ''

  /**
   * 设置插件基础目录（在 loadAll 前调用）
   */
  setPluginsBaseDir(dir: string): void {
    this.pluginsBaseDir = dir
  }

  /**
   * 为指定插件设置沙箱策略。
   * 如果 config 中包含了 `<plugin-dir>` 占位符，会将其替换为插件实际目录。
   */
  setPolicy(pluginId: string, config: SandboxConfig): void {
    const resolved: SandboxConfig = {
      allowedPaths: config.allowedPaths.map((p) =>
        p.replace('<plugin-dir>', path.join(this.pluginsBaseDir, pluginId)),
      ),
      allowedNetworkHosts: [...config.allowedNetworkHosts],
      deniedIPCChannels: [...config.deniedIPCChannels],
      maxCPUPercent: config.maxCPUPercent,
      maxMemoryMB: config.maxMemoryMB,
    }
    this.policies.set(pluginId, resolved)
    logger.debug('SandboxManager', `Policy set for plugin "${pluginId}"`, resolved)
  }

  /**
   * 移除指定插件的沙箱策略（卸载时调用）
   */
  removePolicy(pluginId: string): void {
    this.policies.delete(pluginId)
  }

  /**
   * 获取指定插件的沙箱策略。
   * 未设置策略的插件默认返回受限策略（无任何权限）。
   */
  getPolicy(pluginId: string): SandboxConfig | null {
    return this.policies.get(pluginId) ?? null
  }

  /**
   * 检查插件是否有权访问指定文件路径。
   *
   * 规则：
   *  - `allowedPaths` 包含 `'*'` → 允许所有路径
   *  - 目标路径以任一允许路径开头 → 允许
   *  - 否则 → 拒绝
   */
  checkFileAccess(pluginId: string, filePath: string): boolean {
    const policy = this.policies.get(pluginId)
    if (!policy) {
      logger.warn('SandboxManager', `No policy for plugin "${pluginId}", denying file access: ${filePath}`)
      return false
    }

    // 通配符：允许所有
    if (policy.allowedPaths.includes('*')) {
      return true
    }

    if (policy.allowedPaths.length === 0) {
      return false
    }

    const resolvedPath = path.resolve(filePath)
    for (const allowed of policy.allowedPaths) {
      const resolvedAllowed = path.resolve(allowed)
      if (resolvedPath === resolvedAllowed || resolvedPath.startsWith(resolvedAllowed + path.sep)) {
        return true
      }
    }

    logger.warn('SandboxManager', `Plugin "${pluginId}" denied file access: ${filePath}`)
    return false
  }

  /**
   * 检查插件是否有权访问指定网络主机。
   *
   * 规则：
   *  - `allowedNetworkHosts` 包含 `'*'` → 允许所有主机
   *  - 目标 host 与任一允许主机匹配（精确匹配） → 允许
   *  - 否则 → 拒绝
   */
  checkNetworkAccess(pluginId: string, host: string): boolean {
    const policy = this.policies.get(pluginId)
    if (!policy) {
      logger.warn('SandboxManager', `No policy for plugin "${pluginId}", denying network access: ${host}`)
      return false
    }

    if (policy.allowedNetworkHosts.includes('*')) {
      return true
    }

    if (policy.allowedNetworkHosts.length === 0) {
      return false
    }

    // 归一化处理：去除端口号、去除协议前缀
    const normalizedHost = host.replace(/^https?:\/\//, '').split(':')[0]

    for (const allowed of policy.allowedNetworkHosts) {
      if (normalizedHost === allowed) {
        return true
      }
    }

    logger.warn('SandboxManager', `Plugin "${pluginId}" denied network access: ${host}`)
    return false
  }

  /**
   * 检查插件是否有权调用指定 IPC 通道。
   *
   * 规则：
   *  - channel 不在 `deniedIPCChannels` 中 → 允许
   *  - 否则 → 拒绝
   */
  checkIPCAccess(pluginId: string, channel: string): boolean {
    const policy = this.policies.get(pluginId)
    if (!policy) {
      // 无策略时默认允许 IPC（IPC 权限由 hasPermission 控制）
      return true
    }

    if (policy.deniedIPCChannels.includes(channel)) {
      logger.warn('SandboxManager', `Plugin "${pluginId}" denied IPC channel: ${channel}`)
      return false
    }

    return true
  }

  /**
   * 清除所有策略（应用退出时调用）
   */
  clearAll(): void {
    this.policies.clear()
  }
}