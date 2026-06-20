"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Cpu, HardDrive, BarChart3 } from 'lucide-react'

interface PluginStat {
  pluginId: string
  cpuPercent: number
  memoryMB: number
  lastUpdated: string
}

interface OverallStats {
  cpuPercent: number
  memoryMB: number
  heapUsedMB: number
  heapTotalMB: number
}

export default function PerformanceMonitor() {
  const [pluginStats, setPluginStats] = useState<PluginStat[]>([])
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.perf.getStats()
      setPluginStats(result.pluginStats)
      setOverallStats(result.overallStats)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    intervalRef.current = setInterval(fetchStats, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchStats])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">性能监控</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">查看应用与插件的资源使用情况</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Overall Stats */}
      {overallStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-slate-400">CPU 使用率</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {overallStats.cpuPercent.toFixed(1)}<span className="text-lg font-normal text-gray-500 dark:text-slate-400">%</span>
            </p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-slate-400">内存 (RSS)</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {overallStats.memoryMB.toFixed(1)}<span className="text-lg font-normal text-gray-500 dark:text-slate-400"> MB</span>
            </p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-slate-400">堆内存使用</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {overallStats.heapUsedMB.toFixed(1)}<span className="text-lg font-normal text-gray-500 dark:text-slate-400"> MB</span>
            </p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-slate-400">堆内存总量</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {overallStats.heapTotalMB.toFixed(1)}<span className="text-lg font-normal text-gray-500 dark:text-slate-400"> MB</span>
            </p>
          </div>
        </div>
      )}

      {/* Plugin Stats Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200">插件资源使用</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">插件 ID</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">CPU</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">内存</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">最后更新</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {pluginStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-400 dark:text-slate-500">
                    暂无已加载的插件
                  </td>
                </tr>
              ) : (
                pluginStats.map((stat) => (
                  <tr key={stat.pluginId} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 text-gray-800 dark:text-slate-200 font-medium">{stat.pluginId}</td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300 font-mono">
                      <span className={`inline-flex items-center gap-1 ${stat.cpuPercent > 50 ? 'text-red-500' : stat.cpuPercent > 20 ? 'text-yellow-500' : 'text-gray-700 dark:text-slate-300'}`}>
                        {stat.cpuPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300 font-mono">
                      {stat.memoryMB.toFixed(1)} MB
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 dark:text-slate-500 text-xs">
                      {new Date(stat.lastUpdated).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}