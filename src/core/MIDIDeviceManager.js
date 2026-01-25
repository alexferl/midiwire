import { CONTROLLER_EVENTS } from "./MIDIController.js"

/**
 * High-level MIDI device manager for web UIs. Provides simplified APIs for:
 * - Setting up device selectors with automatic population and refresh
 * - Handling device connections/disconnections with callbacks
 * - Managing MIDI channel selection
 *
 * @example
 * // Setup with callback
 * const manager = new MIDIDeviceManager({
 *   midiController: midi,
 *   onStatusUpdate: (msg, state) => updateStatus(msg, state),
 *   onConnectionUpdate: (output, input, midi) => {
 *     console.log("Output:", output?.name);
 *     console.log("Input:", input?.name);
 *   }
 * });
 *
 * // Setup all selectors with callbacks
 * const midi = await manager.setupSelectors(
 *   {
 *     output: document.getElementById("output-select"),
 *     input: document.getElementById("input-select"),
 *     channel: document.getElementById("channel-select")
 *   },
 *   {
 *     onConnect: ({ midi, device, type }) => {
 *       console.log(`${type} connected: ${device.name}`);
 *     },
 *     onDisconnect: ({ midi, type }) => {
 *       console.log(`${type} disconnected`);
 *     }
 *   }
 * );
 *
 * // Returns MIDI controller for immediate use
 * midi.channel.sendCC(1, 100);
 */
export class MIDIDeviceManager {
  /**
   * Create a new MIDIDeviceManager instance
   * @param {Object} options - Configuration options
   * @param {MIDIController} [options.midiController] - MIDIController instance
   * @param {Function} [options.onStatusUpdate] - Callback for status updates (message: string, state: string)
   * @param {Function} [options.onConnectionUpdate] - Callback when connection status changes (outputDevice: Object, inputDevice: Object, midi: MIDIController)
   * @param {number} [options.channel=1] - Default MIDI channel
   */
  constructor(options = {}) {
    this.midi = options.midiController || null
    this.onStatusUpdate = options.onStatusUpdate || (() => {})
    this.onConnectionUpdate = options.onConnectionUpdate || (() => {})
    this.channel = options.channel || 1
    this.currentOutput = null
    this.currentInput = null
    this.isConnecting = false
  }

  /**
   * Set up all MIDI device selectors in one call. Handles population, connection
   * handling, channel selection, and automatic refresh on device changes.
   *
   * @param {Object} selectors - Selectors configuration
   * @param {HTMLSelectElement|string} [selectors.output] - Output device dropdown element or CSS selector
   * @param {HTMLSelectElement|string} [selectors.input] - Input device dropdown element or CSS selector
   * @param {HTMLSelectElement|string} [selectors.channel] - MIDI channel dropdown element or CSS selector
   * @param {Object} [options] - Configuration options
   * @param {Function} [options.onConnect] - Called when device connects ({ midi, device, type })
   * @param {Function} [options.onDisconnect] - Called when device disconnects ({ midi, type })
   * @param {Function} [options.onDeviceListChange] - Called when device list changes (for custom UI updates)
   * @returns {Promise<MIDIController>} The MIDI controller instance for chaining
   */
  async setupSelectors(selectors = {}, options = {}) {
    if (!this.midi) {
      throw new Error("MIDI controller not initialized. Pass midiController in constructor options.")
    }

    const selectElements = {}
    const { output: outputSelector, input: inputSelector, channel: channelSelector } = selectors

    const outputSelect = this._resolveSelector(outputSelector)
    const inputSelect = this._resolveSelector(inputSelector)
    const channelSelect = this._resolveSelector(channelSelector)

    this._setupDeviceChangeListeners({ output: outputSelect, input: inputSelect }, options.onDeviceListChange)

    if (outputSelect) {
      selectElements.output = outputSelect
      await this._populateOutputDeviceList(outputSelect)

      const handleOutputConnect = options.onConnect
        ? async (midi, device) => options.onConnect({ midi, device, type: "output" })
        : undefined
      const handleOutputDisconnect = options.onDisconnect
        ? async (midi) => options.onDisconnect({ midi, type: "output" })
        : undefined

      this._connectOutputDeviceSelection(outputSelect, handleOutputConnect, handleOutputDisconnect)
    }

    if (inputSelect) {
      selectElements.input = inputSelect
      await this._populateInputDeviceList(inputSelect)

      const handleInputConnect = options.onConnect
        ? async (midi, device) => options.onConnect({ midi, device, type: "input" })
        : undefined
      const handleInputDisconnect = options.onDisconnect
        ? async (midi) => options.onDisconnect({ midi, type: "input" })
        : undefined

      this._connectInputDeviceSelection(inputSelect, handleInputConnect, handleInputDisconnect)
    }

    if (channelSelect) {
      this._connectChannelSelection(channelSelect, "output")
    }

    return this.midi
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
    this.onConnectionUpdate(this.currentOutput, this.currentInput, this.midi)
  }

