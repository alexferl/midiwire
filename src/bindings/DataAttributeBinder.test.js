import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DataAttributeBinder } from "./DataAttributeBinder.js"

// Mock MIDIController for testing
class MockMIDIController {
  constructor() {
    this.boundElements = new Map()
    this.bindings = new Map()
    this.options = { channel: 1 }
  }

  bind(element, config) {
    this.boundElements.set(element, config)
    const unbind = () => this._unbind(element)
    this.bindings.set(element, unbind)
    // Try to set initial value if element has value
    if (element.value !== undefined && element.value !== "") {
      // This would normally trigger the handler
    }
    return unbind
  }

  unbind(element) {
    const binding = this.bindings.get(element)
    if (binding) {
      binding()
    }
  }

  _unbind(element) {
    this.boundElements.delete(element)
    this.bindings.delete(element)
  }
}

describe("DataAttributeBinder", () => {
  let mockController
  let binder

  beforeEach(() => {
    mockController = new MockMIDIController()
    document.body.innerHTML = ""
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (binder) {
      binder.destroy()
    }
  })

  describe("constructor", () => {
    it("should create with default selector", () => {
      binder = new DataAttributeBinder(mockController)
      expect(binder.controller).toBe(mockController)
      expect(binder.selector).toBe("[data-midi-cc]")
      expect(binder.observer).toBeNull()
    })

    it("should create with custom selector", () => {
      binder = new DataAttributeBinder(mockController, ".my-controls")
      expect(binder.selector).toBe(".my-controls")
    })
  })

  describe("_parseAttributes", () => {
    beforeEach(() => {
      binder = new DataAttributeBinder(mockController)
    })

    it("should parse valid midi-cc attribute", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")

      const config = binder._parseAttributes(element)
      expect(config).toEqual({
        cc: 74,
        channel: undefined,
        min: 0,
        max: 127,
        invert: false,
        label: undefined,
      })
    })

    it("should parse all attributes", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")
      element.setAttribute("data-midi-channel", "2")
      element.setAttribute("min", "0")
      element.setAttribute("max", "100")
      element.setAttribute("data-midi-invert", "true")
      element.setAttribute("data-midi-label", "Cutoff")

      const config = binder._parseAttributes(element)
      expect(config).toEqual({
        cc: 74,
        channel: 2,
        min: 0,
        max: 100,
        invert: true,
        label: "Cutoff",
      })
    })

    it("should return null for invalid cc", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "invalid")

      const config = binder._parseAttributes(element)
      expect(config).toBeNull()
    })

    it("should return null for cc out of range", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "-1")

      const config = binder._parseAttributes(element)
      expect(config).toBeNull()
    })

    it("should return null for cc > 127", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "200")

      const config = binder._parseAttributes(element)
      expect(config).toBeNull()
    })

    it("should parse min/max from element attributes", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")
      element.setAttribute("min", "10")
      element.setAttribute("max", "1000")

      const config = binder._parseAttributes(element)
      expect(config.min).toBe(10)
      expect(config.max).toBe(1000)
    })

    it("should use defaults when min/max not specified", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")

      const config = binder._parseAttributes(element)
      expect(config.min).toBe(0)
      expect(config.max).toBe(127)
    })

    it("should parse channel correctly", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")
      element.setAttribute("data-midi-channel", "5")

      const config = binder._parseAttributes(element)
      expect(config.channel).toBe(5)
    })

    it("should parse invert correctly", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")

      element.setAttribute("data-midi-invert", "true")
      expect(binder._parseAttributes(element).invert).toBe(true)

      element.setAttribute("data-midi-invert", "false")
      expect(binder._parseAttributes(element).invert).toBe(false)

      // Should be false when not set
      element.removeAttribute("data-midi-invert")
      expect(binder._parseAttributes(element).invert).toBe(false)
    })

    it("should parse label", () => {
      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")
      element.setAttribute("data-midi-label", "Filter Cutoff")

      const config = binder._parseAttributes(element)
      expect(config.label).toBe("Filter Cutoff")
    })
  })

  describe("bindAll", () => {
    beforeEach(() => {
      binder = new DataAttributeBinder(mockController)
    })

    it("should bind all matching elements", () => {
      document.body.innerHTML = `
				<input type="range" data-midi-cc="74">
				<input type="range" data-midi-cc="71">
				<input type="range" data-midi-cc="7">
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(3)
    })

    it("should not bind elements without data-midi-cc", () => {
      document.body.innerHTML = `
				<input type="range">
				<input type="range" data-midi-cc="74">
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(1)
    })

    it("should not bind elements that are already bound", () => {
      document.body.innerHTML = `
				<input type="range" data-midi-cc="74" data-midi-bound="true">
				<input type="range" data-midi-cc="71">
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(1)
      const unboundElements = document.querySelectorAll('input:not([data-midi-bound="true"])')
      if (unboundElements.length > 0) {
        const config = mockController.boundElements.get(unboundElements[0])
        expect(config).toBeDefined()
        expect(config.cc).toBe(71)
      }
    })

    it("should set data-midi-bound attribute", () => {
      document.body.innerHTML = `<input type="range" data-midi-cc="74">`
      const element = document.querySelector('[data-midi-cc="74"]')

      expect(element.hasAttribute("data-midi-bound")).toBe(false)

      binder.bindAll()

      expect(element.hasAttribute("data-midi-bound")).toBe(true)
      expect(element.getAttribute("data-midi-bound")).toBe("true")
    })

    it("should not bind elements with invalid cc", () => {
      document.body.innerHTML = `
				<input type="range" data-midi-cc="-1">
				<input type="range" data-midi-cc="74">
				<input type="range" data-midi-cc="200">
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(1)
      expect(
        mockController.boundElements.get(document.querySelector('[data-midi-cc="74"]')).cc,
      ).toBe(74)
    })

    it("should handle empty document", () => {
      document.body.innerHTML = ""
      expect(() => binder.bindAll()).not.toThrow()
      expect(mockController.boundElements.size).toBe(0)
    })

    it("should work with custom selector", () => {
      binder = new DataAttributeBinder(mockController, ".midi-control")

      document.body.innerHTML = `
				<input type="range" class="midi-control" data-midi-cc="74">
				<input type="range" data-midi-cc="71">
				<input type="range" class="midi-control" data-midi-cc="7">
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(2)
    })
  })

  describe("enableAutoBinding", () => {
    beforeEach(() => {
      binder = new DataAttributeBinder(mockController)
      binder.bindAll = vi.fn() // Mock for testing
    })

    it("should create a MutationObserver", () => {
      binder.enableAutoBinding()
      expect(binder.observer).toBeInstanceOf(MutationObserver)
    })

    it("should observe document body", () => {
      const observeSpy = vi.spyOn(MutationObserver.prototype, "observe")
      binder.enableAutoBinding()

      expect(observeSpy).toHaveBeenCalledWith(document.body, {
        childList: true,
        subtree: true,
      })

      observeSpy.mockRestore()
    })

    it("should not create multiple observers", () => {
      const observeSpy = vi.spyOn(MutationObserver.prototype, "observe")
      binder.enableAutoBinding()
      binder.enableAutoBinding()

      expect(observeSpy).toHaveBeenCalledTimes(1)

      observeSpy.mockRestore()
    })

    it("should handle already bound elements gracefully", () => {
      binder = new DataAttributeBinder(mockController)
      binder.enableAutoBinding()

      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")

      // Should not throw
      document.body.appendChild(element)
      return new Promise((resolve) => setTimeout(resolve, 100))
    })
  })

  describe("disableAutoBinding", () => {
    beforeEach(() => {
      binder = new DataAttributeBinder(mockController)
    })

    it("should disconnect the observer", () => {
      binder.enableAutoBinding()
      const disconnectSpy = vi.spyOn(binder.observer, "disconnect")

      binder.disableAutoBinding()

      expect(disconnectSpy).toHaveBeenCalled()
      expect(binder.observer).toBeNull()
    })

    it("should not throw when no observer exists", () => {
      expect(() => binder.disableAutoBinding()).not.toThrow()
    })

    it("should prevent further bindings", () => {
      binder.enableAutoBinding()
      binder.disableAutoBinding()

      const element = document.createElement("input")
      element.setAttribute("data-midi-cc", "74")
      document.body.appendChild(element)

      return new Promise((resolve) => {
        setTimeout(() => {
          // Should not have bound since observer was disabled
          expect(mockController.boundElements.size).toBe(0)
          document.body.removeChild(element)
          resolve()
        }, 100)
      })
    })
  })

  describe("destroy", () => {
    beforeEach(() => {
      binder = new DataAttributeBinder(mockController)
    })

    it("should disable auto binding", () => {
      binder.enableAutoBinding()
      const disconnectSpy = vi.spyOn(binder.observer, "disconnect")

      binder.destroy()

      expect(disconnectSpy).toHaveBeenCalled()
      expect(binder.observer).toBeNull()
    })

    it("should not throw when destroyed without auto binding", () => {
      expect(() => binder.destroy()).not.toThrow()
    })
  })

  describe("edge cases", () => {
    beforeEach(() => {
      binder = new DataAttributeBinder(mockController)
    })

    it("should handle elements without a form or default values", () => {
      document.body.innerHTML = `
				<div data-midi-cc="74"></div>
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(1)
    })

    it("should handle mixed valid and invalid elements", () => {
      document.body.innerHTML = `
				<input type="range" data-midi-cc="74">
				<input type="range" data-midi-cc="invalid">
				<input type="range" data-midi-cc="200">
				<input type="range" data-midi-cc="71">
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(2)
    })

    it("should handle non-input elements", () => {
      document.body.innerHTML = `
				<div data-midi-cc="74"></div>
				<span data-midi-cc="71"></span>
			`

      binder.bindAll()

      expect(mockController.boundElements.size).toBe(2)
    })

    it("should preserve existing attributes", () => {
      document.body.innerHTML = `
				<input type="range" data-midi-cc="74" class="slider" id="cutoff">
			`

      const element = document.querySelector('[data-midi-cc="74"]')
      const originalClass = element.className
      const originalId = element.id

      binder.bindAll()

      expect(element.className).toBe(originalClass)
      expect(element.id).toBe(originalId)
      expect(element.getAttribute("data-midi-bound")).toBe("true")
    })

    describe("14-bit CC binding", () => {
      it("should bind 14-bit CC with MSB and LSB", () => {
        document.body.innerHTML = `
					<input type="range" data-midi-msb="74" data-midi-lsb="75" min="0" max="127" value="64">
				`

        binder.bindAll()

        const element = document.querySelector("[data-midi-msb][data-midi-lsb]")
        const config = mockController.boundElements.get(element)

        expect(config).toBeDefined()
        expect(config.is14Bit).toBe(true)
        expect(config.msb).toBe(74)
        expect(config.lsb).toBe(75)
        expect(config.min).toBe(0)
        expect(config.max).toBe(127)
      })

      it("should bind 14-bit CC with channel, invert and label", () => {
        document.body.innerHTML = `
					<input type="range" data-midi-msb="74" data-midi-lsb="75" data-midi-channel="5"
					       data-midi-invert="true" data-midi-label="Filter">
				`

        binder.bindAll()

        const element = document.querySelector("[data-midi-msb][data-midi-lsb]")
        const config = mockController.boundElements.get(element)

        expect(config.channel).toBe(5)
        expect(config.invert).toBe(true)
        expect(config.label).toBe("Filter")
      })

      it("should not bind invalid 14-bit CC (out of range)", () => {
        document.body.innerHTML = `
					<input type="range" data-midi-msb="200" data-midi-lsb="75">
					<input type="range" data-midi-msb="74" data-midi-lsb="200">
				`

        binder.bindAll()

        expect(mockController.boundElements.size).toBe(0)
      })

      it("should not bind when only MSB is provided", () => {
        document.body.innerHTML = `
					<input type="range" data-midi-msb="74" min="0" max="127" value="64">
				`

        binder.bindAll()

        expect(mockController.boundElements.size).toBe(0)
      })

      it("should not bind when only LSB is provided", () => {
        document.body.innerHTML = `
					<input type="range" data-midi-lsb="75" min="0" max="127" value="64">
				`

        binder.bindAll()

        expect(mockController.boundElements.size).toBe(0)
      })

      it("should handle missing min/max for 14-bit CC", () => {
        document.body.innerHTML = `
					<input type="range" data-midi-msb="74" data-midi-lsb="75">
				`

        binder.bindAll()

        const element = document.querySelector("[data-midi-msb][data-midi-lsb]")
        const config = mockController.boundElements.get(element)

        expect(config.min).toBe(0)
        expect(config.max).toBe(127)
      })
    })

    describe("child element binding", () => {
      it("should not bind child elements that are already bound", () => {
        document.body.innerHTML = `
					<div class="container">
						<input type="range" data-midi-cc="74" value="64">
						<input type="range" data-midi-cc="75" value="32">
					</div>
				`

        binder.bindAll()

        expect(mockController.boundElements.size).toBe(2)

        // Try to bind again
        binder.bindAll()

        // Should still be only 2, not 4
        expect(mockController.boundElements.size).toBe(2)
      })

      it("should bind new child elements added after first bindAll", () => {
        document.body.innerHTML = `
					<div class="container">
						<input type="range" data-midi-cc="74" value="64">
					</div>
				`

        binder.bindAll()
        expect(mockController.boundElements.size).toBe(1)

        // Add a new element
        const container = document.querySelector(".container")
        const newInput = document.createElement("input")
        newInput.setAttribute("type", "range")
        newInput.setAttribute("data-midi-cc", "75")
        newInput.value = "32"
        container.appendChild(newInput)

        // Bind again
        binder.bindAll()

        // Should bind the new element but not re-bind the old one
        expect(mockController.boundElements.size).toBe(2)
      })
    })

    describe("edge cases", () => {
      it("should handle element removal and re-addition", () => {
        document.body.innerHTML = `
					<input type="range" data-midi-cc="74" value="64">
				`

        binder.bindAll()
        const element = document.querySelector('[data-midi-cc="74"]')
        expect(mockController.boundElements.has(element)).toBe(true)

        // Remove element
        element.remove()
        expect(mockController.boundElements.has(element)).toBe(true) // Still bound

        // Re-add element
        document.body.appendChild(element)
        binder.bindAll()

        // Should not re-bind due to data-midi-bound attribute
        expect(mockController.boundElements.has(element)).toBe(true)
      })

      it("should handle binding when document has no elements", () => {
        document.body.innerHTML = ""

        expect(() => binder.bindAll()).not.toThrow()
        expect(mockController.boundElements.size).toBe(0)
      })

      it("should handle null selector gracefully", () => {
        binder = new DataAttributeBinder(mockController)
        binder.selector = null

        document.body.innerHTML = `
					<input type="range" data-midi-cc="74" value="64">
				`

        // This will likely throw or do nothing
        expect(() => binder.bindAll()).not.toThrow()
      })
    })
  })
})
