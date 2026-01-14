/**
 * Automatically bind controls using data attributes
 */
export class DataAttributeBinder {
  /**
   * @param {import("../core/MIDIController.js").MIDIController} controller
   * @param {string} selector - CSS selector for elements to bind
   */
  constructor(controller, selector = "[data-midi-cc]") {
    this.controller = controller
    this.selector = selector
    this.observer = null
  }

  /**
   * Bind all matching elements in the document
   */
  bindAll() {
    // Support both 7-bit CC (data-midi-cc) and 14-bit CC (data-midi-msb + data-midi-lsb)
    const elements = document.querySelectorAll(
      this.selector === "[data-midi-cc]"
        ? "[data-midi-cc], [data-midi-msb][data-midi-lsb]"
        : this.selector,
    )

    elements.forEach((element) => {
      // Skip if already bound
      if (element.hasAttribute("data-midi-bound")) return

      const config = this._parseAttributes(element)
      if (config) {
        this.controller.bind(element, config)
        element.setAttribute("data-midi-bound", "true")
      }
    })
  }

  /**
   * Watch for dynamically added elements and auto-bind them
   */
  enableAutoBinding() {
    if (this.observer) return

    // Support both 7-bit CC (data-midi-cc) and 14-bit CC (data-midi-msb + data-midi-lsb)
    const selector =
      this.selector === "[data-midi-cc]"
        ? "[data-midi-cc], [data-midi-msb][data-midi-lsb]"
        : this.selector

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check the node itself
            if (node.matches?.(selector)) {
              const config = this._parseAttributes(node)
              if (config && !node.hasAttribute("data-midi-bound")) {
                this.controller.bind(node, config)
                node.setAttribute("data-midi-bound", "true")
              }
            }

            // Check children
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
      })
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  /**
   * Stop watching for new elements
   */
  disableAutoBinding() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }

  /**
   * Parse MIDI config from data attributes
   * @param {HTMLElement} element
   * @returns {Object|null}
   * @private
   */
  _parseAttributes(element) {
    // Check for 14-bit CC (MSB + LSB)
    const msb = parseInt(element.dataset.midiMsb, 10)
    const lsb = parseInt(element.dataset.midiLsb, 10)

    if (
      !Number.isNaN(msb) &&
      !Number.isNaN(lsb) &&
      msb >= 0 &&
      msb <= 127 &&
      lsb >= 0 &&
      lsb <= 127
    ) {
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

    // Invalid configuration
    if (
      element.dataset.midiCc !== undefined ||
      (element.dataset.midiMsb !== undefined && element.dataset.midiLsb !== undefined)
    ) {
      console.warn(`Invalid MIDI configuration on element:`, element)
    }
    return null
  }

  /**
   * Clean up
   */
  destroy() {
    this.disableAutoBinding()
  }
}
