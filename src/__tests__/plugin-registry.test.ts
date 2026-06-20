import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { PluginRegistry } from '../main/plugin-registry'
import type { PluginManifest } from '../shared/types'

describe('PluginRegistry', () => {
  let tmpDir: string
  let registry: PluginRegistry

  const createManifest = (id: string, overrides: Partial<PluginManifest> = {}): PluginManifest => ({
    id,
    name: `Test ${id}`,
    version: '1.0.0',
    description: 'test plugin',
    icon: 'icon.svg',
    color: '#000',
    bg: '#fff',
    enabled: true,
    builtIn: false,
    pages: [{ id: 'main', name: 'Main', icon: 'home' }],
    ...overrides,
  })

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-registry-test-'))
    registry = new PluginRegistry(tmpDir)
  })

  afterEach(() => {
    registry.flush()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('registerPlugin / unregisterPlugin', () => {
    it('should register a plugin', () => {
      registry.registerPlugin('test-plugin')
      expect(registry.hasPlugin('test-plugin')).toBe(true)
    })

    it('should register a plugin with disabled state', () => {
      registry.registerPlugin('test-plugin', false)
      const state = registry.getPluginState('test-plugin')
      expect(state.enabled).toBe(false)
    })

    it('should unregister a plugin', () => {
      registry.registerPlugin('test-plugin')
      registry.unregisterPlugin('test-plugin')
      expect(registry.hasPlugin('test-plugin')).toBe(false)
    })

    it('should do nothing when unregistering non-existent plugin', () => {
      expect(() => registry.unregisterPlugin('nonexistent')).not.toThrow()
    })
  })

  describe('getPluginState', () => {
    it('should return default state for unregistered plugin', () => {
      const state = registry.getPluginState('unknown')
      expect(state).toEqual({ enabled: true, installedAt: 0, updatedAt: 0 })
    })

    it('should return registered state', () => {
      registry.registerPlugin('test-plugin', false)
      const state = registry.getPluginState('test-plugin')
      expect(state.enabled).toBe(false)
      expect(state.installedAt).toBeGreaterThan(0)
      expect(state.updatedAt).toBeGreaterThan(0)
    })
  })

  describe('setEnabled / getAllEnabled', () => {
    it('should set enabled state for existing plugin', () => {
      registry.registerPlugin('test-plugin')
      registry.setEnabled('test-plugin', false)
      expect(registry.getPluginState('test-plugin').enabled).toBe(false)
    })

    it('should auto-register plugin when setEnabled on unknown plugin', () => {
      registry.setEnabled('new-plugin', true)
      expect(registry.hasPlugin('new-plugin')).toBe(true)
    })

    it('should return all enabled states', () => {
      registry.registerPlugin('a', true)
      registry.registerPlugin('b', false)
      registry.setEnabled('c', true)
      expect(registry.getAllEnabled()).toEqual({ a: true, b: false, c: true })
    })
  })

  describe('setAllEnabled', () => {
    it('should batch update enabled states', () => {
      registry.registerPlugin('a', true)
      registry.registerPlugin('b', true)
      registry.setAllEnabled({ a: false, b: true })
      expect(registry.getPluginState('a').enabled).toBe(false)
      expect(registry.getPluginState('b').enabled).toBe(true)
    })

    it('should auto-register unknown plugins in batch', () => {
      registry.setAllEnabled({ new: true })
      expect(registry.hasPlugin('new')).toBe(true)
    })
  })

  describe('getPluginIds', () => {
    it('should return all registered plugin IDs', () => {
      registry.registerPlugin('a')
      registry.registerPlugin('b')
      const ids = registry.getPluginIds()
      expect(ids.sort()).toEqual(['a', 'b'])
    })

    it('should return empty array when no plugins', () => {
      expect(registry.getPluginIds()).toEqual([])
    })
  })

  describe('applyToManifest', () => {
    it('should override manifest enabled with registry state', () => {
      registry.registerPlugin('test-plugin', false)
      const manifest = createManifest('test-plugin', { enabled: true })
      const result = registry.applyToManifest(manifest)
      expect(result.enabled).toBe(false)
    })

    it('should use manifest enabled if no registry state', () => {
      const manifest = createManifest('unknown-plugin', { enabled: true })
      const result = registry.applyToManifest(manifest)
      expect(result.enabled).toBe(true)
    })

    it('should default to true if neither registry nor manifest specifies', () => {
      const manifest = createManifest('unknown-plugin')
      delete (manifest as any).enabled
      const result = registry.applyToManifest(manifest)
      expect(result.enabled).toBe(true)
    })
  })

  describe('applyToManifests', () => {
    it('should apply to multiple manifests', () => {
      registry.registerPlugin('a', false)
      registry.registerPlugin('b', true)
      const manifests = [
        createManifest('a'),
        createManifest('b'),
      ]
      const results = registry.applyToManifests(manifests)
      expect(results[0].enabled).toBe(false)
      expect(results[1].enabled).toBe(true)
    })
  })

  describe('clear', () => {
    it('should remove all registrations', () => {
      registry.registerPlugin('a')
      registry.registerPlugin('b')
      registry.clear()
      expect(registry.getPluginIds()).toEqual([])
    })

    it('should persist empty state after clear', () => {
      registry.registerPlugin('a')
      registry.clear()
      registry.flush()

      const newRegistry = new PluginRegistry(tmpDir)
      expect(newRegistry.getPluginIds()).toEqual([])
    })
  })

  describe('file persistence', () => {
    it('should persist registration to disk', () => {
      registry.registerPlugin('test-plugin', true)
      registry.flush()

      const registryPath = path.join(tmpDir, 'registry.json')
      expect(fs.existsSync(registryPath)).toBe(true)
      const raw = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
      expect(raw.plugins['test-plugin'].enabled).toBe(true)
    })

    it('should reload persisted state on new instance', () => {
      registry.registerPlugin('persisted', true)
      registry.flush()

      const newRegistry = new PluginRegistry(tmpDir)
      expect(newRegistry.hasPlugin('persisted')).toBe(true)
      expect(newRegistry.getPluginState('persisted').enabled).toBe(true)
    })

    it('should handle corrupted registry file gracefully', () => {
      const registryPath = path.join(tmpDir, 'registry.json')
      fs.writeFileSync(registryPath, '{corrupted}', 'utf-8')

      const corrupted = new PluginRegistry(tmpDir)
      expect(corrupted.getPluginIds()).toEqual([])
      expect(corrupted.getPluginState('anything').enabled).toBe(true)
    })
  })
})
