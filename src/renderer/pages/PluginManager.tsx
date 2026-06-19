"use client"

import { useEffect, useState } from 'react'
import { Puzzle, Trash2, Bell, FolderOpen, RefreshCw } from 'lucide-react'
import { usePluginStore } from '../stores/pluginStore'
import { useToastStore } from '../stores/toastStore'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bell, Puzzle, LayoutDashboard: Bell, ListTodo: Puzzle, History: Bell, Settings: Bell,
}

export default function PluginManagerPage() {
  const { plugins, loading, loadPlugins, togglePlugin, installPlugin, uninstallPlugin } = usePluginStore()
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    useToastStore.getState().addToast(message, type)
  }

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const result = await installPlugin()
      if (result.success) {
        showToast('插件安装成功')
      } else if (result.error !== '用户取消') {
        showToast(result.error || '安装失败', 'error')
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async (pluginId: string, pluginName: string) => {
    const result = await uninstallPlugin(pluginId)
    if (result.success) {
      showToast(`已卸载 ${pluginName}`)
    } else {
      showToast(result.error || '卸载失败', 'error')
    }
  }

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    await togglePlugin(pluginId, enabled)
    showToast(enabled ? '插件已启用' : '插件已禁用')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">插件管理</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">管理和扩展工具集功能</p>
        </div>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="btn-primary flex items-center gap-2"
        >
          {installing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <FolderOpen className="w-4 h-4" />
          )}
          安装插件
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-gray-400 dark:text-slate-500 animate-spin" />
        </div>
      ) : plugins.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Puzzle className="w-12 h-12 text-gray-400 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-slate-300 mb-2">暂无插件</h3>
          <p className="text-sm text-gray-400 dark:text-slate-500 mb-6">点击上方按钮安装插件</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => {
            const Icon = ICON_MAP[plugin.icon] || Bell
            return (
              <div key={plugin.id} className="glass-card p-5 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${plugin.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{plugin.name}</h3>
                      {plugin.builtIn ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-500/20 text-primary-400 border border-primary-500/30">
                          内置
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          外部
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-slate-500">v{plugin.version}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{plugin.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {plugin.pages.map((page) => (
                        <span
                          key={page.id}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 border border-gray-200/50 dark:border-slate-700/30"
                        >
                          {page.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleToggle(plugin.id, !plugin.enabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      plugin.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'
                    }`}
                    title={plugin.enabled ? '禁用' : '启用'}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        plugin.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  {!plugin.builtIn && (
                    <button
                      onClick={() => handleUninstall(plugin.id, plugin.name)}
                      className="btn-ghost p-1.5 text-gray-500 dark:text-slate-400 hover:text-red-400"
                      title="卸载插件"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
