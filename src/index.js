/**
 * midiwire - Declarative MIDI CC controller library
 * @module midiwire
 */

import { DataAttributeBinder } from "./bindings/DataAttributeBinder.js"
import { MIDIController } from "./core/MIDIController.js"

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

  if (options.selector) {
    const binder = new DataAttributeBinder(controller, options.selector)
    binder.bindAll()

    if (options.watchDOM) {
      binder.enableAutoBinding()
    }

    // Store binder for cleanup
    controller._binder = binder
  }

  return controller
}

export { DataAttributeBinder } from "./bindings/DataAttributeBinder.js"
export { EventEmitter } from "./core/EventEmitter.js"
export { MIDIConnection } from "./core/MIDIConnection.js"
export { MIDI_EVENTS, MIDI_EVENTS as EVENTS, MIDIController } from "./core/MIDIController.js"

export * from "./utils/midi.js"
export * from "./utils/sysex.js"
export * from "./utils/validators.js"
