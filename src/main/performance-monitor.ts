import os from 'os'

export interface PluginProcessInfo {
  pluginId: string
  cpuPercent: number
  memoryMB: number
  lastUpdated: string
}

export interface OverallStats {
  cpuPercent: number
  memoryMB: number
  heapUsedMB: number
  heapTotalMB: number
}

export class PerformanceMonitor {
  private plugins: Map<string, PluginProcessInfo> = new Map()
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastCpuUsage: { user: number; system: number } = process.cpuUsage()
  private lastCpuTimestamp: number = Date.now()

  registerPlugin(pluginId: string): void {
    if (!this.plugins.has(pluginId)) {
      this.plugins.set(pluginId, {
        pluginId,
        cpuPercent: 0,
        memoryMB: 0,
        lastUpdated: new Date().toISOString(),
      })
    }
  }

  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  getStats(): PluginProcessInfo[] {
    return Array.from(this.plugins.values())
  }

  getOverallStats(): OverallStats {
    const mem = process.memoryUsage()
    return {
      cpuPercent: this.calculateOverallCpu(),
      memoryMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
    }
  }

  start(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.refresh(), 5000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private calculateOverallCpu(): number {
    const now = Date.now()
    const elapsed = (now - this.lastCpuTimestamp) / 1000 // seconds
    if (elapsed <= 0) return 0

    const currentCpu = process.cpuUsage()
    const userDiff = currentCpu.user - this.lastCpuUsage.user
    const systemDiff = currentCpu.system - this.lastCpuUsage.system
    const totalMicro = userDiff + systemDiff

    this.lastCpuUsage = currentCpu
    this.lastCpuTimestamp = now

    // Convert microseconds to percentage of one core
    const percent = (totalMicro / 1_000_000 / elapsed) * 100
    return Math.round(Math.min(percent, 100 * os.cpus().length) * 100) / 100
  }

  private refresh(): void {
    const overallCpu = this.calculateOverallCpu()
    const mem = process.memoryUsage()
    const totalMemoryMB = Math.round((mem.rss / 1024 / 1024) * 100) / 100
    const count = this.plugins.size || 1
    const now = new Date().toISOString()

    // Distribute resource usage evenly among registered plugins
    const avgCpu = Math.round((overallCpu / count) * 100) / 100
    const avgMem = Math.round((totalMemoryMB / count) * 100) / 100

    for (const [, info] of this.plugins) {
      info.cpuPercent = avgCpu
      info.memoryMB = avgMem
      info.lastUpdated = now
    }
  }
}