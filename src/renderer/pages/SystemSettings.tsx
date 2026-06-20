"use client"

import { useState, useEffect, useCallback } from 'react'
import { Moon, Sun, Monitor, Palette, RotateCcw, Bell, Download, Upload, Archive } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import { useToastStore } from '../stores/toastStore'

const MODE_OPTIONS = [
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon },
  { value: 'system' as const, label: '跟随系统', icon: Monitor },
]

export default function SystemSettings() {
  const config = useThemeStore((s) => s.config)
  const loaded = useThemeStore((s) => s.loaded)
  const loadConfig = useThemeStore((s) => s.loadConfig)
  const setMode = useThemeStore((s) => s.setMode)
  const resetDefaults = useThemeStore((s) => s.resetDefaults)

  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const showToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (!loaded) {
      loadConfig()
    }
  }, [loaded, loadConfig])

  // Load minimizeToTray from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('toolset-minimize-tray')
    if (saved !== null) {
      setMinimizeToTray(saved === 'true')
    }
  }, [])

  const toggleTray = useCallback(() => {
    setMinimizeToTray((prev) => {
      const next = !prev
      localStorage.setItem('toolset-minimize-tray', next.toString())
      return next
    })
  }, [])

  const handleExportBackup = async () => {
    setBackingUp(true)
    try {
      const result = await window.electronAPI.configBackup.exportBackup()
      if (result.success) {
        showToast(`配置备份已导出至: ${result.filePath}`, 'success')
      } else if (result.error && result.error !== '用户取消') {
        showToast(result.error, 'error')
      }
    } finally {
      setBackingUp(false)
    }
  }

  const handleImportBackup = async () => {
    setRestoring(true)
    try {
      const result = await window.electronAPI.configBackup.importBackup()
      if (result.success) {
        showToast(`成功恢复 ${result.restored} 个插件的配置`, 'success')
      } else if (result.errors.length > 0 && !result.errors[0]?.includes('取消')) {
        showToast(result.errors[0] || '恢复失败', 'error')
      }
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">系统设置</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">统一管理应用外观与系统行为</p>
      </div>

      {/* 主题设置 */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary-400" />
          主题设置
        </h3>
        <div className="space-y-6">
          {/* 模式选择器 */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-slate-400 block mb-2">主题模式</label>
            <div className="flex gap-2">
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon
                const isActive = config.mode === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setMode(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary-500 text-white shadow-sm'
                        : 'bg-white/50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 border border-gray-200 dark:border-slate-700/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reset */}
          <div className="pt-2">
            <button
              onClick={resetDefaults}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 bg-white/50 dark:bg-slate-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 border border-gray-200 dark:border-slate-700/50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              恢复默认设置
            </button>
          </div>
        </div>
      </div>

      {/* 系统行为 */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary-400" />
          系统行为
        </h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-800 dark:text-slate-200">最小化到托盘</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">关闭窗口时最小化到系统托盘</p>
            </div>
            <button
              onClick={toggleTray}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                minimizeToTray ? 'bg-primary-500' : 'bg-gray-300 dark:bg-slate-600'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  minimizeToTray ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* 插件配置备份/恢复 */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Archive className="w-4 h-4 text-primary-400" />
          插件配置备份/恢复
        </h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">
          一键导出所有已安装插件的配置，或从备份文件恢复。
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleExportBackup}
            disabled={backingUp}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 bg-white/50 dark:bg-slate-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 border border-gray-200 dark:border-slate-700/50 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {backingUp ? '导出中...' : '导出备份'}
          </button>
          <button
            onClick={handleImportBackup}
            disabled={restoring}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 bg-white/50 dark:bg-slate-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 border border-gray-200 dark:border-slate-700/50 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {restoring ? '恢复中...' : '导入恢复'}
          </button>
        </div>
      </div>
    </div>
  )
}