  /**
   * Set up listeners for MIDI device connection/disconnection events.
   * Automatically repopulates device lists and triggers callbacks when devices change.
   * @private
   * @param {Object} selectElements - Select elements to update
   * @param {HTMLSelectElement} [selectElements.output] - Output device dropdown
   * @param {HTMLSelectElement} [selectElements.input] - Input device dropdown
   * @param {Function} [onDeviceListChange] - Callback when device list changes
   */
  _setupDeviceChangeListeners(selectElements = {}, onDeviceListChange) {
    if (!this.midi || this._listenersInitialized) return

    this._listenersInitialized = true

    this.midi.on(CONTROLLER_EVENTS.DEV_OUT_CONNECTED, async (device) => {
      this.updateStatus(`Output device connected: ${device?.name || "Unknown"}`, "connected")
      if (selectElements.output) {
        await this._populateOutputDeviceList(selectElements.output)
      }
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.on(CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED, async (device) => {
      this.updateStatus(`Output device disconnected: ${device?.name || "Unknown"}`, "error")

      const wasCurrentDevice = this.currentOutput && device?.name === this.currentOutput.name

      if (wasCurrentDevice) {
        this.currentOutput = null
        this.updateConnectionStatus()
        if (selectElements.output) {
          selectElements.output.value = ""
        }
      }

      if (selectElements.output) {
        await this._populateOutputDeviceList(selectElements.output)
      }
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.on(CONTROLLER_EVENTS.DEV_IN_CONNECTED, async (device) => {
      this.updateStatus(`Input device connected: ${device?.name || "Unknown"}`, "connected")
      if (selectElements.input) {
        await this._populateInputDeviceList(selectElements.input)
      }
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })

    this.midi.on(CONTROLLER_EVENTS.DEV_IN_DISCONNECTED, async (device) => {
      this.updateStatus(`Input device disconnected: ${device?.name || "Unknown"}`, "error")
      if (selectElements.input) {
        selectElements.input.value = ""
        await this._populateInputDeviceList(selectElements.input)
      }
      if (onDeviceListChange) {
        onDeviceListChange()
      }
    })
  }

  /**
   * Resolve a selector to a DOM element
   * @private
   * @param {string|HTMLElement} selector - CSS selector string or DOM element
   * @returns {HTMLElement|null} The resolved element or null
   */
  _resolveSelector(selector) {
    if (typeof selector === "string") {
      const element = document.querySelector(selector)
      if (!element) {
        console.warn(`MIDIDeviceManager: Selector "${selector}" not found`)
      }
      return element
    }
    return selector || null
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
   * Connect output device selection events to automatically handle connections when
   * the user selects a device from a dropdown. Handles both connection and disconnection.
   * @private
   * @param {HTMLSelectElement} deviceSelectElement - The select element populated with output devices
   * @param {Function} [onConnect] - Callback when device is successfully connected (midi: MIDIController, device: Object)
   * @param {Function} [onDisconnect] - Callback when device is disconnected (midi: MIDIController)
   * @returns {void}
   */
  _connectOutputDeviceSelection(deviceSelectElement, onConnect, onDisconnect) {
    if (!deviceSelectElement || !this.midi) return

    deviceSelectElement.addEventListener("change", async (e) => {
      if (this.isConnecting) return
      this.isConnecting = true

      const deviceIndex = e.target.value

      if (!deviceIndex) {
        if (this.currentOutput && this.midi) {
          await this.midi.device.disconnectOutput()
          this.currentOutput = null
          this.updateStatus("Output device disconnected", "")
          this.updateConnectionStatus()
        }
        this.isConnecting = false

        if (onDisconnect) {
          await onDisconnect(this.midi)
        }
        return
      }

      try {
        await this.midi.device.connectOutput(parseInt(deviceIndex, 10))
        this.currentOutput = this.midi.device.getCurrentOutput()

        if (this.currentOutput) {
          const outputs = this.midi.device.getOutputs()
          const index = outputs.findIndex((o) => o.id === this.currentOutput.id)
          if (index !== -1) {
            deviceSelectElement.value = index.toString()
          }
        }

        this.updateConnectionStatus()

        if (onConnect) {
          await onConnect(this.midi, this.currentOutput)
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
   * @param {Function} [onConnect] - Callback when device is successfully connected (midi: MIDIController, device: Object)
   * @param {Function} [onDisconnect] - Callback when device is disconnected (midi: MIDIController)
   * @returns {void}
   */
  _connectInputDeviceSelection(deviceSelectElement, onConnect, onDisconnect) {
    if (!deviceSelectElement || !this.midi) return

    deviceSelectElement.addEventListener("change", async (e) => {
      const deviceIndex = e.target.value

      if (!deviceIndex) {
        if (this.midi) {
          await this.midi.device.disconnectInput()
          this.updateStatus("Input device disconnected", "")
          this.updateConnectionStatus()
        }

        if (onDisconnect) {
          await onDisconnect(this.midi)
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

      if (currentDevice) {
        const deviceIndex = devices.findIndex((d) => d.name === currentDevice.name)
        if (deviceIndex !== -1) {
          selectElement.value = deviceIndex.toString()
        } else {
          selectElement.value = ""
          if (isOutput) {
            this.currentOutput = null
            this.updateConnectionStatus()
          }
        }
      } else {
        selectElement.value = ""
      }

      selectElement.disabled = false
      if (isOutput && !this.currentOutput) {
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
    this._populateDeviceList(selectElement, outputs, this.currentOutput, onChange, true)
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
