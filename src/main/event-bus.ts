type EventHandler = (data: any) => void

interface HandlerEntry {
  handler: EventHandler
  once: boolean
}

/**
 * 全局事件总线
 *
 * 支持插件间通信、宿主与插件间事件传递。
 * 单例模式，整个应用共享一个实例。
 */
export class EventBus {
  private listeners = new Map<string, Set<HandlerEntry>>()

  /** 发布事件 */
  emit(eventName: string, data?: any): void {
    const entries = this.listeners.get(eventName)
    if (!entries) return

    const toRemove: EventHandler[] = []
    for (const entry of entries) {
      entry.handler(data)
      if (entry.once) {
        toRemove.push(entry.handler)
      }
    }

    if (toRemove.length > 0) {
      for (const handler of toRemove) {
        this.off(eventName, handler)
      }
    }
  }

  /** 订阅事件，返回取消订阅函数 */
  on(eventName: string, handler: EventHandler): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }
    this.listeners.get(eventName)!.add({ handler, once: false })
    return () => this.off(eventName, handler)
  }

  /** 一次性订阅事件 */
  once(eventName: string, handler: EventHandler): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }
    this.listeners.get(eventName)!.add({ handler, once: true })
  }

  /** 取消订阅 */
  off(eventName: string, handler: EventHandler): void {
    const entries = this.listeners.get(eventName)
    if (!entries) return
    for (const entry of entries) {
      if (entry.handler === handler) {
        entries.delete(entry)
        break
      }
    }
    if (entries.size === 0) {
      this.listeners.delete(eventName)
    }
  }

  /** 清除所有订阅 */
  clearAll(): void {
    this.listeners.clear()
  }
}

/** 全局单例 */
export const eventBus = new EventBus()