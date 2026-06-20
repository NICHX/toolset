import fs from 'fs'
import path from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import { logger } from './logger'

interface BackupManifest {
  createdAt: string
  appVersion: string
  plugins: Array<{
    id: string
    name: string
    version: string
    config: Record<string, unknown>
  }>
}

/**
 * 插件配置备份/恢复管理器
 *
 * 将已安装插件的所有配置导出为一个 JSON 文件，支持一键恢复。
 */
export class ConfigBackupManager {
  private pluginsDir: string

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir
  }

  /**
   * 收集所有已安装插件的配置
   */
  collectPluginConfigs(): Array<{ id: string; name: string; version: string; config: Record<string, unknown> }> {
    const results: Array<{ id: string; name: string; version: string; config: Record<string, unknown> }> = []

    if (!fs.existsSync(this.pluginsDir)) return results

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const pluginDir = path.join(this.pluginsDir, entry.name)
      const manifestPath = path.join(pluginDir, 'plugin.json')
      const configPath = path.join(pluginDir, 'config.json')

      if (!fs.existsSync(manifestPath)) continue

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        let config: Record<string, unknown> = {}
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        }

        results.push({
          id: manifest.id || entry.name,
          name: manifest.name || entry.name,
          version: manifest.version || '0.0.0',
          config,
        })
      } catch (e) {
        logger.warn('ConfigBackup', `Failed to read config for plugin "${entry.name}": ${e}`)
      }
    }

    return results
  }

  /**
   * 导出所有插件配置到备份文件
   */
  async exportBackup(mainWindow: BrowserWindow | null): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const plugins = this.collectPluginConfigs()

    if (plugins.length === 0) {
      return { success: false, error: '没有已安装的插件配置可导出' }
    }

    const manifest: BackupManifest = {
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      plugins,
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '导出插件配置备份',
      defaultPath: path.join(app.getPath('documents'), `toolset-plugins-backup-${Date.now()}.json`),
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '用户取消' }
    }

    try {
      fs.writeFileSync(result.filePath, JSON.stringify(manifest, null, 2), 'utf-8')
      logger.info('ConfigBackup', `Exported backup to ${result.filePath} (${plugins.length} plugins)`)
      return { success: true, filePath: result.filePath }
    } catch (e) {
      return { success: false, error: `写入备份文件失败: ${(e as Error).message}` }
    }
  }

  /**
   * 从备份文件导入并恢复插件配置
   */
  async importBackup(
    mainWindow: BrowserWindow | null,
    onBeforeRestore?: (manifest: BackupManifest) => Promise<boolean>,
  ): Promise<{ success: boolean; restored: number; errors: string[] }> {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入插件配置备份',
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, restored: 0, errors: ['用户取消'] }
    }

    const filePath = result.filePaths[0]
    let manifest: BackupManifest

    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      manifest = JSON.parse(raw)

      if (!manifest.plugins || !Array.isArray(manifest.plugins)) {
        return { success: false, restored: 0, errors: ['备份文件格式无效：缺少 plugins 字段'] }
      }
    } catch (e) {
      return { success: false, restored: 0, errors: [`读取备份文件失败: ${(e as Error).message}`] }
    }

    // 可选的回调让 UI 展示备份信息并确认
    if (onBeforeRestore) {
      const confirmed = await onBeforeRestore(manifest)
      if (!confirmed) {
        return { success: false, restored: 0, errors: [] }
      }
    }

    const errors: string[] = []
    let restored = 0

    for (const p of manifest.plugins) {
      const pluginDir = path.join(this.pluginsDir, p.id)
      if (!fs.existsSync(pluginDir)) {
        errors.push(`插件 "${p.name} (${p.id})" 未安装，已跳过`)
        continue
      }

      try {
        const configPath = path.join(pluginDir, 'config.json')
        fs.writeFileSync(configPath, JSON.stringify(p.config, null, 2), 'utf-8')
        restored++
      } catch (e) {
        errors.push(`恢复插件 "${p.name}" 配置失败: ${(e as Error).message}`)
      }
    }

    logger.info('ConfigBackup', `Restored backup: ${restored} plugins restored, ${errors.length} errors`)
    return { success: errors.length === 0, restored, errors }
  }
}