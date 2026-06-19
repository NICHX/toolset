"use client"

import { useEffect, useState, useCallback } from 'react'
import { usePluginStore } from './stores/pluginStore'
import AppLayout from './components/layout/AppLayout'
import ToolLauncher from './pages/ToolLauncher'
import PluginManagerPage from './pages/PluginManager'
import SystemSettings from './pages/SystemSettings'
import ToastContainer from './components/ToastContainer'
import PluginShell from './components/PluginShell'
import { useToastStore } from './stores/toastStore'

/** 初始化已保存的主题 */
function initTheme() {
  const saved = localStorage.getItem('toolset-theme')
  if (saved === 'light') {
    document.documentElement.classList.remove('dark')
  } else {
    document.documentElement.classList.add('dark')
  }
}
initTheme()

type Page = 'home' | (string & {})

function isHomePage(page: Page): boolean {
  return page === 'home'
}

function parsePluginPage(page: Page): { pluginId: string; pageId: string } | null {
  if (page === 'home') return null
  const idx = page.indexOf(':')
  if (idx === -1) return null
  return { pluginId: page.slice(0, idx), pageId: page.slice(idx + 1) }
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const loadPlugins = usePluginStore((s) => s.loadPlugins)
  const plugins = usePluginStore((s) => s.plugins)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  // 暴露全局 Toast 函数供插件调用
  useEffect(() => {
    window.__showToast = (message, type = 'info') => addToast(message, type)
    return () => { delete window.__showToast }
  }, [addToast])

  const renderPage = useCallback(() => {
    if (isHomePage(page)) {
      return <ToolLauncher onNavigate={setPage} />
    }

    const parsed = parsePluginPage(page)
    if (!parsed) return null

    const { pluginId, pageId } = parsed

    // 系统内置页面
    if (pluginId === '_system') {
      if (pageId === 'manager') return <PluginManagerPage />
      if (pageId === 'settings') return <SystemSettings />
      return null
    }

    // 从动态注册表中获取插件页面
    const pluginPages = (window as any).__PLUGIN_REGISTRY__?.[pluginId]
    if (pluginPages && pluginPages[pageId]) {
      const Component = pluginPages[pageId]
      const plugin = plugins.find((p) => p.id === pluginId)
      return (
        <PluginShell
          key={`${pluginId}:${pageId}`}
          pluginId={pluginId}
          pageId={pageId}
          Component={Component}
          useHostStyles={plugin?.useHostStyles !== false}
          onNavigate={(p: string) => handleNavigate(`${pluginId}:${p}`)}
        />
      )
    }

    return null
  }, [page])

  const handleNavigate = useCallback((newPage: Page) => {
    setPage(newPage)
  }, [])

  return (
    <>
      <AppLayout currentPage={page} onNavigate={handleNavigate} plugins={plugins}>
        {renderPage()}
      </AppLayout>
      <ToastContainer />
    </>
  )
}