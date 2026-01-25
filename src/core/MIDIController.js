import { clamp, normalize14BitValue, normalizeValue } from "../utils/midi.js"
import { EventEmitter } from "./EventEmitter.js"
import { MIDIValidationError } from "./errors.js"
import { CONNECTION_EVENTS, MIDIConnection } from "./MIDIConnection.js"

/**
 * Complete patch data structure for saving/loading controller state
 * @typedef {Object} PatchData
 * @memberof MIDIController
 * @property {string} name - Patch/preset name
 * @property {string|null} device - Output device name (if saved with device)
 * @property {string} timestamp - ISO timestamp when patch was created
 * @property {string} version - Patch format version (e.g., "1.0")
 * @property {Object.<number, ChannelData>} channels - Channel data indexed by channel number (1-16)
 * @property {Object.<string, SettingData>} settings - Control settings indexed by control key
 *
 * @example
 * const patch = {
 *   name: "My Synth Patch",
 *   device: "My MIDI Keyboard",
 *   timestamp: "2024-01-15T10:30:00.000Z",
 *   version: "1.0",
 *   channels: {
 *     1: {
 *       ccs: { 7: 100, 74: 64 },
 *       program: 5,
 *       pitchBend: 8192
 *     }
 *   },
 *   settings: {
 *     cc7: { min: 0, max: 127, invert: false, is14Bit: false, label: "Volume" }
 *   }
 * };
 */

/**
 * Channel-specific MIDI data
 * @typedef {Object} ChannelData
 * @memberof MIDIController
 * @property {Object.<number, number>} ccs - Control Change values indexed by CC number (0-127)
 * @property {Object.<number, number>} notes - Note on/off states indexed by note number (0-127)
 * @property {number} [program] - Program change value for the channel (0-127)
 * @property {number} [pitchBend] - Pitch bend value for the channel (0-16383, center=8192)
 * @property {number} [monoPressure] - Channel pressure/aftertouch value (0-127)
 * @property {Object.<number, number>} [polyPressure] - Polyphonic pressure values indexed by note number
 */

/**
 * Control binding settings
 * @typedef {Object} SettingData
 * @memberof MIDIController
 * @property {number} min - Minimum input value
 * @property {number} max - Maximum input value
 * @property {boolean} invert - Whether to invert the value mapping
 * @property {boolean} is14Bit - Whether this is a 14-bit CC control
 * @property {string|null} label - Optional display label
 * @property {string|null} elementId - Associated DOM element ID
 * @property {Function|null} onInput - Optional callback for value updates
 */

/**
 * Controller event constants. Events are organized by category and follow a consistent naming pattern:
 * - Core events (READY, ERROR, DESTROYED)
 * - Device events (DEV_*)
 * - Channel events (CH_*)
 * - System events (SYS_*)
 * - Patch events (PATCH_*)
 *
 * @namespace CONTROLLER_EVENTS
 * @property {string} READY="ready" - Emitted when controller is initialized and ready
 * @property {string} ERROR="error" - Emitted on errors
 * @property {string} DESTROYED="destroyed" - Emitted when controller is destroyed
 *
 * @property {string} DEV_OUT_CONNECTED="dev-out-connected" - Emitted when output device is connected
 * @property {string} DEV_OUT_DISCONNECTED="dev-out-disconnected" - Emitted when output device is disconnected
 * @property {string} DEV_IN_CONNECTED="dev-in-connected" - Emitted when input device is connected
 * @property {string} DEV_IN_DISCONNECTED="dev-in-disconnected" - Emitted when input device is disconnected
 *
 * @property {string} CH_CC_SEND="ch-cc-send" - Emitted when sending control change
 * @property {string} CH_CC_RECV="ch-cc-recv" - Emitted when receiving control change
 * @property {string} CH_NOTE_ON_SEND="ch-note-on-send" - Emitted when sending note on
 * @property {string} CH_NOTE_ON_RECV="ch-note-on-recv" - Emitted when receiving note on
 * @property {string} CH_NOTE_OFF_SEND="ch-note-off-send" - Emitted when sending note off
 * @property {string} CH_NOTE_OFF_RECV="ch-note-off-recv" - Emitted when receiving note off
 * @property {string} CH_PC_SEND="ch-pc-send" - Emitted when sending program change
 * @property {string} CH_PC_RECV="ch-pc-recv" - Emitted when receiving program change
 * @property {string} CH_PITCH_BEND_SEND="ch-pitch-bend-send" - Emitted when sending pitch bend
 * @property {string} CH_PITCH_BEND_RECV="ch-pitch-bend-recv" - Emitted when receiving pitch bend
 * @property {string} CH_MONO_PRESS_SEND="ch-mono-press-send" - Emitted when sending channel pressure
 * @property {string} CH_MONO_PRESS_RECV="ch-mono-press-recv" - Emitted when receiving channel pressure
 * @property {string} CH_POLY_PRESS_SEND="ch-poly-press-send" - Emitted when sending polyphonic pressure
 * @property {string} CH_POLY_PRESS_RECV="ch-poly-press-recv" - Emitted when receiving polyphonic pressure
 * @property {string} CH_ALL_SOUNDS_OFF_SEND="ch-all-sounds-off-send" - Emitted when sending all sounds off
 * @property {string} CH_RESET_CONTROLLERS_SEND="ch-reset-controllers-send" - Emitted when sending reset all controllers
 * @property {string} CH_LOCAL_CONTROL_SEND="ch-local-control-send" - Emitted when sending local control
 * @property {string} CH_ALL_NOTES_OFF_SEND="ch-all-notes-off-send" - Emitted when sending all notes off
 * @property {string} CH_OMNI_OFF_SEND="ch-omni-off-send" - Emitted when sending omni mode off
 * @property {string} CH_OMNI_ON_SEND="ch-omni-on-send" - Emitted when sending omni mode on
 * @property {string} CH_MONO_ON_SEND="ch-mono-on-send" - Emitted when sending mono mode on
 * @property {string} CH_POLY_ON_SEND="ch-poly-on-send" - Emitted when sending poly mode on
 *
 * @property {string} SYS_EX_SEND="sys-ex-send" - Emitted when sending SysEx
 * @property {string} SYS_EX_RECV="sys-ex-recv" - Emitted when receiving SysEx
 * @property {string} SYS_CLOCK_RECV="sys-clock-recv" - Emitted when receiving MIDI clock
 * @property {string} SYS_START_RECV="sys-start-recv" - Emitted when receiving start command
 * @property {string} SYS_CONTINUE_RECV="sys-continue-recv" - Emitted when receiving continue command
 * @property {string} SYS_STOP_RECV="sys-stop-recv" - Emitted when receiving stop command
 * @property {string} SYS_MTC_RECV="sys-mtc-recv" - Emitted when receiving MTC
 * @property {string} SYS_SONG_POS_RECV="sys-song-pos-recv" - Emitted when receiving song position
 * @property {string} SYS_SONG_SEL_RECV="sys-song-sel-recv" - Emitted when receiving song selection
 * @property {string} SYS_TUNE_REQ_RECV="sys-tune-req-recv" - Emitted when receiving tune request
 * @property {string} SYS_ACT_SENSE_RECV="sys-act-sense-recv" - Emitted when receiving active sensing
 * @property {string} SYS_RESET_RECV="sys-reset-recv" - Emitted when receiving system reset
 *
 * @property {string} MIDI_RAW="midi-raw" - Emitted for unhandled raw MIDI messages
 *
 * @property {string} PATCH_SAVED="patch-saved" - Emitted when a patch is saved
 * @property {string} PATCH_LOADED="patch-loaded" - Emitted when a patch is loaded
 * @property {string} PATCH_DELETED="patch-deleted" - Emitted when a patch is deleted
 *
 * @example
 * // Listen for controller ready
 * midi.on(CONTROLLER_EVENTS.READY, (controller) => {
 *   console.log("MIDI ready!");
 * });
 *
 * @example
 * // Listen for CC messages (both send and receive)
 * midi.on(CONTROLLER_EVENTS.CH_CC_SEND, ({ cc, value, channel }) => {
 *   console.log(`Sent CC ${cc}: ${value} on channel ${channel}`);
 * });
 *
 * midi.on(CONTROLLER_EVENTS.CH_CC_RECV, ({ cc, value, channel }) => {
 *   console.log(`Received CC ${cc}: ${value} on channel ${channel}`);
 * });
 *
 * @example
 * // Listen for device connections
 * midi.on(CONTROLLER_EVENTS.DEV_OUT_CONNECTED, (device) => {
 *   console.log(`Output connected: ${device.name}`);
 * });
 *
 * @example
 * // Using the short alias (CTRL)
 * midi.on(CTRL.READY, (controller) => {
 *   console.log("MIDI ready!");
 * });
 */
