"use client"

import { type ReactNode, useState, useEffect, useRef } from 'react'
import { Bell, X, Search, Sparkles, Puzzle, Settings } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { PluginManifest } from '../../../shared/types'
import ToastContainer from '../ToastContainer'

interface AppLayoutProps {
  children: ReactNode
  currentPage: string
  onNavigate: (page: string) => void
  plugins: PluginManifest[]
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Puzzle, Settings, Bell, LayoutDashboard: Sparkles,
  ListTodo: Puzzle, History: Bell,
}

function isHomePage(page: string): boolean {
  return page === 'home'
}

export default function AppLayout({ children, currentPage, onNavigate, plugins }: AppLayoutProps) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [searchTasks, setSearchTasks] = useState<any[]>([])

  const onHomePage = isHomePage(currentPage)
  const isSystemPage = currentPage.startsWith('_system:')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setSearchQuery('')
        setTimeout(() => searchRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    // 仅当搜索打开且当前处于 reminder 插件页面时，加载任务列表用于搜索
    const activePluginId = currentPage.includes(':') ? currentPage.split(':')[0] : null
    if (searchOpen && activePluginId === 'reminder') {
      window.electronAPI.task?.getAll?.().then(setSearchTasks).catch(() => {})
    } else {
      setSearchTasks([])
      setSearchQuery('')
    }
  }, [searchOpen, currentPage])

  const filteredTasks = searchQuery.trim()
    ? searchTasks.filter((t: any) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  useEffect(() => {
    setSelectedIdx(0)
  }, [searchQuery])

  const handleSearchNavigate = (page: string) => {
    setSearchOpen(false)
    setSearchQuery('')
    onNavigate(page)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, filteredTasks.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filteredTasks[selectedIdx]) {
      handleSearchNavigate('reminder:tasks')
    }
  }

  useEffect(() => {
    if (window.electronAPI.app.platform !== 'darwin') {
      window.electronAPI.app.isMaximized().then(setIsMaximized)
      const cleanup = window.electronAPI.app.onMaximizedChanged(setIsMaximized)
      return cleanup
    }
  }, [])

  const isMac = window.electronAPI.app.platform === 'darwin'
  const needsWinControls = !isMac

  const getPageTitle = (): string => {
    if (onHomePage) return '工具首页'
    for (const plugin of plugins) {
      if (!plugin.enabled) continue
      for (const page of plugin.pages) {
        if (`${plugin.id}:${page.id}` === currentPage) {
          return page.name
        }
      }
    }
    return ''
  }

  const getActivePluginId = (): string | null => {
    if (onHomePage) return null
    const idx = currentPage.indexOf(':')
    if (idx === -1) return null
    return currentPage.slice(0, idx)
  }

  const activePluginId = getActivePluginId()
  const activePlugin = activePluginId ? plugins.find((p) => p.id === activePluginId && p.enabled) : null

  return (
    <>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-color)' }}>

      <aside className="w-56 flex-shrink-0 surface-sidebar border-r border-gray-200/80 dark:border-slate-800/50 flex flex-col transition-all duration-300">
        {/* Windows 窗口控制按钮 — 集成在侧边栏顶部 */}
        <div className={cn("flex flex-col", needsWinControls ? "pt-0" : "pt-[38px]")} style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          {needsWinControls && (
            <div className="flex items-center justify-end h-[38px] pr-1 border-b border-gray-200/80 dark:border-slate-800/50 bg-gray-50/80 dark:bg-slate-900/80" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
              <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                {/* 最小化 */}
                <button
                  onClick={() => window.electronAPI.app.minimize()}
                  className="w-11 h-8 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15 transition-colors rounded-sm"
                  title="最小化"
                >
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                    <path d="M2.5 6h7" />
                  </svg>
                </button>
                {/* 最大化/还原 */}
                <button
                  onClick={() => window.electronAPI.app.maximize()}
                  className="w-11 h-8 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15 transition-colors rounded-sm"
                  title={isMaximized ? '还原' : '最大化'}
                >
                  {isMaximized ? (
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 4.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.5" />
                      <rect x="4.5" y="4.5" width="5" height="5" rx="0.75" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
                    </svg>
                  )}
                </button>
                {/* 关闭 */}
                <button
                  onClick={() => window.electronAPI.app.close()}
                  className="w-11 h-8 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-red-500 hover:text-white active:bg-red-600 transition-colors rounded-sm"
                  title="关闭"
                >
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 px-5 pb-2 border-b border-gray-200/80 dark:border-slate-800/50" style={needsWinControls ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-slate-100 text-base">工具集</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {(onHomePage || currentPage.startsWith('_system:')) ? (
            <>
              <button
                onClick={() => onNavigate('home')}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  onHomePage
                    ? 'bg-primary-600/20 text-primary-400 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                )}
              >
                <Sparkles className={cn('w-4 h-4', onHomePage && 'text-primary-400')} />
                工具首页
                {onHomePage && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </button>
              <button
                onClick={() => onNavigate('_system:manager')}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  currentPage === '_system:manager'
                    ? 'bg-primary-600/20 text-primary-400 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                )}
              >
                <Puzzle className={cn('w-4 h-4', currentPage === '_system:manager' && 'text-primary-400')} />
                插件管理
                {currentPage === '_system:manager' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </button>
              <button
                onClick={() => onNavigate('_system:settings')}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  currentPage === '_system:settings'
                    ? 'bg-primary-600/20 text-primary-400 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                )}
              >
                <Settings className={cn('w-4 h-4', currentPage === '_system:settings' && 'text-primary-400')} />
                系统设置
                {currentPage === '_system:settings' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onNavigate('home')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-all duration-200 mb-2"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                返回首页
              </button>
              {activePlugin && (
                <>
                  <div className="pt-2 pb-1">
                    <div className="flex items-center gap-2 px-3">
                      {(() => {
                        const PluginIcon = ICON_MAP[activePlugin.icon] || Bell
                        return <PluginIcon className="w-3.5 h-3.5 text-primary-400" />
                      })()}
                      <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{activePlugin.name}</span>
                    </div>
                  </div>
                  {activePlugin.pages.map((page) => {
                    const PageIcon = ICON_MAP[page.icon] || Bell
                    const pageKey = `${activePlugin.id}:${page.id}`
                    const isPageActive = currentPage === pageKey
                    return (
                      <button
                        key={pageKey}
                        onClick={() => onNavigate(pageKey)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 pl-9',
                          isPageActive
                            ? 'bg-primary-600/20 text-primary-400 shadow-sm'
                            : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                        )}
                      >
                        <PageIcon className={cn('w-4 h-4', isPageActive && 'text-primary-400')} />
                        {page.name}
                        {isPageActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
                      </button>
                    )
                  })}
                </>
              )}
            </>
          )}
        </nav>

        <div className="px-5 py-4 border-t border-gray-200/80 dark:border-slate-800/50">
          {(onHomePage || currentPage.startsWith('_system:')) ? (
            <p className="text-xs text-gray-400 dark:text-slate-600">
              {onHomePage ? '选择一个工具开始使用' : '工具集 v1.0.2'}
            </p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-slate-600">工具集 v1.0.2</p>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-color)' }}>
        {/* 插件页面显示标题栏，平台页面（首页/插件管理/系统设置）隐藏 */}
        {!onHomePage && !isSystemPage && (
          <header className={cn(
            'flex-shrink-0 surface-header backdrop-blur-xl border-b border-gray-200/80 dark:border-slate-800/50 flex items-center justify-between',
            'h-14 px-6'
          )}>
            <h1 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              {getPageTitle()}
            </h1>
            {currentPage.startsWith('reminder:') && (searchOpen ? (
              <div className="relative flex-1 max-w-md mx-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  ref={searchRef}
                  type="text"
                  className="input-field pl-9 pr-9 h-9 text-sm"
                  placeholder="搜索任务..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => setTimeout(() => { setSearchOpen(false); setSearchQuery('') }, 200)}
                />
                {searchQuery.trim() && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                    onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {filteredTasks.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-xl border border-gray-200/80 dark:border-slate-700/50 shadow-xl overflow-hidden z-50">
                    {filteredTasks.slice(0, 10).map((task: any, idx: number) => (
                      <button
                        key={task.id}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                          idx === selectedIdx
                            ? 'bg-primary-500/10 text-primary-400'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                        }`}
                        onClick={() => handleSearchNavigate('reminder:tasks')}
                        onMouseEnter={() => setSelectedIdx(idx)}
                      >
                        <Search className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{task.name}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
                          {task.enabled ? '运行中' : '已暂停'}
                        </span>
                      </button>
                    ))}
                    {filteredTasks.length > 10 && (
                      <div className="px-4 py-2 text-xs text-gray-400 dark:text-slate-500 border-t border-gray-200/80 dark:border-slate-700/50 text-center">
                        还有 {filteredTasks.length - 10} 个结果，前往任务列表查看
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50) }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-colors"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">搜索 (Ctrl+F)</span>
              </button>
            ))}
          </header>
        )}

        <div className={cn('flex-1 overflow-auto min-h-0', onHomePage ? 'p-0' : 'p-6')}>
          <div
            className={cn(
              onHomePage ? '' : 'animate-fade-in',
              activePluginId && `plugin-${activePluginId}`,
              !onHomePage && 'h-full'
            )}
            data-plugin={activePluginId || undefined}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
    </>
  )
}
