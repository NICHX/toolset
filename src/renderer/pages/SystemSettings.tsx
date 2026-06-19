"use client"

import { useState, useEffect } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { cn } from '../lib/utils'

interface Settings {
  darkMode: boolean
}

export default function SystemSettings() {
  const [settings, setSettings] = useState<Settings>({ darkMode: true })

  useEffect(() => {
    // Apply theme
    if (settings.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings.darkMode])

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-100 mb-8">系统设置</h2>

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800/50 bg-slate-900/60 backdrop-blur-sm p-6">
          <h3 className="text-base font-semibold text-slate-100 mb-4">外观</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.darkMode ? (
                <Moon className="w-5 h-5 text-primary-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-400" />
              )}
              <div>
                <p className="text-sm text-slate-200">深色模式</p>
                <p className="text-xs text-slate-400">切换应用主题</p>
              </div>
            </div>
            <button
              onClick={() => setSettings((s) => ({ ...s, darkMode: !s.darkMode }))}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors duration-200',
                settings.darkMode ? 'bg-primary-500' : 'bg-slate-600'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                settings.darkMode ? 'translate-x-[22px]' : 'translate-x-0.5'
              )} />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/50 bg-slate-900/60 backdrop-blur-sm p-6">
          <h3 className="text-base font-semibold text-slate-100 mb-2">关于</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">应用名称</span>
              <span className="text-slate-200">工具集</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">版本</span>
              <span className="text-slate-200">1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}