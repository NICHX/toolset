import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { PluginRegistry } from '../main/plugin-registry'

// Mock electron completely
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-app-path'),
    isReady: vi.fn(() => true),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    destroy: vi.fn(),
  })),
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({
      popUp: vi.fn(),
    })),
  },
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    popUpContextMenu: vi.fn(),
  })),
  nativeImage: {
    createFromPath: vi.fn(() => ({
      resize: vi.fn(() => ({})),
    })),
    createEmpty: vi.fn(() => ({})),
  },
  protocol: {
    handle: vi.fn(),
  },
}))

// Mock logger to prevent console noise
vi.mock('../main/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { PluginLoader } = await import('../main/plugin-loader')

describe('PluginLoader', () => {
  let tmpDir: string
  let pluginLoader: InstanceType<typeof PluginLoader>
  let registry: PluginRegistry

  const createMinimalManifest = (id: string, overrides: Record<string, unknown> = {}) => {
    const manifest: Record<string, unknown> = {
      id,
      name: `Test ${id}`,
      version: '1.0.0',
      description: 'test description',
      icon: 'icon.svg',
      color: '#ff0000',
      bg: '#ffffff',
      pages: [{ id: 'main', name: 'Main', icon: 'home' }],
      ...overrides,
    }
    return manifest
  }

  const writePluginManifest = (pluginDir: string, manifest: Record<string, unknown>) => {
    fs.mkdirSync(pluginDir, { recursive: true })
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest), 'utf-8')
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'))
    registry = new PluginRegistry(tmpDir)
    pluginLoader = new PluginLoader()
    pluginLoader.setRegistry(registry)
  })

  afterEach(() => {
    pluginLoader.clearAll()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('validateManifest (tested via loadAll)', () => {
    it('should load a plugin with valid manifest', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      const pluginDir = path.join(pluginsDir, 'test-plugin')
      writePluginManifest(pluginDir, createMinimalManifest('test-plugin'))

      await pluginLoader.loadAll(pluginsDir)
      const ids = pluginLoader.getPluginIds()
      expect(ids).toContain('test-plugin')
    })

    it('should skip plugin with invalid manifest (missing id)', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      const pluginDir = path.join(pluginsDir, 'bad-plugin')
      const manifest = createMinimalManifest('bad-plugin')
      delete manifest.id
      writePluginManifest(pluginDir, manifest)

      await pluginLoader.loadAll(pluginsDir)
      expect(pluginLoader.getPluginIds()).toEqual([])
    })

    it('should skip plugin with invalid manifest (missing required field)', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      const pluginDir = path.join(pluginsDir, 'bad-plugin')
      const manifest = createMinimalManifest('bad-plugin')
      delete manifest.name
      writePluginManifest(pluginDir, manifest)

      await pluginLoader.loadAll(pluginsDir)
      expect(pluginLoader.getPluginIds()).toEqual([])
    })

    it('should skip plugin with invalid pages field', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      const pluginDir = path.join(pluginsDir, 'bad-plugin')
      writePluginManifest(pluginDir, createMinimalManifest('bad-plugin', { pages: 'not-an-array' }))

      await pluginLoader.loadAll(pluginsDir)
      expect(pluginLoader.getPluginIds()).toEqual([])
    })

    it('should skip non-directory entries', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      fs.mkdirSync(pluginsDir, { recursive: true })
      // Create a file in the plugins directory (not a dir)
      fs.writeFileSync(path.join(pluginsDir, 'not-a-dir.txt'), 'hello', 'utf-8')

      await pluginLoader.loadAll(pluginsDir)
      expect(pluginLoader.getPluginIds()).toEqual([])
    })

    it('should load multiple plugins', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'plugin-a'), createMinimalManifest('plugin-a'))
      writePluginManifest(path.join(pluginsDir, 'plugin-b'), createMinimalManifest('plugin-b'))

      await pluginLoader.loadAll(pluginsDir)
      expect(pluginLoader.getPluginIds()).toContain('plugin-a')
      expect(pluginLoader.getPluginIds()).toContain('plugin-b')
    })
  })

  describe('getManifests', () => {
    it('should return loaded plugin manifests', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))

      await pluginLoader.loadAll(pluginsDir)
      const manifests = pluginLoader.getManifests()
      expect(manifests).toHaveLength(1)
      expect(manifests[0].id).toBe('test-plugin')
      expect(manifests[0].name).toBe('Test test-plugin')
    })

    it('should return empty array when no plugins loaded', () => {
      expect(pluginLoader.getManifests()).toEqual([])
    })
  })

  describe('getPluginIds', () => {
    it('should return loaded plugin IDs', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'p1'), createMinimalManifest('p1'))
      writePluginManifest(path.join(pluginsDir, 'p2'), createMinimalManifest('p2'))

      await pluginLoader.loadAll(pluginsDir)
      expect(pluginLoader.getPluginIds().sort()).toEqual(['p1', 'p2'])
    })
  })

  describe('getRendererScripts', () => {
    it('should return renderer script paths', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))

      await pluginLoader.loadAll(pluginsDir)
      const scripts = pluginLoader.getRendererScripts()
      expect(scripts).toHaveLength(1)
      expect(scripts[0].id).toBe('test-plugin')
      expect(scripts[0].jsPath).toContain('plugin://test-plugin/renderer/index.js')
      expect(scripts[0].cssPath).toContain('plugin://test-plugin/renderer/index.css')
    })
  })

  describe('loadSingle', () => {
    it('should load a single plugin by ID', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))

      const result = await pluginLoader.loadSingle(pluginsDir, 'test-plugin')
      expect(result).toBe(true)
      expect(pluginLoader.getPluginIds()).toContain('test-plugin')
    })

    it('should return false for non-existent plugin', async () => {
      const result = await pluginLoader.loadSingle('/nonexistent', 'ghost')
      expect(result).toBe(false)
    })
  })

  describe('lifecycle triggers', () => {
    it('should trigger enable callbacks', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      expect(() => pluginLoader.triggerEnable('test-plugin')).not.toThrow()
    })

    it('should trigger disable callbacks', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      expect(() => pluginLoader.triggerDisable('test-plugin')).not.toThrow()
    })

    it('should trigger install callbacks', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      expect(() => pluginLoader.triggerInstall('test-plugin')).not.toThrow()
    })

    it('should trigger uninstall callbacks', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      expect(() => pluginLoader.triggerUninstall('test-plugin')).not.toThrow()
    })

    it('should do nothing when triggering lifecycle for non-existent plugin', () => {
      expect(() => pluginLoader.triggerEnable('ghost')).not.toThrow()
      expect(() => pluginLoader.triggerDisable('ghost')).not.toThrow()
      expect(() => pluginLoader.triggerInstall('ghost')).not.toThrow()
      expect(() => pluginLoader.triggerUninstall('ghost')).not.toThrow()
    })
  })

  describe('applyStates', () => {
    it('should update plugin enabled states', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      pluginLoader.applyStates({ 'test-plugin': false })
      const manifests = pluginLoader.getManifests()
      expect(manifests[0].enabled).toBe(false)
    })

    it('should persist states to registry', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      pluginLoader.applyStates({ 'test-plugin': false })
      expect(registry.getPluginState('test-plugin').enabled).toBe(false)
    })
  })

  describe('removePlugin', () => {
    it('should remove a loaded plugin', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      pluginLoader.removePlugin('test-plugin')
      expect(pluginLoader.getPluginIds()).not.toContain('test-plugin')
    })

    it('should do nothing when removing non-existent plugin', () => {
      expect(() => pluginLoader.removePlugin('ghost')).not.toThrow()
    })
  })

  describe('unregisterPlugin', () => {
    it('should unregister a plugin from loader and registry', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      pluginLoader.unregisterPlugin('test-plugin')
      expect(pluginLoader.getPluginIds()).not.toContain('test-plugin')
      expect(registry.hasPlugin('test-plugin')).toBe(false)
    })
  })

  describe('clearAll', () => {
    it('should clear all plugins and registry', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'p1'), createMinimalManifest('p1'))
      writePluginManifest(path.join(pluginsDir, 'p2'), createMinimalManifest('p2'))
      await pluginLoader.loadAll(pluginsDir)

      pluginLoader.clearAll()
      expect(pluginLoader.getPluginIds()).toEqual([])
      expect(registry.getPluginIds()).toEqual([])
    })
  })

  describe('getPlugin', () => {
    it('should return undefined for non-existent plugin', () => {
      expect(pluginLoader.getPlugin('ghost')).toBeUndefined()
    })

    it('should return plugin data for loaded plugin', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      const plugin = pluginLoader.getPlugin('test-plugin')
      expect(plugin).toBeDefined()
      expect(plugin!.manifest.id).toBe('test-plugin')
    })
  })

  describe('getPluginConfig', () => {
    it('should return config for loaded plugin', async () => {
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'test-plugin'), createMinimalManifest('test-plugin'))
      await pluginLoader.loadAll(pluginsDir)

      const config = pluginLoader.getPluginConfig('test-plugin')
      expect(config).toBeDefined()
    })

    it('should return undefined for unknown plugin', () => {
      expect(pluginLoader.getPluginConfig('ghost')).toBeUndefined()
    })
  })

  describe('setRegistry', () => {
    it('should fail silently when registry not set', async () => {
      const badLoader = new PluginLoader()
      const pluginsDir = path.join(tmpDir, 'plugins')
      writePluginManifest(path.join(pluginsDir, 'p'), createMinimalManifest('p'))

      const result = await badLoader.loadAll(pluginsDir)
      expect(result).toBeUndefined()
      expect(badLoader.getPluginIds()).toEqual([])
    })
  })

  describe('loadAll with empty plugins dir', () => {
    it('should create plugins directory if not exists', async () => {
      const pluginsDir = path.join(tmpDir, 'nonexistent-plugins')
      expect(fs.existsSync(pluginsDir)).toBe(false)

      await pluginLoader.loadAll(pluginsDir)
      expect(fs.existsSync(pluginsDir)).toBe(true)
    })
  })
})
