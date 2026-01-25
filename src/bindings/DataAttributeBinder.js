/**
 * Declarative MIDI binding system using HTML data attributes. Enables zero-JavaScript
 * MIDI controller creation by scanning the DOM for data-midi-* attributes and automatically
 * binding elements to MIDIController.
 *
 * Features:
 * - **Auto-discovery**: Scans DOM for data-midi-* attributes
 * - **7-bit CC**: Bind with `data-midi-cc="74"` (e.g., Filter Cutoff)
 * - **14-bit CC**: Bind with `data-midi-msb="74" data-midi-lsb="75"` for high resolution
 * - **Custom ranges**: Use HTML min/max attributes or `data-midi-min`/`data-midi-max`
 * - **Channel override**: `data-midi-channel="2"` to use channel 2 instead of default
 * - **Value inversion**: `data-midi-invert="true"` to invert the value mapping
 * - **De bouncing**: `data-midi-debounce="100"` for high-frequency updates (ms)
 * - **Auto-binding**: Watch DOM for dynamically added/removed elements with MutationObserver
 * - **Labeling**: `data-midi-label="Filter Cutoff"` for patch saving
 *
 * @example
 * // 7-bit CC binding
 * <input type="range" min="0" max="127" data-midi-cc="74" data-midi-label="Filter Cutoff">
 *
 * @example
 * // 14-bit high-resolution binding
 * <input type="range" min="0" max="16383" data-midi-msb="74" data-midi-lsb="75" data-midi-label="Pitch Bend">
 *
 * @example
 * // With channel override and inversion
 * <input type="range" min="0" max="127" data-midi-cc="7" data-midi-channel="2" data-midi-invert="true" data-midi-label="Volume">
 *
 * @example
 * // With custom range
 * <input type="range" min="-100" max="100" data-midi-cc="10" data-midi-label="Pan">
 *
 * @example
 * // Complete setup with auto-binding
 * const midi = new MIDIController();
 * const binder = new DataAttributeBinder(midi);
 *
 * // Bind existing elements
 * binder.bindAll();
 *
 * // Enable auto-binding for dynamically added elements
 * binder.enableAutoBinding();
 *
 * @example
 * // Manual binding with custom selector
 * const binder = new DataAttributeBinder(midi, "[data-midi-cc]");
 * binder.bindAll();
 */
export class DataAttributeBinder {
  /**
   * Create a new DataAttributeBinder instance for declarative MIDI binding
   *
   * @param {MIDIController} controller - MIDIController instance to bind elements to
   * @param {string} [selector="[data-midi-cc]"] - CSS selector for elements to bind. Defaults to looking for data-midi-cc or data-midi-msb/lmb attributes
   *
   * @example
   * // Basic usage
   * const midi = new MIDIController();
   * const binder = new DataAttributeBinder(midi);
   *
   * @example
   * // With custom selector
   * const binder = new DataAttributeBinder(midi, ".midi-control");
   *
   * @example
   * // Bind after MIDI is ready
   * const midi = new MIDIController();
   * midi.on(midi.READY, () => {
   *   const binder = new DataAttributeBinder(midi);
   *   binder.bindAll();
   * });
   */
  constructor(controller, selector = "[data-midi-cc]") {
    this.controller = controller
    this.selector = selector
    this.observer = null
  }

  /**
   * Bind all matching elements in the document to MIDI Controller. Searches the DOM for elements
   * that match the selector and have data-midi-* attributes. Skips already bound elements (marked
   * with data-midi-bound attribute). Automatically handles both 7-bit CC and 14-bit CC configurations.
   *
   * @returns {void}
   *
   * @example
   * // Bind all elements with data-midi-cc or data-midi-msb/lmb attributes
   * binder.bindAll();
   *
   * @example
   * // Bind after DOM is loaded
   * document.addEventListener("DOMContentLoaded", () => {
   *   binder.bindAll();
   * });
   *
   * @example
   * // Bind after MIDI is ready
   * midi.on(midi.READY, () => {
   *   binder.bindAll();
   * });
   */
  bindAll() {
    // Support both 7-bit CC (data-midi-cc) and 14-bit CC (data-midi-msb + data-midi-lsb)
    const elements = document.querySelectorAll(
      this.selector === "[data-midi-cc]" ? "[data-midi-cc], [data-midi-msb][data-midi-lsb]" : this.selector,
    )

    elements.forEach((element) => {
      if (element.hasAttribute("data-midi-bound")) return

      const config = this._parseAttributes(element)
      if (config) {
        this.controller.bind(element, config)
        element.setAttribute("data-midi-bound", "true")
      }
    })
  }

  /**
   * Enable automatic binding of dynamically added elements using MutationObserver.
   * Watches the DOM for new elements that match the selector and have data-midi-* attributes,
   * automatically binding them when they're added. Also handles cleanup of removed elements.
   *
   * @returns {void}
   *
   * @example
   * // Enable and forget - perfect for single page apps
   * binder.enableAutoBinding();
   *
   * @example
   * // Add controls dynamically
   * binder.enableAutoBinding();
   * // Later, when you add new UI controls:
   * const newSlider = document.createElement("input");
   * newSlider.type = "range";
   * newSlider.setAttribute("data-midi-cc", "71");
   * document.getElementById("controls").appendChild(newSlider);
   * // Automatically bound!
   */
  enableAutoBinding() {
    if (this.observer) return

    // Support both 7-bit CC (data-midi-cc) and 14-bit CC (data-midi-msb + data-midi-lsb)
    const selector =
      this.selector === "[data-midi-cc]" ? "[data-midi-cc], [data-midi-msb][data-midi-lsb]" : this.selector

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches?.(selector)) {
              const config = this._parseAttributes(node)
              if (config && !node.hasAttribute("data-midi-bound")) {
                this.controller.bind(node, config)
                node.setAttribute("data-midi-bound", "true")
              }
            }

