/**
 * midiwire - Browser-based MIDI controller framework
 *
 * A lightweight, zero-dependency library for creating web-based MIDI controllers.
 * Features declarative HTML binding via data attributes, programmatic APIs,
 * bidirectional MIDI communication, SysEx support, voice management, and more.
 *
 * Works with the Web MIDI API in Chrome, Firefox, and Opera. Provides multiple
 * integration approaches from fully declarative (HTML-only) to fully programmatic (JavaScript-only).
 *
 * ## Features
 * - Declarative binding via data attributes (zero JavaScript)
 * - Programmatic binding with full control
 * - Bidirectional MIDI communication (send/receive)
 * - SysEx support
 * - Patch management (save/load presets)
 * - Hotplug device detection
 * - Comprehensive event system
 * - DX7 voice/parameter management
 *
 * @module midiwire
 * @see {@link https://github.com/alexferl/midiwire} for full documentation
 * @see {@link https://github.com/alexferl/midiwire#quick-start} for quick start guide
 *
 * @example
 * // Quick start - Auto-binding with data attributes
 * import { createMIDIController } from "midiwire";
 *
 * const midi = await createMIDIController({
 *   channel: 1,
 *   selector: "[data-midi-cc]",
 *   watchDOM: true
 * });
 *
 * // In your HTML:
 * // <input type="range" min="0" max="127" data-midi-cc="74" data-midi-label="Filter">
 * // <input type="range" min="0" max="127" data-midi-cc="7" data-midi-label="Volume">
 *
 * @example
 * // Programmatic binding
 * import { MIDIController } from "midiwire";
 *
 * const midi = new MIDIController({ channel: 1 });
 * await midi.init();
 * await midi.connect("My Synth");
 *
 * const cutoff = document.getElementById("cutoff");
 * midi.bind(cutoff, { cc: 74 });
 *
 * @example
 * // Device manager with UI integration
 * import { createMIDIDeviceManager } from "midiwire";
 *
 * const deviceManager = await createMIDIDeviceManager({
 *   onStatusUpdate: (message, state) => {
 *     document.getElementById("status").textContent = message;
 *   }
 * });
 *
 * // Setup device dropdown
 * const select = document.getElementById("device-select");
 * const channelSelect = document.getElementById("channel-select");
 * await deviceManager.setupSelectors({
 *   output: select,
 *   channel: channelSelect
 * });
 */

import { DataAttributeBinder } from "./bindings/DataAttributeBinder.js"
import { MIDIController } from "./core/MIDIController.js"
import { MIDIDeviceManager } from "./core/MIDIDeviceManager.js"

/**
 * Options for createMIDIController()
 * @typedef {Object} MIDIControlsOptions
 * @property {string} [selector="[data-midi-cc]"] - CSS selector for auto-binding elements that have data-midi-* attributes
 * @property {number} [inputChannel=1] - Input MIDI channel (1-16)
 * @property {number} [outputChannel=1] - Output MIDI channel (1-16)
 * @property {string|number} [output] - MIDI output device name, ID, or index to auto-connect to
 * @property {boolean} [sysex=false] - Request SysEx access for sending/receiving system exclusive messages
 * @property {boolean} [autoConnect=true] - Auto-connect to first available output device
 * @property {boolean} [watchDOM=false] - Automatically bind dynamically added elements using MutationObserver
 * @property {Function} [onReady] - Callback when MIDI is ready, receives (controller) as parameter
 * @property {Function} [onError] - Error handler for MIDI access errors
 * @property {string|number} [input] - MIDI input device name, ID, or index to connect to for receiving MIDI
 *
 * @example
 * // Basic auto-binding
 * const options = {
 *   selector: "[data-midi-cc]",
 *   outputChannel: 1,
 *   watchDOM: true
 * };
 *
 * @example
 * // Connect to specific device
 * const options = {
 *   output: "My MIDI Keyboard",
 *   outputChannel: 2,
 *   sysex: true
 * };
 *
 * @example
 * // With separate input/output channels
 * const options = {
 *   inputChannel: 1,
 *   outputChannel: 2,
 *   input: "My MIDI Controller",
 *   output: "My Synth"
 * };
 */

