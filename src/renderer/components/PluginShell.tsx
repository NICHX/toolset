import { useEffect, useRef, useState, useCallback } from 'react'
import { PluginErrorBoundary } from './PluginErrorBoundary'

interface PluginShellProps {
  pluginId: string
  pageId: string
  Component: React.ComponentType<{ onNavigate: (page: string) => void }>
  onNavigate: (page: string) => void
  useHostStyles?: boolean
}

interface ShellState {
  shadowRoot: ShadowRoot
  root: ReturnType<typeof import('react-dom/client').createRoot>
  themeObserver: MutationObserver
}

const hostCssCache = new Map<string, string>()
let hostLinkUrls: string[] | null = null

/** 清除样式缓存（主题切换时调用） */
export function clearPluginShellStyleCache() {
  hostCssCache.clear()
  hostLinkUrls = null
}

function collectHostLinkUrls(): string[] {
  if (hostLinkUrls) return hostLinkUrls
  const urls: string[] = []
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const href = (link as HTMLLinkElement).href
    if (href && !href.includes('plugin://')) {
      urls.push(href)
    }
  }
  hostLinkUrls = urls
  return urls
}

function collectHostInlineCss(): string {
  const cached = hostCssCache.get('inline')
  if (cached) return cached

  const parts: string[] = []
  for (const sheet of document.styleSheets) {
    try {
      const owner = sheet.ownerNode
      if (owner instanceof HTMLStyleElement && owner.id !== 'plugin-inline-styles') {
        const rules = sheet.cssRules
        if (rules) {
          parts.push(Array.from(rules).map(r => r.cssText).join('\n'))
        }
      }
    } catch (e) {
      console.error('[PluginShell] Failed to collect host inline CSS:', (e as Error).message || e)
    }
  }

  const combined = parts.join('\n')
  hostCssCache.set('inline', combined)
  return combined
}

function injectStyles(shadowRoot: ShadowRoot, pluginId: string, useHostStyles: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (useHostStyles) {
      const linkUrls = collectHostLinkUrls()
      for (const url of linkUrls) {
        const linkEl = document.createElement('link')
        linkEl.rel = 'stylesheet'
        linkEl.href = url
        shadowRoot.appendChild(linkEl)
      }

      const inlineCss = collectHostInlineCss()
      if (inlineCss) {
        const existing = shadowRoot.getElementById('host-styles')
        if (existing) existing.remove()
        const styleEl = document.createElement('style')
        styleEl.id = 'host-styles'
        styleEl.textContent = inlineCss
        shadowRoot.appendChild(styleEl)
      }
    }

    fetch(`plugin://${pluginId}/renderer/index.css`)
      .then((resp) => resp.text())
      .then((pluginCss) => {
        const existing = shadowRoot.getElementById('plugin-styles')
        if (existing) existing.remove()
        const pluginStyle = document.createElement('style')
        pluginStyle.id = 'plugin-styles'
        pluginStyle.textContent = pluginCss
        shadowRoot.appendChild(pluginStyle)
      })
      .catch(() => {})
      .finally(() => resolve())
  })
}

export default function PluginShell({ pluginId, pageId, Component, onNavigate, useHostStyles = true }: PluginShellProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ShellState | null>(null)
  const [renderKey, setRenderKey] = useState(0)

  const handleReset = useCallback(() => {
    setRenderKey((k) => k + 1)
  }, [])

  // 使用 ref 避免 onNavigate 变化导致整个 Shadow DOM 重建
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // 如果已存在 Shadow Root（StrictMode 双次调用），清空复用
    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    // 清空所有子节点
    while (shadowRoot.lastChild) {
      shadowRoot.removeChild(shadowRoot.lastChild)
    }

    // 注入样式
    injectStyles(shadowRoot, pluginId, useHostStyles)

    // 创建渲染容器
    const container = document.createElement('div')
    container.id = 'plugin-root'
    container.style.cssText = 'height: 100%; width: 100%;'
    shadowRoot.appendChild(container)

    // 同步初始主题（需要在 container 创建之后，因为 dark 类要加在 container 上）
    const isDark = document.documentElement.classList.contains('dark')
    host.classList.toggle('dark', isDark)
    container.classList.toggle('dark', isDark)

    // 主题同步：同时同步 host 和 container
    const themeObserver = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark')
      host.classList.toggle('dark', dark)
      container.classList.toggle('dark', dark)
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // 创建独立 React root
    const ReactDOM = window.ReactDOM
    const root = ReactDOM.createRoot(container)
    const React = window.React as typeof import('react')
    root.render(
      React.createElement(
        PluginErrorBoundary,
        { pluginId, onReset: handleReset, key: renderKey },
        React.createElement(Component, { onNavigate: onNavigateRef.current }),
      ),
    )

    stateRef.current = { shadowRoot, root, themeObserver }

    return () => {
      // 卸载 React root 并清空 Shadow DOM（用于 StrictMode 下重建）
      try { root.unmount() } catch {}
      while (shadowRoot.lastChild) {
        shadowRoot.removeChild(shadowRoot.lastChild)
      }
      themeObserver.disconnect()
      stateRef.current = null
    }
  }, [pluginId, pageId, Component, useHostStyles, renderKey, handleReset])

  return (
    <div
      ref={hostRef}
      className="h-full w-full plugin-shell"
      data-plugin-id={pluginId}
      data-plugin
    />
  )
}
