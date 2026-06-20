"use client"

import { useEffect, useState } from 'react'
import { Puzzle, Trash2, Bell, RefreshCw, ArrowUpCircle, GitBranch, ChevronRight, ChevronDown, AlertTriangle, CheckCircle, PackagePlus } from 'lucide-react'
import { usePluginStore } from '../stores/pluginStore'
import { useToastStore } from '../stores/toastStore'
import type { PluginUpdateInfo } from '../../shared/types'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bell, Puzzle, LayoutDashboard: Bell, ListTodo: Puzzle, History: Bell, Settings: Bell,
}

export default function PluginManagerPage() {
  const { plugins, loading, loadPlugins, togglePlugin, installPlugin, uninstallPlugin, checkPluginUpdate, updatePlugin } = usePluginStore()
  const [installing, setInstalling] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateConfirm, setUpdateConfirm] = useState<PluginUpdateInfo & { packagePath: string } | null>(null)
  const [depModalOpen, setDepModalOpen] = useState(false)
  const [depLoading, setDepLoading] = useState(false)
  const [depResults, setDepResults] = useState<Map<string, { resolved: any; errors: string[] }>>(new Map())
  const [depErrors, setDepErrors] = useState<{ pluginId: string; errors: string[] }[]>([])
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set())

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
    if (!window.confirm(`确定要卸载插件「${pluginName}」吗？\n\n卸载将删除该插件的所有文件，此操作不可撤销。`)) {
      return
    }
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

  /** 检查并准备更新 */
  const handleCheckUpdate = async () => {
    setUpdating(true)
    try {
      const result = await checkPluginUpdate()
      if (result.success && result.updateInfo && result.packagePath) {
        setUpdateConfirm({ ...result.updateInfo, packagePath: result.packagePath })
      } else if (result.error && result.error !== '已取消') {
        showToast(result.error, 'error')
      }
    } finally {
      setUpdating(false)
    }
  }

  /** 确认执行更新 */
  const handleConfirmUpdate = async () => {
    if (!updateConfirm) return
    setUpdating(true)
    setUpdateConfirm(null)
    try {
      const result = await updatePlugin(updateConfirm.pluginId, updateConfirm.packagePath)
      if (result.success) {
        showToast(`插件「${updateConfirm.pluginName}」已更新至 v${updateConfirm.newVersion}`)
      } else {
        showToast(result.error || '更新失败', 'error')
      }
    } finally {
      setUpdating(false)
    }
  }

  /** 检查所有插件的依赖状态 */
  const handleCheckDependencies = async () => {
    setDepLoading(true)
    setDepModalOpen(true)
    try {
      const result = await window.electronAPI.dependency.checkAll()
      setDepErrors(result.errors)

      // Resolve dependency tree for each plugin that has dependencies
      const results = new Map<string, { resolved: any; errors: string[] }>()
      for (const plugin of plugins) {
        if (plugin.dependencies && plugin.dependencies.length > 0) {
          const depResult = await window.electronAPI.dependency.resolve(plugin.id)
          results.set(plugin.id, depResult)
        }
      }
      setDepResults(results)

      // Auto-expand plugins that have errors
      const errorPluginIds = new Set(result.errors.map((e) => e.pluginId))
      setExpandedPlugins(errorPluginIds)
    } catch (err) {
      showToast('检查依赖失败: ' + (err as Error).message, 'error')
    } finally {
      setDepLoading(false)
    }
  }

  const togglePluginExpanded = (pluginId: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev)
      if (next.has(pluginId)) {
        next.delete(pluginId)
      } else {
        next.add(pluginId)
      }
      return next
    })
  }

  /** 递归渲染依赖树节点 */
  const renderDepNode = (node: any, depth: number) => {
    const hasChildren = node.dependencies && node.dependencies.length > 0
    const isOptional = node.optional
    const statusClass = node.missing
      ? 'text-red-500'
      : node.conflict
        ? 'text-red-400'
        : isOptional
          ? 'text-gray-400'
          : 'text-gray-700 dark:text-slate-300'

    return (
      <div key={node.id + depth} style={{ marginLeft: depth * 16 }}>
        <div className={`flex items-center gap-2 py-1 ${statusClass}`}>
          {node.missing ? (
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-500" />
          ) : node.conflict ? (
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
          ) : isOptional ? (
            <span className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" />
          )}
          <span className="text-xs font-medium">{node.id}</span>
          <span className="text-xs opacity-60">v{node.version}</span>
          {node.missing && <span className="text-xs text-red-500">（缺失）</span>}
          {node.conflict && <span className="text-xs text-red-400">（版本冲突）</span>}
          {isOptional && <span className="text-xs text-gray-400">（可选）</span>}
        </div>
        {hasChildren && node.dependencies.map((child: any) => renderDepNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">插件管理</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">管理和扩展工具集功能</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckDependencies}
            className="btn-secondary flex items-center gap-2"
            title="检查所有插件的依赖状态"
          >
            <GitBranch className="w-4 h-4" />
            检查依赖
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="btn-primary flex items-center gap-2"
            title="选择插件包文件（.plugin.zip）或目录"
          >
            {installing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <PackagePlus className="w-4 h-4" />
            )}
            安装插件
          </button>
        </div>
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
                    <>
                      <button
                        onClick={handleCheckUpdate}
                        disabled={updating}
                        className="btn-ghost p-1.5 text-gray-500 dark:text-slate-400 hover:text-primary-400"
                        title="更新插件"
                      >
                        <ArrowUpCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUninstall(plugin.id, plugin.name)}
                        className="btn-ghost p-1.5 text-gray-500 dark:text-slate-400 hover:text-red-400"
                        title="卸载插件"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 更新确认弹窗 */}
      {updateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-slate-800/50 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2">确认更新插件</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              将更新「{updateConfirm.pluginName}」从 v{updateConfirm.currentVersion} 到 v{updateConfirm.newVersion}
            </p>
            {updateConfirm.newDescription && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1 font-medium">新版本描述：</p>
                <p className="text-sm text-gray-700 dark:text-slate-300">{updateConfirm.newDescription}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-5">
              更新将保留插件现有配置，此操作可撤销（需重新安装旧版本）。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setUpdateConfirm(null)}
                className="btn-ghost px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                onClick={handleConfirmUpdate}
                disabled={updating}
                className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
              >
                {updating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                确认更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 依赖检查弹窗 */}
      {depModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-slate-800/50 p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">插件依赖状态</h3>
              <button
                onClick={() => setDepModalOpen(false)}
                className="btn-ghost p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {depLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-gray-400 dark:text-slate-500 animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2">
                {depErrors.length > 0 && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl mb-4">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                      发现 {depErrors.length} 个插件存在依赖问题
                    </p>
                    <p className="text-xs text-red-500 dark:text-red-400">
                      红色标注的插件存在缺失或版本冲突的依赖，请安装或更新相应插件。
                    </p>
                  </div>
                )}
                {depErrors.length === 0 && depResults.size === 0 && (
                  <div className="text-center py-8 text-sm text-gray-500 dark:text-slate-400">
                    所有插件均无依赖声明
                  </div>
                )}
                {depErrors.length === 0 && depResults.size > 0 && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl mb-4">
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      所有插件依赖已满足 ✓
                    </p>
                  </div>
                )}

                {/* 逐个插件展示依赖树 */}
                {Array.from(depResults.entries()).map(([pluginId, result]) => {
                  const plugin = plugins.find((p) => p.id === pluginId)
                  const pluginName = plugin?.name ?? pluginId
                  const hasError = depErrors.some((e) => e.pluginId === pluginId)
                  const isExpanded = expandedPlugins.has(pluginId)

                  return (
                    <div key={pluginId} className="glass-card overflow-hidden">
                      <button
                        onClick={() => togglePluginExpanded(pluginId)}
                        className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{pluginName}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">({plugin?.version})</span>
                        {hasError ? (
                          <AlertTriangle className="w-4 h-4 text-red-500 ml-auto flex-shrink-0" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto flex-shrink-0" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3">
                          {/* 显示该插件的错误信息 */}
                          {depErrors
                            .filter((e) => e.pluginId === pluginId)
                            .flatMap((e) => e.errors)
                            .map((err, i) => (
                              <div key={i} className="flex items-start gap-2 py-1 text-xs text-red-500">
                                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span>{err}</span>
                              </div>
                            ))}
                          {/* 渲染依赖树 */}
                          <div className="mt-2 border-l-2 border-gray-200 dark:border-slate-700 pl-2">
                            {renderDepNode(result.resolved, 0)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