/**
 * Create and initialize a MIDI controller with optional auto-binding. This factory function
 * creates a MIDIController instance, initializes it, and optionally sets up declarative binding
 * using DataAttributeBinder. Perfect for getting started quickly or when using data attributes.
 *
 * @param {MIDIControlsOptions} [options={}] - Configuration options
 * @returns {Promise<MIDIController>} A promise resolving to the initialized MIDIController instance
 * @throws {MIDIAccessError} If MIDI access is denied or browser doesn't support Web MIDI API
 *
 * @example
 * // Quick start with auto-binding
 * const midi = await createMIDIController({
 *   selector: "[data-midi-cc]",
 *   watchDOM: true
 * });
 *
 * @example
 * // Auto-bind with specific device and output channel
 * const midi = await createMIDIController({
 *   output: "My Synth",
 *   outputChannel: 2,
 *   selector: "[data-midi-cc]",
 *   onReady: (controller) => {
 *     console.log("MIDI ready!");
 *   }
 * });
 *
 * @example
 * // Auto-bind with separate input/output channels
 * const midi = await createMIDIController({
 *   inputChannel: 1,
 *   outputChannel: 2,
 *   selector: "[data-midi-cc]",
 *   watchDOM: true
 * });
 *
 * @example
 * // Programmatic binding (no auto-bind)
 * const midi = await createMIDIController({
 *   autoConnect: false,
 *   outputChannel: 1
 * });
 * await midi.device.connectOutput("My Synth");
 * const slider = document.getElementById("cutoff");
 * midi.bind(slider, { cc: 74 });
 *
 * @example
 * // With SysEx support
 * const midi = await createMIDIController({
 *   sysex: true,
 *   onReady: (controller) => {
 *     // Send SysEx after connection
 *     controller.sendSysEx([0x41, 0x10, 0x42]);
 *   }
 * });
 */
export async function createMIDIController(options = {}) {
  const controller = new MIDIController(options)
  await controller.init()

  const selector = options.selector || "[data-midi-cc]"
  if (selector) {
    const binder = new DataAttributeBinder(controller, selector)
    binder.bindAll()

    if (options.watchDOM) {
      binder.enableAutoBinding()
    }

    // Store binder for cleanup
    controller._binder = binder
  }

  return controller
}

/**
 * Options for createMIDIDeviceManager()
 * @typedef {Object} MIDIDeviceManagerOptions
 * @property {Function} [onStatusUpdate] - Callback for status updates (message: string, state: string)
 * @property {Function} [onConnectionUpdate] - Callback when connection status changes (device: Object, midi: MIDIController)
 * @property {number} [inputChannel=1] - Input MIDI channel (1-16)
 * @property {number} [outputChannel=1] - Output MIDI channel (1-16)
 * @property {string|number} [output] - MIDI output device name, ID, or index to auto-connect to
 * @property {boolean} [sysex=false] - Request SysEx access
 * @property {Function} [onReady] - Callback when MIDI is ready, receives (midi: MIDIController, deviceManager: MIDIDeviceManager)
 * @property {Function} [onError] - Error handler for MIDI access errors
 * @property {string} [selector="[data-midi-cc]"] - CSS selector for auto-binding controls
 * @property {boolean} [watchDOM=false] - Automatically bind dynamically added elements
 * @property {string|number} [input] - MIDI input device name, ID, or index to connect to
 *
 * @example
 * // Basic device manager setup
 * const options = {
 *   outputChannel: 1,
 *   onStatusUpdate: (message, state) => updateStatusUI(message, state)
 * };
 *
 * @example
 * // Full device manager with UI integration
 * const options = {
 *   output: "My Synth",
 *   outputChannel: 2,
 *   sysex: true,
 *   selector: "[data-midi-cc]",
 *   watchDOM: true,
 *   onStatusUpdate: (message, state) => {
 *     console.log(message);
 *     document.getElementById("status").textContent = message;
 *   },
 *   onReady: async (midi, deviceManager) => {
 *     // Setup device dropdown and channel selector
 *     const deviceSelect = document.getElementById("device-select");
 *     const channelSelect = document.getElementById("channel-select");
 *     await deviceManager.setupSelectors({
 *       output: deviceSelect,
 *       channel: channelSelect
 *     });
 *   }
 * };
 *
 * @example
 * // With separate input/output channels
 * const options = {
 *   inputChannel: 1,
 *   outputChannel: 2,
 *   input: "My MIDI Controller",
 *   output: "My Synth",
 *   onStatusUpdate: (message, state) => updateStatusUI(message, state)
 * };
 */

