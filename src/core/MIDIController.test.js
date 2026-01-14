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

  describe("Patch Management", () => {
    beforeEach(async () => {
      await midiController.initialize()
      await midiController.connection.connect()
    })

    describe("getPatch", () => {
      it("should create patch with default name", () => {
        const patch = midiController.getPatch()

        expect(patch).toHaveProperty("name", "Unnamed Patch")
        expect(patch).toHaveProperty("device")
        expect(patch).toHaveProperty("timestamp")
        expect(patch).toHaveProperty("version", "1.0")
        expect(patch).toHaveProperty("channels")
        expect(patch).toHaveProperty("settings")
      })

      it("should create patch with custom name", () => {
        const patch = midiController.getPatch("My Patch")

        expect(patch.name).toBe("My Patch")
      })

      it("should include current CC values", () => {
        midiController.sendCC(74, 100, 2)
        midiController.sendCC(71, 64, 3)

        const patch = midiController.getPatch()

        expect(patch.channels["2"].ccs["74"]).toBe(100)
        expect(patch.channels["3"].ccs["71"]).toBe(64)
      })

      it("should include device information", () => {
        const patch = midiController.getPatch()

        expect(patch.device).toBe("Test Output 1")
      })

      it("should handle null device", async () => {
        await midiController.connection.disconnect()
        const patch = midiController.getPatch()

        expect(patch.device).toBeNull()
      })

      it("should collect control settings", () => {
        const element = {
          value: "50",
          id: "cutoff-slider",
          addEventListener: vi.fn(),
          getAttribute: vi.fn((attr) => {
            if (attr === "data-midi-label") return "Filter Cutoff"
            if (attr === "min" || attr === "max") return "0"
            return null
          }),
        }

        midiController.bind(element, {
          cc: 74,
          min: 20,
          max: 20000,
          channel: 2,
          invert: false,
        })

        const patch = midiController.getPatch()

        expect(patch.settings.cc74).toEqual({
          min: 20,
          max: 20000,
          invert: false,
          is14Bit: false,
          label: "Filter Cutoff",
          elementId: "cutoff-slider",
        })
      })
    })

    describe("setPatch", () => {
      it("should apply CC values from patch", async () => {
        const patch = {
          name: "Test Patch",
          channels: {
            1: {
              ccs: {
                74: 100,
                71: 64,
              },
            },
          },
        }

        await midiController.setPatch(patch)

        expect(midiController.getCC(74, 1)).toBe(100)
        expect(midiController.getCC(71, 1)).toBe(64)
        expect(mockOutputs[0].send).toHaveBeenCalled()
      })

      it("should throw error for invalid patch", async () => {
        await expect(midiController.setPatch(null)).rejects.toThrow("Invalid patch format")
        await expect(midiController.setPatch({})).rejects.toThrow("Invalid patch format")
      })

      it("should apply notes from patch", async () => {
        const patch = {
          name: "Test Patch",
          channels: {
            1: {
              notes: {
                60: 100, // Note on
                64: 0, // Note off
              },
            },
          },
        }

        await midiController.setPatch(patch)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x90, 60, 100]))
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x90, 64, 0]))
      })

      it("should emit PATCH_LOADED event", async () => {
        const spy = vi.fn()
        midiController.on(MIDI_EVENTS.PATCH_LOADED, spy)

        const patch = {
          name: "Test Patch",
          channels: {
            1: { ccs: { 74: 100 } },
          },
        }

        await midiController.setPatch(patch)

        expect(spy).toHaveBeenCalledWith({ patch })
      })

      it("should apply settings to controls when possible", async () => {
        const element = {
          value: "50",
          min: "0",
          max: "127",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element, { cc: 74, min: 0, max: 127, channel: 2 })

        const patch = {
          name: "Test Patch",
          channels: {
            2: { ccs: { 74: 100 } },
          },
          settings: {
            cc74: { min: 10, max: 1000 },
          },
        }

        await midiController.setPatch(patch)

        expect(element.min).toBe("10")
        expect(element.max).toBe("1000")
      })

      it("should convert MIDI CC value to element value with custom min/max", async () => {
        const element = {
          value: "1000",
          min: "20",
          max: "20000",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element, { cc: 74, min: 20, max: 20000, channel: 2 })

        // Create a patch with settings that match the binding config
        const patch = {
          name: "Test Patch",
          channels: {
            2: { ccs: { 74: 63 } }, // MIDI value ~50%
          },
          settings: {
            cc74: { min: 20, max: 20000, channel: 2 },
          },
        }

        await midiController.setPatch(patch)

        // MIDI value 63/127 ~ 0.496, so 20 + 0.496 * (20000-20) ≈ 9940
        const expectedValue = 20 + (63 / 127) * (20000 - 20)
        expect(Math.round(parseFloat(element.value))).toBe(Math.round(expectedValue))
        expect(element.dispatchEvent).toHaveBeenCalled()
        expect(element.dispatchEvent.mock.calls[0][0].type).toBe("input")
      })

      it("should convert MIDI CC value with inverted mapping", async () => {
        const element = {
          value: "64",
          min: "0",
          max: "127",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element, { cc: 74, invert: true, channel: 2 })

        const patch = {
          name: "Test Patch",
          channels: {
            2: { ccs: { 74: 63 } }, // MIDI value ~50%
          },
        }

        await midiController.setPatch(patch)

        // Inverted: 127 - (63/127)*(127-0) = 127 - 62.7 = 64.3
        const expectedValue = 127 - (63 / 127) * (127 - 0)
        expect(Math.round(parseFloat(element.value))).toBe(Math.round(expectedValue))
        expect(element.dispatchEvent).toHaveBeenCalled()
      })

      it("should handle CC values with default min/max", async () => {
        const element = {
          value: "64",
          min: "0",
          max: "127",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element, { cc: 74, channel: 2 })

        const patch = {
          name: "Test Patch",
          channels: {
            2: { ccs: { 74: 100 } },
          },
        }

        await midiController.setPatch(patch)

        // With default min/max (0/127), MIDI value 100 should map to element value 100
        expect(parseFloat(element.value)).toBe(100)
        expect(element.dispatchEvent).toHaveBeenCalled()
      })

      it("should handle missing CC values in patch gracefully", async () => {
        const element = {
          value: "64",
          min: "0",
          max: "127",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element, { cc: 74, channel: 2 })

        const patch = {
          name: "Test Patch",
          channels: {
            2: { ccs: { 75: 100 } }, // Different CC
          },
        }

        await midiController.setPatch(patch)

        // Element value should not change if CC is not in patch
        expect(parseFloat(element.value)).toBe(64)
        // Should not dispatch event for missing CC
        expect(element.dispatchEvent).not.toHaveBeenCalled()
      })

      it("should handle numeric string min/max values", async () => {
        const element = {
          value: "500",
          min: "100",
          max: "1000",
          addEventListener: vi.fn(),
          getAttribute: vi.fn((attr) => {
            if (attr === "min") return "100"
            if (attr === "max") return "1000"
            return null
          }),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element, { cc: 74, channel: 2 })

        const patch = {
          name: "Test Patch",
          channels: {
            2: { ccs: { 74: 100 } }, // Default min=100, max=1000
          },
        }

        await midiController.setPatch(patch)

        // Should parse string values correctly: 100 + (100/127)*(1000-100) = 100 + 708.66 = 808.66
        expect(parseFloat(element.value)).toBeGreaterThan(500)
        expect(element.dispatchEvent).toHaveBeenCalled()
      })

      it("should apply multiple CC values to multiple bound elements", async () => {
        const element1 = {
          value: "50",
          min: "0",
          max: "127",
          addEventListener: vi.fn(),
          getAttribute: vi.fn((attr) => {
            if (attr === "min") return "0"
            if (attr === "max") return "127"
            return null
          }),
          dispatchEvent: vi.fn(),
        }

        const element2 = {
          value: "1000",
          min: "20",
          max: "20000",
          addEventListener: vi.fn(),
          getAttribute: vi.fn((attr) => {
            if (attr === "min") return "20"
            if (attr === "max") return "20000"
            return null
          }),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element1, { cc: 74, channel: 2 })
        midiController.bind(element2, { cc: 75, channel: 2 })

        const patch = {
          name: "Test Patch",
          channels: {
            2: {
              ccs: {
                74: 100, // Should map to exactly 100 in 0-127 range
                75: 63, // Should map to 20 + (63/127)*(20000-20) ≈ 9940 in 20-20000 range
              },
            },
          },
        }

        await midiController.setPatch(patch)

        expect(parseFloat(element1.value)).toBe(100)
        const expectedValue = 20 + (63 / 127) * (20000 - 20)
        expect(Math.round(parseFloat(element2.value))).toBe(Math.round(expectedValue))
        expect(element1.dispatchEvent).toHaveBeenCalled()
        expect(element2.dispatchEvent).toHaveBeenCalled()
      })
    })

    describe("savePatch", () => {
      beforeEach(() => {
        vi.stubGlobal("localStorage", {
          setItem: vi.fn(),
          getItem: vi.fn(),
          removeItem: vi.fn(),
          length: 0,
          key: vi.fn(),
          clear: vi.fn(),
        })
      })

      afterEach(() => {
        vi.unstubAllGlobals()
      })

      it("should save patch to localStorage", () => {
        const patch = { name: "Test Patch", channels: { 1: { ccs: { 74: 100 } } } }
        const key = midiController.savePatch("Test Patch", patch)

        expect(key).toBe("midiwire_patch_Test Patch")
        expect(localStorage.setItem).toHaveBeenCalledWith(
          "midiwire_patch_Test Patch",
          JSON.stringify(patch),
        )
      })

      it("should use getPatch() if no patch provided", () => {
        midiController.sendCC(74, 100, 1)

        midiController.savePatch("My Patch")

        expect(localStorage.setItem).toHaveBeenCalled()
        const savedData = JSON.parse(localStorage.setItem.mock.calls[0][1])
        expect(savedData.name).toBe("My Patch")
        expect(savedData.channels["1"].ccs["74"]).toBe(100)
      })

      it("should emit PATCH_SAVED event", () => {
        const spy = vi.fn()
        midiController.on(MIDI_EVENTS.PATCH_SAVED, spy)

        midiController.savePatch("Test Patch")

        expect(spy).toHaveBeenCalled()
        expect(spy.mock.calls[0][0]).toHaveProperty("name", "Test Patch")
      })

      it("should handle localStorage errors", () => {
        localStorage.setItem = vi.fn().mockImplementation(() => {
          throw new Error("Quota exceeded")
        })

        expect(() => midiController.savePatch("Test Patch")).toThrow("Quota exceeded")
      })
    })

    describe("loadPatch", () => {
      beforeEach(() => {
        vi.stubGlobal("localStorage", {
          setItem: vi.fn(),
          getItem: vi.fn(),
          removeItem: vi.fn(),
          length: 0,
          key: vi.fn(),
          clear: vi.fn(),
        })
      })

      afterEach(() => {
        vi.unstubAllGlobals()
      })

      it("should load patch from localStorage", () => {
        const patch = { name: "Test Patch", channels: { 1: { ccs: { 74: 100 } } } }
        localStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(patch))

        const loaded = midiController.loadPatch("Test Patch")

        expect(loaded).toEqual(patch)
        expect(localStorage.getItem).toHaveBeenCalledWith("midiwire_patch_Test Patch")
      })

      it("should return null if patch not found", () => {
        localStorage.getItem = vi.fn().mockReturnValue(null)

        const loaded = midiController.loadPatch("Nonexistent")

        expect(loaded).toBeNull()
      })

      it("should emit PATCH_LOADED event", () => {
        const patch = { name: "Test Patch", channels: { 1: { ccs: { 74: 100 } } } }
        localStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(patch))

        const spy = vi.fn()
        midiController.on(MIDI_EVENTS.PATCH_LOADED, spy)

        midiController.loadPatch("Test Patch")

        expect(spy).toHaveBeenCalledWith({ name: "Test Patch", patch })
      })

      it("should handle JSON parse errors", () => {
        localStorage.getItem = vi.fn().mockReturnValue("invalid json")
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        const loaded = midiController.loadPatch("Test Patch")

        expect(loaded).toBeNull()
        expect(consoleSpy).toHaveBeenCalled()

        consoleSpy.mockRestore()
      })
    })

    describe("deletePatch", () => {
      beforeEach(() => {
        vi.stubGlobal("localStorage", {
          setItem: vi.fn(),
          getItem: vi.fn(),
          removeItem: vi.fn(),
          length: 0,
          key: vi.fn(),
          clear: vi.fn(),
        })
      })

      afterEach(() => {
        vi.unstubAllGlobals()
      })

      it("should delete patch from localStorage", () => {
        const result = midiController.deletePatch("Test Patch")

        expect(result).toBe(true)
        expect(localStorage.removeItem).toHaveBeenCalledWith("midiwire_patch_Test Patch")
      })

      it("should emit PATCH_DELETED event", () => {
        const spy = vi.fn()
        midiController.on(MIDI_EVENTS.PATCH_DELETED, spy)

        midiController.deletePatch("Test Patch")

        expect(spy).toHaveBeenCalledWith({ name: "Test Patch" })
      })

      it("should handle errors gracefully", () => {
        localStorage.removeItem = vi.fn().mockImplementation(() => {
          throw new Error("Storage error")
        })
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        const result = midiController.deletePatch("Test Patch")

        expect(result).toBe(false)
        expect(consoleSpy).toHaveBeenCalled()

        consoleSpy.mockRestore()
      })
    })

    describe("listPatches", () => {
      beforeEach(() => {
        vi.stubGlobal("localStorage", {
          setItem: vi.fn(),
          getItem: vi.fn(),
          removeItem: vi.fn(),
          length: 3,
          key: vi.fn((index) => {
            const keys = ["other_key", "midiwire_patch_A", "midiwire_patch_B"]
            return keys[index]
          }),
          clear: vi.fn(),
        })
      })

      afterEach(() => {
        vi.unstubAllGlobals()
      })

      it("should list all midiwire patches", () => {
        const patchA = { name: "Patch A", channels: { 1: { ccs: { 74: 100 } } } }
        const patchB = { name: "Patch B", channels: { 1: { ccs: { 71: 64 } } } }

        localStorage.getItem = vi.fn((key) => {
          if (key === "midiwire_patch_A") return JSON.stringify(patchA)
          if (key === "midiwire_patch_B") return JSON.stringify(patchB)
          return null
        })

        const patches = midiController.listPatches()

        expect(patches).toHaveLength(2)
        expect(patches[0].name).toBe("A")
        expect(patches[0].patch).toEqual(patchA)
        expect(patches[1].name).toBe("B")
        expect(patches[1].patch).toEqual(patchB)
      })

      it("should filter out invalid patches", () => {
        localStorage.getItem = vi.fn(() => null)

        const patches = midiController.listPatches()

        expect(patches).toHaveLength(0)
      })

      it("should sort patches by name", () => {
        const patchB = { name: "Patch B", channels: { 1: { ccs: { 74: 100 } } } }
        const patchA = { name: "Patch A", channels: { 1: { ccs: { 71: 64 } } } }

        localStorage.getItem = vi.fn((key) => {
          if (key === "midiwire_patch_A") return JSON.stringify(patchA)
          if (key === "midiwire_patch_B") return JSON.stringify(patchB)
          return null
        })

        const patches = midiController.listPatches()

        expect(patches[0].name).toBe("A")
        expect(patches[1].name).toBe("B")
      })
    })
  })
})
