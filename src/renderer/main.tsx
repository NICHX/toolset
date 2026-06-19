import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// 将 React/ReactDOM 暴露为全局变量，供插件 IIFE 脚本使用
// 插件 Vite 构建时将 react/react-dom 设为 external，运行时需全局可用
;(window as any).React = React
;(window as any).ReactDOM = ReactDOM

const rootEl = document.getElementById('root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}