export const CONTROLLER_EVENTS = {
  // Core controller events
  READY: "ready",
  ERROR: "error",
  DESTROYED: "destroyed",

  // Device events (midi.device.*)
  DEV_OUT_CONNECTED: "dev-out-connected",
  DEV_OUT_DISCONNECTED: "dev-out-disconnected",
  DEV_IN_CONNECTED: "dev-in-connected",
  DEV_IN_DISCONNECTED: "dev-in-disconnected",

  // Channel Voice Messages (midi.channel.*)
  CH_CC_SEND: "ch-cc-send",
  CH_CC_RECV: "ch-cc-recv",
  CH_NOTE_ON_SEND: "ch-note-on-send",
  CH_NOTE_ON_RECV: "ch-note-on-recv",
  CH_NOTE_OFF_SEND: "ch-note-off-send",
  CH_NOTE_OFF_RECV: "ch-note-off-recv",
  CH_PC_SEND: "ch-pc-send",
  CH_PC_RECV: "ch-pc-recv",
  CH_PITCH_BEND_SEND: "ch-pitch-bend-send",
  CH_PITCH_BEND_RECV: "ch-pitch-bend-recv",
  CH_MONO_PRESS_SEND: "ch-mono-press-send",
  CH_MONO_PRESS_RECV: "ch-mono-press-recv",
  CH_POLY_PRESS_SEND: "ch-poly-press-send",
  CH_POLY_PRESS_RECV: "ch-poly-press-recv",
  CH_ALL_SOUNDS_OFF_SEND: "ch-all-sounds-off-send",
  CH_RESET_CONTROLLERS_SEND: "ch-reset-controllers-send",
  CH_LOCAL_CONTROL_SEND: "ch-local-control-send",
  CH_ALL_NOTES_OFF_SEND: "ch-all-notes-off-send",
  CH_OMNI_OFF_SEND: "ch-omni-off-send",
  CH_OMNI_ON_SEND: "ch-omni-on-send",
  CH_MONO_ON_SEND: "ch-mono-on-send",
  CH_POLY_ON_SEND: "ch-poly-on-send",

  // System Messages (midi.system.*)
  SYS_EX_SEND: "sys-ex-send",
  SYS_EX_RECV: "sys-ex-recv",
  SYS_CLOCK_RECV: "sys-clock-recv",
  SYS_START_RECV: "sys-start-recv",
  SYS_CONTINUE_RECV: "sys-continue-recv",
  SYS_STOP_RECV: "sys-stop-recv",
  SYS_MTC_RECV: "sys-mtc-recv",
  SYS_SONG_POS_RECV: "sys-song-pos-recv",
  SYS_SONG_SEL_RECV: "sys-song-sel-recv",
  SYS_TUNE_REQ_RECV: "sys-tune-req-recv",
  SYS_ACT_SENSE_RECV: "sys-act-sense-recv",
  SYS_RESET_RECV: "sys-reset-recv",

  // Raw MIDI messages
  MIDI_RAW: "midi-raw",

  // Patch events (midi.patch.*)
  PATCH_SAVED: "patch-saved",
  PATCH_LOADED: "patch-loaded",
  PATCH_DELETED: "patch-deleted",
}

/**
 * Main controller for browser-based MIDI operations. Provides APIs for:
 * - Device management (connect/disconnect, enumerate devices)
 * - Control binding (DOM elements <-> MIDI CC)
 * - MIDI messaging (send/receive CC, Note, SysEx)
 * - Patch management (save/load presets)
 * - Event handling (MIDI messages, connection changes, errors)
 * @extends EventEmitter
 *
 * @example
 * // Basic initialization
 * const midi = new MIDIController({ inputChannel: 1, outputChannel: 1 });
 * await midi.init();
 *
 * @example
 * // Bind UI controls to MIDI CCs
 * const volumeSlider = document.getElementById("volume");
 * midi.bind(volumeSlider, { cc: 7 }); // Bind CC 7 (volume)
 *
 * @example
 * // Send MIDI messages
 * midi.channel.sendCC(74, 64); // Send CC 74 (filter cutoff) value 64
 * midi.channel.sendNoteOn(60, 100); // Play middle C with velocity 100
 * midi.channel.sendNoteOff(60); // Stop middle C
 *
 * @example
 * // Listen for MIDI events
 * midi.on(CONTROLLER_EVENTS.CH_CC_RECV, ({ cc, value, channel }) => {
 *   console.log(`CC ${cc} received: ${value}`);
 * });
 *
 * @example
 * // Save and load patches
 * const patch = midi.patch.get("My Patch");
 * midi.patch.save("My Patch");
 * midi.patch.load("My Patch");
 */
