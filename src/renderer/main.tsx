import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// 将 React/ReactDOM 暴露为全局变量，供插件 IIFE 脚本使用
// 插件 Vite 构建时将 react/react-dom 设为 external，运行时需全局可用
window.React = React
// @ts-expect-error @types/react-dom 同时声明了全局 ReactDOM namespace 和 react-dom/client 模块，
// TS 会将其合并为 typeof import("react-dom/client") & typeof import("react-dom/index")，
// 但实际运行时赋值为 react-dom/client，类型交集过于严格，此处忽略。
window.ReactDOM = ReactDOM

const rootEl = document.getElementById('root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}