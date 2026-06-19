"use client"

import { useEffect, useState } from 'react'
import { Puzzle, Check, X, Download, Trash2, RefreshCw, FolderOpen } from 'lucide-react'
import { cn } from '../lib/utils'
import { usePluginStore } from '../stores/pluginStore'
import { useToastStore } from '../stores/toastStore'
import type { PluginManifest } from '../../shared/types'

export default function PluginManagerPage() {
  const { plugins, loading, loadPlugins, togglePlugin, installPlugin, uninstallPlugin, clearAllPlugins } = usePluginStore()
  const addToast = useToastStore((s) => s.addToast)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    setActionLoading(`toggle-${pluginId}`)
    await togglePlugin(pluginId, enabled)
    addToast(`插件已${enabled ? '启用' : '禁用'}`, 'success')
    setActionLoading(null)
  }

  const handleInstall = async () => {
    setActionLoading('install')
    const result = await installPlugin()
    if (result.success) {
      addToast('插件安装成功', 'success')
    } else if (result.error && result.error !== '已取消') {
      addToast(`安装失败: ${result.error}`, 'error')
    }
    setActionLoading(null)
  }

  const handleUninstall = async (pluginId: string, pluginName: string) => {
    setActionLoading(`uninstall-${pluginId}`)
    const result = await uninstallPlugin(pluginId)
    if (result.success) {
      addToast(`插件 "${pluginName}" 已卸载`, 'success')
    } else {
      addToast(`卸载失败: ${result.error}`, 'error')
    }
    setActionLoading(null)
  }

  const handleRefresh = () => {
    loadPlugins()
    addToast('插件列表已刷新', 'info')
  }

  const handleClearAll = async () => {
    if (plugins.length === 0) return
    if (!window.confirm('确定要清除所有已安装的插件吗？此操作不可撤销。')) return
    setActionLoading('clear-all')
    const result = await clearAllPlugins()
    if (result.success) {
      addToast('所有插件已清除', 'success')
    } else {
      addToast(`清除失败: ${result.error}`, 'error')
    }
    setActionLoading(null)
  }

  const handleOpenDir = async () => {
    await window.electronAPI.plugin.invoke('plugin:open-dir')
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">插件管理</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">管理和安装工具集插件</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRefresh} className="btn-ghost p-2" title="刷新">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          {plugins.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={actionLoading === 'clear-all'}
              className="btn-ghost flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              title="清除所有插件"
            >
              <Trash2 className="w-4 h-4" />
              清除全部
            </button>
          )}
          <button onClick={handleInstall} disabled={actionLoading === 'install'} className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            安装插件
          </button>
          <button onClick={handleOpenDir} className="btn-ghost flex items-center gap-2" title="打开插件目录">
            <FolderOpen className="w-4 h-4" />
            插件目录
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {plugins.length === 0 && !loading && (
          <div className="text-center py-16">
            <Puzzle className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-slate-400">暂无已安装的插件</p>
            <button onClick={handleInstall} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
              <Download className="w-4 h-4" />
              安装插件
            </button>
          </div>
        )}

        {loading && plugins.length === 0 && (
          <div className="text-center py-16">
            <RefreshCw className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto animate-spin" />
            <p className="text-gray-500 dark:text-slate-400 mt-4">加载中...</p>
          </div>
        )}

        {plugins.map((plugin) => (
          <div key={plugin.id} className="rounded-2xl border border-gray-200/80 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', plugin.bg || 'bg-primary-500/10')}>
                  <Puzzle className="w-6 h-6 text-gray-700 dark:text-slate-200" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">{plugin.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{plugin.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400 dark:text-slate-500">v{plugin.version}</span>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      plugin.enabled
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-gray-200/80 dark:bg-slate-800/50 text-gray-500 dark:text-slate-500'
                    )}>
                      {plugin.enabled ? '已启用' : '已禁用'}
                    </span>
                    {plugin.builtIn && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400">内置</span>
                    )}
                  </div>
                  {plugin.pages && plugin.pages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {plugin.pages.map((p) => (
                        <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={() => handleToggle(plugin.id, !plugin.enabled)}
                  disabled={actionLoading === `toggle-${plugin.id}`}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                    plugin.enabled
                      ? 'bg-gray-200/80 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-400'
                      : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  )}
                >
                  {plugin.enabled ? (
                    <><X className="w-3 h-3" /> 禁用</>
                  ) : (
                    <><Check className="w-3 h-3" /> 启用</>
                  )}
                </button>
                {!plugin.builtIn && (
                  <button
                    onClick={() => handleUninstall(plugin.id, plugin.name)}
                    disabled={actionLoading === `uninstall-${plugin.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
                  >
                    <Trash2 className="w-3 h-3" />
                    卸载
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}