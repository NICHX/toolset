import type React from 'react'
import type ReactDOM from 'react-dom'
import type { ElectronAPI } from '../../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
    /** 全局 Toast 函数，供插件调用以显示通知 */
    __showToast?: (message: string, type?: 'success' | 'error' | 'info') => void
    /** React 运行时（供外部 IIFE 插件脚本使用） */
    React: typeof React
    /** ReactDOM 运行时（供外部 IIFE 插件脚本使用） */
    ReactDOM: typeof ReactDOM
  }
}