"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  module: string
  message: string
}

const LEVEL_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
]

const LEVEL_COLORS: Record<string, string> = {
  error: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  warn: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
  info: 'text-gray-800 dark:text-slate-200',
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [moduleFilter, setModuleFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [modules, setModules] = useState<string[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const filter: any = {}
      if (moduleFilter) filter.module = moduleFilter
      if (levelFilter) filter.level = levelFilter
      if (searchText) filter.search = searchText
      const result = await window.electronAPI.log.get(filter)
      setLogs(result)

      // 提取模块列表
      const all = await window.electronAPI.log.get({})
      const modSet = new Set<string>()
      for (const entry of all) {
        if (entry.module) modSet.add(entry.module)
      }
      setModules(Array.from(modSet).sort())
    } finally {
      setLoading(false)
    }
  }, [moduleFilter, levelFilter, searchText])

  const handleClear = useCallback(async () => {
    await window.electronAPI.log.clear()
    setLogs([])
  }, [])

  // 初始加载 + 自动刷新
  useEffect(() => {
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchLogs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">日志查看器</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">查看应用运行日志</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清空
          </button>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">模块</label>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">全部</option>
              {modules.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">级别</label>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">搜索</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="输入关键词搜索..."
              className="flex-1 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-24">时间</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-20">级别</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-32">模块</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">消息</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-slate-500">
                    暂无日志
                  </td>
                </tr>
              ) : (
                logs.map((entry, idx) => (
                  <tr
                    key={idx}
                    className={`font-mono text-xs ${
                      entry.level === 'error'
                        ? 'bg-red-50/50 dark:bg-red-900/10'
                        : entry.level === 'warn'
                          ? 'bg-yellow-50/50 dark:bg-yellow-900/10'
                          : ''
                    }`}
                  >
                    <td className="px-4 py-2 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          entry.level === 'error'
                            ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
                            : entry.level === 'warn'
                              ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30'
                              : 'text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800'
                        }`}
                      >
                        {entry.level}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-slate-300 whitespace-nowrap">
                      {entry.module}
                    </td>
                    <td className="px-4 py-2 text-gray-800 dark:text-slate-200 break-all">
                      {entry.message}
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