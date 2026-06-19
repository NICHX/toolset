"use client"

import { type ReactNode, useState, useEffect, useRef } from 'react'
import { Minus, Square, X, Search, Sparkles, Puzzle, Settings } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { PluginManifest } from '../../../shared/types'

interface AppLayoutProps {
  children: ReactNode
  currentPage: string
  onNavigate: (page: string) => void
  plugins: PluginManifest[]
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

  const onHomePage = isHomePage(currentPage)

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
    if (window.electronAPI.app.platform !== 'darwin') {
      window.electronAPI.app.isMaximized().then(setIsMaximized)
      const cleanup = window.electronAPI.app.onMaximizedChanged(setIsMaximized)
      return cleanup
    }
  }, [])

  const showControls = window.electronAPI.app.isMainWindow && window.electronAPI.app.platform !== 'darwin'
  const isMac = window.electronAPI.app.platform === 'darwin'

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

  const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Sparkles, Puzzle, Settings,
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-white/80 dark:bg-slate-900/80 border-r border-gray-200/80 dark:border-slate-800/50 flex flex-col transition-all duration-300">
        <div className={cn('min-h-14 flex items-center gap-3 px-5 pb-2 border-b border-gray-200/80 dark:border-slate-800/50', isMac ? 'pt-[38px]' : 'pt-3')} style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 dark:text-slate-100 text-base">工具集</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {(onHomePage || currentPage.startsWith('_system:')) ? (
            <>
              <button onClick={() => onNavigate('home')}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  onHomePage ? 'bg-primary-600/20 text-primary-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                )}>
                <Sparkles className={cn('w-4 h-4', onHomePage && 'text-primary-400')} />
                工具首页
                {onHomePage && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </button>
              <button onClick={() => onNavigate('_system:manager')}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  currentPage === '_system:manager' ? 'bg-primary-600/20 text-primary-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                )}>
                <Puzzle className={cn('w-4 h-4', currentPage === '_system:manager' && 'text-primary-400')} />
                插件管理
                {currentPage === '_system:manager' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </button>
              <button onClick={() => onNavigate('_system:settings')}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  currentPage === '_system:settings' ? 'bg-primary-600/20 text-primary-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                )}>
                <Settings className={cn('w-4 h-4', currentPage === '_system:settings' && 'text-primary-400')} />
                系统设置
                {currentPage === '_system:settings' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onNavigate('home')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-all duration-200 mb-2">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                </svg>
                返回首页
              </button>
              {activePlugin && (
                <>
                  <div className="pt-2 pb-1"><div className="flex items-center gap-2 px-3">
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{activePlugin.name}</span>
                  </div></div>
                  {activePlugin.pages.map((page) => {
                    const PageIcon = ICON_MAP[page.icon] || Sparkles
                    const pageKey = `${activePlugin.id}:${page.id}`
                    const isPageActive = currentPage === pageKey
                    return (
                      <button key={pageKey} onClick={() => onNavigate(pageKey)}
                        className={cn('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 pl-9',
                          isPageActive ? 'bg-primary-600/20 text-primary-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                        )}>
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
          <p className="text-xs text-gray-400 dark:text-slate-600">工具集 v1.0.0</p>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className={cn('flex-shrink-0 flex items-center justify-between transition-all duration-200',
          onHomePage ? 'h-0 overflow-hidden border-0' : 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-b border-gray-200/80 dark:border-slate-800/50',
          showControls ? 'h-[52px] pr-0' : 'h-14 px-6',
          onHomePage ? '' : (showControls ? '' : 'px-6')
        )}>
          {!onHomePage && (
            <>
              <h1 className={cn('text-base font-semibold text-gray-900 dark:text-slate-100', showControls ? 'pl-4' : '')}>{getPageTitle()}</h1>
              <div className="flex items-center gap-3 h-full">
                {showControls && (
                  <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button onClick={() => window.electronAPI.app.minimize()} className="w-[46px] h-full flex items-center justify-center hover:bg-gray-200/80 dark:hover:bg-slate-700/60 transition-colors text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"><Minus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => window.electronAPI.app.maximize()} className="w-[46px] h-full flex items-center justify-center hover:bg-gray-200/80 dark:hover:bg-slate-700/60 transition-colors text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200">
                      {isMaximized ? (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="9" height="9" rx="1" /><path d="M12 5V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v1" /></svg>
                      ) : (<Square className="w-3.5 h-3.5" />)}
                    </button>
                    <button onClick={() => window.electronAPI.app.close()} className="w-[46px] h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors text-gray-500 dark:text-slate-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </>
          )}
        </header>
        <div className={cn('flex-1 overflow-auto', onHomePage ? 'p-0' : 'p-6')}>
          <div className={onHomePage ? '' : 'animate-fade-in'}>{children}</div>
        </div>
      </main>
    </div>
  )
}