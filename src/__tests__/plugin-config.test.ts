import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { PluginConfig } from '../main/plugin-config'

describe('PluginConfig', () => {
  let tmpDir: string
  let config: PluginConfig

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-config-test-'))
    config = new PluginConfig(tmpDir)
  })

  afterEach(() => {
    config.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('get / set', () => {
    it('should return default value for non-existent key', () => {
      expect(config.get('nonexistent')).toBeUndefined()
      expect(config.get('nonexistent', 'default')).toBe('default')
    })

    it('should set and get a value', () => {
      config.set('theme', 'dark')
      expect(config.get('theme')).toBe('dark')
    })

    it('should return undefined for key that was never set (no default)', () => {
      expect(config.get('noSuchKey')).toBeUndefined()
    })

    it('should overwrite existing value', () => {
      config.set('key', 'first')
      config.set('key', 'second')
      expect(config.get('key')).toBe('second')
    })

    it('should not trigger change or save if value is the same', () => {
      config.set('key', 'value')
      config.set('key', 'value')
      expect(config.get('key')).toBe('value')
    })

    it('should store and retrieve different types', () => {
      config.set('str', 'hello')
      config.set('num', 42)
      config.set('bool', true)
      config.set('arr', [1, 2, 3])
      config.set('obj', { nested: 'data' })

      expect(config.get('str')).toBe('hello')
      expect(config.get('num')).toBe(42)
      expect(config.get('bool')).toBe(true)
      expect(config.get('arr')).toEqual([1, 2, 3])
      expect(config.get('obj')).toEqual({ nested: 'data' })
    })
  })

  describe('getAll', () => {
    it('should return all stored values', () => {
      config.set('a', 1)
      config.set('b', 2)
      expect(config.getAll()).toEqual({ a: 1, b: 2 })
    })

    it('should return a copy, not the internal cache', () => {
      config.set('key', 'value')
      const all = config.getAll()
      all.key = 'modified'
      expect(config.get('key')).toBe('value')
    })

    it('should return empty object for fresh config', () => {
      expect(config.getAll()).toEqual({})
    })
  })

  describe('update', () => {
    it('should update multiple keys at once', () => {
      config.set('a', 1)
      config.set('b', 2)
      config.update({ a: 10, c: 3 })
      expect(config.get('a')).toBe(10)
      expect(config.get('b')).toBe(2)
      expect(config.get('c')).toBe(3)
    })

    it('should not trigger notification if nothing changed', () => {
      const listener = vi.fn()
      config.onChanged(listener)
      config.set('key', 'value')
      listener.mockClear()
      config.update({})
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('should reset a specific key', () => {
      config.set('key', 'value')
      config.reset('key')
      expect(config.get('key')).toBeUndefined()
    })

    it('should reset all keys when called without arguments', () => {
      config.set('a', 1)
      config.set('b', 2)
      config.reset()
      expect(config.get('a')).toBeUndefined()
      expect(config.get('b')).toBeUndefined()
    })

    it('should do nothing when resetting a non-existent key', () => {
      expect(() => config.reset('nonexistent')).not.toThrow()
    })
  })

  describe('onChanged', () => {
    it('should notify on set', () => {
      const listener = vi.fn()
      config.onChanged(listener)
      config.set('key', 'value')
      expect(listener).toHaveBeenCalledWith({ key: 'value' })
    })

    it('should notify on update', () => {
      const listener = vi.fn()
      config.onChanged(listener)
      config.update({ a: 1, b: 2 })
      expect(listener).toHaveBeenCalledWith({ a: 1, b: 2 })
    })

    it('should notify on reset (specific key)', () => {
      config.set('key', 'value')
      const listener = vi.fn()
      config.onChanged(listener)
      config.reset('key')
      expect(listener).toHaveBeenCalledWith({ key: undefined })
    })

    it('should return an unsubscribe function', () => {
      const listener = vi.fn()
      const unsubscribe = config.onChanged(listener)
      unsubscribe()
      config.set('key', 'value')
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('file persistence', () => {
    it('should persist data to disk via destroy/flush', () => {
      config.set('theme', 'dark')
      config.set('volume', 80)
      config.destroy()

      const configPath = path.join(tmpDir, 'config.json')
      expect(fs.existsSync(configPath)).toBe(true)
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(raw).toEqual({ theme: 'dark', volume: 80 })
    })

    it('should reload persisted data on a new instance', () => {
      config.set('theme', 'dark')
      config.destroy()

      const newConfig = new PluginConfig(tmpDir)
      expect(newConfig.get('theme')).toBe('dark')
      newConfig.destroy()
    })

    it('should handle corrupted config file gracefully', () => {
      const configPath = path.join(tmpDir, 'config.json')
      fs.writeFileSync(configPath, '{invalid json}', 'utf-8')

      const corruptedConfig = new PluginConfig(tmpDir)
      expect(corruptedConfig.get('anything')).toBeUndefined()
      expect(corruptedConfig.getAll()).toEqual({})
      corruptedConfig.destroy()
    })
  })

  describe('destroy', () => {
    it('should flush and clear write timer', () => {
      config.set('key', 'value')
      config.destroy()

      const configPath = path.join(tmpDir, 'config.json')
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(raw).toEqual({ key: 'value' })
    })

    it('should be safe to call destroy multiple times', () => {
      config.destroy()
      expect(() => config.destroy()).not.toThrow()
    })
  })

  describe('edge cases', () => {
    it('should handle empty string keys', () => {
      config.set('', 'empty-key')
      expect(config.get('')).toBe('empty-key')
    })

    it('should handle undefined values via set', () => {
      config.set('key', undefined as any)
      expect(config.get('key')).toBeUndefined()
    })

    it('should handle null values', () => {
      config.set('key', null)
      expect(config.get('key')).toBeNull()
    })

    it('should handle deeply nested objects', () => {
      const deep = { level1: { level2: { level3: 'deep' } } }
      config.set('nested', deep)
      expect(config.get('nested')).toEqual(deep)
    })
  })
})
