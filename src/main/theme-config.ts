import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { DEFAULT_THEME } from '../shared/theme-types'
import type { ThemeConfig } from '../shared/theme-types'

function getConfigPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'theme-config.json')
}

export function loadThemeConfig(): ThemeConfig {
  const configPath = getConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_THEME, ...parsed }
    }
  } catch {
    // ignore parse errors, return defaults
  }
  return { ...DEFAULT_THEME }
}

export function saveThemeConfig(config: ThemeConfig): void {
  const configPath = getConfigPath()
  try {
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to save theme config:', e)
  }
}