import { EventEmitter } from "./EventEmitter.js"

/**
 * Connection event constants
 */
export const CONNECTION_EVENTS = {
  DEVICE_CHANGE: "device-change",
  INPUT_DEVICE_CONNECTED: "input-device-connected",
  INPUT_DEVICE_DISCONNECTED: "input-device-disconnected",
  OUTPUT_DEVICE_CONNECTED: "output-device-connected",
  OUTPUT_DEVICE_DISCONNECTED: "output-device-disconnected",
}

/**
 * Low-level Web MIDI API connection handler. Manages:
 * - MIDI device access/request
 * - Device enumeration (inputs/outputs)
 * - Device connection/disconnection
 * - Hotplug detection and events
 * - Raw MIDI message sending/receiving
 * - SysEx message handling
 * - Connection state tracking
 *
 * NOTE: Typically used internally by MIDIController. Most applications
 * should use MIDIController instead for higher-level APIs.
 * @extends EventEmitter
 */
export class MIDIConnection extends EventEmitter {
  /**
   * @param {Object} options
   * @param {boolean} [options.sysex=false] - Request SysEx access
   */
  constructor(options = {}) {
    super()
    this.options = {
      sysex: false,
      ...options,
    }

    this.midiAccess = null
    this.output = null
    this.input = null
  }

  /**
   * Request MIDI access from the browser
   * @returns {Promise<void>}
   * @throws {Error} If MIDI is not supported or access is denied
   */
  async requestAccess() {
    if (!navigator.requestMIDIAccess) {
      throw new Error("Web MIDI API is not supported in this browser")
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({
        sysex: this.options.sysex,
      })

      // Set up device state change listener for hotplugged devices
      this.midiAccess.onstatechange = (event) => {
        const port = event.port
        const state = event.port.state

        // Emit device state change event
        this.emit(CONNECTION_EVENTS.DEVICE_CHANGE, {
          port,
          state,
          type: port.type,
          device: {
            id: port.id,
            name: port.name,
            manufacturer: port.manufacturer || "Unknown",
          },
        })

        // Check if current devices were disconnected
        if (state === "disconnected") {
          // Emit events for ALL device disconnects, not just current ones
          if (port.type === "input") {
            this.emit(CONNECTION_EVENTS.INPUT_DEVICE_DISCONNECTED, { device: port })
            // Clear current input if it was this device
            if (this.input && this.input.id === port.id) {
              this.input = null
            }
          } else if (port.type === "output") {
            this.emit(CONNECTION_EVENTS.OUTPUT_DEVICE_DISCONNECTED, { device: port })
            // Clear current output if it was this device
            if (this.output && this.output.id === port.id) {
              this.output = null
            }
          }
        } else if (state === "connected") {
          if (port.type === "input") {
            this.emit(CONNECTION_EVENTS.INPUT_DEVICE_CONNECTED, { device: port })
          } else if (port.type === "output") {
            this.emit(CONNECTION_EVENTS.OUTPUT_DEVICE_CONNECTED, { device: port })
          }
        }
      }
    } catch (error) {
      if (error.name === "SecurityError") {
        throw new Error("MIDI access denied. SysEx requires user permission.")
      }
      throw new Error(`Failed to get MIDI access: ${error.message}`)
    }
  }

  /**
   * Get all available MIDI outputs
   * @returns {Array<{id: string, name: string, manufacturer: string}>}
   */
  getOutputs() {
    if (!this.midiAccess) return []

    const outputs = []
    this.midiAccess.outputs.forEach((output) => {
      // Only include connected devices
      if (output.state === "connected") {
        outputs.push({
          id: output.id,
          name: output.name,
          manufacturer: output.manufacturer || "Unknown",
        })
      }
    })

    return outputs
  }

  /**
   * Get all available MIDI inputs
   * @returns {Array<{id: string, name: string, manufacturer: string}>}
   */
  getInputs() {
    if (!this.midiAccess) return []

    const inputs = []
    this.midiAccess.inputs.forEach((input) => {
      if (input.state === "connected") {
        inputs.push({
          id: input.id,
          name: input.name,
          manufacturer: input.manufacturer || "Unknown",
        })
      }
    })

    return inputs
  }

