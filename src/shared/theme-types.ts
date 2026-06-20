// ==================== 主题类型与预设常量 ====================
// 此文件用于 renderer 端导入，不得包含 Node.js（electron/fs/path）依赖

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system'
}

export const DEFAULT_THEME: ThemeConfig = {
  mode: 'dark',
}