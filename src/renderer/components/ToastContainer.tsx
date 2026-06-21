"use client"

import { useToastStore } from '../stores/toastStore'
import { cn } from '../lib/utils'

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'px-5 py-3 rounded-xl shadow-xl backdrop-blur-xl border transition-all duration-300 animate-fade-in',
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-300'
              : toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/20 dark:border-red-500/30 dark:text-red-300'
              : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800/80 dark:border-slate-700/50 dark:text-slate-200'
          )}
          onClick={() => removeToast(toast.id)}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm">{toast.message}</span>
          </div>
        </div>
      ))}
    </div>
  )
}