  /**
   * Connect to a MIDI output device
   * @param {string|number} [device] - Device name, ID, or index (defaults to first available)
   * @returns {Promise<void>}
   * @throws {Error} If device not found
   */
  async connect(device) {
    if (!this.midiAccess) {
      throw new Error("MIDI access not initialized. Call requestAccess() first.")
    }

    const outputs = Array.from(this.midiAccess.outputs.values())

    if (outputs.length === 0) {
      throw new Error("No MIDI output devices available")
    }

    // If no device specified, use first available
    if (device === undefined) {
      this.output = outputs[0]
      return
    }

    // Connect by index
    if (typeof device === "number") {
      if (device < 0 || device >= outputs.length) {
        throw new Error(`Output index ${device} out of range (0-${outputs.length - 1})`)
      }
      this.output = outputs[device]
      return
    }

    // Connect by name or ID
    this.output = outputs.find((output) => output.name === device || output.id === device)

    if (!this.output) {
      const availableNames = outputs.map((o) => o.name).join(", ")
      throw new Error(`MIDI output "${device}" not found. Available: ${availableNames}`)
    }
  }

  /**
   * Connect to a MIDI input device for receiving messages
   * @param {string|number} [device] - Device name, ID, or index (defaults to first available)
   * @param {Function} onMessage - Callback for incoming MIDI messages
   * @returns {Promise<void>}
   */
  async connectInput(device, onMessage) {
    if (!this.midiAccess) {
      throw new Error("MIDI access not initialized. Call requestAccess() first.")
    }

    // Validate onMessage is a function
    if (typeof onMessage !== "function") {
      throw new TypeError("onMessage callback must be a function")
    }

    const inputs = Array.from(this.midiAccess.inputs.values())

    if (inputs.length === 0) {
      throw new Error("No MIDI input devices available")
    }

    // Disconnect existing input
    if (this.input) {
      this.input.onmidimessage = null
    }

    // If no device specified, use first available
    if (device === undefined) {
      this.input = inputs[0]
    } else if (typeof device === "number") {
      // Connect by index
      if (device < 0 || device >= inputs.length) {
        throw new Error(`Input index ${device} out of range (0-${inputs.length - 1})`)
      }
      this.input = inputs[device]
    } else {
      // Connect by name or ID
      this.input = inputs.find((input) => input.name === device || input.id === device)

      if (!this.input) {
        const availableNames = inputs.map((i) => i.name).join(", ")
        throw new Error(`MIDI input "${device}" not found. Available: ${availableNames}`)
      }
    }

    // Set up message handler
    this.input.onmidimessage = (event) => {
      onMessage(event)
    }
  }

  /**
   * Send a MIDI message
   * @param {Uint8Array|Array<number>} message - MIDI message bytes
   * @param {number} [timestamp=performance.now()] - Optional timestamp
   */
  send(message, timestamp = null) {
    if (!this.output) {
      console.warn("No MIDI output connected. Call connect() first.")
      return
    }

    try {
      // Convert to Uint8Array for Web MIDI API
      const data = new Uint8Array(message)

      if (timestamp === null) {
        this.output.send(data)
      } else {
        this.output.send(data, timestamp)
      }
    } catch (error) {
      console.error("Failed to send MIDI message:", error)
    }
  }

  /**
   * Send a SysEx message
   * @param {Array<number>} data - SysEx data bytes (without F0/F7 wrapper)
   * @param {boolean} [includeWrapper=false] - If true, data already includes F0/F7
   */
  sendSysEx(data, includeWrapper = false) {
    if (!this.options.sysex) {
      console.warn("SysEx not enabled. Initialize with sysex: true")
      return
    }

    let message
    if (includeWrapper) {
      // Add SysEx wrapper bytes
      message = [0xf0, ...data, 0xf7]
    } else {
      message = data
    }

    this.send(message)
  }

  /**
   * Disconnect from current output and input
   */
  disconnect() {
    if (this.input) {
      this.input.onmidimessage = null
      this.input = null
    }
    this.output = null
  }

  /**
   * Check if currently connected to an output
   * @returns {boolean}
   */
  isConnected() {
    return this.output !== null
  }

  /**
   * Get current output device info
   * @returns {Object|null}
   */
  getCurrentOutput() {
    if (!this.output) return null

    return {
      id: this.output.id,
      name: this.output.name,
      manufacturer: this.output.manufacturer || "Unknown",
    }
  }

  /**
   * Get current input device info
   * @returns {Object|null}
   */
  getCurrentInput() {
    if (!this.input) return null

    return {
      id: this.input.id,
      name: this.input.name,
      manufacturer: this.input.manufacturer || "Unknown",
    }
  }
}
