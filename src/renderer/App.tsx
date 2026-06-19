"use client"

import { useEffect, useState, useCallback } from 'react'
import { usePluginStore } from './stores/pluginStore'
import AppLayout from './components/layout/AppLayout'
import ToolLauncher from './pages/ToolLauncher'
import PluginManagerPage from './pages/PluginManager'
import SystemSettings from './pages/SystemSettings'
import ToastContainer from './components/ToastContainer'
import ErrorBoundary from './components/ErrorBoundary'

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

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

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
      return (
        <ErrorBoundary>
          <Component onNavigate={(p: string) => handleNavigate(`${pluginId}:${p}`)} />
        </ErrorBoundary>
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