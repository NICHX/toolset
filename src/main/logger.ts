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
      try {
        fs.mkdirSync(this.logDir, { recursive: true })
      } catch {
        return
      }
    }
    const date = new Date()
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    this.logFile = path.join(this.logDir, `toolset-${dateStr}.log`)
    try {
      this.stream = fs.createWriteStream(this.logFile, { flags: 'a' })
      this.initialized = true
      this.cleanOldLogs()
      this.write('INFO', 'Logger', `Log file: ${this.logFile}`)
    } catch (err) {
      // 文件可能被其他进程锁定或无权限，尝试删除旧文件重新创建
      try {
        fs.rmSync(this.logFile, { force: true })
        this.stream = fs.createWriteStream(this.logFile, { flags: 'a' })
        this.initialized = true
        this.cleanOldLogs()
        this.write('INFO', 'Logger', `Log file re-created: ${this.logFile}`)
      } catch (retryErr) {
        console.error(`[Logger] Failed to open log file "${this.logFile}":`, err, retryErr)
        this.initialized = false
      }
    }
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
      try {
        this.stream.write(line + '\n')
      } catch {
        // 写入失败时静默处理
      }
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