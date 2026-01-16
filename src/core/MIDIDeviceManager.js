import { CONNECTION_EVENTS } from "./MIDIConnection.js"

/**
 * High-level MIDI device manager for web UIs. Simplifies device
 * management with helpers for:
 * - Populating device select dropdowns
 * - Handling device connections/disconnections
 * - Tracking connection status
 * - Updating UI on device changes
 *
 * NOTE: Typically used with createMIDIDeviceManager(). For direct
 * MIDI I/O, use MIDIController instead.
 */
export class MIDIDeviceManager {
  /**
   * @param {Object} options
   * @param {MIDIController} options.midiController - The MIDIController instance
   * @param {Function} options.onStatusUpdate - Callback for status updates (message, state)
   * @param {Function} options.onConnectionUpdate - Callback when connection status changes
   * @param {number} [options.channel=1] - Default MIDI channel
   */
  constructor(options = {}) {
    this.midi = options.midiController || null
    this.onStatusUpdate = options.onStatusUpdate || (() => {})
    this.onConnectionUpdate = options.onConnectionUpdate || (() => {})
    this.channel = options.channel || 1
    this.currentDevice = null
    this.isConnecting = false
  }

  /**
   * Initialize the device manager with a MIDIController
   * @param {MIDIController} midi
   */
  setMIDI(midi) {
    this.midi = midi
  }

  /**
   * Set up device change event listeners
   * @param {Function} [onDeviceListChange] - Optional callback when device list should be refreshed
   */
  setupDeviceListeners(onDeviceListChange) {
    if (!this.midi?.connection) return

    this.midi.connection.on(CONNECTION_EVENTS.OUTPUT_DEVICE_CONNECTED, ({ device }) => {
      this.updateStatus(`Device connected: ${device.name}`, "connected")
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.connection.on(CONNECTION_EVENTS.OUTPUT_DEVICE_DISCONNECTED, ({ device }) => {
      this.updateStatus(`Device disconnected: ${device.name}`, "error")

      // Check if the disconnected device was the current one
      if (this.currentDevice && device.name === this.currentDevice.name) {
        this.currentDevice = null
        this.updateConnectionStatus()
      }

      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })
  }

  /**
   * Update status message
   * @param {string} message
   * @param {string} state
   */
  updateStatus(message, state = "") {
    this.onStatusUpdate(message, state)
  }

  /**
   * Update connection status
   */
  updateConnectionStatus() {
    this.onConnectionUpdate(this.currentDevice, this.midi)
  }

  /**
   * Get the current list of MIDI output devices
   * @returns {Array<Object>} Array of device objects with id, name, manufacturer
   */
  getOutputDevices() {
    if (!this.midi?.connection) return []
    return this.midi.connection.getOutputs()
  }

  /**
   * Check if a device is still connected
   * @param {string} deviceName
   * @returns {boolean}
   */
  isDeviceConnected(deviceName) {
    if (!this.midi?.connection) return false
    const outputs = this.midi.connection.getOutputs()
    return outputs.some((o) => o.name === deviceName)
  }

  /**
   * Connect device selection events to the device manager
   * @param {HTMLSelectElement} deviceSelectElement
   * @param {Function} onConnect - Callback when device is connected (midi, device)
   */
  connectDeviceSelection(deviceSelectElement, onConnect) {
    if (!deviceSelectElement || !this.midi) return

    deviceSelectElement.addEventListener("change", async (e) => {
      const deviceIndex = e.target.value

      if (!deviceIndex) {
        if (this.currentDevice && this.midi) {
          this.midi.connection.disconnect()
          this.currentDevice = null
          this.updateStatus("Disconnected")
          this.updateConnectionStatus()
        }
        return
      }

      if (this.isConnecting) return
      this.isConnecting = true

      try {
        await this.midi.setOutput(parseInt(deviceIndex, 10))
        this.currentDevice = this.midi.getCurrentOutput()
        this.updateConnectionStatus()

        if (onConnect) {
          await onConnect(this.midi, this.currentDevice)
        }
      } catch (err) {
        this.updateStatus(`Connection failed: ${err.message}`, "error")
      } finally {
        this.isConnecting = false
      }
    })
  }

  /**
   * Connect channel selection events
   * @param {HTMLSelectElement} channelSelectElement
   */
  connectChannelSelection(channelSelectElement) {
    if (!channelSelectElement || !this.midi) return

    channelSelectElement.addEventListener("change", (e) => {
      if (this.midi) {
        const channel = parseInt(e.target.value, 10)
        this.midi.options.channel = channel
        this.updateConnectionStatus()
      }
    })
  }

  /**
   * Populate a device select element with available MIDI output devices
   * @param {HTMLSelectElement} selectElement
   * @param {Function} [onChange] - Optional callback when selection should change
   */
  populateDeviceList(selectElement, onChange) {
    if (!selectElement) return

    const outputs = this.getOutputDevices()

    if (outputs.length > 0) {
      selectElement.innerHTML =
        '<option value="">Select a device</option>' +
        outputs.map((output, i) => `<option value="${i}">${output.name}</option>`).join("")

      // Check if the currently connected device is still available
      if (this.currentDevice) {
        const deviceIndex = outputs.findIndex((o) => o.name === this.currentDevice.name)
        if (deviceIndex !== -1) {
          // Device is still connected, keep it selected
          selectElement.value = deviceIndex.toString()
        } else {
          // Current device was disconnected
          selectElement.value = ""
          this.currentDevice = null
          this.updateConnectionStatus()
        }
      } else {
        // No device connected, show "Select a device"
        selectElement.value = ""
      }

      if (!this.currentDevice) {
        this.updateStatus("Select a MIDI device")
      }
    } else {
      selectElement.innerHTML = '<option value="">No MIDI devices found</option>'
      this.updateStatus("No MIDI devices available", "error")
    }

    if (onChange) {
      onChange()
    }
  }
}
