"use client"

import { useEffect, useState } from 'react'
import { Sparkles, Puzzle, Settings, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { usePluginStore } from '../stores/pluginStore'

interface ToolLauncherProps {
  onNavigate: (page: string) => void
}

const systemTools = [
  {
    id: '_system:manager',
    name: '插件管理',
    description: '管理已安装的插件',
    icon: Puzzle,
    color: 'from-purple-500 to-pink-600',
    bg: 'bg-purple-500/10',
  },
  {
    id: '_system:settings',
    name: '系统设置',
    description: '应用全局设置',
    icon: Settings,
    color: 'from-gray-500 to-slate-600',
    bg: 'bg-gray-500/10',
  },
]

export default function ToolLauncher({ onNavigate }: ToolLauncherProps) {
  const plugins = usePluginStore((s) => s.plugins)
  const [greeting, setGreeting] = useState('')
  const [time, setTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const hour = now.getHours()
      setTime(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))

      if (hour < 6) setGreeting('夜深了')
      else if (hour < 9) setGreeting('早上好')
      else if (hour < 12) setGreeting('上午好')
      else if (hour < 14) setGreeting('中午好')
      else if (hour < 18) setGreeting('下午好')
      else setGreeting('晚上好')
    }

    updateTime()
    const timer = setInterval(updateTime, 10000)
    return () => clearInterval(timer)
  }, [])

  const enabledPlugins = plugins.filter((p) => p.enabled)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-5xl mx-auto px-8 pt-24 pb-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-xl shadow-primary-500/25 mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-slate-100 mb-3">{greeting}，欢迎使用工具集</h1>
          <p className="text-lg text-gray-500 dark:text-slate-400">选择一个工具或插件开始使用</p>
          <div className="mt-4 text-6xl font-light text-gray-300 dark:text-slate-500/50">{time}</div>
        </div>

        {/* 系统工具 */}
        <div className="mb-12">
          <h2 className="text-sm font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider mb-4 px-1">系统工具</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {systemTools.map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  onClick={() => onNavigate(tool.id)}
                  className="group relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm p-6 text-left transition-all duration-300 hover:border-gray-300/80 dark:hover:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800/60 hover:shadow-xl hover:-translate-y-0.5"
                >
                  <div className={cn('inline-flex p-3 rounded-xl mb-4', tool.bg)}>
                    <Icon className="w-5 h-5 text-gray-700 dark:text-slate-200" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-200 mb-1.5">{tool.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">{tool.description}</p>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0" />
                </button>
              )
            })}
          </div>
        </div>

        {/* 已安装插件 */}
        {enabledPlugins.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider mb-4 px-1">已安装插件</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {enabledPlugins.map((plugin) => {
                const firstPage = plugin.pages[0]
                return (
                  <button
                    key={plugin.id}
                    onClick={() => firstPage && onNavigate(`${plugin.id}:${firstPage.id}`)}
                    className="group relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm p-6 text-left transition-all duration-300 hover:border-gray-300/80 dark:hover:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800/60 hover:shadow-xl hover:-translate-y-0.5"
                  >
                    <div className={cn('inline-flex p-3 rounded-xl mb-4', plugin.bg || 'bg-primary-500/10')}>
                      <Sparkles className="w-5 h-5 text-gray-700 dark:text-slate-200" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-slate-200 mb-1.5">{plugin.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">{plugin.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {plugin.pages.map((p) => (
                        <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400">
                          {p.name}
                        </span>
                      ))}
                    </div>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 无插件时的引导 */}
        {enabledPlugins.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-200/80 dark:bg-slate-800/50 mb-4">
              <Puzzle className="w-8 h-8 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="text-gray-500 dark:text-slate-400 mb-2">暂无已启用的插件</p>
            <button
              onClick={() => onNavigate('_system:manager')}
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              前往插件管理安装
            </button>
          </div>
        )}
      </div>
    </div>
  )
}