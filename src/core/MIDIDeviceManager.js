import { CONNECTION_EVENTS } from "./MIDIConnection.js"

/**
 * High-level MIDI device manager for web UIs. Provides simplified APIs for:
 * - Populating device select dropdowns with available MIDI outputs
 * - Handling device connections/disconnections with status updates
 * - Tracking connection state and current device
 * - Updating UI elements on device changes
 * - Managing MIDI channel selection
 *
 * NOTE: Typically used with createMIDIDeviceManager() factory function.
 * For direct MIDI I/O and control binding, use MIDIController instead.
 *
 * @example
 * // Basic usage with MIDIController
 * const midi = new MIDIController();
 * await midi.init();
 *
 * const manager = new MIDIDeviceManager({ midiController: midi });
 * const deviceSelect = document.getElementById("device-select");
 * const channelSelect = document.getElementById("channel-select");
 *
 * // Set up device list dropdown
 * manager.populateDeviceList(deviceSelect);
 *
 * // Handle device selection
 * manager.connectDeviceSelection(deviceSelect, (midi, device) => {
 *   console.log(`Connected to ${device.name}`);
 * });
 *
 * // Handle channel selection
 * manager.connectChannelSelection(channelSelect);
 *
 * @example
 * // With status and connection callbacks
 * const manager = new MIDIDeviceManager({
 *   midiController: midi,
 *   onStatusUpdate: (message, state) => {
 *     console.log(`Status: ${message}`);
 *     document.getElementById("status").textContent = message;
 *   },
 *   onConnectionUpdate: (device, midi) => {
 *     console.log("Connection state changed");
 *   }
 * });
 */
export class MIDIDeviceManager {
  /**
   * Create a new MIDIDeviceManager instance
   * @param {Object} options - Configuration options
   * @param {MIDIController} [options.midiController] - MIDIController instance. Can also be set via setMIDI()
   * @param {Function} [options.onStatusUpdate] - Callback for status updates (message: string, state: string)
   * @param {Function} [options.onConnectionUpdate] - Callback when connection status changes (device: Object, midi: MIDIController)
   * @param {number} [options.channel=1] - Default MIDI channel
   *
   * @example
   * // With MIDIController
   * const manager = new MIDIDeviceManager({
   *   midiController: midi,
   *   onStatusUpdate: (msg, state) => console.log(msg),
   *   onConnectionUpdate: (device, midi) => console.log("Device changed")
   * });
   *
   * @example
   * // Set MIDIController later
   * const manager = new MIDIDeviceManager({
   *   onStatusUpdate: (msg, state) => updateUI(msg, state)
   * });
   * manager.setMIDI(midi);
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
   * Set up device change event listeners for automatic UI updates when devices
   * connect or disconnect. Handles both successful connections and disconnections,
   * updating status messages and tracking the current device state.
   *
   * @param {Function} [onDeviceListChange] - Optional callback to refresh device list UI when devices change
   * @returns {void}
   *
   * @emits CONNECTION_EVENTS.OUT_DEV_CONNECTED via MIDIConnection
   * @emits CONNECTION_EVENTS.OUT_DEV_DISCONNECTED via MIDIConnection
   *
   * @example
   * // Basic setup
   * manager.setupDeviceListeners();
   *
   * @example
   * // With device list refresh callback
   * manager.setupDeviceListeners(() => {
   *   manager.populateDeviceList(deviceSelect);
   * });
   */
  setupDeviceListeners(onDeviceListChange) {
    if (!this.midi?.connection) return

    this.midi.connection.on(CONNECTION_EVENTS.OUT_DEV_CONNECTED, ({ device }) => {
      this.updateStatus(`Device connected: ${device.name}`, "connected")
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.connection.on(CONNECTION_EVENTS.OUT_DEV_DISCONNECTED, ({ device }) => {
      this.updateStatus(`Device disconnected: ${device.name}`, "error")

      const wasCurrentDevice = this.currentDevice && device.name === this.currentDevice.name

      if (wasCurrentDevice) {
        this.currentDevice = null
        this.updateConnectionStatus()
      }

      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })
  }

  /**
   * Update status message and trigger status callback
   *
   * @param {string} message - Status message to display
   * @param {string} [state=""] - Status state (e.g., "connected", "error", "warning")
   * @returns {void}
   *
   * @example
   * manager.updateStatus("Connected to MIDI keyboard", "connected");
   *
   * @example
   * manager.updateStatus("Connection failed", "error");
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
   * Get the current list of MIDI input devices
   * @returns {Array<Object>} Array of device objects with id, name, manufacturer
   */
  getInputDevices() {
    if (!this.midi?.connection) return []
    return this.midi.connection.getInputs()
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
   * Connect device selection events to automatically handle device connections when
   * the user selects a device from a dropdown. Handles both connection and disconnection.
   * Also manages connection state to prevent concurrent connection attempts.
   *
   * @param {HTMLSelectElement} deviceSelectElement - The select element populated with devices
   * @param {Function} onConnect - Callback when device is successfully connected (midi: MIDIController, device: Object)
   * @returns {void}
   *
   * @example
   * // Basic device selection
   * const deviceSelect = document.getElementById("device-select");
   * manager.connectDeviceSelection(deviceSelect, (midi, device) => {
   *   console.log(`Connected to ${device.name}`);
   * });
   *
   * @example
   * // With setup complete callback
   * manager.connectDeviceSelection(deviceSelect, async (midi, device) => {
   *   // Send initial program change after connection
   *   midi.channel.sendPC(5);
   *   // Load saved patch for this device
   *   await loadDevicePatch(device.name);
   * });
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
        await this.midi.device.connectOutput(parseInt(deviceIndex, 10))
        this.currentDevice = this.midi.device.getCurrentOutput()
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
   * Connect channel selection events to automatically update the MIDI channel when
   * the user selects a different channel from a dropdown. Triggers connection status
   * update to notify listeners of the channel change.
   *
   * @param {HTMLSelectElement} channelSelectElement - The select element with channel options (1-16)
   * @returns {void}
   *
   * @example
   * // Setup channel selection
   * const channelSelect = document.getElementById("channel-select");
   * manager.connectChannelSelection(channelSelect);
   *
   * @example
   * // Combined with device selection
   * manager.connectDeviceSelection(deviceSelect, (midi, device) => {
   *   console.log("Device connected");
   * });
   * manager.connectChannelSelection(channelSelect);
   */
  connectChannelSelection(channelSelectElement) {
    if (!channelSelectElement || !this.midi) return

    channelSelectElement.addEventListener("change", (e) => {
      if (this.midi) {
        this.midi.options.channel = parseInt(e.target.value, 10)
        this.updateConnectionStatus()
      }
    })
  }

  /**
   * Populate a device select element with available MIDI output devices. Automatically
   * handles maintaining selection when the current device remains connected, and clears
   * selection when the current device is disconnected. Updates status message accordingly.
   *
   * @param {HTMLSelectElement} selectElement - The select element to populate with devices
   * @param {Function} [onChange] - Optional callback invoked after populating the list
   * @returns {void}
   *
   * @example
   * // Basic population
   * const deviceSelect = document.getElementById("device-select");
   * manager.populateDeviceList(deviceSelect);
   *
   * @example
   * // With refresh callback
   * manager.populateDeviceList(deviceSelect, () => {
   *   console.log("Device list updated");
   * });
   *
   * @example
   * // Combined with device listeners for automatic refresh
   * manager.setupDeviceListeners(() => {
   *   manager.populateDeviceList(deviceSelect);
   * });
   * manager.populateDeviceList(deviceSelect); // Initial population
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
