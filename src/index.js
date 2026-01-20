/**
 * midiwire - Browser-based MIDI controller framework
 *
 * A lightweight, zero-dependency library for creating web-based MIDI controllers.
 * Features declarative HTML binding via data attributes, programmatic APIs,
 * bidirectional MIDI communication, SysEx support, voice management, and more.
 *
 * Works with the Web MIDI API in Chrome, Firefox, and Opera.
 *
 * @module midiwire
 * @see {@link https://github.com/alexferl/midiwire} for documentation
 */

import { DataAttributeBinder } from "./bindings/DataAttributeBinder.js"
import { MIDIController } from "./core/MIDIController.js"
import { MIDIDeviceManager } from "./core/MIDIDeviceManager.js"

/**
 * @typedef {Object} MIDIControlsOptions
 * @property {string} [selector="[data-midi-cc]"] - CSS selector for auto-binding
 * @property {number} [channel=1] - Default MIDI channel (1-16)
 * @property {string|number} [output] - MIDI output device name, ID, or index
 * @property {boolean} [sysex=false] - Request SysEx access
 * @property {boolean} [autoConnect=true] - Auto-connect to first available output
 * @property {boolean} [watchDOM=false] - Automatically bind dynamically added elements
 * @property {Function} [onReady] - Callback when MIDI is ready
 * @property {Function} [onError] - Error handler
 */

/**
 * Create and initialize a MIDI controller
 * @param {MIDIControlsOptions} [options={}]
 * @returns {Promise<MIDIController>}
 *
 * @example
 * // Auto-bind with data attributes
 * const midi = await createMIDIController({
 *   channel: 1,
 *   output: "My Synth",
 *   selector: "[data-midi-cc]"
 * });
 *
 * @example
 * // Programmatic binding
 * const midi = await createMIDIController({ autoConnect: false });
 * await midi.setOutput("My Synth");
 * midi.bind(document.querySelector("#cutoff"), { cc: 74 });
 */
export async function createMIDIController(options = {}) {
  const controller = new MIDIController(options)
  await controller.initialize()

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
 * @typedef {Object} MIDIDeviceManagerOptions
 * @property {Function} [onStatusUpdate] - Callback for status updates (message, state)
 * @property {Function} [onConnectionUpdate] - Callback when connection status changes
 * @property {number} [channel=1] - Default MIDI channel
 * @property {string} [output] - MIDI output device name, ID, or index
 * @property {boolean} [sysex=false] - Request SysEx access
 * @property {Function} [onReady] - Callback when MIDI is ready (midi, deviceManager)
 * @property {Function} [onError] - Error handler
 * @property {string} [selector] - CSS selector for auto-binding controls
 * @property {boolean} [watchDOM=false] - Automatically bind dynamically added elements
 */

/**
 * Create a MIDIDeviceManager with an integrated MIDIController
 * @param {MIDIDeviceManagerOptions} [options={}]
 * @returns {Promise<MIDIDeviceManager>}
 *
 * @example
 * // Basic usage
 * const deviceManager = await createMIDIDeviceManager({
 *   channel: 1,
 *   onStatusUpdate: (message, state) => console.log(message)
 * });
 *
 * // Access the MIDIController via deviceManager.midi
 * const midi = deviceManager.midi;
 *
 * @example
 * // Auto-connect to a specific device
 * const deviceManager = await createMIDIDeviceManager({
 *   output: "My Synth",
 *   channel: 2,
 *   onStatusUpdate: (message, state) => console.log(message)
 * });
 */
export async function createMIDIDeviceManager(options = {}) {
  const {
    onStatusUpdate,
    onConnectionUpdate,
    channel,
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
    channel: channel || 1,
    selector: selectorToUse,
    watchDOM,
    onError,
    ...otherOptions,
  })

  const deviceManager = new MIDIDeviceManager({
    midiController: midi,
    onStatusUpdate: onStatusUpdate || (() => {}),
    onConnectionUpdate: onConnectionUpdate || (() => {}),
    channel: channel || 1,
  })

  if (output) {
    try {
      await midi.setOutput(output)
      deviceManager.currentDevice = midi.getCurrentOutput()
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
export { DX7Bank, DX7Voice } from "./utils/dx7"
export * from "./utils/midi.js"
export * from "./utils/sysex.js"
export * from "./utils/validators.js"