export class MIDIController extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.inputChannel=1] - Input MIDI channel (1-16)
   * @param {number} [options.outputChannel=1] - Output MIDI channel (1-16)
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
      inputChannel: 1,
      outputChannel: 1,
      autoConnect: true,
      sysex: false,
      ...options,
    }

    this.connection = null
    this.bindings = new Map()
    this.state = {
      controlChange: new Map(), // ${channel}:${cc} -> value
      programChange: new Map(), // ${channel} -> program
      pitchBend: new Map(), // ${channel} -> value (0-16383)
      monoPressure: new Map(), // ${channel} -> pressure
      polyPressure: new Map(), // ${channel}:${note} -> pressure
    }
    this.initialized = false

    // Initialize namespaces after all methods are defined
    this._initNamespaces()
  }

  /**
   * Initialize MIDI access. Requests browser permission and connects to devices.
   * Emits "ready" event on success, "error" event on failure.
   *
   * @returns {Promise<void>}
   * @throws {MIDIAccessError} If MIDI access is denied or browser doesn't support Web MIDI
   *
   * @emits CONTROLLER_EVENTS.READY - When initialization succeeds
   * @emits CONTROLLER_EVENTS.ERROR - When initialization fails
   *
   * @example
   * // Basic initialization
   * const midi = new MIDIController();
   * await midi.init();
   *
   * @example
   * // Initialization with custom options
   * const midi = new MIDIController({
   *   channel: 2,
   *   sysex: true,
   *   autoConnect: false
   * });
   * await midi.init();
   *
   * @example
   * // With event listeners
   * const midi = new MIDIController();
   * midi.on(CONTROLLER_EVENTS.READY, (controller) => {
   *   console.log("MIDI ready!");
   * });
   * midi.on(CONTROLLER_EVENTS.ERROR, (error) => {
   *   console.error("MIDI error:", error);
   * });
   * await midi.init();
   */
  async init() {
    if (this.initialized) {
      console.warn("MIDI Controller already initialized")
      return
    }

    try {
      this.connection = new MIDIConnection({
        sysex: this.options.sysex,
      })

      await this.connection.requestAccess()

      // Set up device change listeners for physical connect/disconnect
      this.connection.on(CONNECTION_EVENTS.DEVICE_CHANGE, async ({ state, type, device }) => {
        try {
          if (state === "connected") {
            // Emit connected event when device is physically connected
            if (type === "output") {
              this.emit(CONTROLLER_EVENTS.DEV_OUT_CONNECTED, device)
            } else if (type === "input") {
              this.emit(CONTROLLER_EVENTS.DEV_IN_CONNECTED, device)
            }
          } else if (state === "disconnected") {
            // Emit disconnection event for any output device that disconnects
            if (type === "output" && device) {
              // Check if this is the current output device
              const currentOutput = this.connection.getCurrentOutput()
              if (currentOutput && currentOutput.id === device.id) {
                await this._disconnectOutput()
              } else {
                // Only emit if not the current device (current device emits in _disconnectOutput)
                this.emit(CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED, device)
              }
            }

            // Emit disconnection event for any input device that disconnects
            if (type === "input" && device) {
              // Check if this is the current input device
              const currentInput = this.connection.getCurrentInput()
              if (currentInput && currentInput.id === device.id) {
                await this._disconnectInput()
              } else {
                // Only emit if not the current device (current device emits in _disconnectInput)
                this.emit(CONTROLLER_EVENTS.DEV_IN_DISCONNECTED, device)
              }
            }
          }
        } catch (error) {
          console.error("Error in device change handler:", error)
          this.emit(CONTROLLER_EVENTS.ERROR, error)
        }
      })

      if (this.options.autoConnect) {
        await this.connection.connect(this.options.output)
      }

      // Connect input if specified
      if (this.options.input !== undefined) {
        await this._connectInput(this.options.input)
      }

      this.initialized = true
      this.emit(CONTROLLER_EVENTS.READY, this)
      this.options.onReady?.(this)
    } catch (err) {
      this.emit(CONTROLLER_EVENTS.ERROR, err)
      this.options.onError?.(err)
      throw err
    }
  }

  /**
   * Initialize namespace bindings
   * This must be called after all private methods are defined
   * @private
   */
  _initNamespaces() {
    /**
     * Device-related MIDI operations
     * @namespace
     */
    this.device = {
      /**
       * Connect to a MIDI output device
       * @param {string|number} device - Device name, ID, or index
       * @returns {Promise<void>}
       * @example
       * // Connect by device name
       * await midi.device.connect("Korg minilogue xd");
       *
       * @example
       * // Connect by device index
       * await midi.device.connect(0);
       */
      connect: this._connect.bind(this),
      /**
       * Disconnect from current MIDI device
       * @returns {Promise<void>}
       */
      disconnect: this._disconnect.bind(this),
      /**
       * Connect to a MIDI input device
       * @param {string|number} device - Device name, ID, or index
       * @returns {Promise<void>}
       * @example
       * // Connect to device by name
       * await midi.device.connectInput("Korg microKEY");
       */
      connectInput: this._connectInput.bind(this),
      /**
       * Disconnect from the MIDI input device
       * @returns {Promise<void>}
       * @example
       * await midi.device.disconnectInput();
       */
      disconnectInput: this._disconnectInput.bind(this),
      /**
       * Switch to a different output device
       * @param {string|number} output - New device name, ID, or index
       * @returns {Promise<void>}
       */
      connectOutput: this._connectOutput.bind(this),
      /**
       * Disconnect from the MIDI output device
       * @returns {Promise<void>}
       * @example
       * await midi.device.disconnectOutput();
       */
      disconnectOutput: this._disconnectOutput.bind(this),
      /**
       * Get current output device info
       * @returns {Object|null} Device info with id, name, manufacturer
       * @example
       * const device = midi.device.getCurrentOutput();
       * if (device) {
       *   console.log(`Connected to ${device.name}`);
       * }
       */
      getCurrentOutput: this._getCurrentOutput.bind(this),
      /**
       * Get current input device info
       * @returns {Object|null} Device info with id, name, manufacturer
       */
      getCurrentInput: this._getCurrentInput.bind(this),
      /**
       * List all available MIDI output devices
       * @returns {Array<{id: string, name: string, manufacturer: string}>}
       * @example
       * const outputs = midi.device.getOutputs();
       * outputs.forEach(device => {
       *   console.log(`${device.name} by ${device.manufacturer}`);
       * });
       */
      getOutputs: this._getOutputs.bind(this),
      /**
       * List all available MIDI input devices
       * @returns {Array<{id: string, name: string, manufacturer: string}>}
       */
      getInputs: this._getInputs.bind(this),
    }

    /**
     * Channel-specific MIDI operations
     * @namespace
     */
    this.channel = {
      /**
       * Send a note on message
       * @param {number} note - Note number (0-127)
       * @param {number} [velocity=64] - Note velocity (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {void}
       * @example
       * // Play middle C (60) with velocity 100
       * midi.channel.sendNoteOn(60, 100);
       *
       * @example
       * // Play note 64 (E4) on channel 5
       * midi.channel.sendNoteOn(64, 80, 5);
       */
      sendNoteOn: this._sendNoteOn.bind(this),
      /**
       * Send a note off message
       * @param {number} note - Note number (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @param {number} [velocity=0] - Release velocity (0-127)
       * @returns {void}
       * @example
       * // Stop middle C
       * midi.channel.sendNoteOff(60);
       */
      sendNoteOff: this._sendNoteOff.bind(this),
      /**
       * Send a control change message
       * @param {number} cc - CC number (0-127, e.g., 7 for volume, 74 for filter cutoff)
       * @param {number} value - CC value (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {void}
       * @example
       * // Set volume (CC 7) to 100 on default channel
       * midi.channel.sendCC(7, 100);
       *
       * @example
       * // Set filter cutoff (CC 74) to 64 on channel 2
       * midi.channel.sendCC(74, 64, 2);
       */
      sendCC: this._sendCC.bind(this),
      /**
       * Get current value of a CC
       * @param {number} cc - CC number (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {number|undefined} Current CC value or undefined if not set
       * @example
       * const volume = midi.channel.getCC(7);
       * if (volume !== undefined) {
       *   console.log(`Current volume: ${volume}`);
       * }
       */
      getCC: this._getCC.bind(this),
      /**
       * Send a program change message
       * @param {number} program - Program number (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {void}
       * @example
       * // Change to program 5 on default channel
       * midi.channel.sendPC(5);
       */
      sendPC: this._sendPC.bind(this),
      /**
       * Get current program for a channel
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {number|undefined} Current program or undefined if not set
       */
      getPC: this._getPC.bind(this),
      /**
       * Send a pitch bend message
       * @param {number} value - Pitch bend value (0-16383, center = 8192)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {void}
       * @example
       * // Bend pitch up (value > 8192)
       * midi.channel.sendPitchBend(10000);
       *
       * @example
       * // Return to center (no bend)
       * midi.channel.sendPitchBend(8192);
       */
      sendPitchBend: this._sendPitchBend.bind(this),
      /**
       * Get current pitch bend value for a channel
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {number|undefined} Current pitch bend value or undefined if not set
       */
      getPitchBend: this._getPitchBend.bind(this),
      /**
       * Send a channel pressure (aftertouch) message
       * @param {number} pressure - Pressure value (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {void}
       * @example
       * // Send channel pressure at max (127)
       * midi.channel.sendMonoPressure(127);
       */
      sendMonoPressure: this._sendMonoPressure.bind(this),
      /**
       * Get current channel pressure for a channel
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {number|undefined} Current pressure value or undefined if not set
       */
      getMonoPressure: this._getMonoPressure.bind(this),
      /**
       * Send a polyphonic key pressure (polyphonic aftertouch) message
       * @param {number} note - Note number (0-127)
       * @param {number} pressure - Pressure value (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {void}
       * @example
       * // Send poly pressure for middle C
       * midi.channel.sendPolyPressure(60, 100);
       */
      sendPolyPressure: this._sendPolyPressure.bind(this),
      /**
       * Get current polyphonic pressure for a note on a channel
       * @param {number} note - Note number (0-127)
       * @param {number} [channel] - MIDI channel (defaults to controller's default channel)
       * @returns {number|undefined} Current pressure value or undefined if not set
       */
      getPolyPressure: this._getPolyPressure.bind(this),
      /**
       * Send All Sounds Off message (CC 120, value 0)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       * @example
       * // Stop all sounds on channel 1
       * midi.channel.allSoundsOff(1);
       *
       * @example
       * // Send to all channels
       * midi.channel.allSoundsOff();
       */
      allSoundsOff: this._allSoundsOff.bind(this),
      /**
       * Send Reset All Controllers message (CC 121, value 0)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       */
      resetControllers: this._resetControllers.bind(this),
      /**
       * Send Local Control On/Off message (CC 122)
       * @param {boolean} enabled - true for on (value 127), false for off (value 0)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       * @example
       * // Turn off local control on channel 1
       * midi.channel.localControl(false, 1);
       */
      localControl: this._localControl.bind(this),
      /**
       * Send All Notes Off message (CC 123, value 0)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       */
      allNotesOff: this._allNotesOff.bind(this),
      /**
       * Send Omni Mode Off message (CC 124, value 0)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       */
      omniOff: this._omniOff.bind(this),
      /**
       * Send Omni Mode On message (CC 125, value 0)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       */
      omniOn: this._omniOn.bind(this),
      /**
       * Send Mono Mode On message (CC 126)
       * @param {number} [channels=1] - Number of channels for mono mode (0-16, 0=omni)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       */
      monoOn: this._monoOn.bind(this),
      /**
       * Send Poly Mode On message (CC 127, value 0)
       * @param {number} [channel] - MIDI channel (1-16). If not provided, sends to all channels
       * @returns {void}
       */
      polyOn: this._polyOn.bind(this),
    }

    /**
     * System-level MIDI operations
     * @namespace
     */
    this.system = {
      /**
       * Send a SysEx message
       * @param {Array<number>} data - SysEx data bytes (0-127)
       * @param {boolean} [includeWrapper=false] - If true, data already includes F0/F7
       * @returns {void}
       * @throws {Error} If SysEx not enabled in controller options
       * @example
       * // Send data with wrapper
       * midi.system.sendEx([0xF0, 0x42, 0x30, 0x00, 0x01, 0x2F, 0x12, 0xF7], true);
       *
       * @example
       * // Send data without wrapper (wrapper added automatically)
       * midi.system.sendEx([0x42, 0x30, 0x00, 0x7F]);
       */
      sendEx: function (data, includeWrapper = false) {
        return this._sendSysEx(data, includeWrapper)
      }.bind(this),
      /**
       * Send a timing clock message (0xF8)
       * Typically used for synchronizing tempo-dependent devices
       * @returns {void}
       * @example
       * // Send clock pulse (usually 24 pulses per quarter note)
       * midi.system.sendClock();
       */
      sendClock: this._sendClock.bind(this),
      /**
       * Send a start message (0xFA)
       * Indicates start of playback from beginning of song
       * @returns {void}
       */
      start: this._sendStart.bind(this),
      /**
       * Send a continue message (0xFB)
       * Indicates resume playback from current position
       * @returns {void}
       */
      continue: this._sendContinue.bind(this),
      /**
       * Send a stop message (0xFC)
       * Indicates stop playback
       * @returns {void}
       */
      stop: this._sendStop.bind(this),
      /**
       * Send an MTC quarter frame message
       * @param {number} data - MTC quarter frame data (0-127)
       * @returns {void}
       * @example
       * midi.system.sendMTC(0x00); // First quarter frame
       */
      sendMTC: this._sendMTC.bind(this),
      /**
       * Send a song position pointer message
       * @param {number} position - Song position in beats (0-16383)
       * @returns {void}
       * @example
       * midi.system.sendSongPosition(0); // Beginning of song
       */
      sendSongPosition: this._sendSongPosition.bind(this),
      /**
       * Send a song select message
       * @param {number} song - Song/sequence number (0-127)
       * @returns {void}
       * @example
       * midi.system.sendSongSelect(0); // Select first song
       */
      sendSongSelect: this._sendSongSelect.bind(this),
      /**
       * Send a tune request message (0xF6)
       * Requests analog synthesizers to tune themselves
       * @returns {void}
       */
      sendTuneRequest: this._sendTuneRequest.bind(this),
      /**
       * Send an active sensing message (0xFE)
       * Used to indicate controller is still active
       * @returns {void}
       */
      sendActiveSensing: this._sendActiveSensing.bind(this),
      /**
       * Send a system reset message (0xFF)
       * Resets all devices to power-up default state
       * @returns {void}
       */
      sendSystemReset: this._sendSystemReset.bind(this),
    }

    /**
     * Patch management operations
     * @namespace
     */
    this.patch = {
      /**
       * Get current state as a patch object
       * @param {string} [name="Unnamed Patch"] - Patch name
       * @returns {PatchData} Patch data object
       * @example
       * const patch = midi.patch.get("My Patch");
       * console.log(patch.channels);
       */
      get: this._getPatch.bind(this),
      /**
       * Apply a patch to the controller
       * @param {PatchData} patch - Patch object to apply
       * @returns {Promise<void>}
       * @throws {MIDIValidationError} If patch format is invalid
       * @example
       * const patch = { name: "My Patch", channels: { 1: { ccs: { 7: 100 } } } };
       * await midi.patch.set(patch);
       */
      set: this._setPatch.bind(this),
      /**
       * Save a patch to localStorage
       * @param {string} name - Patch name
       * @param {Object} [patch] - Optional patch object (will use get() if not provided)
       * @returns {string} Storage key used
       * @example
       * midi.patch.save("My Favorite Settings");
       */
      save: this._savePatch.bind(this),
      /**
       * Load a patch from localStorage
       * @param {string} name - Patch name
       * @returns {PatchData|null} Patch object or null if not found
       * @example
       * const patch = midi.patch.load("My Patch");
       * if (patch) {
       *   await midi.patch.set(patch);
       * }
       */
      load: this._loadPatch.bind(this),
      /**
       * Delete a patch from localStorage
       * @param {string} name - Patch name
       * @returns {boolean} Success
       * @example
       * const success = midi.patch.delete("Old Patch");
       */
      delete: this._deletePatch.bind(this),
      /**
       * List all saved patches
       * @returns {Array<{name: string, patch: PatchData}>} Array of patch objects with name and data
       * @example
       * const patches = midi.patch.list();
       * patches.forEach(p => {
       *   console.log(p.name);
       * });
       */
      list: this._listPatches.bind(this),
    }
  }

  /**
   * Bind a DOM element to a MIDI CC for bidirectional control. Automatically handles
   * value normalization based on element type (slider, knob, etc.) and MIDI range (0-127).
   * Sends initial MIDI value when binding if controller is initialized.
   *
   * @param {HTMLElement} element - DOM element to bind (e.g., input range, number input)
   * @param {Object} config - Binding configuration
   * @param {number} config.cc - CC number (0-127, e.g., 7 for volume, 74 for filter cutoff)
   * @param {number} [config.min=0] - Minimum input value (auto-detected from element if available)
   * @param {number} [config.max=127] - Maximum input value (auto-detected from element if available)
   * @param {number} [config.channel] - MIDI channel (defaults to controller's default channel)
   * @param {boolean} [config.invert=false] - Invert the value mapping
   * @param {boolean} [config.is14Bit=false] - Use 14-bit CC (MSB + LSB, requires msb/lsb config)
   * @param {number} [config.msb] - MSB CC number for 14-bit control
   * @param {number} [config.lsb] - LSB CC number for 14-bit control
   * @param {Function} [config.onInput] - Optional callback for value updates (receives normalized element value)
   * @param {Object} [options={}] - Additional options
   * @param {number} [options.debounce=0] - Debounce delay in ms for high-frequency updates
   * @returns {Function} Unbind function - Call to remove binding and cleanup event listeners
   *
   * @example
   * // Basic slider binding
   * const volumeSlider = document.getElementById("volume");
   * const unbindVolume = midi.bind(volumeSlider, { cc: 7 }); // CC 7 = Channel Volume
   *
   * @example
   * // Binding with custom range and inversion
   * const filterKnob = document.getElementById("filter");
   * midi.bind(filterKnob, {
   *   cc: 74,        // CC 74 = Filter Cutoff
   *   min: 0,        // Knob minimum value
   *   max: 127,      // Knob maximum value
   *   invert: true   // Invert value (useful for cutoff - higher CC = brighter)
   * });
   *
   * @example
   * // 14-bit high-resolution control
   * const fineTune = document.getElementById("fine-tune");
   * midi.bind(fineTune, {
   *   is14Bit: true,
   *   msb: 0,    // CC 0 = MSB
   *   lsb: 32    // CC 32 = LSB
   * });
   *
   * @example
   * // With debouncing for high-frequency updates
   * const lfoRate = document.getElementById("lfo-rate");
   * midi.bind(lfoRate, { cc: 76 }, { debounce: 50 }); // 50ms debounce
   *
   * @example
   * // Using callback to update display
   * const pitchSlider = document.getElementById("pitch");
   * const pitchDisplay = document.getElementById("pitch-value");
   * midi.bind(pitchSlider, {
   *   cc: 75,
   *   onInput: (value) => {
   *     pitchDisplay.textContent = Math.round(value);
   *   }
   * });
   */
  bind(element, config, options = {}) {
    if (!element) {
      console.warn("Cannot bind: element is null or undefined")
      return () => {}
    }

    const binding = this._createBinding(element, config, options)
    this.bindings.set(element, binding)

    // Send initial value
    if (this.initialized && this.connection?.isConnected()) {
      binding.handler({ target: element })
    }

    return () => this.unbind(element)
  }

  /**
   * Create a binding between an element and MIDI CC
   * @private
   * @param {HTMLElement} element - DOM element to bind
   * @param {Object} config - Binding configuration
   * @param {Object} options - Additional binding options
   * @returns {Object} Binding object with element, config, handler, and destroy function
   */
  _createBinding(element, config, options = {}) {
    const {
      min = parseFloat(element.getAttribute("min")) || 0,
      max = parseFloat(element.getAttribute("max")) || 127,
      channel,
      invert = false,
      onInput = undefined,
    } = config
    const { debounce = 0 } = options

    // Store resolved values back to config for patch saving
    // Don't store channel if not explicitly provided - use dynamic midi.options.channel
    const resolvedConfig = {
      ...config,
      min,
      max,
      invert,
      onInput,
    }
    if (channel !== undefined) {
      resolvedConfig.channel = channel
    }

    // Handle 14-bit CC (MSB + LSB)
    if (config.is14Bit) {
      const { msb, lsb } = config

      const handler = (event) => {
        const value = parseFloat(event.target.value)

        if (Number.isNaN(value)) return

        // Normalize to 14-bit range (0-16383)
        const { msb: msbValue, lsb: lsbValue } = normalize14BitValue(value, min, max, invert)

        // Send MSB and LSB using dynamic channel
        const channelToUse = channel || this.options.outputChannel
        this._sendCC(msb, msbValue, channelToUse)
        this._sendCC(lsb, lsbValue, channelToUse)
      }

      // Add debouncing if specified
      let timeoutId = null
      const debouncedHandler =
        debounce > 0
          ? (event) => {
              if (timeoutId) clearTimeout(timeoutId)
              timeoutId = setTimeout(() => {
                handler(event)
                timeoutId = null
              }, debounce)
            }
          : handler

      element.addEventListener("input", debouncedHandler)
      element.addEventListener("change", debouncedHandler)

      return {
        element,
        config: resolvedConfig,
        handler,
        destroy: () => {
          if (timeoutId) clearTimeout(timeoutId)
          element.removeEventListener("input", debouncedHandler)
          element.removeEventListener("change", debouncedHandler)
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

      // Use dynamic channel from midi.options.outputChannel
      const channelToUse = channel === undefined ? this.options.outputChannel : channel
      this._sendCC(cc, midiValue, channelToUse)
    }

    // Add debouncing if specified
    let timeoutId = null
    const debouncedHandler =
      debounce > 0
        ? (event) => {
            if (timeoutId) clearTimeout(timeoutId)
            timeoutId = setTimeout(() => {
              handler(event)
              timeoutId = null
            }, debounce)
          }
        : handler

    element.addEventListener("input", debouncedHandler)
    element.addEventListener("change", debouncedHandler)

    return {
      element,
      config: resolvedConfig,
      handler,
      destroy: () => {
        if (timeoutId) clearTimeout(timeoutId)
        element.removeEventListener("input", debouncedHandler)
        element.removeEventListener("change", debouncedHandler)
      },
    }
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
   * Clean up resources
   * @returns {Promise<void>}
   */
  async destroy() {
    for (const binding of this.bindings.values()) {
      binding.destroy()
    }
    this.bindings.clear()
    this.state.controlChange.clear()
    this.state.programChange.clear()
    this.state.pitchBend.clear()
    this.state.monoPressure.clear()
    this.state.polyPressure.clear()
    await this._disconnect()
    this.initialized = false
    this.emit(CONTROLLER_EVENTS.DESTROYED)
    this.removeAllListeners()
  }

  /**
   * Connect to MIDI output device
   * @private
   * @param {string|number|undefined} device - Device identifier (name, ID, index) or undefined for auto-connect
   * @returns {Promise<void>}
   */
  async _connect(device) {
    if (device) {
      await this.connection.connect(device)
    } else if (this.options.output !== undefined) {
      await this.connection.connect(this.options.output)
    } else if (this.options.autoConnect) {
      await this.connection.connect()
    }
  }

  /**
   * Disconnect from current MIDI output device
   * @private
   * @returns {Promise<void>}
   */
  async _disconnect() {
    this.connection.disconnect()
  }

  /**
   * Connect to MIDI input device
   * @private
   * @param {string|number} device - Input device identifier (name, ID, index)
   * @returns {Promise<void>}
   */
  async _connectInput(device) {
    await this.connection.connectInput(device, (event) => {
      this._handleMIDIMessage(event)
    })
    this.emit(CONTROLLER_EVENTS.DEV_IN_CONNECTED, this.connection.getCurrentInput())
  }

  /**
   * Disconnect from MIDI input device
   * @private
   * @returns {Promise<void>}
   */
  async _disconnectInput() {
    const currentInput = this.connection.getCurrentInput()
    this.connection.disconnectInput()
    this.emit(CONTROLLER_EVENTS.DEV_IN_DISCONNECTED, currentInput)
  }

  /**
   * Connect to MIDI output device
   * @private
   * @param {string|number} output - Output device identifier (name, ID, index)
   * @returns {Promise<void>}
   */
  async _connectOutput(output) {
    await this.connection.connect(output)
    this.emit(CONTROLLER_EVENTS.DEV_OUT_CONNECTED, this.connection.getCurrentOutput())
  }

  /**
   * Disconnect from MIDI output device
   * @private
   * @returns {Promise<void>}
   */
  async _disconnectOutput() {
    const currentOutput = this.connection.getCurrentOutput()
    this.connection.disconnectOutput()
    this.emit(CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED, currentOutput)
  }

  /**
   * Get current output device information
   * @private
   * @returns {Object|null} Current output device info with id, name, manufacturer or null if not connected
   */
  _getCurrentOutput() {
    return this.connection?.getCurrentOutput() || null
  }

  /**
   * Get current input device information
   * @private
   * @returns {Object|null} Current input device info with id, name, manufacturer or null if not connected
   */
  _getCurrentInput() {
    return this.connection?.getCurrentInput() || null
  }

  /**
   * Get list of available MIDI output devices
   * @private
   * @returns {Array<Object>} Array of output device objects with id, name, manufacturer
   */
  _getOutputs() {
    return this.connection?.getOutputs() || []
  }

  /**
   * Get list of available MIDI input devices
   * @private
   * @returns {Array<Object>} Array of input device objects with id, name, manufacturer
   */
  _getInputs() {
    return this.connection?.getInputs() || []
  }

  /**
   * Send raw MIDI data
   * @param {Array<number>} data - MIDI message bytes
   */
  send(data) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }
    this.connection.send(data)
  }

  /**
   * Send Note On message
   * @private
   * @param {number} note - Note number (0-127)
   * @param {number} velocity - Note velocity (0-127, default 64)
   * @param {number} channel - MIDI channel (1-16, default outputChannel)
   * @returns {void}
   */
  _sendNoteOn(note, velocity = 64, channel = this.options.outputChannel) {
    if (!this.initialized) return

    note = clamp(Math.round(note), 0, 127)
    velocity = clamp(Math.round(velocity), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0x90 + (channel - 1)
    this.connection.send([status, note, velocity])

    this.emit(CONTROLLER_EVENTS.CH_NOTE_ON_SEND, { note, velocity, channel })
  }

  /**
   * Send Note Off message
   * @private
   * @param {number} note - Note number (0-127)
   * @param {number} channel - MIDI channel (1-16, default outputChannel)
   * @param {number} velocity - Release velocity (0-127, default 0)
   * @returns {void}
   */
  _sendNoteOff(note, channel = this.options.outputChannel, velocity = 0) {
    if (!this.initialized) return

    note = clamp(Math.round(note), 0, 127)
    velocity = clamp(Math.round(velocity), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    // Use Note On with velocity 0 for better compatibility with some synths
    const status = 0x90 + (channel - 1)
    this.connection.send([status, note, velocity])

    this.emit(CONTROLLER_EVENTS.CH_NOTE_OFF_SEND, { note, channel, velocity })
  }

  /**
   * Send Control Change message
   * @private
   * @param {number} cc - CC number (0-127)
   * @param {number} value - CC value (0-127)
   * @param {number} channel - MIDI channel (1-16, default outputChannel)
   * @returns {void}
   */
  _sendCC(cc, value, channel = this.options.outputChannel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    // Validate inputs
    cc = clamp(Math.round(cc), 0, 127)
    value = clamp(Math.round(value), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0xb0 + (channel - 1) // Control Change status
    this.connection.send([status, cc, value])

    const key = `${channel}:${cc}`
    this.state.controlChange.set(key, value)

    this.emit(CONTROLLER_EVENTS.CH_CC_SEND, { cc, value, channel })
  }

  /**
   * Send Program Change message
   * @private
   * @param {number} program - Program number (0-127)
   * @param {number} channel - MIDI channel (1-16, default outputChannel)
   * @returns {void}
   */
  _sendPC(program, channel = this.options.outputChannel) {
    if (!this.initialized) return

    program = clamp(Math.round(program), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0xc0 + (channel - 1)
    this.connection.send([status, program])

    this.state.programChange.set(channel.toString(), program)

    this.emit(CONTROLLER_EVENTS.CH_PC_SEND, { program, channel })
  }

  /**
   * Get current Program Change value for channel
   * @private
   * @param {number} channel - MIDI channel (1-16, default inputChannel)
   * @returns {number|undefined} Program number or undefined if not set
   */
  _getPC(channel = this.options.inputChannel) {
    return this.state.programChange.get(channel.toString())
  }

  /**
   * Get current Control Change value
   * @private
   * @param {number} cc - CC number (0-127)
   * @param {number} channel - MIDI channel (1-16, default inputChannel)
   * @returns {number|undefined} CC value or undefined if not set
   */
  _getCC(cc, channel = this.options.inputChannel) {
    const key = `${channel}:${cc}`
    return this.state.controlChange.get(key)
  }

  /**
   * Send Pitch Bend message on specified channel
   * @private
   * @param {number} value - Pitch bend value (0-16383, where 8192 is center)
   * @param {number} [channel=this.options.outputChannel] - MIDI channel (1-16)
   * @returns {void}
   */
  _sendPitchBend(value, channel = this.options.outputChannel) {
    if (!this.initialized) return

    value = clamp(Math.round(value), 0, 16383)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0xe0 + (channel - 1)
    const lsb = value & 0x7f // Least significant 7 bits
    const msb = (value >> 7) & 0x7f // Most significant 7 bits
    this.connection.send([status, lsb, msb])

    this.state.pitchBend.set(channel.toString(), value)

    this.emit(CONTROLLER_EVENTS.CH_PITCH_BEND_SEND, { value, channel })
  }

  /**
   * Get current Pitch Bend value for a channel
   * @private
   * @param {number} channel - MIDI channel (1-16, default inputChannel)
   * @returns {number|undefined} Pitch bend value (0-16383) or undefined if not set
   */
  _getPitchBend(channel = this.options.inputChannel) {
    return this.state.pitchBend.get(channel.toString())
  }

  /**
   * Send Channel Pressure (Aftertouch) message
   * @private
   * @param {number} pressure - Pressure value (0-127)
   * @param {number} channel - MIDI channel (1-16, default outputChannel)
   * @returns {void}
   */
  _sendMonoPressure(pressure, channel = this.options.outputChannel) {
    if (!this.initialized) return

    pressure = clamp(Math.round(pressure), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0xd0 + (channel - 1)
    this.connection.send([status, pressure])

    this.state.monoPressure.set(channel.toString(), pressure)

    this.emit(CONTROLLER_EVENTS.CH_MONO_PRESS_SEND, { pressure, channel })
  }

  /**
   * Get current Channel Pressure (Aftertouch) value for a channel
   * @private
   * @param {number} channel - MIDI channel (1-16, default inputChannel)
   * @returns {number|undefined} Pressure value (0-127) or undefined if not set
   */
  _getMonoPressure(channel = this.options.inputChannel) {
    return this.state.monoPressure.get(channel.toString())
  }

  /**
   * Send Polyphonic Key Pressure (Polyphonic Aftertouch) message
   * @private
   * @param {number} note - Note number (0-127)
   * @param {number} pressure - Pressure value (0-127)
   * @param {number} channel - MIDI channel (1-16, default outputChannel)
   * @returns {void}
   */
  _sendPolyPressure(note, pressure, channel = this.options.outputChannel) {
    if (!this.initialized) return

    note = clamp(Math.round(note), 0, 127)
    pressure = clamp(Math.round(pressure), 0, 127)
    channel = clamp(Math.round(channel), 1, 16)

    const status = 0xa0 + (channel - 1)
    this.connection.send([status, note, pressure])

    const key = `${channel}:${note}`
    this.state.polyPressure.set(key, pressure)

    this.emit(CONTROLLER_EVENTS.CH_POLY_PRESS_SEND, { note, pressure, channel })
  }

  /**
   * Get current Polyphonic Pressure (Aftertouch) value for a specific note on a channel
   * @private
   * @param {number} note - Note number (0-127)
   * @param {number} [channel=this.options.inputChannel] - MIDI channel (1-16)
   * @returns {number|undefined} Pressure value (0-127) or undefined if not set
   */
  _getPolyPressure(note, channel = this.options.inputChannel) {
    const key = `${channel}:${note}`
    return this.state.polyPressure.get(key)
  }

  /**
   * @private
   */
  _allSoundsOff(channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    if (channel !== undefined) {
      // Send to specific channel
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 120, 0])
      this.emit(CONTROLLER_EVENTS.CH_ALL_SOUNDS_OFF_SEND, { channel })
    } else {
      // Broadcast to all channels
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 120, 0])
      }
      this.emit(CONTROLLER_EVENTS.CH_ALL_SOUNDS_OFF_SEND, { channel: null })
    }
  }

  /**
   * @private
   */
  _resetControllers(channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    if (channel !== undefined) {
      // Send to specific channel
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 121, 0])
      this.emit(CONTROLLER_EVENTS.CH_RESET_CONTROLLERS_SEND, { channel })
    } else {
      // Broadcast to all channels
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 121, 0])
      }
      this.emit(CONTROLLER_EVENTS.CH_RESET_CONTROLLERS_SEND, { channel: null })
    }
  }

  /**
   * @private
   */
  _localControl(enabled, channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    const value = enabled ? 127 : 0

    if (channel !== undefined) {
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 122, value])
      this.emit(CONTROLLER_EVENTS.CH_LOCAL_CONTROL_SEND, { enabled, channel })
    } else {
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 122, value])
      }
      this.emit(CONTROLLER_EVENTS.CH_LOCAL_CONTROL_SEND, { enabled, channel: null })
    }
  }

  /**
   * @private
   */
  _allNotesOff(channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    if (channel !== undefined) {
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 123, 0])
      this.emit(CONTROLLER_EVENTS.CH_ALL_NOTES_OFF_SEND, { channel })
    } else {
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 123, 0])
      }
      this.emit(CONTROLLER_EVENTS.CH_ALL_NOTES_OFF_SEND, { channel: null })
    }
  }

  /**
   * @private
   */
  _omniOff(channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    if (channel !== undefined) {
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 124, 0])
      this.emit(CONTROLLER_EVENTS.CH_OMNI_OFF_SEND, { channel })
    } else {
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 124, 0])
      }
      this.emit(CONTROLLER_EVENTS.CH_OMNI_OFF_SEND, { channel: null })
    }
  }

  /**
   * @private
   */
  _omniOn(channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    if (channel !== undefined) {
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 125, 0])
      this.emit(CONTROLLER_EVENTS.CH_OMNI_ON_SEND, { channel })
    } else {
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 125, 0])
      }
      this.emit(CONTROLLER_EVENTS.CH_OMNI_ON_SEND, { channel: null })
    }
  }

  /**
   * @private
   */
  _monoOn(channels = 1, channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    channels = Math.max(0, Math.min(16, Math.round(channels)))

    if (channel !== undefined) {
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 126, channels])
      this.emit(CONTROLLER_EVENTS.CH_MONO_ON_SEND, { channels, channel })
    } else {
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 126, channels])
      }
      this.emit(CONTROLLER_EVENTS.CH_MONO_ON_SEND, { channels, channel: null })
    }
  }

  /**
   * @private
   */
  _polyOn(channel) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    if (channel !== undefined) {
      channel = clamp(Math.round(channel), 1, 16)
      const status = 0xb0 + (channel - 1)
      this.connection.send([status, 127, 0])
      this.emit(CONTROLLER_EVENTS.CH_POLY_ON_SEND, { channel })
    } else {
      for (let ch = 1; ch <= 16; ch++) {
        const status = 0xb0 + (ch - 1)
        this.connection.send([status, 127, 0])
      }
      this.emit(CONTROLLER_EVENTS.CH_POLY_ON_SEND, { channel: null })
    }
  }

  /**
   * Send SysEx (System Exclusive) message
   * @private
   * @param {Array<number>} data - SysEx data bytes (0-127)
   * @param {boolean} [includeWrapper=false] - If true, data already includes F0/F7
   * @returns {void}
   * @example
   * this._sendSysEx([0x42, 0x30, 0x00, 0x7F]) // Send without wrapper
   * this._sendSysEx([0xF0, 0x42, 0x30, 0xF7], true) // Send with wrapper
   */
  _sendSysEx(data, includeWrapper = false) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    if (!this.options.sysex) {
      console.warn("SysEx not enabled. Initialize with sysex: true")
      return
    }

    this.connection.sendSysEx(data, includeWrapper)
    this.emit(CONTROLLER_EVENTS.SYS_EX_SEND, { data, includeWrapper })
  }

  /**
   * Send MIDI Timing Clock message (System Real-Time)
   * @private
   * @returns {void}
   */
  _sendClock() {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }
    this.connection.send([0xf8])
  }

  /**
   * Send MIDI Start message (System Real-Time)
   * @private
   * @returns {void}
   */
  _sendStart() {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    this.connection.send([0xfa])
  }

  /**
   * Send MIDI Continue message (System Real-Time)
   * @private
   * @returns {void}
   */
  _sendContinue() {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    this.connection.send([0xfb])
  }

  /**
   * Send MIDI Stop message (System Real-Time)
   * @private
   * @returns {void}
   */
  _sendStop() {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    this.connection.send([0xfc])
  }

  /**
   * Send MTC (MIDI Time Code) quarter frame message
   * @private
   * @param {number} data - MTC quarter frame data (0-127)
   * @returns {void}
   */
  _sendMTC(data) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    data = clamp(Math.round(data), 0, 127)
    this.connection.send([0xf1, data])
  }

  /**
   * Send Song Position Pointer message (System Common)
   * @private
   * @param {number} position - Song position in beats (0-16383)
   * @returns {void}
   */
  _sendSongPosition(position) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    position = clamp(Math.round(position), 0, 16383)
    const lsb = position & 0x7f
    const msb = (position >> 7) & 0x7f
    this.connection.send([0xf2, lsb, msb])
  }

  /**
   * Send Song Select message (System Common)
   * @private
   * @param {number} song - Song/sequence number (0-127)
   * @returns {void}
   */
  _sendSongSelect(song) {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }
    song = clamp(Math.round(song), 0, 127)
    this.connection.send([0xf3, song])
  }

  /**
   * Send Tune Request message (System Common)
   * @private
   * @returns {void}
   */
  _sendTuneRequest() {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    this.connection.send([0xf6])
  }

  /**
   * Send Active Sensing message (System Real-Time)
   * @private
   * @returns {void}
   */
  _sendActiveSensing() {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }
    this.connection.send([0xfe])
  }

  /**
   * Send System Reset message (System Real-Time)
   * @private
   * @returns {void}
   */
  _sendSystemReset() {
    if (!this.initialized) {
      console.warn("MIDI not initialized. Call init() first.")
      return
    }

    this.connection.send([0xff])
  }

  /**
   * Handle incoming MIDI messages from input device
   * @private
   * @param {Object} event - MIDI message event
   * @param {Array<number>} event.data - MIDI message bytes
   * @param {number} event.midiwire - Timestamp
   * @returns {void}
   */
  _handleMIDIMessage(event) {
    const [status, data1, data2] = event.data
    const messageType = status & 0xf0
    const channel = (status & 0x0f) + 1

    // System Real-Time messages (0xF8-0xFF)
    if (status === 0xf8) {
      this.emit(CONTROLLER_EVENTS.SYS_CLOCK_RECV, {
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xfa) {
      this.emit(CONTROLLER_EVENTS.SYS_START_RECV, {
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xfb) {
      this.emit(CONTROLLER_EVENTS.SYS_CONTINUE_RECV, {
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xfc) {
      this.emit(CONTROLLER_EVENTS.SYS_STOP_RECV, {
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xfe) {
      this.emit(CONTROLLER_EVENTS.SYS_ACT_SENSE_RECV, {
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xff) {
      this.emit(CONTROLLER_EVENTS.SYS_RESET_RECV, {
        timestamp: event.midiwire,
      })
      return
    }

    // SysEx message (0xF0)
    if (status === 0xf0) {
      this.emit(CONTROLLER_EVENTS.SYS_EX_RECV, {
        data: Array.from(event.data),
        timestamp: event.midiwire,
      })
      return
    }

    // System Common messages (0xF1-0xF7)
    if (status === 0xf1) {
      this.emit(CONTROLLER_EVENTS.SYS_MTC_RECV, {
        data: data1,
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xf2) {
      const position = data1 + (data2 << 7)
      this.emit(CONTROLLER_EVENTS.SYS_SONG_POS_RECV, {
        position,
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xf3) {
      this.emit(CONTROLLER_EVENTS.SYS_SONG_SEL_RECV, {
        song: data1,
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xf6) {
      this.emit(CONTROLLER_EVENTS.SYS_TUNE_REQ_RECV, {
        timestamp: event.midiwire,
      })
      return
    }

    if (status === 0xf7) {
      // End of SysEx - emit raw message
      this.emit(CONTROLLER_EVENTS.MIDI_RAW, {
        status,
        data: [data1, data2],
        channel,
        timestamp: event.midiwire,
      })
      return
    }

    // Control Change
    if (messageType === 0xb0) {
      const key = `${channel}:${data1}`
      this.state.controlChange.set(key, data2)

      this.emit(CONTROLLER_EVENTS.CH_CC_RECV, {
        cc: data1,
        value: data2,
        channel,
      })
      return
    }

    // Program Change
    if (messageType === 0xc0) {
      this.state.programChange.set(channel.toString(), data1)

      this.emit(CONTROLLER_EVENTS.CH_PC_RECV, {
        program: data1,
        channel,
      })
      return
    }

    // Pitch Bend
    if (messageType === 0xe0) {
      const value = data1 + (data2 << 7) // Combine LSB and MSB
      this.state.pitchBend.set(channel.toString(), value)

      this.emit(CONTROLLER_EVENTS.CH_PITCH_BEND_RECV, {
        value,
        channel,
      })
      return
    }

    // Channel Pressure (Aftertouch)
    if (messageType === 0xd0) {
      this.state.monoPressure.set(channel.toString(), data1)

      this.emit(CONTROLLER_EVENTS.CH_MONO_PRESS_RECV, {
        pressure: data1,
        channel,
      })
      return
    }

    // Polyphonic Pressure (Polyphonic Aftertouch)
    if (messageType === 0xa0) {
      const key = `${channel}:${data1}`
      this.state.polyPressure.set(key, data2)

      this.emit(CONTROLLER_EVENTS.CH_POLY_PRESS_RECV, {
        note: data1,
        pressure: data2,
        channel,
      })
      return
    }

    // Note On
    if (messageType === 0x90 && data2 > 0) {
      this.emit(CONTROLLER_EVENTS.CH_NOTE_ON_RECV, {
        note: data1,
        velocity: data2,
        channel,
      })
      return
    }

    // Note Off (either 0x80 or 0x90 with velocity 0)
    if (messageType === 0x80 || (messageType === 0x90 && data2 === 0)) {
      this.emit(CONTROLLER_EVENTS.CH_NOTE_OFF_RECV, {
        note: data1,
        channel,
      })
      return
    }

    // Other messages
    this.emit(CONTROLLER_EVENTS.MIDI_RAW, {
      status,
      data: [data1, data2],
      channel,
      timestamp: event.midiwire,
    })
  }

  /**
   * Get current state as a patch object
   * @private
   * @param {string} [name="Unnamed Patch"] - Patch name
   * @returns {PatchData} Patch data object with channels, settings, and metadata
   */
  _getPatch(name = "Unnamed Patch") {
    const patch = {
      name,
      device: this._getCurrentOutput()?.name || null,
      timestamp: new Date().toISOString(),
      version: "1.0",
      channels: {},
      settings: {},
    }

    // Collect CC values by channel
    for (const [key, value] of this.state.controlChange.entries()) {
      const [channel, cc] = key.split(":").map(Number)
      if (!patch.channels[channel]) {
        patch.channels[channel] = { ccs: {}, notes: {} }
      }
      patch.channels[channel].ccs[cc] = value
    }

    // Collect program changes by channel
    for (const [channelStr, value] of this.state.programChange.entries()) {
      const channel = parseInt(channelStr, 10)
      if (!patch.channels[channel]) {
        patch.channels[channel] = { ccs: {}, notes: {} }
      }
      patch.channels[channel].program = value
    }

    // Collect pitch bend values by channel
    for (const [channelStr, value] of this.state.pitchBend.entries()) {
      const channel = parseInt(channelStr, 10)
      if (!patch.channels[channel]) {
        patch.channels[channel] = { ccs: {}, notes: {} }
      }
      patch.channels[channel].pitchBend = value
    }

    // Collect channel pressure values by channel
    for (const [channelStr, value] of this.state.monoPressure.entries()) {
      const channel = parseInt(channelStr, 10)
      if (!patch.channels[channel]) {
        patch.channels[channel] = { ccs: {}, notes: {} }
      }
      patch.channels[channel].monoPressure = value
    }

    // Collect polyphonic pressure values by channel:note
    for (const [key, value] of this.state.polyPressure.entries()) {
      const [channelStr, note] = key.split(":").map(Number)
      const channel = parseInt(channelStr, 10)
      if (!patch.channels[channel]) {
        patch.channels[channel] = { ccs: {}, notes: {} }
      }
      if (!patch.channels[channel].polyPressure) {
        patch.channels[channel].polyPressure = {}
      }
      patch.channels[channel].polyPressure[note] = value
    }

    // Collect control settings
    for (const [element, binding] of this.bindings.entries()) {
      const { config } = binding
      if (config.cc) {
        const settingKey = `cc${config.cc}`
        patch.settings[settingKey] = {
          min: config.min,
          max: config.max,
          invert: config.invert || false,
          is14Bit: config.is14Bit || false,
          label: element.getAttribute?.("data-midi-label") || null,
          elementId: element.id || null,
        }
      }
    }

    return patch
  }

  /**
   * Apply a patch to the controller
   * @private
   * @param {PatchData} patch - Patch object to apply
   * @returns {Promise<void>}
   * @throws {MIDIValidationError} If patch format is invalid
   */
  async _setPatch(patch) {
    if (!patch || !patch.channels) {
      throw new MIDIValidationError("Invalid patch format", "patch")
    }

    // Handle different patch versions
    const version = patch.version || "1.0"

    if (version === "1.0") {
      await this._applyPatchV1(patch)
    } else {
      console.warn(`Unknown patch version: ${version}. Attempting to apply as v1.0`)
      await this._applyPatchV1(patch)
    }

    this.emit(CONTROLLER_EVENTS.PATCH_LOADED, { patch })
  }

  /**
   * Apply patch data for version 1.0 format
   * @private
   * @param {PatchData} patch - Patch object to apply
   * @returns {Promise<void>}
   */
  async _applyPatchV1(patch) {
    // Apply CC values
    for (const [channelStr, channelData] of Object.entries(patch.channels)) {
      const channel = parseInt(channelStr, 10)

      // Apply CC values
      if (channelData.ccs) {
        for (const [ccStr, value] of Object.entries(channelData.ccs)) {
          const cc = parseInt(ccStr, 10)
          this._sendCC(cc, value, channel)
        }
      }

      // Apply program change
      if (channelData.program !== undefined) {
        this._sendPC(channelData.program, channel)
      }

      // Apply pitch bend
      if (channelData.pitchBend !== undefined) {
        this._sendPitchBend(channelData.pitchBend, channel)
      }

      // Apply channel pressure
      if (channelData.monoPressure !== undefined) {
        this._sendMonoPressure(channelData.monoPressure, channel)
      }

      // Apply polyphonic pressure
      if (channelData.polyPressure) {
        for (const [noteStr, pressure] of Object.entries(channelData.polyPressure)) {
          const note = parseInt(noteStr, 10)
          this._sendPolyPressure(note, pressure, channel)
        }
      }

      // Apply note states if present
      if (channelData.notes) {
        for (const [noteStr, velocity] of Object.entries(channelData.notes)) {
          const note = parseInt(noteStr, 10)
          if (velocity > 0) {
            this._sendNoteOn(note, velocity, channel)
          } else {
            this._sendNoteOff(note, channel)
          }
        }
      }
    }

    // Apply settings to controls (if they exist)
    if (patch.settings) {
      for (const [bindingKey, setting] of Object.entries(patch.settings)) {
        // Find controls by CC number and update their settings
        for (const [element, binding] of this.bindings.entries()) {
          if (binding.config.cc?.toString() === bindingKey.replace("cc", "")) {
            // Update element attributes if they exist
            if (element.min !== undefined && setting.min !== undefined) {
              element.min = String(setting.min)
            }
            if (element.max !== undefined && setting.max !== undefined) {
              element.max = String(setting.max)
            }
          }
        }
      }
    }

    // Update element values from channel data for all bound elements
    for (const [element, binding] of this.bindings.entries()) {
      const { config } = binding
      if (config.cc !== undefined) {
        const channel = config.channel || this.options.inputChannel
        const channelData = patch.channels[channel]
        if (channelData?.ccs) {
          const ccValue = channelData.ccs[config.cc]
          if (ccValue !== undefined) {
            // Convert MIDI value (0-127) back to element value
            const min = config.min !== undefined ? config.min : parseFloat(element.getAttribute?.("min")) || 0
            const max = config.max !== undefined ? config.max : parseFloat(element.getAttribute?.("max")) || 127
            const invert = config.invert || false

            let elementValue
            if (invert) {
              elementValue = max - (ccValue / 127) * (max - min)
            } else {
              elementValue = min + (ccValue / 127) * (max - min)
            }

            // Use onInput callback if provided, otherwise fall back to direct element update
            if (config.onInput && typeof config.onInput === "function") {
              config.onInput(elementValue)
            } else {
              element.value = elementValue
              // Dispatch input event to trigger any display updates
              element.dispatchEvent(new Event("input", { bubbles: true }))
            }
          }
        }
      }
    }
  }

  /**
   * Save a patch to localStorage
   * @private
   * @param {string} name - Patch name
   * @param {PatchData} [patch] - Optional patch object (will use get() if not provided)
   * @returns {string} Storage key used
   */
  _savePatch(name, patch = null) {
    const patchToSave = patch || this._getPatch(name)
    const key = `midiwire_patch_${name}`

    try {
      localStorage.setItem(key, JSON.stringify(patchToSave))
      this.emit(CONTROLLER_EVENTS.PATCH_SAVED, { name, patch: patchToSave })
      return key
    } catch (err) {
      console.error("Failed to save patch:", err)
      throw err
    }
  }

  /**
   * Load a patch from localStorage
   * @private
   * @param {string} name - Patch name
   * @returns {PatchData|null} Patch object or null if not found
   */
  _loadPatch(name) {
    const key = `midiwire_patch_${name}`

    try {
      const stored = localStorage.getItem(key)
      if (!stored) {
        return null
      }

      const patch = JSON.parse(stored)
      this.emit(CONTROLLER_EVENTS.PATCH_LOADED, { name, patch })
      return patch
    } catch (err) {
      console.error("Failed to load patch:", err)
      return null
    }
  }

  /**
   * Delete a patch from localStorage
   * @private
   * @param {string} name - Patch name
   * @returns {boolean} Success status
   */
  _deletePatch(name) {
    const key = `midiwire_patch_${name}`

    try {
      localStorage.removeItem(key)
      this.emit(CONTROLLER_EVENTS.PATCH_DELETED, { name })
      return true
    } catch (err) {
      console.error("Failed to delete patch:", err)
      return false
    }
  }

  /**
   * List all saved patches from localStorage
   * @private
   * @returns {Array<{name: string, patch: PatchData}>} Sorted array of patch objects
   */
  _listPatches() {
    const patches = []

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith("midiwire_patch_")) {
          const name = key.replace("midiwire_patch_", "")
          const patch = this._loadPatch(name)
          if (patch) {
            patches.push({ name, patch })
          }
        }
      }
    } catch (err) {
      console.error("Failed to list patches:", err)
    }

    return patches.sort((a, b) => a.name.localeCompare(b.name))
  }
}
