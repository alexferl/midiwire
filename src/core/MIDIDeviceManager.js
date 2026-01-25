import { CONTROLLER_EVENTS } from "./MIDIController.js"

/**
 * High-level MIDI device manager for web UIs. Provides simplified APIs for:
 * - Populating device select dropdowns with available MIDI inputs and outputs
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
 * const outputSelect = document.getElementById("output-select");
 * const inputSelect = document.getElementById("input-select");
 * const channelSelect = document.getElementById("channel-select");
 *
 * // Set up output device list dropdown
 * manager.output.populateDeviceList(outputSelect);
 *
 * // Handle output device selection
 * manager.output.connectDeviceSelection(outputSelect, (midi, device) => {
 *   console.log(`Connected to ${device.name}`);
 * });
 *
 * // Set up input device list dropdown
 * manager.input.populateDeviceList(inputSelect);
 *
 * // Handle input device selection
 * manager.input.connectDeviceSelection(inputSelect, (midi, device) => {
 *   console.log(`Connected to input: ${device.name}`);
 * });
 *
 * // Handle channel selection
 * manager.output.connectChannelSelection(channelSelect); // or manager.input.connectChannelSelection(channelSelect)
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

    // Initialize namespaces after all methods are defined
    this._initNamespaces()
  }

  /**
   * Initialize namespace bindings
   * This must be called after all private methods are defined
   * @private
   */
  _initNamespaces() {
    /**
     * Output device management namespace
     * @namespace
     */
    this.output = {
      /**
       * Populate a select element with available MIDI output devices. Automatically
       * handles maintaining selection when the current device remains connected, and clears
       * selection when the current device is disconnected. Updates status message accordingly.
       *
       * @param {HTMLSelectElement} selectElement - The select element to populate with devices
       * @param {Function} [onChange] - Optional callback invoked after populating the list
       * @returns {Promise<void>}
       *
       * @example
       * // Basic population
       * const outputSelect = document.getElementById("output-select");
       * await manager.output.populateDeviceList(outputSelect);
       *
       * @example
       * // With refresh callback
       * await manager.output.populateDeviceList(outputSelect, () => {
       *   console.log("Device list updated");
       * });
       *
       * @example
       * // Combined with device listeners for automatic refresh
       * manager.setupDeviceListeners(() => {
       *   manager.output.populateDeviceList(outputSelect);
       * });
       * await manager.output.populateDeviceList(outputSelect); // Initial population
       */
      populateDeviceList: this._populateOutputDeviceList.bind(this),

      /**
       * Connect device selection events for output devices to automatically handle connections when
       * the user selects a device from a dropdown. Handles both connection and disconnection.
       *
       * @param {HTMLSelectElement} deviceSelectElement - The select element populated with output devices
       * @param {Function} onConnect - Callback when device is successfully connected (midi: MIDIController, device: Object)
       * @returns {void}
       *
       * @example
       * // Basic output device selection
       * const outputSelect = document.getElementById("output-select");
       * manager.output.connectDeviceSelection(outputSelect, (midi, device) => {
       *   console.log(`Connected to ${device.name}`);
       * });
       */
      connectDeviceSelection: this._connectOutputDeviceSelection.bind(this),

      /**
       * Connect channel selection events to automatically update the output MIDI channel when
       * the user selects a different channel from a dropdown. Triggers connection status
       * update to notify listeners of the channel change.
       *
       * @param {HTMLSelectElement} channelSelectElement - The select element with channel options (1-16)
       * @returns {void}
       *
       * @example
       * // Setup output channel selection
       * const channelSelect = document.getElementById("channel-select");
       * manager.output.connectChannelSelection(channelSelect);
       */
      connectChannelSelection: (channelSelectElement) => this._connectChannelSelection(channelSelectElement, "output"),

      /**
       * Check if an output device is connected
       * @param {string} deviceName
       * @returns {boolean}
       */
      isDeviceConnected: this._isOutputDeviceConnected.bind(this),

      /**
       * Get the current list of MIDI output devices
       * @returns {Array<Object>}
       */
      getDevices: this._getOutputDevices.bind(this),
    }

    /**
     * Input device management namespace
     * @namespace
     */
    this.input = {
      /**
       * Populate a select element with available MIDI input devices. Automatically
       * handles maintaining selection when the current input device remains connected, and clears
       * selection when the current input device is disconnected.
       *
       * @param {HTMLSelectElement} selectElement - The select element to populate with input devices
       * @param {Function} [onChange] - Optional callback invoked after populating the list
       * @returns {Promise<void>}
       *
       * @example
       * // Basic population
       * const inputSelect = document.getElementById("input-select");
       * await manager.input.populateDeviceList(inputSelect);
       *
       * @example
       * // With refresh callback
       * await manager.input.populateDeviceList(inputSelect, () => {
       *   console.log("Input device list updated");
       * });
       *
       * @example
       * // Combined with device listeners for automatic refresh
       * manager.setupDeviceListeners(() => {
       *   manager.input.populateDeviceList(inputSelect);
       * });
       * await manager.input.populateDeviceList(inputSelect); // Initial population
       */
      populateDeviceList: this._populateInputDeviceList.bind(this),

      /**
       * Connect input device selection events to automatically handle input device connections when
       * the user selects a device from a dropdown. Handles both connection and disconnection.
       *
       * @param {HTMLSelectElement} deviceSelectElement - The select element populated with input devices
       * @param {Function} onConnect - Callback when device is successfully connected (midi: MIDIController, device: Object)
       * @returns {void}
       *
       * @example
       * // Basic input device selection
       * const inputSelect = document.getElementById("input-select");
       * manager.input.connectDeviceSelection(inputSelect, (midi, device) => {
       *   console.log(`Connected to input: ${device.name}`);
       * });
       */
      connectDeviceSelection: this._connectInputDeviceSelection.bind(this),

      /**
       * Connect channel selection events to automatically update the input MIDI channel when
       * the user selects a different channel from a dropdown. Triggers connection status
       * update to notify listeners of the channel change.
       *
       * @param {HTMLSelectElement} channelSelectElement - The select element with channel options (1-16)
       * @returns {void}
       *
       * @example
       * // Setup input channel selection
       * const inputChannelSelect = document.getElementById("input-channel-select");
       * manager.input.connectChannelSelection(inputChannelSelect);
       */
      connectChannelSelection: (channelSelectElement) => this._connectChannelSelection(channelSelectElement, "input"),

      /**
       * Check if an input device is connected
       * @param {string} deviceName
       * @returns {boolean}
       */
      isDeviceConnected: this._isInputDeviceConnected.bind(this),

      /**
       * Get the current list of MIDI input devices
       * @returns {Array<Object>}
       */
      getDevices: this._getInputDevices.bind(this),
    }
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
   * @param {Object} [selectElements] - Optional select elements to update on disconnect
   * @param {HTMLSelectElement} [selectElements.output] - Output device select element
   * @param {HTMLSelectElement} [selectElements.input] - Input device select element
   * @returns {void}
   *
   * @emits CONTROLLER_EVENTS.DEV_OUT_CONNECTED
   * @emits CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED
   *
   * @example
   * // Basic setup
   * manager.setupDeviceListeners();
   *
   * @example
   * // With device list refresh callback
   * manager.setupDeviceListeners(() => {
   *   manager.output.populateDeviceList(deviceSelect);
   * });
   *
   * @example
   * // With select elements to clear on disconnect
   * manager.setupDeviceListeners(null, {
   *   output: outputSelect,
   *   input: inputSelect
   * });
   */
  setupDeviceListeners(onDeviceListChange, selectElements = {}) {
    if (!this.midi) return

    this.midi.on(CONTROLLER_EVENTS.DEV_OUT_CONNECTED, (device) => {
      this.updateStatus(`Output device connected: ${device?.name || "Unknown"}`, "connected")
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.on(CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED, (device) => {
      this.updateStatus(`Output device disconnected: ${device?.name || "Unknown"}`, "error")

      const wasCurrentDevice = this.currentDevice && device?.name === this.currentDevice.name

      if (wasCurrentDevice) {
        this.currentDevice = null
        this.updateConnectionStatus()
        // Clear output select element if provided
        if (selectElements.output) {
          selectElements.output.value = ""
        }
      }

      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.on(CONTROLLER_EVENTS.DEV_IN_CONNECTED, (device) => {
      this.updateStatus(`Input device connected: ${device?.name || "Unknown"}`, "connected")
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.on(CONTROLLER_EVENTS.DEV_IN_DISCONNECTED, (device) => {
      this.updateStatus(`Input device disconnected: ${device?.name || "Unknown"}`, "error")
      // Clear input select element if provided
      if (selectElements.input) {
        selectElements.input.value = ""
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
   * @private
   * @returns {Array<Object>} Array of MIDI output device objects
   */
  _getOutputDevices() {
    if (!this.midi) return []
    return this.midi.device.getOutputs()
  }

  /**
   * Get the current list of MIDI input devices
   * @private
   * @returns {Array<Object>} Array of MIDI input device objects
   */
  _getInputDevices() {
    if (!this.midi) return []
    return this.midi.device.getInputs()
  }

  /**
   * Check if an output device is connected by name
   * @private
   * @param {string} deviceName - Name of the device to check
   * @returns {boolean} True if device is connected, false otherwise
   */
  _isOutputDeviceConnected(deviceName) {
    if (!this.midi) return false
    const outputs = this.midi.device.getOutputs()
    return outputs.some((o) => o.name === deviceName)
  }

  /**
   * Check if an input device is connected by name
   * @private
   * @param {string} deviceName - Name of the input device to check
   * @returns {boolean} True if device is connected, false otherwise
   */
  _isInputDeviceConnected(deviceName) {
    if (!this.midi) return false
    const inputs = this.midi.device.getInputs()
    return inputs.some((input) => input.name === deviceName)
  }

  /**
   * Connect output device selection events to automatically handle connections when
   * the user selects a device from a dropdown. Handles both connection and disconnection.
   * @private
   * @param {HTMLSelectElement} deviceSelectElement - The select element populated with output devices
   * @param {Function} onConnect - Callback when device is successfully connected
   * @returns {void}
   */
  _connectOutputDeviceSelection(deviceSelectElement, onConnect) {
    if (!deviceSelectElement || !this.midi) return

    deviceSelectElement.addEventListener("change", async (e) => {
      // Check for concurrent connections first
      if (this.isConnecting) return
      this.isConnecting = true

      const deviceIndex = e.target.value

      if (!deviceIndex) {
        if (this.currentDevice && this.midi) {
          await this.midi.device.disconnectOutput()
          this.currentDevice = null
          this.updateStatus("Output device disconnected", "")
          this.updateConnectionStatus()
        }
        this.isConnecting = false
        return
      }

      try {
        await this.midi.device.connectOutput(parseInt(deviceIndex, 10))
        this.currentDevice = this.midi.device.getCurrentOutput()

        // Update the select element to show the selected device
        if (this.currentDevice) {
          const outputs = this.midi.device.getOutputs()
          const index = outputs.findIndex((o) => o.id === this.currentDevice.id)
          if (index !== -1) {
            deviceSelectElement.value = index.toString()
          }
        }

        this.updateConnectionStatus()

        if (onConnect) {
          await onConnect(this.midi, this.currentDevice)
        }
      } catch (err) {
        this.updateStatus(`Output connection failed: ${err.message}`, "error")
      } finally {
        this.isConnecting = false
      }
    })
  }

  /**
   * Connect input device selection events to automatically handle input device connections when
   * the user selects a device from a dropdown. Handles both connection and disconnection.
   * @private
   * @param {HTMLSelectElement} deviceSelectElement - The select element populated with input devices
   * @param {Function} onConnect - Callback when device is successfully connected
   * @returns {void}
   */
  _connectInputDeviceSelection(deviceSelectElement, onConnect) {
    if (!deviceSelectElement || !this.midi) return

    deviceSelectElement.addEventListener("change", async (e) => {
      const deviceIndex = e.target.value

      if (!deviceIndex) {
        if (this.midi) {
          await this.midi.device.disconnectInput()
          this.updateStatus("Input device disconnected", "")
          this.updateConnectionStatus()
        }
        return
      }

      if (this.isConnecting) return
      this.isConnecting = true

      try {
        await this.midi.device.connectInput(parseInt(deviceIndex, 10))
        const inputDevice = this.midi.device.getCurrentInput()
        this.updateConnectionStatus()

        if (onConnect) {
          await onConnect(this.midi, inputDevice)
        }
      } catch (err) {
        this.updateStatus(`Input connection failed: ${err.message}`, "error")
      } finally {
        this.isConnecting = false
      }
    })
  }

  /**
   * Helper method to populate device list for either input or output devices
   * @private
   * @param {HTMLSelectElement} selectElement - The select element to populate
   * @param {Array} devices - Array of device objects
   * @param {Object} currentDevice - The currently connected device
   * @param {Function} [onChange] - Optional callback
   * @param {boolean} isOutput - Whether these are output devices
   * @returns {void}
   */
  _populateDeviceList(selectElement, devices, currentDevice, onChange, isOutput) {
    if (devices.length > 0) {
      selectElement.innerHTML =
        '<option value="">Select a device</option>' +
        devices.map((device, i) => `<option value="${i}">${device.name}</option>`).join("")

      // Check if the currently connected device is still available
      if (currentDevice) {
        const deviceIndex = devices.findIndex((d) => d.name === currentDevice.name)
        if (deviceIndex !== -1) {
          // Device is still connected, keep it selected
          selectElement.value = deviceIndex.toString()
        } else {
          // Current device was disconnected
          selectElement.value = ""
          if (isOutput) {
            this.currentDevice = null
            this.updateConnectionStatus()
          }
        }
      } else {
        // No device connected, show "Select a device"
        selectElement.value = ""
      }

      selectElement.disabled = false
      if (isOutput && !this.currentDevice) {
        this.updateStatus("Select a device")
      }
    } else {
      selectElement.innerHTML = '<option value="">No devices connected</option>'
      selectElement.disabled = true
      if (isOutput) {
        this.updateStatus("No devices connected", "error")
      }
    }

    if (onChange) {
      onChange()
    }
  }

  /**
   * Populate a select element with available MIDI output devices. Automatically
   * handles maintaining selection when the current device remains connected, and clears
   * selection when the current device is disconnected. Updates status message accordingly.
   * @private
   * @param {HTMLSelectElement} selectElement - The select element to populate with devices
   * @param {Function} [onChange] - Optional callback invoked after populating the list
   * @returns {Promise<void>}
   */
  async _populateOutputDeviceList(selectElement, onChange) {
    if (!selectElement || !this.midi) return

    const outputs = this._getOutputDevices()
    this._populateDeviceList(selectElement, outputs, this.currentDevice, onChange, true)
  }

  /**
   * Populate a select element with available MIDI input devices. Automatically
   * handles maintaining selection when the current input device remains connected, and clears
   * selection when the current input device is disconnected.
   * @private
   * @param {HTMLSelectElement} selectElement - The select element to populate with input devices
   * @param {Function} [onChange] - Optional callback invoked after populating the list
   * @returns {Promise<void>}
   */
  async _populateInputDeviceList(selectElement, onChange) {
    if (!selectElement || !this.midi) return

    const inputs = this._getInputDevices()
    const currentInput = this.midi.device.getCurrentInput()
    this._populateDeviceList(selectElement, inputs, currentInput, onChange, false)
  }

  /**
   * Connect channel selection events to automatically update the MIDI channel when
   * the user selects a different channel from a dropdown. Triggers connection status
   * update to notify listeners of the channel change.
   *
   * @private
   * @param {HTMLSelectElement} channelSelectElement - The select element with channel options (1-16)
   * @param {string} type - Channel type: "input" or "output"
   * @returns {void}
   *
   * @example
   * // Setup output channel selection
   * const outputChannelSelect = document.getElementById("output-channel-select");
   * manager.output.connectChannelSelection(channelSelect);
   *
   * @example
   * // Setup input channel selection
   * const inputChannelSelect = document.getElementById("input-channel-select");
   * manager.input.connectChannelSelection(inputChannelSelect);
   */
  _connectChannelSelection(channelSelectElement, type) {
    if (!channelSelectElement || !this.midi) return

    const channelProperty = type === "input" ? "inputChannel" : "outputChannel"

    channelSelectElement.addEventListener("change", (e) => {
      if (this.midi) {
        this.midi.options[channelProperty] = parseInt(e.target.value, 10)
        this.updateConnectionStatus()
      }
    })
  }
}
