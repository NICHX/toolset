import { describe, it, expect } from 'vitest'

function validateShape<T extends Record<string, unknown>>(data: unknown, requiredFields: (keyof T)[]): data is T {
  if (typeof data !== 'object' || data === null) return false
  return requiredFields.every((field) => field in (data as Record<string, unknown>))
}

describe('validateShape', () => {
  it('should return true for valid data', () => {
    const data = { name: 'test', age: 25 }
    expect(validateShape(data, ['name', 'age'])).toBe(true)
  })

  it('should return false for missing fields', () => {
    const data = { name: 'test' }
    expect(validateShape(data, ['name', 'age'])).toBe(false)
  })

  it('should return false for null', () => {
    expect(validateShape(null, ['name'])).toBe(false)
  })

  it('should return false for non-object', () => {
    expect(validateShape('string', ['name'])).toBe(false)
  })
})
