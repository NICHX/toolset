"use client"

import { useEffect, useState } from 'react'
import {
  Sparkles, ArrowRight, Bell,
  Puzzle, FolderOpen, Settings as SettingsIcon, Layers, Grid3X3,
  Cpu, HardDrive, CheckCircle, XCircle,
} from 'lucide-react'
import { usePluginStore } from '../stores/pluginStore'
import { useToastStore } from '../stores/toastStore'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Puzzle, Settings: SettingsIcon, Bell,
  LayoutDashboard: Sparkles, ListTodo: Puzzle, History: Bell,
}

interface ToolLauncherProps {
  onNavigate: (page: string) => void
}

export default function ToolLauncher({ onNavigate }: ToolLauncherProps) {
  const { plugins, loading, loadPlugins, installPlugin } = usePluginStore()
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    loadPlugins()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [loadPlugins])

  const enabledPlugins = plugins.filter((p) => p.enabled && p.id !== '_system')
  const disabledPlugins = plugins.filter((p) => !p.enabled && p.id !== '_system')
  const totalPlugins = enabledPlugins.length + disabledPlugins.length

  const [systemStats, setSystemStats] = useState<{ cpuPercent: number; memoryMB: number } | null>(null)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await window.electronAPI.perf.getOverall()
        setSystemStats(stats)
      } catch { /* ignore */ }
    }
    loadStats()
    const timer = setInterval(loadStats, 10000)
    return () => clearInterval(timer)
  }, [])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    useToastStore.getState().addToast(message, type)
  }

  const handleInstall = async () => {
    const result = await installPlugin()
    if (result.success) {
      showToast('插件安装成功')
    } else if (result.error !== '用户取消') {
      showToast(result.error || '安装失败', 'error')
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-color)' }}>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary-500/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-primary-500/5 blur-3xl" />
        </div>

        <div className="relative px-8 pt-14 pb-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/20">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">工具集</h1>
                  <p className="text-sm text-gray-500 dark:text-slate-400">选择工具开始使用</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-primary-400 tabular-nums tracking-tight">
                {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {currentTime.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pb-10 space-y-8">
        {/* 工具集概览统计 */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-gray-600 dark:text-slate-300">
              <span className="font-semibold text-gray-900 dark:text-slate-100">{enabledPlugins.length}</span> 已启用
            </span>
          </div>
          {disabledPlugins.length > 0 && (
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40">
              <XCircle className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-gray-600 dark:text-slate-300">
                <span className="font-semibold text-gray-900 dark:text-slate-100">{disabledPlugins.length}</span> 已禁用
              </span>
            </div>
          )}
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40">
            <Layers className="w-4 h-4 text-primary-400" />
            <span className="text-sm text-gray-600 dark:text-slate-300">
              <span className="font-semibold text-gray-900 dark:text-slate-100">{totalPlugins}</span> 总插件
            </span>
          </div>
          {systemStats && (
            <>
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-gray-600 dark:text-slate-300">
                  <span className="font-semibold text-gray-900 dark:text-slate-100">{systemStats.cpuPercent.toFixed(1)}%</span> CPU
                </span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40">
                <HardDrive className="w-4 h-4 text-rose-400" />
                <span className="text-sm text-gray-600 dark:text-slate-300">
                  <span className="font-semibold text-gray-900 dark:text-slate-100">{systemStats.memoryMB.toFixed(0)}</span> MB
                </span>
              </div>
            </>
          )}
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">已安装工具</h2>
            </div>
            {enabledPlugins.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-slate-500">共 {enabledPlugins.length} 个</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Sparkles className="w-6 h-6 text-gray-400 dark:text-slate-500 animate-pulse" />
            </div>
          ) : enabledPlugins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-8 rounded-2xl bg-white/40 dark:bg-slate-800/20 border border-dashed border-gray-300/60 dark:border-slate-700/40">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800/60 flex items-center justify-center mb-4">
                <Puzzle className="w-7 h-7 text-gray-400 dark:text-slate-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-1">暂无可用的工具</h3>
              <p className="text-sm text-gray-400 dark:text-slate-500 mb-5">安装插件来扩展功能</p>
              <button onClick={handleInstall} className="btn-primary flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                安装插件
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {enabledPlugins.map((plugin) => {
                const Icon = ICON_MAP[plugin.icon] || Bell
                const firstPage = plugin.pages[0]
                const pageKey = firstPage ? `${plugin.id}:${firstPage.id}` : 'home'

                return (
                  <button
                    key={plugin.id}
                    onClick={() => onNavigate(pageKey)}
                    className="group relative p-5 rounded-2xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40 hover:border-primary-400/50 dark:hover:border-primary-500/40 hover:shadow-lg hover:shadow-primary-500/5 transition-all duration-200 text-left"
                  >
                    <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-sm" />
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${plugin.color} flex items-center justify-center mb-3.5 group-hover:scale-110 transition-transform duration-200`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">{plugin.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed line-clamp-2">{plugin.description}</p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      进入工具
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">系统管理</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => onNavigate('_system:manager')}
              className="group p-5 rounded-2xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40 hover:border-primary-400/50 dark:hover:border-primary-500/40 hover:shadow-lg hover:shadow-primary-500/5 transition-all duration-200 text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Puzzle className="w-5 h-5 text-primary-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">插件管理</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">安装、卸载和管理插件</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
                进入管理
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>

            <button
              onClick={() => onNavigate('_system:settings')}
              className="group p-5 rounded-2xl bg-white/70 dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/40 hover:border-primary-400/50 dark:hover:border-primary-500/40 hover:shadow-lg hover:shadow-primary-500/5 transition-all duration-200 text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <SettingsIcon className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">系统设置</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">外观主题、系统行为配置</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
                进入设置
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>

            <button
              onClick={handleInstall}
              className="group p-5 rounded-2xl bg-white/70 dark:bg-slate-800/50 border border-dashed border-gray-300/60 dark:border-slate-700/40 hover:border-emerald-400/50 dark:hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-200 text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FolderOpen className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">安装插件</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">从本地目录加载插件</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                选择目录
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          </div>
        </section>

        <div className="text-center pt-4 pb-2">
          <p className="text-xs text-gray-400 dark:text-slate-600">工具集 v1.0.2</p>
        </div>
      </div>
    </div>
  )
}