/**
 * Create a MIDIDeviceManager with an integrated MIDIController. This factory function creates a complete
 * device management solution including MIDIController, auto-binding (optional), and device manager UI helpers.
 * Perfect for applications that need device selection UI and status management.
 *
 * @param {MIDIDeviceManagerOptions} [options={}] - Configuration options
 * @returns {Promise<MIDIDeviceManager>} A promise resolving to the initialized MIDIDeviceManager instance
 * @throws {MIDIAccessError} If MIDI access is denied or browser doesn't support Web MIDI API
 *
 * @example
 * // Basic device manager
 * const deviceManager = await createMIDIDeviceManager({
 *   outputChannel: 1,
 *   onStatusUpdate: (message, state) => {
 *     console.log(message);
 *   }
 * });
 *
 * // Access the MIDIController via deviceManager.midi
 * const midi = deviceManager.midi;
 * midi.bind(document.getElementById("cutoff"), { cc: 74 });
 *
 * @example
 * // With auto-connect and status UI
 * const deviceManager = await createMIDIDeviceManager({
 *   output: "My Synth",
 *   outputChannel: 2,
 *   selector: "[data-midi-cc]",
 *   onStatusUpdate: (message, state) => {
 *     const statusEl = document.getElementById("status");
 *     statusEl.textContent = message;
 *     statusEl.className = state;
 *   }
 * });
 *
 * @example
 * // Complete UI integration with device dropdown
 * const deviceManager = await createMIDIDeviceManager({
 *   inputChannel: 1,
 *   outputChannel: 2,
 *   sysex: true,
 *   onStatusUpdate: (message, state) => {
 *     document.getElementById("status").textContent = message;
 *   },
 *   onReady: async (midi, dm) => {
 *     // Setup device and channel selection
 *     const deviceSelect = document.getElementById("device-select");
 *     const channelSelect = document.getElementById("channel-select");
 *     await dm.setupSelectors({
 *       output: deviceSelect,
 *       channel: channelSelect
 *     });
 *   }
 * });
 *
 * @example
 * // With separate input/output devices and channels
 * const deviceManager = await createMIDIDeviceManager({
 *   inputChannel: 1,
 *   outputChannel: 2,
 *   input: "My MIDI Keyboard",
 *   output: "My Synth Module",
 *   onStatusUpdate: (message, state) => {
 *     document.getElementById("status").textContent = message;
 *   },
 *   onReady: async (midi, dm) => {
 *     // Setup input and output device selectors
 *     const inputSelect = document.getElementById("input-select");
 *     const outputSelect = document.getElementById("output-select");
 *     const channelSelect = document.getElementById("channel-select");
 *     await dm.setupSelectors({
 *       input: inputSelect,
 *       output: outputSelect,
 *       channel: channelSelect
 *     });
 *   }
 * });
 */
export async function createMIDIDeviceManager(options = {}) {
  const {
    onStatusUpdate,
    onConnectionUpdate,
    inputChannel = 1,
    outputChannel = 1,
    output,
    sysex,
    onReady,
    onError,
    selector,
    watchDOM,
    ...otherOptions
  } = options
  const selectorToUse = selector || "[data-midi-cc]"

  const midi = await createMIDIController({
    autoConnect: false,
    sysex,
    inputChannel,
    outputChannel,
    selector: selectorToUse,
    watchDOM,
    onError,
    ...otherOptions,
  })

  const deviceManager = new MIDIDeviceManager({
    midiController: midi,
    onStatusUpdate: onStatusUpdate || (() => {}),
    onConnectionUpdate: onConnectionUpdate || (() => {}),
    channel: outputChannel,
  })

  if (output) {
    try {
      await midi.device.connectOutput(output)
      deviceManager.currentOutput = midi.device.getCurrentOutput()
      deviceManager.updateConnectionStatus()
    } catch (err) {
      if (onError) onError(err)
      else console.error("Failed to connect to MIDI device:", err.message)
    }
  }

  if (onReady) {
    onReady(midi, deviceManager)
  }

  return deviceManager
}

export { DataAttributeBinder } from "./bindings/DataAttributeBinder.js"
export { EventEmitter } from "./core/EventEmitter.js"
export {
  DX7Error,
  DX7ParseError,
  DX7ValidationError,
  MIDIAccessError,
  MIDIConnectionError,
  MIDIDeviceError,
  MIDIError,
  MIDIValidationError,
} from "./core/errors.js"
export {
  CONNECTION_EVENTS,
  CONNECTION_EVENTS as CONN,
  MIDIConnection,
} from "./core/MIDIConnection.js"
export {
  CONTROLLER_EVENTS,
  CONTROLLER_EVENTS as CTRL,
  MIDIController,
} from "./core/MIDIController.js"
export { MIDIDeviceManager } from "./core/MIDIDeviceManager.js"
export { DX7Bank, DX7Voice } from "./utils/dx7/index.js"
export * from "./utils/midi.js"
export * from "./utils/sysex.js"
export * from "./utils/validators.js"
