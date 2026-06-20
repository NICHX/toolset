import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { logger } from './logger'
import type { PluginManifest, PluginUpdateInfo } from '../shared/types'

/**
 * 快速校验 manifest 对象是否有必要字段
 */
function isValidManifest(raw: unknown): raw is PluginManifest {
  if (!raw || typeof raw !== 'object') return false
  const m = raw as Record<string, unknown>
  return typeof m.id === 'string' && !!m.id
      && typeof m.name === 'string' && !!m.name
      && typeof m.version === 'string' && !!m.version
}

/**
 * 从 ZIP 文件或目录中读取 plugin.json
 */
function readManifestFromSource(sourcePath: string): { manifest: PluginManifest; sourceDir: string } | null {
  const stat = fs.statSync(sourcePath, { throwIfNoEntry: false })
  if (!stat) return null

  // 如果传入的是目录，直接读 plugin.json
  if (stat.isDirectory()) {
    const manifestPath = path.join(sourcePath, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return null
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw)
    if (!isValidManifest(manifest)) {
      logger.warn('PluginUpdater', `无效 manifest: 缺少必要字段`)
      return null
    }
    return { manifest, sourceDir: sourcePath }
  }

  // 如果是 ZIP 文件，解压到临时目录并查找 plugin.json
  if (stat.isFile() && (sourcePath.endsWith('.zip') || sourcePath.endsWith('.plugin'))) {
    const tempDir = path.join(path.dirname(sourcePath), `.update-temp-${Date.now()}`)
    try {
      const zip = new AdmZip(sourcePath)
      // 安全解压
      const resolvedTarget = path.resolve(tempDir)
      fs.mkdirSync(resolvedTarget, { recursive: true })
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const entryPath = path.resolve(tempDir, entry.entryName)
        if (!entryPath.startsWith(resolvedTarget)) continue
        const dir = path.dirname(entryPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(entryPath, entry.getData())
      }

      // 递归查找 plugin.json
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
      if (!manifestPath) return null

      const raw = fs.readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(raw)
      if (!isValidManifest(manifest)) {
        logger.warn('PluginUpdater', `无效 manifest: 缺少必要字段`)
        return null
      }
      return { manifest, sourceDir: path.dirname(manifestPath) }
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    }
  }

  return null
}

/**
 * 版本号比较（semver 风格）
 * 返回: 1 = v1 > v2, -1 = v1 < v2, 0 = v1 === v2
 */
function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number)
  const p2 = v2.split('.').map(Number)
  const len = Math.max(p1.length, p2.length)
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0
    const n2 = p2[i] || 0
    if (n1 > n2) return 1
    if (n1 < n2) return -1
  }
  return 0
}

/**
 * 检查更新：从文件包中读取新 manifest，与当前已安装版本比较
 *
 * @param packagePath - 插件包文件路径（.zip 或 .plugin 文件）
 * @param installedPlugins - 当前已安装的插件 manifest 列表
 * @returns 更新信息，或 null（无更新或无效包）
 */
export function checkUpdateFromPackage(
  packagePath: string,
  installedPlugins: PluginManifest[],
): PluginUpdateInfo | null {
  const result = readManifestFromSource(packagePath)
  if (!result) return null

  const { manifest: newManifest } = result
  const current = installedPlugins.find((p) => p.id === newManifest.id)
  if (!current) {
    logger.info('PluginUpdater', `插件 "${newManifest.id}" 尚未安装，无法更新`)
    return null
  }

  const cmp = compareVersions(current.version, newManifest.version)
  if (cmp >= 0) {
    logger.info('PluginUpdater', `插件 "${newManifest.id}" 当前版本 ${current.version} 已是最新或更高（${newManifest.version}）`)
    return null
  }

  return {
    pluginId: newManifest.id,
    pluginName: newManifest.name,
    currentVersion: current.version,
    newVersion: newManifest.version,
    newDescription: newManifest.description,
  }
}

/**
 * 获取更新包的源目录（解压或目录路径）
 */
export function getUpdateSourceDir(packagePath: string): string | null {
  const stat = fs.statSync(packagePath, { throwIfNoEntry: false })
  if (!stat) return null
  if (stat.isDirectory()) return packagePath

  // ZIP 文件解压到临时目录
  if (stat.isFile() && (packagePath.endsWith('.zip') || packagePath.endsWith('.plugin'))) {
    const tempDir = path.join(path.dirname(packagePath), `.update-src-${Date.now()}`)
    try {
      const zip = new AdmZip(packagePath)
      const resolvedTarget = path.resolve(tempDir)
      fs.mkdirSync(resolvedTarget, { recursive: true })
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const entryPath = path.resolve(tempDir, entry.entryName)
        if (!entryPath.startsWith(resolvedTarget)) continue
        const dir = path.dirname(entryPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(entryPath, entry.getData())
      }
      return tempDir
    } catch {
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
      return null
    }
  }

  return null
}

export type { PluginUpdateInfo }