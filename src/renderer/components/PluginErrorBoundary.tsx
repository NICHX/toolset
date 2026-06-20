import { Component, createElement } from 'react'

interface ErrorBoundaryProps {
  children?: React.ReactNode
  pluginId: string
  onReset: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class PluginErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 通过 IPC 报告错误到主进程
    try {
      window.electronAPI?.plugin?.invoke?.('plugin:report-error', {
        pluginId: this.props.pluginId,
        error: { message: error.message, stack: error.stack },
        componentStack: info.componentStack || '',
      })
    } catch {
      // 静默失败，避免递归错误
    }
    console.error(`[PluginError][${this.props.pluginId}]`, error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    // 给 React 一个 tick 来清理状态，然后触发重置
    setTimeout(() => this.props.onReset(), 0)
  }

  render() {
    if (this.state.hasError) {
      return createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '32px',
            textAlign: 'center',
            color: '#94a3b8',
          },
        },
        createElement(
          'div',
          {
            style: {
              fontSize: '40px',
              marginBottom: '16px',
            },
          },
          '⚠️'
        ),
        createElement(
          'h3',
          {
            style: {
              fontSize: '16px',
              fontWeight: 600,
              color: '#f1f5f9',
              marginBottom: '8px',
            },
          },
          `插件「${this.props.pluginId}」渲染出错`
        ),
        createElement(
          'p',
          {
            style: {
              fontSize: '13px',
              marginBottom: '20px',
              maxWidth: '400px',
              lineHeight: 1.5,
              wordBreak: 'break-all',
            },
          },
          this.state.error?.message || '未知错误'
        ),
        createElement(
          'button',
          {
            onClick: this.handleRetry,
            style: {
              padding: '8px 24px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: '14px',
              cursor: 'pointer',
            },
          },
          '重试'
        )
      )
    }

    return this.props.children
  }
}