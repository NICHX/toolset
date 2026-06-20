import type { PluginManifest } from '../shared/types'

// ==================== Types ====================

export interface DependencyNode {
  id: string
  version: string
  dependencies: DependencyNode[]
  resolved: boolean
  missing: boolean
  conflict: boolean
  optional: boolean
}

// ==================== Version Comparison ====================

/**
 * Compare two dot-separated version strings (e.g. "1.2.3" vs "1.3.0").
 * Returns negative if a < b, 0 if a == b, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = i < pa.length ? pa[i] : 0
    const nb = i < pb.length ? pb[i] : 0
    if (na !== nb) return na - nb
  }
  return 0
}

/**
 * Check if version `actual` satisfies a dependency requirement `required`.
 * Uses simple prefix matching: if the required version is just "1" or "1.2",
 * only the corresponding prefix components are compared.
 */
function versionSatisfies(actual: string, required: string): boolean {
  const reqParts = required.split('.')
  const actParts = actual.split('.')
  const len = Math.min(reqParts.length, actParts.length)
  for (let i = 0; i < len; i++) {
    const rn = Number(reqParts[i])
    const an = Number(actParts[i])
    if (an !== rn) return false
  }
  // If required has fewer parts (e.g. "1"), we only check the prefix.
  // If required has more parts, all checked parts must match.
  return true
}

// ==================== Dependency Resolution ====================

/**
 * Recursively resolve all dependencies for a plugin identified by targetId.
 * Returns a dependency tree and any errors encountered.
 */
export function resolveDependencies(
  manifests: PluginManifest[],
  targetId: string,
): { resolved: DependencyNode; errors: string[] } {
  const errors: string[] = []
  const manifestMap = new Map<string, PluginManifest>()
  for (const m of manifests) {
    manifestMap.set(m.id, m)
  }

  const visited = new Set<string>()

  function resolve(
    pluginId: string,
    requiredVersion: string | null,
    depth: number,
  ): DependencyNode {
    // Circular dependency detection
    if (visited.has(pluginId)) {
      errors.push(`Circular dependency detected: "${pluginId}"`)
      return {
        id: pluginId,
        version: requiredVersion ?? 'unknown',
        dependencies: [],
        resolved: false,
        missing: false,
        conflict: false,
        optional: false,
      }
    }

    if (depth > 10) {
      errors.push(`Max dependency depth (10) exceeded while resolving "${pluginId}"`)
      return {
        id: pluginId,
        version: requiredVersion ?? 'unknown',
        dependencies: [],
        resolved: false,
        missing: false,
        conflict: false,
        optional: false,
      }
    }

    const manifest = manifestMap.get(pluginId)
    if (!manifest) {
      errors.push(`Missing dependency: "${pluginId}"${requiredVersion ? ` (required version: ${requiredVersion})` : ''}`)
      return {
        id: pluginId,
        version: requiredVersion ?? 'unknown',
        dependencies: [],
        resolved: false,
        missing: true,
        conflict: false,
        optional: false,
      }
    }

    // Check version compatibility
    let conflict = false
    if (requiredVersion) {
      if (!versionSatisfies(manifest.version, requiredVersion)) {
        errors.push(
          `Version conflict for "${pluginId}": required ${requiredVersion}, but found ${manifest.version}`,
        )
        conflict = true
      }
    }

    visited.add(pluginId)

    const deps: DependencyNode[] = []
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        const child = resolve(dep.id, dep.version, depth + 1)
        child.optional = !!dep.optional
        // Optional dependencies that are missing should not be treated as errors
        if (child.missing && dep.optional) {
          // Remove the "Missing dependency" error we just added
          const idx = errors.findIndex((e) => e.includes(`Missing dependency: "${dep.id}"`))
          if (idx !== -1) errors.splice(idx, 1)
          child.resolved = true // optional missing is OK
        }
        deps.push(child)
      }
    }

    visited.delete(pluginId)

    return {
      id: pluginId,
      version: manifest.version,
      dependencies: deps,
      resolved: !conflict,
      missing: false,
      conflict,
      optional: false,
    }
  }

  // Start resolution
  visited.clear()
  const root = resolve(targetId, null, 0)

  return { resolved: root, errors }
}

// ==================== Bulk Check ====================

/**
 * Check all plugins' dependencies are satisfied across the entire manifest list.
 */
export function checkAllDependencies(
  manifests: PluginManifest[],
): { valid: boolean; errors: { pluginId: string; errors: string[] }[] } {
  const allErrors: { pluginId: string; errors: string[] }[] = []
  let valid = true

  for (const manifest of manifests) {
    if (!manifest.dependencies || manifest.dependencies.length === 0) {
      continue
    }

    const { errors } = resolveDependencies(manifests, manifest.id)
    if (errors.length > 0) {
      valid = false
      allErrors.push({ pluginId: manifest.id, errors })
    }
  }

  return { valid, errors: allErrors }
}