import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MIDI_EVENTS, MIDIController } from "./MIDIController.js"

// Mock the dependencies
const mockOutputs = [
  {
    id: "output-1",
    name: "Test Output 1",
    manufacturer: "Test Manufacturer",
    send: vi.fn(),
  },
  {
    id: "output-2",
    name: "Test Output 2",
    manufacturer: "Test Manufacturer",
    send: vi.fn(),
  },
]

const mockInput = {
  id: "input-1",
  name: "Test Input",
  manufacturer: "Test Manufacturer",
  onmidimessage: null,
}

const createMockMIDIAccess = () => ({
  outputs: new Map([
    ["output-1", mockOutputs[0]],
    ["output-2", mockOutputs[1]],
  ]),
  inputs: new Map([["input-1", mockInput]]),
})

describe("MIDIController", () => {
  let midiController
  let mockMIDIAccess
  let originalNavigator

  beforeEach(() => {
    vi.clearAllMocks()
    mockMIDIAccess = createMockMIDIAccess()
    originalNavigator = global.navigator

    global.navigator = {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockMIDIAccess),
    }

    midiController = new MIDIController({
      sysex: true,
      channel: 2,
    })
  })

  afterEach(() => {
    global.navigator = originalNavigator
  })

  describe("constructor", () => {
    it("should create controller with default options", () => {
      const controller = new MIDIController({ channel: 1 })
      expect(controller.options.channel).toBe(1)
      expect(controller.options.autoConnect).toBe(true)
      expect(controller.options.sysex).toBe(false)
    })

    it("should track CC state", () => {
      expect(midiController.state).toBeInstanceOf(Map)
      expect(midiController.bindings).toBeInstanceOf(Map)
    })
  })

  describe("initialize", () => {
    it("should initialize MIDI access and connect", async () => {
      await midiController.initialize()
      expect(midiController.initialized).toBe(true)
      expect(midiController.connection).toBeTruthy()
    })

    it("should warn if already initialized", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      await midiController.initialize()

      consoleSpy.mockClear()
      await midiController.initialize()

      expect(consoleSpy).toHaveBeenCalledWith("MIDI Controller already initialized")
      consoleSpy.mockRestore()
    })

    it("should connect to input if specified", async () => {
      midiController = new MIDIController({
        input: 0,
        autoConnect: false,
      })

      await midiController.initialize()
      expect(midiController.getCurrentInput()).toBeTruthy()
    })

    it("should emit error on initialization failure", async () => {
      global.navigator.requestMIDIAccess = vi.fn().mockRejectedValue(new Error("Access denied"))

      const errorHandler = vi.fn()
      midiController = new MIDIController({
        onError: errorHandler,
      })

      await expect(midiController.initialize()).rejects.toThrow("Access denied")
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe("connectInput", () => {
    beforeEach(async () => {
      await midiController.initialize()
    })

    it("should connect to input and emit event", async () => {
      const spy = vi.fn()
      midiController.on("input-connected", spy)

      await midiController.connectInput("Test Input")

      expect(spy).toHaveBeenCalledWith({
        id: "input-1",
        name: "Test Input",
        manufacturer: "Test Manufacturer",
      })
    })
  })

  describe("sendCC", () => {
    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()
    })

    it("should warn if not initialized", () => {
      const controller = new MIDIController()
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      controller.sendCC(7, 100)

      expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
      consoleSpy.mockRestore()
    })

    it("should send CC with correct status", async () => {
      midiController.sendCC(74, 100, 5)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb4, 74, 100]))
    })

    it("should clamp cc value to valid range", async () => {
      midiController.sendCC(200, 100)
      midiController.sendCC(-50, 100)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 127, 100]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 0, 100]))
    })

    it("should clamp value to valid range", async () => {
      midiController.sendCC(7, 200)
      midiController.sendCC(7, -50)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 7, 127]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 7, 0]))
    })

    it("should clamp channel to valid range", async () => {
      midiController.sendCC(7, 100, 22)
      midiController.sendCC(7, 100, 0)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb0, 7, 100]))
    })

    it("should store CC state", async () => {
      midiController.sendCC(74, 100, 3)

      expect(midiController.getCC(74, 3)).toBe(100)
    })

    it("should emit cc-send event", async () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.CC_SEND, spy)

      midiController.sendCC(74, 100, 2)

      expect(spy).toHaveBeenCalledWith({
        cc: 74,
        value: 100,
        channel: 2,
      })
    })
  })

  describe("sendSysEx", () => {
    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()
    })

    it("should warn if not initialized", () => {
      const controller = new MIDIController({ sysex: true })
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      controller.sendSysEx([0x42, 0x30])

      expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
      consoleSpy.mockRestore()
    })

    it("should warn if sysex not enabled", async () => {
      const controller = new MIDIController()
      await controller.initialize()
      await controller.connection.connect()

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      controller.sendSysEx([0x42, 0x30])

      expect(consoleSpy).toHaveBeenCalledWith("SysEx not enabled. Initialize with sysex: true")
      consoleSpy.mockRestore()
    })

    it("should send SysEx message", async () => {
      midiController.sendSysEx([0x42, 0x30, 0x00, 0x01, 0x2f, 0x12])

      expect(mockOutputs[0].send).toHaveBeenCalledWith(
        new Uint8Array([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7]),
      )
    })

    it("should emit sysex-send event", async () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.SYSEX_SEND, spy)

      midiController.sendSysEx([0x42, 0x30])

      expect(spy).toHaveBeenCalledWith({
        data: [0x42, 0x30],
        includeWrapper: false,
      })
    })
  })

  describe("sendNoteOn", () => {
    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()
      await controller.initialize()

      controller.sendNoteOn(60, 100)
      // Should not throw, just return early
    })

    it("should send note on with correct status", async () => {
      midiController.sendNoteOn(60, 100, 5)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x94, 60, 100]))
    })

    it("should clamp note to valid range", async () => {
      midiController.sendNoteOn(200, 100)
      midiController.sendNoteOn(-50, 100)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 127, 100]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 0, 100]))
    })

    it("should use default velocity", async () => {
      midiController.sendNoteOn(60)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 60, 64]))
    })

    it("should emit note-on-send event", async () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.NOTE_ON_SEND, spy)

      midiController.sendNoteOn(60, 100, 2)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        velocity: 100,
        channel: 2,
      })
    })
  })

  describe("sendNoteOff", () => {
    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()
      await controller.initialize()

      controller.sendNoteOff(60)
      // Should not throw, just return early
    })

    it("should send note off with correct status", async () => {
      midiController.sendNoteOff(60, 2, 50)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 60, 50]))
    })

    it("should use default velocity", async () => {
      midiController.sendNoteOff(60, 5)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x94, 60, 0]))
    })

    it("should emit note-off-send event", async () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.NOTE_OFF_SEND, spy)

      midiController.sendNoteOff(60, 3, 40)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        channel: 3,
        velocity: 40,
      })
    })
  })

  describe("bind and unbind", () => {
    let mockElement

    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()

      mockElement = {
        value: "64",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
      }
    })

    it("should bind element and send initial value", () => {
      const unbind = midiController.bind(mockElement, {
        cc: 74,
        channel: 2,
      })

      expect(mockElement.addEventListener).toHaveBeenCalledWith("input", expect.any(Function))
      expect(mockElement.addEventListener).toHaveBeenCalledWith("change", expect.any(Function))
      expect(typeof unbind).toBe("function")

      // Initial value should be sent
      expect(mockOutputs[0].send).toHaveBeenCalled()
    })

    it("should warn if element is null", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      const unbind = midiController.bind(null, { cc: 74 })

      expect(consoleSpy).toHaveBeenCalledWith("Cannot bind: element is null or undefined")
      expect(typeof unbind).toBe("function")
      consoleSpy.mockRestore()
    })

    it("should unbind element", () => {
      const unbind = midiController.bind(mockElement, { cc: 74 })

      unbind()

      expect(mockElement.removeEventListener).toHaveBeenCalledWith("input", expect.any(Function))
      expect(mockElement.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function))
    })

    it("should handle unbind of non-bound element", () => {
      expect(() => midiController.unbind(mockElement)).not.toThrow()
    })

    describe("14-bit CC binding", () => {
      it("should bind 14-bit CC with handler that normalizes and sends MSB/LSB", async () => {
        await midiController.initialize()
        await midiController.connection.connect()

        const element = {
          value: "64",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          getAttribute: vi.fn((attr) => {
            if (attr === "min") return "0"
            if (attr === "max") return "127"
            return null
          }),
        }

        const config = {
          msb: 74,
          lsb: 75,
          is14Bit: true,
          channel: 3,
          min: 0,
          max: 127,
          invert: false,
        }

        midiController._createBinding(element, config)

        expect(element.addEventListener).toHaveBeenCalledWith("input", expect.any(Function))
        expect(element.addEventListener).toHaveBeenCalledWith("change", expect.any(Function))

        // Trigger the handler to verify it works
        element.value = "100"
        const handler = element.addEventListener.mock.calls[0][1]
        handler({ target: element })

        // Should send two CC messages (MSB and LSB)
        expect(mockOutputs[0].send).toHaveBeenCalled()
      })

      it("should handle NaN value in 14-bit binding", async () => {
        await midiController.initialize()

        const element = {
          value: "invalid",
          addEventListener: vi.fn(),
        }

        const config = {
          msb: 74,
          lsb: 75,
          is14Bit: true,
          channel: 3,
          min: 0,
          max: 127,
          invert: false,
        }

        midiController._createBinding(element, config)
        const handler = element.addEventListener.mock.calls[0][1]

        // Should handle NaN gracefully (not throw)
        expect(() => handler({ target: element })).not.toThrow()
      })

      it("should handle inverted values for 14-bit CC", async () => {
        await midiController.initialize()
        await midiController.connection.connect()

        const element = {
          value: "100",
          addEventListener: vi.fn(),
          getAttribute: vi.fn((attr) => {
            if (attr === "min") return "0"
            if (attr === "max") return "127"
            return null
          }),
        }

        const config = {
          msb: 74,
          lsb: 75,
          is14Bit: true,
          channel: 3,
          min: 0,
          max: 127,
          invert: true,
        }

        midiController._createBinding(element, config)
        const handler = element.addEventListener.mock.calls[0][1]
        handler({ target: element })

        // Should send inverted values
        expect(mockOutputs[0].send).toHaveBeenCalled()
      })

      it("should destroy 14-bit binding and remove event listeners", async () => {
        await midiController.initialize()

        const element = {
          value: "64",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
        }

        const config = {
          msb: 74,
          lsb: 75,
          is14Bit: true,
          channel: 3,
          invert: false,
        }

        const binding = midiController._createBinding(element, config)
        binding.destroy()

        expect(element.removeEventListener).toHaveBeenCalledWith("input", expect.any(Function))
        expect(element.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function))
      })

      it("should use custom min/max values from config", async () => {
        await midiController.initialize()

        const element = {
          value: "50",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
        }

        const config = {
          msb: 74,
          lsb: 75,
          is14Bit: true,
          min: 10,
          max: 100,
          invert: false,
        }

        midiController._createBinding(element, config)

        expect(element.getAttribute).not.toHaveBeenCalled() // Should use config values, not element attributes
      })
    })
  })

  describe("getCC", () => {
    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()
    })

    it("should return undefined for unknown CC", () => {
      expect(midiController.getCC(74, 2)).toBeUndefined()
    })

    it("should return stored CC value", async () => {
      midiController.sendCC(74, 100, 3)
      expect(midiController.getCC(74, 3)).toBe(100)
    })

    it("should use default channel", () => {
      midiController.sendCC(7, 64)
      expect(midiController.getCC(7, 2)).toBe(64) // Default channel is 2
    })
  })

  describe("getOutputs", () => {
    it("should return outputs from connection", async () => {
      await midiController.initialize()
      const outputs = midiController.getOutputs()

      expect(outputs).toHaveLength(2)
      expect(outputs[0].name).toBe("Test Output 1")
    })

    it("should return empty array if no connection", () => {
      expect(midiController.getOutputs()).toEqual([])
    })
  })

  describe("getInputs", () => {
    it("should return inputs from connection", async () => {
      await midiController.initialize()
      const inputs = midiController.getInputs()

      expect(inputs).toHaveLength(1)
      expect(inputs[0].name).toBe("Test Input")
    })

    it("should return empty array if no connection", () => {
      expect(midiController.getInputs()).toEqual([])
    })
  })

  describe("setOutput", () => {
    beforeEach(async () => {
      await midiController.initialize()
    })

    it("should switch output and emit event", async () => {
      await midiController.connection.connect(0)
      const spy = vi.fn()
      midiController.on("output-changed", spy)

      await midiController.setOutput(1)

      expect(spy).toHaveBeenCalled()
      expect(midiController.getCurrentOutput().id).toBe("output-2")
    })
  })

  describe("getCurrentOutput", () => {
    it("should return current output", async () => {
      await midiController.initialize()
      await midiController.connection.connect(0)

      const output = midiController.getCurrentOutput()
      expect(output.id).toBe("output-1")
    })

    it("should return null if no connection", () => {
      expect(midiController.getCurrentOutput()).toBeNull()
    })
  })

  describe("getCurrentInput", () => {
    it("should return current input", async () => {
      await midiController.initialize()
      await midiController.connectInput(0)

      const input = midiController.getCurrentInput()
      expect(input.id).toBe("input-1")
    })

    it("should return null if no connection", () => {
      expect(midiController.getCurrentInput()).toBeNull()
    })
  })

  describe("destroy", () => {
    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()
    })

    it("should clean up all bindings", () => {
      // Create mock binding
      const mockBinding = {
        destroy: vi.fn(),
      }
      midiController.bindings.set({}, mockBinding)

      midiController.destroy()

      expect(mockBinding.destroy).toHaveBeenCalled()
      expect(midiController.bindings.size).toBe(0)
    })

    it("should clear state", () => {
      midiController.state.set("1:7", 100)
      expect(midiController.state.size).toBeGreaterThan(0)

      midiController.destroy()

      expect(midiController.state.size).toBe(0)
    })

    it("should disconnect connection", () => {
      const spy = vi.spyOn(midiController.connection, "disconnect")

      midiController.destroy()

      expect(spy).toHaveBeenCalled()
    })

    it("should remove all listeners", () => {
      const spy = vi.fn()
      midiController.on("test", spy)

      midiController.destroy()

      midiController.emit("test")
      expect(spy).not.toHaveBeenCalled()
    })

    it("should emit destroyed event", () => {
      const spy = vi.fn()
      midiController.on("destroyed", spy)

      midiController.destroy()

      expect(spy).toHaveBeenCalled()
      expect(midiController.initialized).toBe(false)
    })

    it("should clean up on destroy", () => {
      midiController.destroy()
      expect(midiController.initialized).toBe(false)
    })
  })

  describe("_handleMIDIMessage", () => {
    beforeEach(async () => {
      await midiController.initialize()
    })

    it("should handle SysEx messages", () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.SYSEX_RECV, spy)

      const event = {
        data: new Uint8Array([0xf0, 0x42, 0x30, 0xf7]),
        midiwire: 1234,
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        data: [0xf0, 0x42, 0x30, 0xf7],
        timestamp: 1234,
      })
    })

    it("should handle CC messages", () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.CC_RECV, spy)

      const event = {
        data: new Uint8Array([0xb1, 74, 100]),
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        cc: 74,
        value: 100,
        channel: 2,
      })
      expect(midiController.getCC(74, 2)).toBe(100)
    })

    it("should handle Note On messages", () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.NOTE_ON_RECV, spy)

      const event = {
        data: new Uint8Array([0x91, 60, 100]),
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        velocity: 100,
        channel: 2,
      })
    })

    it("should handle Note Off messages (0x80)", () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.NOTE_OFF_RECV, spy)

      const event = {
        data: new Uint8Array([0x81, 60, 0]),
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        channel: 2,
      })
    })

    it("should handle Note Off messages (0x90 with velocity 0)", () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.NOTE_OFF_RECV, spy)

      const event = {
        data: new Uint8Array([0x91, 60, 0]),
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        channel: 2,
      })
    })

    it("should handle other MIDI messages", () => {
      const spy = vi.fn()
      midiController.on(MIDI_EVENTS.MIDI_MSG, spy)

      const event = {
        data: new Uint8Array([0xe1, 0x00, 0x40]),
        midiwire: 5678,
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        status: 0xe1,
        data: [0x00, 0x40],
        channel: 2,
        timestamp: 5678,
      })
    })
  })
})
