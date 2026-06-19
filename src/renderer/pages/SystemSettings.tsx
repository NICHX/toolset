"use client"

import { useState, useEffect, useCallback } from 'react'
import { Moon, Sun, Bell } from 'lucide-react'

function getSavedTheme(): 'dark' | 'light' {
  const saved = localStorage.getItem('toolset-theme')
  if (saved === 'light') return 'light'
  return 'dark'
}

function applyAndSave(dark: boolean) {
  localStorage.setItem('toolset-theme', dark ? 'dark' : 'light')
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export default function SystemSettings() {
  const [darkMode, setDarkMode] = useState(() => getSavedTheme() === 'dark')
  const [minimizeToTray, setMinimizeToTray] = useState(true)

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev
      applyAndSave(next)
      return next
    })
  }, [])

  const toggleTray = useCallback(() => {
    setMinimizeToTray((prev) => !prev)
  }, [])

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">系统设置</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">统一管理应用外观与系统行为</p>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Moon className="w-4 h-4 text-primary-400" />
          外观
        </h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800/60 flex items-center justify-center">
                <Moon className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              </div>
              <div>
                <p className="text-sm text-gray-800 dark:text-slate-200">深色模式</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">使用深色主题</p>
              </div>
            </div>
            <button
              onClick={toggleDarkMode}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                darkMode ? 'bg-primary-500' : 'bg-gray-300 dark:bg-slate-600'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform flex items-center justify-center ${
                  darkMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              >
                {darkMode ? (
                  <Moon className="w-3 h-3 text-slate-700" />
                ) : (
                  <Sun className="w-3 h-3 text-amber-500" />
                )}
              </div>
            </button>
          </label>
        </div>
      </div>

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
    </div>
  )
}
