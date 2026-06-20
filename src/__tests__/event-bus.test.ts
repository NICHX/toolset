import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBus } from '../main/event-bus'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  afterEach(() => {
    bus.clearAll()
  })

  describe('emit / on', () => {
    it('should call handlers when event is emitted', () => {
      const handler = vi.fn()
      bus.on('test:event', handler)
      bus.emit('test:event', { data: 1 })
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ data: 1 })
    })

    it('should call multiple handlers for the same event', () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bus.on('test:event', h1)
      bus.on('test:event', h2)
      bus.emit('test:event', 'data')
      expect(h1).toHaveBeenCalledTimes(1)
      expect(h2).toHaveBeenCalledTimes(1)
    })

    it('should do nothing when emitting an event with no listeners', () => {
      expect(() => bus.emit('nonexistent', 'data')).not.toThrow()
    })

    it('should pass data correctly when emitting without arguments', () => {
      const handler = vi.fn()
      bus.on('test:event', handler)
      bus.emit('test:event')
      expect(handler).toHaveBeenCalledWith(undefined)
    })

    it('should return an unsubscribe function from on()', () => {
      const handler = vi.fn()
      const unsubscribe = bus.on('test:event', handler)
      unsubscribe()
      bus.emit('test:event', 'data')
      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle multiple events independently', () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bus.on('event:a', h1)
      bus.on('event:b', h2)
      bus.emit('event:a', 'a')
      expect(h1).toHaveBeenCalledWith('a')
      expect(h2).not.toHaveBeenCalled()
    })
  })

  describe('once', () => {
    it('should only fire the handler once', () => {
      const handler = vi.fn()
      bus.once('test:event', handler)
      bus.emit('test:event', 1)
      bus.emit('test:event', 2)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(1)
    })

    it('should work alongside regular on handlers', () => {
      const regular = vi.fn()
      const onceHandler = vi.fn()
      bus.on('test:event', regular)
      bus.once('test:event', onceHandler)
      bus.emit('test:event', 'a')
      bus.emit('test:event', 'b')
      expect(regular).toHaveBeenCalledTimes(2)
      expect(onceHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe('off', () => {
    it('should remove a specific handler', () => {
      const handler = vi.fn()
      bus.on('test:event', handler)
      bus.off('test:event', handler)
      bus.emit('test:event', 'data')
      expect(handler).not.toHaveBeenCalled()
    })

    it('should not affect other handlers when removing one', () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bus.on('test:event', h1)
      bus.on('test:event', h2)
      bus.off('test:event', h1)
      bus.emit('test:event', 'data')
      expect(h1).not.toHaveBeenCalled()
      expect(h2).toHaveBeenCalledTimes(1)
    })

    it('should do nothing when unsubscribing from non-existent event', () => {
      expect(() => bus.off('nonexistent', vi.fn())).not.toThrow()
    })
  })

  describe('clearAll', () => {
    it('should remove all listeners', () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bus.on('event:a', h1)
      bus.on('event:b', h2)
      bus.clearAll()
      bus.emit('event:a', 'data')
      bus.emit('event:b', 'data')
      expect(h1).not.toHaveBeenCalled()
      expect(h2).not.toHaveBeenCalled()
    })

    it('should clear listeners for the same event', () => {
      const handler = vi.fn()
      bus.on('test:event', handler)
      bus.clearAll()
      bus.emit('test:event', 'data')
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('handler execution order', () => {
    it('should call handlers in registration order', () => {
      const calls: number[] = []
      bus.on('test:event', () => calls.push(1))
      bus.on('test:event', () => calls.push(2))
      bus.emit('test:event')
      expect(calls).toEqual([1, 2])
    })
  })
})