            if (node.querySelectorAll) {
              const children = node.querySelectorAll(selector)
              children.forEach((child) => {
                if (!child.hasAttribute("data-midi-bound")) {
                  const config = this._parseAttributes(child)
                  if (config) {
                    this.controller.bind(child, config)
                    child.setAttribute("data-midi-bound", "true")
                  }
                }
              })
            }
          }
        })

        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.hasAttribute?.("data-midi-bound")) {
              this.controller.unbind(node)
            }

            if (node.querySelectorAll) {
              const boundChildren = node.querySelectorAll("[data-midi-bound]")
              boundChildren.forEach((child) => {
                this.controller.unbind(child)
              })
            }
          }
        })
      })
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  /**
   * Disable automatic binding and clean up the MutationObserver. Stops watching for
   * dynamically added/removed elements and disconnects the observer to prevent memory leaks.
   *
   * @returns {void}
   *
   * @example
   * // Temporarily disable auto-binding
   * binder.disableAutoBinding();
   * // Make bulk DOM changes
   * updateAllControls();
   * // Re-enable when done
   * binder.enableAutoBinding();
   *
   * @example
   * // Clean up when done with the binder
   * binder.disableAutoBinding();
   * binder.destroy();
   */
  disableAutoBinding() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }

  /**
   * Parse MIDI configuration from an element's data attributes. Extracts MIDI binding
   * configuration including CC numbers, channel, range, inversion, and debouncing settings.
   * Validates the configuration and returns null if invalid. Handles both 7-bit CC
   * (data-midi-cc) and 14-bit CC (data-midi-msb + data-midi-lsb) configurations.
   *
   * @param {HTMLElement} element - The element to parse attributes from
   * @returns {Object|null} Configuration object or null if invalid
   * @private
   *
   * @example
   * // 7-bit CC configuration
   * // <input type="range" min="0" max="127" data-midi-cc="74" data-midi-invert="true">
   * // Returns: { cc: 74, min: 0, max: 127, invert: true }
   *
   * @example
   * // 14-bit CC configuration
   * // <input type="range" min="0" max="16383" data-midi-msb="74" data-midi-lsb="75">
   * // Returns: { msb: 74, lsb: 75, is14Bit: true, min: 0, max: 16383 }
   */
  _parseAttributes(element) {
    // Check for 14-bit CC (MSB + LSB)
    const msb = parseInt(element.dataset.midiMsb, 10)
    const lsb = parseInt(element.dataset.midiLsb, 10)

    if (!Number.isNaN(msb) && !Number.isNaN(lsb) && msb >= 0 && msb <= 127 && lsb >= 0 && lsb <= 127) {
      // Check if 7-bit CC is also present
      const cc = parseInt(element.dataset.midiCc, 10)
      if (!Number.isNaN(cc) && cc >= 0 && cc <= 127) {
        console.warn(
          `Element has both 7-bit (data-midi-cc="${cc}") and 14-bit (data-midi-msb="${msb}" data-midi-lsb="${lsb}") CC attributes. 14-bit takes precedence.`,
          element,
        )
      }

      // Valid 14-bit CC
      return {
        msb,
        lsb,
        is14Bit: true,
        channel: parseInt(element.dataset.midiChannel, 10) || undefined,
        min: parseFloat(element.getAttribute("min")) || 0,
        max: parseFloat(element.getAttribute("max")) || 127,
        invert: element.dataset.midiInvert === "true",
        label: element.dataset.midiLabel,
      }
    }

    // Fallback to 7-bit CC
    const cc = parseInt(element.dataset.midiCc, 10)
    if (!Number.isNaN(cc) && cc >= 0 && cc <= 127) {
      return {
        cc,
        channel: parseInt(element.dataset.midiChannel, 10) || undefined,
        min: parseFloat(element.getAttribute("min")) || 0,
        max: parseFloat(element.getAttribute("max")) || 127,
        invert: element.dataset.midiInvert === "true",
        label: element.dataset.midiLabel,
      }
    }

    if (
      element.dataset.midiCc !== undefined ||
      (element.dataset.midiMsb !== undefined && element.dataset.midiLsb !== undefined)
    ) {
      console.warn(`Invalid MIDI configuration on element:`, element)
    }
    return null
  }

  /**
   * Clean up resources and disconnect any active observers. Disables auto-binding if active
   * and disconnects the MutationObserver to prevent memory leaks. Call this when done with
   * the binder instance.
   *
   * @returns {void}
   *
   * @example
   * // Clean up when done
   * const binder = new DataAttributeBinder(midi);
   * binder.bindAll();
   * binder.enableAutoBinding();
   *
   * // Later, when cleaning up
   * binder.destroy();
   *
   * @example
   * // Clean up in response to user action
   * document.getElementById("cleanup-btn").addEventListener("click", () => {
   *   binder.destroy();
   * });
   */
  destroy() {
    this.disableAutoBinding()
  }
}
