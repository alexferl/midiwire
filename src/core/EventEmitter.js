/**
 * Simple event emitter for MIDI events
 */
export class EventEmitter {
  constructor() {
    this.events = new Map()
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event).push(handler)

    // Return unsubscribe function
    return () => this.off(event, handler)
  }

  /**
   * Register a one-time event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  once(event, handler) {
    const onceHandler = (...args) => {
      handler(...args)
      this.off(event, onceHandler)
    }
    this.on(event, onceHandler)
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  off(event, handler) {
    if (!this.events.has(event)) return

    const handlers = this.events.get(event)
    const index = handlers.indexOf(handler)
    if (index > -1) {
      handlers.splice(index, 1)
    }

    if (handlers.length === 0) {
      this.events.delete(event)
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this.events.has(event)) return

    const handlers = this.events.get(event)
    handlers.forEach((handler) => {
      try {
        handler(data)
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error)
      }
    })
  }

  /**
   * Remove all event listeners
   * @param {string} [event] - Optional event name to clear specific event
   */
  removeAllListeners(event) {
    if (event) {
      this.events.delete(event)
    } else {
      this.events.clear()
    }
  }
}
