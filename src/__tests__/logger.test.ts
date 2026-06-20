import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tmpDir),
  },
}))
const loggerModule = await import('../main/logger')
const { logger } = loggerModule

describe('FileLogger', () => {
  beforeEach(() => {
    logger.destroy()
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    logger.destroy()
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('init', () => {
    it('should create log directory', () => {
      logger.init()
      const logFile = logger.getLogFile()
      expect(logFile).toBeTruthy()
      expect(fs.existsSync(path.dirname(logFile))).toBe(true)
    })

    it('should be safe to call init multiple times', () => {
      logger.init()
      logger.init()
      const logFile = logger.getLogFile()
      expect(fs.existsSync(path.dirname(logFile))).toBe(true)
    })
  })

  describe('info / warn / error / debug', () => {
    it('should write info log to console', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logger.init()
      spy.mockClear()
      logger.info('TestTag', 'info message')
      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0][0]).toContain('[INFO]')
      expect(spy.mock.calls[0][0]).toContain('[TestTag]')
      expect(spy.mock.calls[0][0]).toContain('info message')
      spy.mockRestore()
    })

    it('should write warn log to console.warn', () => {
      logger.init()
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      logger.warn('TestTag', 'warn message')
      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0][0]).toContain('[WARN]')
      expect(spy.mock.calls[0][0]).toContain('[TestTag]')
      expect(spy.mock.calls[0][0]).toContain('warn message')
      spy.mockRestore()
    })

    it('should write error log to console.error', () => {
      logger.init()
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      logger.error('TestTag', 'error message')
      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0][0]).toContain('[ERROR]')
      expect(spy.mock.calls[0][0]).toContain('[TestTag]')
      expect(spy.mock.calls[0][0]).toContain('error message')
      spy.mockRestore()
    })

    it('should write debug log in development mode', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'
      logger.init()
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logger.debug('TestTag', 'debug message')
      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0][0]).toContain('[DEBUG]')
      expect(spy.mock.calls[0][0]).toContain('debug message')
      spy.mockRestore()
      process.env.NODE_ENV = originalEnv
    })

    it('should skip debug log in production mode', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      logger.init()
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logger.debug('TestTag', 'debug message')
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
      process.env.NODE_ENV = originalEnv
    })
  })

  describe('log format', () => {
    it('should include timestamp in logs', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logger.init()
      spy.mockClear()
      logger.info('Tag', 'msg')
      expect(spy.mock.calls[0][0]).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      spy.mockRestore()
    })

    it('should handle Error arguments', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      logger.init()
      spy.mockClear()
      logger.info('Tag', new Error('test error'))
      expect(spy.mock.calls[0][0]).toContain('Error: test error')
      spy.mockRestore()
    })
  })

  describe('getLogFile', () => {
    it('should return the log file path after init', () => {
      logger.init()
      const logFile = logger.getLogFile()
      expect(logFile).toBeTruthy()
      expect(logFile).toContain('toolset-')
      expect(logFile).toMatch(/toolset-\d{8}\.log$/)
    })
  })

  describe('destroy', () => {
    it('should close the stream and reset initialized flag', () => {
      logger.init()
      logger.destroy()
      expect(() => logger.info('Tag', 'after destroy')).not.toThrow()
    })
  })
})
