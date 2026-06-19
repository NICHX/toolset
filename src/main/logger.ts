import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

class FileLogger {
  private logDir: string = ''
  private logFile: string = ''
  private stream: fs.WriteStream | null = null
  private initialized = false

  init() {
    if (this.initialized) return
    this.logDir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
    const date = new Date()
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    this.logFile = path.join(this.logDir, `toolset-${dateStr}.log`)
    this.stream = fs.createWriteStream(this.logFile, { flags: 'a' })
    this.initialized = true

    // 清理 7 天前的日志
    this.cleanOldLogs()

    this.info('Logger', `Log file: ${this.logFile}`)
  }

  private cleanOldLogs() {
    try {
      if (!fs.existsSync(this.logDir)) return
      const files = fs.readdirSync(this.logDir)
      const now = Date.now()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      for (const file of files) {
        if (!file.startsWith('toolset-') || !file.endsWith('.log')) continue
        const filePath = path.join(this.logDir, file)
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs > sevenDays) {
          fs.rmSync(filePath, { force: true })
        }
      }
    } catch {
      // 清理失败不影响主流程
    }
  }

  private write(level: LogLevel, tag: string, ...args: unknown[]) {
    if (!this.initialized) {
      try { this.init() } catch { /* app 可能未就绪 */ }
    }

    const timestamp = new Date().toISOString()
    const message = args
      .map((a) => (typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a)))
      .join(' ')
    const line = `[${timestamp}] [${level}] [${tag}] ${message}`

    // 写入文件
    if (this.stream) {
      this.stream.write(line + '\n')
    }

    // 同时输出到终端
    switch (level) {
      case 'ERROR':
        console.error(line)
        break
      case 'WARN':
        console.warn(line)
        break
      default:
        console.log(line)
    }
  }

  info(tag: string, ...args: unknown[]) {
    this.write('INFO', tag, ...args)
  }

  warn(tag: string, ...args: unknown[]) {
    this.write('WARN', tag, ...args)
  }

  error(tag: string, ...args: unknown[]) {
    this.write('ERROR', tag, ...args)
  }

  debug(tag: string, ...args: unknown[]) {
    if (process.env.NODE_ENV === 'development') {
      this.write('DEBUG', tag, ...args)
    }
  }

  getLogFile(): string {
    return this.logFile
  }

  destroy() {
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
    this.initialized = false
  }
}

export const logger = new FileLogger()