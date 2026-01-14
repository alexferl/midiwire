import { clamp, normalize14BitValue, normalizeValue } from "../utils/midi.js"
import { EventEmitter } from "./EventEmitter.js"
import { MIDIConnection } from "./MIDIConnection.js"

/**
 * MIDI event constants
 */
export const MIDI_EVENTS = {
  READY: "ready",
  ERROR: "error",
  CC_SEND: "cc-send",
  CC_RECV: "cc-recv",
  NOTE_ON_SEND: "note-on-send",
  NOTE_ON_RECV: "note-on-recv",
  NOTE_OFF_SEND: "note-off-send",
  NOTE_OFF_RECV: "note-off-recv",
  SYSEX_SEND: "sysex-send",
  SYSEX_RECV: "sysex-recv",
  OUTPUT_CHANGED: "output-changed",
  INPUT_CONNECTED: "input-connected",
  DESTROYED: "destroyed",
  MIDI_MSG: "midi-msg",
}

/**
 * Main MIDI controller class
 * @extends EventEmitter
 */
export class MIDIController extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.channel=1] - Default MIDI channel (1-16)
   * @param {string|number} [options.output] - MIDI output device
   * @param {string|number} [options.input] - MIDI input device
   * @param {boolean} [options.sysex=false] - Request SysEx access
   * @param {boolean} [options.autoConnect=true] - Auto-connect to first available output
   * @param {Function} [options.onReady] - Callback when MIDI is ready
   * @param {Function} [options.onError] - Error handler
   */
  constructor(options = {}) {
    super()

    this.options = {
      channel: 1,
      autoConnect: true,
      sysex: false,
      ...options,
    }

    this.connection = null
    this.bindings = new Map()
    this.state = new Map() // Track all CC values
    this.initialized = false
  }

  /**
   * Initialize MIDI access
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      console.warn("MIDI Controller already initialized")
      return
    }

    try {
      this.connection = new MIDIConnection({
        sysex: this.options.sysex,
      })

      await this.connection.requestAccess()

      if (this.options.autoConnect) {
        await this.connection.connect(this.options.output)
      }

      // Connect input if specified
      if (this.options.input !== undefined) {
        await this.connectInput(this.options.input)
      }

      this.initialized = true
      this.emit(MIDI_EVENTS.READY, this)
      this.options.onReady?.(this)
    } catch (error) {
      this.emit(MIDI_EVENTS.ERROR, error)
      this.options.onError?.(error)
      throw error
    }
  }

  /**
   * Connect to a MIDI input device for receiving messages
   * @param {string|number} device - Device name, ID, or index
   * @returns {Promise<void>}
   */
  async connectInput(device) {
    await this.connection.connectInput(device, (event) => {
      this._handleMIDIMessage(event)
    })
    this.emit(MIDI_EVENTS.INPUT_CONNECTED, this.connection.getCurrentInput())
  }

  /**
   * Send a control change message
   * @param {number} cc - CC number (0-127)
   * @param {number} value - CC value (0-127)
   * @param {number} [channel] - MIDI channel (defaults to controller channel)
   */
  sendCC(cc, value, channel = this.options.channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call initialize() first.")
      return
    }

    // Validate inputs
    cc = clamp(Math.round(cc), 0, 127)
    value = clamp(Math.round(value), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0xb0 + (channel - 1) // Control Change status
    this.connection.send([status, cc, value])

    // Update state
    const key = `${channel}:${cc}`
    this.state.set(key, value)

    this.emit(MIDI_EVENTS.CC_SEND, { cc, value, channel })
  }

  /**
   * Send a SysEx message
   * @param {Array<number>} data - SysEx data bytes (without F0/F7 wrapper)
   * @param {boolean} [includeWrapper=false] - If true, data already includes F0/F7
   *
   * @example
   * // Send with wrapper included
   * midi.sendSysEx([0xF0, 0x42, 0x30, 0x00, 0x01, 0x2F, 0x12, 0xF7], true)
   */
  sendSysEx(data, includeWrapper = false) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call initialize() first.")
      return
    }

    if (!this.options.sysex) {
      console.warn("SysEx not enabled. Initialize with sysex: true")
      return
    }

    this.connection.sendSysEx(data, includeWrapper)
    this.emit(MIDI_EVENTS.SYSEX_SEND, { data, includeWrapper })
  }

  /**
   * Send a note on message
   * @param {number} note - Note number (0-127)
   * @param {number} [velocity=64] - Note velocity (0-127)
   * @param {number} [channel] - MIDI channel
   */
  sendNoteOn(note, velocity = 64, channel = this.options.channel) {
    if (!this.initialized) return

    note = clamp(Math.round(note), 0, 127)
    velocity = clamp(Math.round(velocity), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0x90 + (channel - 1)
    this.connection.send([status, note, velocity])

    this.emit(MIDI_EVENTS.NOTE_ON_SEND, { note, velocity, channel })
  }

  /**
   * Send a note off message
   * @param {number} note - Note number (0-127)
   * @param {number} [channel] - MIDI channel
   * @param {number} [velocity=0] - Release velocity (0-127)
   */
  sendNoteOff(note, channel = this.options.channel, velocity = 0) {
    if (!this.initialized) return

    note = clamp(Math.round(note), 0, 127)
    velocity = clamp(Math.round(velocity), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    // Use Note On with velocity 0 for better compatibility with some synths
    const status = 0x90 + (channel - 1)
    this.connection.send([status, note, velocity])

    this.emit(MIDI_EVENTS.NOTE_OFF_SEND, { note, channel, velocity })
  }

  /**
   * Bind a control programmatically
   * @param {HTMLElement} element - DOM element
   * @param {Object} config - Binding configuration
   * @param {number} config.cc - CC number
   * @param {number} [config.min=0] - Minimum input value
   * @param {number} [config.max=127] - Maximum input value
   * @param {number} [config.channel] - Override channel
   * @param {boolean} [config.invert=false] - Invert the value
   * @returns {Function} Unbind function
   */
  bind(element, config) {
    if (!element) {
      console.warn("Cannot bind: element is null or undefined")
      return () => {}
    }

    const binding = this._createBinding(element, config)
    this.bindings.set(element, binding)

    // Send initial value
    if (element.value !== undefined && element.value !== "") {
      binding.handler({ target: element })
    }

    return () => this.unbind(element)
  }

  /**
   * Unbind a control
   * @param {HTMLElement} element
   */
  unbind(element) {
    const binding = this.bindings.get(element)
    if (binding) {
      binding.destroy()
      this.bindings.delete(element)
    }
  }

  /**
   * Get current value of a CC
   * @param {number} cc - CC number
   * @param {number} [channel] - MIDI channel
   * @returns {number|undefined}
   */
  getCC(cc, channel = this.options.channel) {
    const key = `${channel}:${cc}`
    return this.state.get(key)
  }

  /**
   * Get all available MIDI outputs
   * @returns {Array<{id: string, name: string, manufacturer: string}>}
   */
  getOutputs() {
    return this.connection?.getOutputs() || []
  }

  /**
   * Get all available MIDI inputs
   * @returns {Array<{id: string, name: string, manufacturer: string}>}
   */
  getInputs() {
    return this.connection?.getInputs() || []
  }

  /**
   * Switch to a different output device
   * @param {string|number} output - Device name, ID, or index
   * @returns {Promise<void>}
   */
  async setOutput(output) {
    await this.connection.connect(output)
    this.emit(MIDI_EVENTS.OUTPUT_CHANGED, this.connection.getCurrentOutput())
  }

  /**
   * Get current output device
   * @returns {Object|null}
   */
  getCurrentOutput() {
    return this.connection?.getCurrentOutput() || null
  }

  /**
   * Get current input device
   * @returns {Object|null}
   */
  getCurrentInput() {
    return this.connection?.getCurrentInput() || null
  }

  /**
   * Clean up resources
   */
  destroy() {
    for (const binding of this.bindings.values()) {
      binding.destroy()
    }
    this.bindings.clear()
    this.state.clear()
    this.connection?.disconnect()
    this.initialized = false
    this.emit(MIDI_EVENTS.DESTROYED)
    this.removeAllListeners()
  }

  /**
   * Handle incoming MIDI messages
   * @private
   */
  _handleMIDIMessage(event) {
    const [status, data1, data2] = event.data
    const messageType = status & 0xf0
    const channel = (status & 0x0f) + 1

    // SysEx message
    if (status === 0xf0) {
      this.emit(MIDI_EVENTS.SYSEX_RECV, {
        data: Array.from(event.data),
        timestamp: event.midiwire,
      })
      return
    }

    // Control Change
    if (messageType === 0xb0) {
      const key = `${channel}:${data1}`
      this.state.set(key, data2)

      this.emit(MIDI_EVENTS.CC_RECV, {
        cc: data1,
        value: data2,
        channel,
      })
      return
    }

    // Note On
    if (messageType === 0x90 && data2 > 0) {
      this.emit(MIDI_EVENTS.NOTE_ON_RECV, {
        note: data1,
        velocity: data2,
        channel,
      })
      return
    }

    // Note Off (either 0x80 or 0x90 with velocity 0)
    if (messageType === 0x80 || (messageType === 0x90 && data2 === 0)) {
      this.emit(MIDI_EVENTS.NOTE_OFF_RECV, {
        note: data1,
        channel,
      })
      return
    }

    // Other messages
    this.emit(MIDI_EVENTS.MIDI_MSG, {
      status,
      data: [data1, data2],
      channel,
      timestamp: event.midiwire,
    })
  }

  /**
   * Create a binding between an element and MIDI CC
   * @private
   */
  _createBinding(element, config) {
    const {
      min = parseFloat(element.getAttribute("min")) || 0,
      max = parseFloat(element.getAttribute("max")) || 127,
      channel = this.options.channel,
      invert = false,
    } = config

    // Handle 14-bit CC (MSB + LSB)
    if (config.is14Bit) {
      const { msb, lsb } = config

      const handler = (event) => {
        const value = parseFloat(event.target.value)

        if (Number.isNaN(value)) return

        // Normalize to 14-bit range (0-16383)
        const { msb: msbValue, lsb: lsbValue } = normalize14BitValue(value, min, max, invert)

        // Send MSB and LSB
        this.sendCC(msb, msbValue, channel)
        this.sendCC(lsb, lsbValue, channel)
      }

      element.addEventListener("input", handler)
      element.addEventListener("change", handler)

      return {
        element,
        config,
        handler,
        destroy: () => {
          element.removeEventListener("input", handler)
          element.removeEventListener("change", handler)
        },
      }
    }

    // Handle 7-bit CC
    const { cc } = config

    const handler = (event) => {
      const value = parseFloat(event.target.value)

      if (Number.isNaN(value)) return

      // Normalize to 0-127 MIDI range
      const midiValue = normalizeValue(value, min, max, invert)

      this.sendCC(cc, midiValue, channel)
    }

    element.addEventListener("input", handler)
    element.addEventListener("change", handler)

    return {
      element,
      config,
      handler,
      destroy: () => {
        element.removeEventListener("input", handler)
        element.removeEventListener("change", handler)
      },
    }
  }
}
