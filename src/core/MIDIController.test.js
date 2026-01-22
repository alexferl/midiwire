import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONTROLLER_EVENTS, MIDIController } from "./MIDIController.js"

// Mock the dependencies
const mockOutputs = [
  {
    id: "output-1",
    name: "Test Output 1",
    manufacturer: "Test Manufacturer",
    state: "connected",
    send: vi.fn(),
  },
  {
    id: "output-2",
    name: "Test Output 2",
    manufacturer: "Test Manufacturer",
    state: "connected",
    send: vi.fn(),
  },
]

const mockInput = {
  id: "input-1",
  name: "Test Input",
  manufacturer: "Test Manufacturer",
  state: "connected",
  _onmidimessage: null,
  set onmidimessage(handler) {
    this._onmidimessage = handler
  },
  get onmidimessage() {
    return this._onmidimessage
  },
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

    it("should track state and bindings", () => {
      expect(midiController.state).toBeInstanceOf(Object)
      expect(midiController.state.controlChange).toBeInstanceOf(Map)
      expect(midiController.state.programChange).toBeInstanceOf(Map)
      expect(midiController.state.pitchBend).toBeInstanceOf(Map)
      expect(midiController.state.monoPressure).toBeInstanceOf(Map)
      expect(midiController.state.polyPressure).toBeInstanceOf(Map)
      expect(midiController.bindings).toBeInstanceOf(Map)
    })
  })

  describe("initialize", () => {
    it("should initialize MIDI access and connect", async () => {
      await midiController.init()
      expect(midiController.initialized).toBe(true)
      expect(midiController.connection).toBeTruthy()
    })

    it("should warn if already initialized", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      await midiController.init()

      consoleSpy.mockClear()
      await midiController.init()

      expect(consoleSpy).toHaveBeenCalledWith("MIDI Controller already initialized")
      consoleSpy.mockRestore()
    })

    it("should connect to input if specified", async () => {
      midiController = new MIDIController({
        input: 0,
        autoConnect: false,
      })

      await midiController.init()
      expect(midiController.device.getCurrentInput()).toBeTruthy()
    })

    it("should emit error on initialization failure", async () => {
      global.navigator.requestMIDIAccess = vi.fn().mockRejectedValue(new Error("Access denied"))

      const errorHandler = vi.fn()
      midiController = new MIDIController({
        onError: errorHandler,
      })

      await expect(midiController.init()).rejects.toThrow("Access denied")
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe("connectInput", () => {
    beforeEach(async () => {
      await midiController.init()
    })

    it("should connect to input and emit event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.DEV_IN_CONNECTED, spy)

      await midiController.device.connectInput("Test Input")

      expect(spy).toHaveBeenCalledWith({
        id: "input-1",
        name: "Test Input",
        manufacturer: "Test Manufacturer",
      })
    })

    it("should handle incoming MIDI messages via callback", async () => {
      await midiController.device.connectInput("Test Input")

      // Simulate a CC message through the input's onmidimessage handler
      const ccEvent = {
        data: new Uint8Array([0xb0, 74, 100]), // CC 74 on channel 1, value 100
      }

      // Call the onmidimessage handler directly - this should call _handleMIDIMessage
      mockInput.onmidimessage(ccEvent)

      // Verify the CC value was stored (which happens in _handleMIDIMessage)
      expect(midiController.channel.getCC(74, 1)).toBe(100)
    })
  })

  describe("sendCC", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should warn if not initialized", () => {
      const controller = new MIDIController()
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      controller.channel.sendCC(7, 100)

      expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
      consoleSpy.mockRestore()
    })

    it("should send CC with correct status", async () => {
      midiController.channel.sendCC(74, 100, 5)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb4, 74, 100]))
    })

    it("should clamp cc value to valid range", async () => {
      midiController.channel.sendCC(200, 100)
      midiController.channel.sendCC(-50, 100)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 127, 100]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 0, 100]))
    })

    it("should clamp value to valid range", async () => {
      midiController.channel.sendCC(7, 200)
      midiController.channel.sendCC(7, -50)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 7, 127]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 7, 0]))
    })

    it("should clamp channel to valid range", async () => {
      midiController.channel.sendCC(7, 100, 22)
      midiController.channel.sendCC(7, 100, 0)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb0, 7, 100]))
    })

    it("should store CC state", async () => {
      midiController.channel.sendCC(74, 100, 3)

      expect(midiController.channel.getCC(74, 3)).toBe(100)
    })

    it("should emit cc-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_CC_SEND, spy)

      midiController.channel.sendCC(74, 100, 2)

      expect(spy).toHaveBeenCalledWith({
        cc: 74,
        value: 100,
        channel: 2,
      })
    })
  })

  describe("exclusive", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should warn if not initialized", () => {
      const controller = new MIDIController({ sysex: true })
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      controller.system.ex([0x42, 0x30])

      expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
      consoleSpy.mockRestore()
    })

    it("should warn if sysex not enabled", async () => {
      const controller = new MIDIController()
      await controller.init()
      await controller.connection.connect()

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      controller.system.ex([0x42, 0x30])

      expect(consoleSpy).toHaveBeenCalledWith("SysEx not enabled. Initialize with sysex: true")
      consoleSpy.mockRestore()
    })

    it("should send SysEx message", async () => {
      midiController.system.ex([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7])

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7]))
    })

    it("should send SysEx message with wrapper bytes", async () => {
      midiController.system.ex([0x42, 0x30, 0x00, 0x01, 0x2f, 0x12], true)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7]))
    })

    it("should emit sysex-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.SYS_EX_SEND, spy)

      midiController.system.ex([0x42, 0x30])

      expect(spy).toHaveBeenCalledWith({
        data: [0x42, 0x30],
        includeWrapper: false,
      })
    })
  })

  describe("system namespace", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    describe("sys.exclusive", () => {
      it("should send SysEx message with data as-is (no wrapper)", async () => {
        midiController.system.ex([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7])

        expect(mockOutputs[0].send).toHaveBeenCalledWith(
          new Uint8Array([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7]),
        )
      })

      it("should send SysEx message with data as-is (default behavior)", async () => {
        midiController.system.ex([0x42, 0x30, 0x00, 0x01, 0x2f, 0x12])

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x42, 0x30, 0x00, 0x01, 0x2f, 0x12]))
      })

      it("should send SysEx message with wrapper added when includeWrapper=true", async () => {
        midiController.system.ex([0x42, 0x30, 0x00, 0x01, 0x2f, 0x12], true)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(
          new Uint8Array([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7]),
        )
      })

      it("should emit sysex-send event", async () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_EX_SEND, spy)

        midiController.system.ex([0x42, 0x30])

        expect(spy).toHaveBeenCalledWith({
          data: [0x42, 0x30],
          includeWrapper: false,
        })
      })

      it("should warn if sysex not enabled", async () => {
        const controller = new MIDIController()
        await controller.init()
        await controller.connection.connect()

        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.ex([0x42, 0x30])

        expect(consoleSpy).toHaveBeenCalledWith("SysEx not enabled. Initialize with sysex: true")
        consoleSpy.mockRestore()
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController({ sysex: true })
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.ex([0x42, 0x30])

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.sendClock", () => {
      it("should send timing clock message", async () => {
        midiController.system.sendClock()

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf8]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.sendClock()

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.start", () => {
      it("should send start message", async () => {
        midiController.system.start()

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xfa]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.start()

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.continue", () => {
      it("should send continue message", async () => {
        midiController.system.continue()

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xfb]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.continue()

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.stop", () => {
      it("should send stop message", async () => {
        midiController.system.stop()

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xfc]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.stop()

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.sendMTC", () => {
      it("should send MTC quarter frame message", async () => {
        midiController.system.sendMTC(0x45)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf1, 0x45]))
      })

      it("should clamp MTC data to valid range", async () => {
        midiController.system.sendMTC(150)
        midiController.system.sendMTC(-20)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf1, 127]))
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf1, 0]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.sendMTC(0x45)

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.sendSongPosition", () => {
      it("should send song position pointer message", async () => {
        midiController.system.sendSongPosition(8192) // Halfway position

        // 8192 = 0x00 + (0x40 << 7)
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf2, 0x00, 0x40]))
      })

      it("should send maximum song position", async () => {
        midiController.system.sendSongPosition(16383)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf2, 0x7f, 0x7f]))
      })

      it("should send minimum song position", async () => {
        midiController.system.sendSongPosition(0)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf2, 0x00, 0x00]))
      })

      it("should clamp position to valid range", async () => {
        midiController.system.sendSongPosition(20000)
        midiController.system.sendSongPosition(-5000)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf2, 0x7f, 0x7f]))
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf2, 0x00, 0x00]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.sendSongPosition(42)

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.sendSongSelect", () => {
      it("should send song select message", async () => {
        midiController.system.sendSongSelect(10)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf3, 10]))
      })

      it("should clamp song number to valid range", async () => {
        midiController.system.sendSongSelect(150)
        midiController.system.sendSongSelect(-20)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf3, 127]))
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf3, 0]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.sendSongSelect(10)

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.sendTuneRequest", () => {
      it("should send tune request message", async () => {
        midiController.system.sendTuneRequest()

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xf6]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.sendTuneRequest()

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.sendActiveSensing", () => {
      it("should send active sensing message", async () => {
        midiController.system.sendActiveSensing()

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xfe]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.sendActiveSensing()

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })

    describe("sys.sendSystemReset", () => {
      it("should send system reset message", async () => {
        midiController.system.sendSystemReset()

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xff]))
      })

      it("should warn if not initialized", () => {
        const controller = new MIDIController()
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

        controller.system.sendSystemReset()

        expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
        consoleSpy.mockRestore()
      })
    })
  })

  describe("send (raw MIDI)", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should send raw MIDI data", async () => {
      midiController.send([0x90, 0x3c, 0x64]) // Note on C4
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x90, 0x3c, 0x64]))
    })

    it("should warn if not initialized", () => {
      const controller = new MIDIController()
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      controller.send([0x90, 0x3c, 0x64])

      expect(consoleSpy).toHaveBeenCalledWith("MIDI not initialized. Call initialize() first.")
      consoleSpy.mockRestore()
    })

    it("should send multiple raw bytes correctly", async () => {
      midiController.send([0xc0, 0x40]) // Program change
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xc0, 0x40]))

      midiController.send([0xe0, 0x00, 0x40]) // Pitch bend center
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xe0, 0x00, 0x40]))
    })
  })

  describe("sendNoteOn", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()
      // Note: controller is NOT initialized

      controller.channel.sendNoteOn(60, 100)
      // Should not throw, just return early
      expect(controller.initialized).toBe(false)
    })

    it("should send note on with correct status", async () => {
      midiController.channel.sendNoteOn(60, 100, 5)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x94, 60, 100]))
    })

    it("should clamp note to valid range", async () => {
      midiController.channel.sendNoteOn(200, 100)
      midiController.channel.sendNoteOn(-50, 100)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 127, 100]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 0, 100]))
    })

    it("should use default velocity", async () => {
      midiController.channel.sendNoteOn(60)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 60, 64]))
    })

    it("should emit note-on-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_NOTE_ON_SEND, spy)

      midiController.channel.sendNoteOn(60, 100, 2)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        velocity: 100,
        channel: 2,
      })
    })
  })

  describe("sendNoteOff", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()
      // Note: controller is NOT initialized

      controller.channel.sendNoteOff(60)
      // Should not throw, just return early
      expect(controller.initialized).toBe(false)
    })

    it("should send note off with correct status", async () => {
      midiController.channel.sendNoteOff(60, 2, 50)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x91, 60, 50]))
    })

    it("should use default velocity", async () => {
      midiController.channel.sendNoteOff(60, 5)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x94, 60, 0]))
    })

    it("should emit note-off-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_NOTE_OFF_SEND, spy)

      midiController.channel.sendNoteOff(60, 3, 40)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        channel: 3,
        velocity: 40,
      })
    })
  })

  describe("sendPC", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()
      // Note: controller is NOT initialized

      controller.channel.sendPC(60)
      expect(controller.initialized).toBe(false)
    })

    it("should send program change with correct status", async () => {
      midiController.channel.sendPC(64, 5)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xc4, 64]))
    })

    it("should clamp program number to valid range", async () => {
      midiController.channel.sendPC(140, 1)
      midiController.channel.sendPC(-10, 1)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xc0, 127])) // Program change status with program 127 (max)
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xc0, 0])) // Program change status with program 0 (min)
    })

    it("should use default channel", async () => {
      midiController.channel.sendPC(40)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xc1, 40]))
    })

    it("should emit program-change-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_PC_SEND, spy)

      midiController.channel.sendPC(64, 3)

      expect(spy).toHaveBeenCalledWith({
        program: 64,
        channel: 3,
      })
    })

    it("should store program change state", async () => {
      midiController.channel.sendPC(64, 4)

      expect(midiController.channel.getPC(4)).toBe(64)
    })

    it("should return undefined for unknown program", () => {
      expect(midiController.channel.getPC(5)).toBeUndefined()
    })

    it("should use default channel for getProgram", async () => {
      midiController.channel.sendPC(32) // Sends on channel 2 (default)

      expect(midiController.channel.getPC()).toBe(32)
    })
  })

  describe("sendPitchBend", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()

      controller.channel.sendPitchBend(8192)
      expect(controller.initialized).toBe(false)
    })

    it("should send pitch bend with correct LSB/MSB bytes", async () => {
      midiController.channel.sendPitchBend(8192, 1) // Center position

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xe0, 0x00, 0x40])) // LSB = 0x00, MSB = 0x40
    })

    it("should send maximum pitch bend", async () => {
      midiController.channel.sendPitchBend(16383, 2) // Maximum

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xe1, 0x7f, 0x7f])) // LSB = 0x7F, MSB = 0x7F
    })

    it("should send minimum pitch bend", async () => {
      midiController.channel.sendPitchBend(0, 3) // Minimum

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xe2, 0x00, 0x00])) // LSB = 0x00, MSB = 0x00
    })

    it("should clamp value to valid range", async () => {
      midiController.channel.sendPitchBend(20000, 1)
      midiController.channel.sendPitchBend(-5000, 1)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xe0, 0x7f, 0x7f]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xe0, 0x00, 0x00]))
    })

    it("should use default channel", async () => {
      midiController.channel.sendPitchBend(10000) // Should use channel 2

      // 10000 = 16 + (78 << 7) = 16 + 9984 = 10000
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xe1, 0x10, 0x4e])) // LSB = 0x10 (16), MSB = 0x4E (78)
    })

    it("should emit pitch-bend-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_PITCH_BEND_SEND, spy)

      midiController.channel.sendPitchBend(9000, 4)

      expect(spy).toHaveBeenCalledWith({
        value: 9000,
        channel: 4,
      })
    })

    it("should store pitch bend state", async () => {
      midiController.channel.sendPitchBend(10000, 5)

      expect(midiController.channel.getPitchBend(5)).toBe(10000)
    })

    it("should return undefined for unknown pitch bend value", () => {
      expect(midiController.channel.getPitchBend(6)).toBeUndefined()
    })

    it("should use default channel for getPitchBend", async () => {
      midiController.channel.sendPitchBend(12000)

      expect(midiController.channel.getPitchBend()).toBe(12000)
    })
  })

  describe("sendMonoPressure", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()

      controller.channel.sendMonoPressure(100)
      expect(controller.initialized).toBe(false)
    })

    it("should send channel pressure with correct status", async () => {
      midiController.channel.sendMonoPressure(127, 3)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xd2, 127]))
    })

    it("should clamp pressure to valid range", async () => {
      midiController.channel.sendMonoPressure(140, 1)
      midiController.channel.sendMonoPressure(-10, 1)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xd0, 127]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xd0, 0]))
    })

    it("should use default channel", async () => {
      midiController.channel.sendMonoPressure(64)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xd1, 64]))
    })

    it("should emit channel-pressure-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_MONO_PRESS_SEND, spy)

      midiController.channel.sendMonoPressure(100, 5)

      expect(spy).toHaveBeenCalledWith({
        pressure: 100,
        channel: 5,
      })
    })

    it("should store channel pressure state", async () => {
      midiController.channel.sendMonoPressure(80, 6)

      expect(midiController.channel.getMonoPressure(6)).toBe(80)
    })

    it("should return undefined for unknown pressure", () => {
      expect(midiController.channel.getMonoPressure(7)).toBeUndefined()
    })

    it("should use default channel for getMonoPressure", async () => {
      midiController.channel.sendMonoPressure(90)

      expect(midiController.channel.getMonoPressure()).toBe(90)
    })
  })

  describe("sendPolyPressure", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should not send if not initialized", async () => {
      const controller = new MIDIController()

      controller.channel.sendPolyPressure(60, 100)
      expect(controller.initialized).toBe(false)
    })

    it("should send polyphonic pressure with correct status", async () => {
      midiController.channel.sendPolyPressure(60, 100, 4)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xa3, 60, 100]))
    })

    it("should clamp note and pressure to valid ranges", async () => {
      midiController.channel.sendPolyPressure(200, 140, 2)
      midiController.channel.sendPolyPressure(-50, -10, 2)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xa1, 127, 127]))
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xa1, 0, 0]))
    })

    it("should use default channel", async () => {
      midiController.channel.sendPolyPressure(64, 80)

      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xa1, 64, 80]))
    })

    it("should emit polyphonic-pressure-send event", async () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_POLY_PRESS_SEND, spy)

      midiController.channel.sendPolyPressure(72, 110, 7)

      expect(spy).toHaveBeenCalledWith({
        note: 72,
        pressure: 110,
        channel: 7,
      })
    })

    it("should store polyphonic pressure state", async () => {
      midiController.channel.sendPolyPressure(60, 95, 5)

      expect(midiController.channel.getPolyPressure(60, 5)).toBe(95)
    })

    it("should return undefined for unknown polyphonic pressure", () => {
      expect(midiController.channel.getPolyPressure(60, 8)).toBeUndefined()
    })

    it("should use default channel for getPolyPressure", async () => {
      midiController.channel.sendPolyPressure(72, 85)

      expect(midiController.channel.getPolyPressure(72)).toBe(85)
    })

    it("should store different pressures for different notes", async () => {
      midiController.channel.sendPolyPressure(60, 80, 3)
      midiController.channel.sendPolyPressure(64, 90, 3)
      midiController.channel.sendPolyPressure(67, 100, 3)

      expect(midiController.channel.getPolyPressure(60, 3)).toBe(80)
      expect(midiController.channel.getPolyPressure(64, 3)).toBe(90)
      expect(midiController.channel.getPolyPressure(67, 3)).toBe(100)
    })
  })

  describe("bind and unbind", () => {
    let mockElement

    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()

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

    it("should not send initial value when binding if not initialized", async () => {
      // Create controller but don't initialize
      const controller = new MIDIController()
      expect(controller.initialized).toBe(false)

      const element = {
        value: "64",
        addEventListener: vi.fn(),
        getAttribute: vi.fn(() => "0"),
      }

      controller.bind(element, {
        cc: 74,
        channel: 2,
      })

      // Initial value should NOT be sent since controller is not initialized
      expect(mockOutputs[0].send).not.toHaveBeenCalled()
    })

    describe("14-bit CC binding", () => {
      it("should bind 14-bit CC with handler that normalizes and sends MSB/LSB", async () => {
        await midiController.init()
        await midiController.device.connect()

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
        await midiController.init()

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

      it("should handle NaN value in 7-bit binding", async () => {
        await midiController.init()

        const element = {
          value: "invalid",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
        }

        midiController._createBinding(element, {
          cc: 74,
          channel: 3,
        })
        const handler = element.addEventListener.mock.calls[0][1]

        // Should handle NaN gracefully (not throw, just return early)
        expect(() => handler({ target: element })).not.toThrow()
      })

      it("should send CC on default channel when not specified for 7-bit", async () => {
        await midiController.init()
        await midiController.device.connect()

        const element = {
          value: "100",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
        }

        midiController._createBinding(element, {
          cc: 74,
          // Note: channel is NOT specified
        })
        const handler = element.addEventListener.mock.calls[0][1]

        element.value = "100"
        handler({ target: element })

        // Should use default channel (2)
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 74, 100]))
      })

      it("should handle inverted values for 14-bit CC", async () => {
        await midiController.init()
        await midiController.device.connect()

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
        await midiController.init()

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
        await midiController.init()

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

      it("should use default channel when not specified", async () => {
        await midiController.init()
        await midiController.device.connect()

        const element = {
          value: "100",
          addEventListener: vi.fn(),
          getAttribute: vi.fn(() => "0"),
        }

        const config = {
          msb: 74,
          lsb: 75,
          is14Bit: true,
          min: 0,
          max: 127,
          invert: false,
          // Note: channel is NOT specified, should use this.options.channel (which is 2)
        }

        midiController._createBinding(element, config)
        const handler = element.addEventListener.mock.calls[0][1]

        // Trigger the handler
        element.value = "100"
        handler({ target: element })

        // Should send CC messages on default channel (2) since no channel was specified
        expect(mockOutputs[0].send).toHaveBeenCalled()
      })
    })

    it("should call onInput callback when setPatch updates bound element", async () => {
      await midiController.init()
      await midiController.device.connect()

      const onInputCallback = vi.fn()
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

      // Bind with onInput callback - specify channel to match patch
      midiController.bind(element, {
        cc: 74,
        channel: 1,
        min: 0,
        max: 100,
        onInput: onInputCallback,
      })

      // Apply a patch that should trigger onInput
      const patch = {
        name: "Test Patch",
        device: "Test Output 1",
        timestamp: new Date().toISOString(),
        version: "1.0",
        channels: {
          1: {
            ccs: {
              74: 64, // This should call onInput with the converted value
            },
          },
        },
        settings: {},
      }

      await midiController.patch.set(patch)

      // onInput should have been called with the converted value
      expect(onInputCallback).toHaveBeenCalledTimes(1)
      // Value should be converted from MIDI (0-127) to element range (0-100) = 50.39...
      expect(onInputCallback).toHaveBeenCalledWith(expect.closeTo(50.39, 1))
    })

    it("should not call onInput callback when setPatch runs on element without callback", async () => {
      await midiController.init()
      await midiController.device.connect()

      const element = {
        value: "64",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
        dispatchEvent: vi.fn(),
      }

      // Bind WITHOUT onInput callback - specify channel to match patch
      const setValueSpy = vi.spyOn(element, "value", "set")
      midiController.bind(element, {
        cc: 75,
        channel: 1,
        min: 0,
        max: 100,
      })

      // Apply a patch
      const patch = {
        name: "Test Patch",
        device: "Test Output 1",
        timestamp: new Date().toISOString(),
        version: "1.0",
        channels: {
          1: {
            ccs: {
              75: 32,
            },
          },
        },
        settings: {},
      }

      await midiController.patch.set(patch)

      // element.value should be set directly (no onInput callback)
      expect(setValueSpy).toHaveBeenCalled()
      // Value should be in element range (0-100) = 25.19...
      expect(setValueSpy).toHaveBeenCalledWith(expect.closeTo(25.19, 1))
    })
  })

  describe("debouncing", () => {
    let _debounceElement

    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()

      _debounceElement = {
        value: "0",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
      }
    })

    it("should debounce rapid input changes", async () => {
      const element = {
        value: "0",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
      }

      midiController.bind(element, { cc: 74 }, { debounce: 50 })

      const handler = element.addEventListener.mock.calls[0][1]

      // Clear the initial call
      mockOutputs[0].send.mockClear()

      // Rapid changes
      element.value = "10"
      handler({ target: element })
      element.value = "20"
      handler({ target: element })
      element.value = "30"
      handler({ target: element })

      // Only last value should be sent after debounce period
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(mockOutputs[0].send).toHaveBeenCalledTimes(1)
      expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xb1, 74, 30]))
    })

    it("should clean up timeout on destroy", () => {
      const element = {
        value: "50",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
      }

      const unbind = midiController.bind(element, { cc: 74 }, { debounce: 100 })

      const handler = element.addEventListener.mock.calls[0][1]
      handler({ target: element }) // Trigger debounce

      unbind() // Should clear pending timeout

      // No error should occur
      expect(element.removeEventListener).toHaveBeenCalled()
    })

    it("should work without debouncing (default behavior)", () => {
      const element = {
        value: "0",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
      }

      midiController.bind(element, { cc: 74 })

      const handler = element.addEventListener.mock.calls[0][1]

      // Multiple changes should all be sent immediately
      element.value = "10"
      handler({ target: element })
      element.value = "20"
      handler({ target: element })
      element.value = "30"
      handler({ target: element })

      // All three should be sent immediately (no debouncing), plus the initial value
      expect(mockOutputs[0].send).toHaveBeenCalledTimes(4)
    })

    it("should debounce 14-bit CC changes", async () => {
      const element = {
        value: "0",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
      }

      midiController.bind(
        element,
        {
          msb: 74,
          lsb: 75,
          is14Bit: true,
        },
        { debounce: 50 },
      )

      const handler = element.addEventListener.mock.calls[0][1]

      // Clear initial calls
      mockOutputs[0].send.mockClear()

      // Rapid changes
      element.value = "100"
      handler({ target: element })
      element.value = "200"
      handler({ target: element })

      // Should send MSB+LSB for debounced final value only
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(mockOutputs[0].send).toHaveBeenCalledTimes(2)
    })

    it("should not debounce when debounce is 0", () => {
      const element = {
        value: "0",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getAttribute: vi.fn((attr) => {
          if (attr === "min") return "0"
          if (attr === "max") return "127"
          return null
        }),
      }

      midiController.bind(element, { cc: 74 }, { debounce: 0 })

      const handler = element.addEventListener.mock.calls[0][1]

      // Multiple changes
      element.value = "10"
      handler({ target: element })
      element.value = "20"
      handler({ target: element })

      // Both should be sent immediately, plus the initial value
      expect(mockOutputs[0].send).toHaveBeenCalledTimes(3)
    })
  })

  describe("getPatch with edge cases", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should collect settings from elements without getAttribute method", () => {
      const element = {
        value: "50",
        id: "test-slider",
        addEventListener: vi.fn(),
        // Note: No getAttribute method - this tests the optional chaining
      }

      midiController.bind(element, {
        cc: 74,
        min: 0,
        max: 127,
        channel: 2,
      })

      // Should not throw even though element has no getAttribute
      const patch = midiController.patch.get()
      expect(patch.settings.cc74).toBeDefined()
      expect(patch.settings.cc74.label).toBeNull()
      expect(patch.settings.cc74.elementId).toBe("test-slider")
    })

    it("should include all CC values in state", () => {
      // Send multiple CC messages on different channels
      midiController.channel.sendCC(74, 100, 1)
      midiController.channel.sendCC(75, 64, 2)
      midiController.channel.sendCC(76, 32, 3)

      const patch = midiController.patch.get()

      // Verify all CC values are collected
      expect(patch.channels[1].ccs[74]).toBe(100)
      expect(patch.channels[2].ccs[75]).toBe(64)
      expect(patch.channels[3].ccs[76]).toBe(32)
    })

    it("should create channel objects as needed", () => {
      // Only send CC on channel 5
      midiController.channel.sendCC(74, 100, 5)

      const patch = midiController.patch.get()

      // Should create channel 5 object
      expect(patch.channels[5]).toBeDefined()
      expect(patch.channels[5].ccs[74]).toBe(100)
      // Other channels should be empty or not exist
      expect(patch.channels[1]).toBeUndefined()
      expect(patch.channels[2]).toBeUndefined()
    })
  })

  describe("getCC", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    it("should return undefined for unknown CC", () => {
      expect(midiController.channel.getCC(74, 2)).toBeUndefined()
    })

    it("should return stored CC value", async () => {
      midiController.channel.sendCC(74, 100, 3)
      expect(midiController.channel.getCC(74, 3)).toBe(100)
    })

    it("should use default channel", () => {
      midiController.channel.sendCC(7, 64)
      expect(midiController.channel.getCC(7, 2)).toBe(64) // Default channel is 2
    })
  })

  describe("getOutputs", () => {
    it("should return outputs from connection", async () => {
      await midiController.init()
      const outputs = midiController.device.getOutputs()

      expect(outputs).toHaveLength(2)
      expect(outputs[0].name).toBe("Test Output 1")
    })

    it("should return empty array if no connection", () => {
      expect(midiController.device.getOutputs()).toEqual([])
    })
  })

  describe("getInputs", () => {
    it("should return inputs from connection", async () => {
      await midiController.init()
      const inputs = midiController.device.getInputs()

      expect(inputs).toHaveLength(1)
      expect(inputs[0].name).toBe("Test Input")
    })

    it("should return empty array if no connection", () => {
      expect(midiController.device.getInputs()).toEqual([])
    })
  })

  describe("connectOutput", () => {
    beforeEach(async () => {
      await midiController.init()
    })

    it("should switch output and emit event", async () => {
      await midiController.connection.connect(0)
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.DEV_OUT_CONNECTED, spy)

      await midiController.device.connectOutput(1)

      expect(spy).toHaveBeenCalled()
      expect(midiController.device.getCurrentOutput().id).toBe("output-2")
    })
  })

  describe("getCurrentOutput", () => {
    it("should return current output", async () => {
      await midiController.init()
      await midiController.connection.connect(0)

      const output = midiController.device.getCurrentOutput()
      expect(output.id).toBe("output-1")
    })

    it("should return null if no connection", () => {
      expect(midiController.device.getCurrentOutput()).toBeNull()
    })
  })

  describe("getCurrentInput", () => {
    it("should return current input", async () => {
      await midiController.init()
      await midiController.device.connectInput(0)

      const input = midiController.device.getCurrentInput()
      expect(input.id).toBe("input-1")
    })

    it("should return null if no connection", () => {
      expect(midiController.device.getCurrentInput()).toBeNull()
    })
  })

  describe("device.connect and device.disconnect", () => {
    it("should connect to device using helper", async () => {
      await midiController.init()
      const spy = vi.spyOn(midiController.connection, "connect")

      await midiController.device.connect()

      expect(spy).toHaveBeenCalled()
    })

    it("should connect to specific device using helper", async () => {
      await midiController.init()
      const spy = vi.spyOn(midiController.connection, "connect")

      await midiController.device.connect("Test Output 1")

      expect(spy).toHaveBeenCalledWith("Test Output 1")
    })

    it("should disconnect using helper", async () => {
      await midiController.init()
      await midiController.device.connect()
      const spy = vi.spyOn(midiController.connection, "disconnect")

      await midiController.device.disconnect()

      expect(spy).toHaveBeenCalled()
    })
  })

  describe("destroy", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
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
      midiController.state.controlChange.set("1:7", 100)
      expect(midiController.state.controlChange.size).toBeGreaterThan(0)

      midiController.destroy()

      expect(midiController.state.controlChange.size).toBe(0)
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
      midiController.on(CONTROLLER_EVENTS.DESTROYED, spy)

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
      await midiController.init()
    })

    it("should handle SysEx messages", () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.SYS_EX_RECV, spy)

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
      midiController.on(CONTROLLER_EVENTS.CH_CC_RECV, spy)

      const event = {
        data: new Uint8Array([0xb1, 74, 100]),
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        cc: 74,
        value: 100,
        channel: 2,
      })
      expect(midiController.channel.getCC(74, 2)).toBe(100)
    })

    it("should handle Note On messages", () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_NOTE_ON_RECV, spy)

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
      midiController.on(CONTROLLER_EVENTS.CH_NOTE_OFF_RECV, spy)

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
      midiController.on(CONTROLLER_EVENTS.CH_NOTE_OFF_RECV, spy)

      const event = {
        data: new Uint8Array([0x91, 60, 0]),
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        channel: 2,
      })
    })

    it("should handle Program Change messages", () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_PC_RECV, spy)

      const event = {
        data: new Uint8Array([0xc1, 64]), // Program 64 on channel 2
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        program: 64,
        channel: 2,
      })
      expect(midiController.channel.getPC(2)).toBe(64)
    })

    it("should handle Pitch Bend messages", () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_PITCH_BEND_RECV, spy)

      const event = {
        data: new Uint8Array([0xe2, 0x20, 0x40]), // Pitch bend with LSB=0x20, MSB=0x40
      }

      midiController._handleMIDIMessage(event)

      // Calculate expected value: 0x20 + (0x40 << 7) = 32 + 8192 = 8224
      const expectedValue = 0x20 + (0x40 << 7)
      expect(spy).toHaveBeenCalledWith({
        value: expectedValue,
        channel: 3,
      })
      expect(midiController.channel.getPitchBend(3)).toBe(expectedValue)
    })

    it("should handle Channel Pressure (Aftertouch) messages", () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_MONO_PRESS_RECV, spy)

      const event = {
        data: new Uint8Array([0xd3, 100]), // Channel pressure value 100 on channel 4
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        pressure: 100,
        channel: 4,
      })
      expect(midiController.channel.getMonoPressure(4)).toBe(100)
    })

    it("should handle Polyphonic Pressure (Polyphonic Aftertouch) messages", () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.CH_POLY_PRESS_RECV, spy)

      const event = {
        data: new Uint8Array([0xa4, 60, 110]), // Note 60, pressure 110 on channel 5
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        note: 60,
        pressure: 110,
        channel: 5,
      })
      expect(midiController.channel.getPolyPressure(60, 5)).toBe(110)
    })

    describe("System Real-Time message handlers", () => {
      it("should handle timing clock messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_CLOCK_RECV, spy)

        const event = {
          data: new Uint8Array([0xf8]),
          midiwire: 9999,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          timestamp: 9999,
        })
      })

      it("should handle start messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_START_RECV, spy)

        const event = {
          data: new Uint8Array([0xfa]),
          midiwire: 8888,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          timestamp: 8888,
        })
      })

      it("should handle continue messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_CONTINUE_RECV, spy)

        const event = {
          data: new Uint8Array([0xfb]),
          midiwire: 7777,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          timestamp: 7777,
        })
      })

      it("should handle stop messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_STOP_RECV, spy)

        const event = {
          data: new Uint8Array([0xfc]),
          midiwire: 6666,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          timestamp: 6666,
        })
      })

      it("should handle active sensing messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_ACT_SENSE_RECV, spy)

        const event = {
          data: new Uint8Array([0xfe]),
          midiwire: 5555,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          timestamp: 5555,
        })
      })

      it("should handle system reset messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_RESET_RECV, spy)

        const event = {
          data: new Uint8Array([0xff]),
          midiwire: 4444,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          timestamp: 4444,
        })
      })
    })

    describe("System Common message handlers", () => {
      it("should handle MTC quarter frame messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_MTC_RECV, spy)

        const event = {
          data: new Uint8Array([0xf1, 0x45]),
          midiwire: 3333,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          data: 0x45,
          timestamp: 3333,
        })
      })

      it("should handle song position pointer messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_SONG_POS_RECV, spy)

        const event = {
          data: new Uint8Array([0xf2, 0x20, 0x40]),
          midiwire: 2222,
        }

        midiController._handleMIDIMessage(event)

        // Position = 0x20 + (0x40 << 7) = 32 + 8192 = 8224
        expect(spy).toHaveBeenCalledWith({
          position: 8224,
          timestamp: 2222,
        })
      })

      it("should handle song select messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_SONG_SEL_RECV, spy)

        const event = {
          data: new Uint8Array([0xf3, 42]),
          midiwire: 1111,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          song: 42,
          timestamp: 1111,
        })
      })

      it("should handle tune request messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.SYS_TUNE_REQ_RECV, spy)

        const event = {
          data: new Uint8Array([0xf6]),
          midiwire: 1000,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          timestamp: 1000,
        })
      })

      it("should handle end of SysEx messages", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.MIDI_RAW, spy)

        const event = {
          data: new Uint8Array([0xf7]),
          midiwire: 1234,
        }

        midiController._handleMIDIMessage(event)

        expect(spy).toHaveBeenCalledWith({
          status: 0xf7,
          data: [undefined, undefined],
          channel: 8,
          timestamp: 1234,
        })
      })
    })

    it("should handle other MIDI messages", () => {
      const spy = vi.fn()
      midiController.on(CONTROLLER_EVENTS.MIDI_RAW, spy)

      const event = {
        data: new Uint8Array([0xf9]), // Undefined message - not handled specifically
        midiwire: 5678,
      }

      midiController._handleMIDIMessage(event)

      expect(spy).toHaveBeenCalledWith({
        status: 0xf9,
        data: [undefined, undefined], // destructuring gives undefined for missing values
        // Note: channel is calculated from status byte even for system messages
        // In practice, system messages (0xF0-0xFF) shouldn't be used here
        channel: 10,
        timestamp: 5678,
      })
    })
  })

  describe("Patch Management", () => {
    beforeEach(async () => {
      await midiController.init()
      await midiController.device.connect()
    })

    describe("getPatch", () => {
      it("should create patch with default name", () => {
        const patch = midiController.patch.get()

        expect(patch).toHaveProperty("name", "Unnamed Patch")
        expect(patch).toHaveProperty("device")
        expect(patch).toHaveProperty("timestamp")
        expect(patch).toHaveProperty("version", "1.0")
        expect(patch).toHaveProperty("channels")
        expect(patch).toHaveProperty("settings")
      })

      it("should create patch with custom name", () => {
        const patch = midiController.patch.get("My Patch")

        expect(patch.name).toBe("My Patch")
      })

      it("should include current CC values", () => {
        midiController.channel.sendCC(74, 100, 2)
        midiController.channel.sendCC(71, 64, 3)

        const patch = midiController.patch.get()

        expect(patch.channels["2"].ccs["74"]).toBe(100)
        expect(patch.channels["3"].ccs["71"]).toBe(64)
      })

      it("should include program change values", () => {
        midiController.channel.sendPC(64, 2)
        midiController.channel.sendPC(32, 5)

        const patch = midiController.patch.get()

        expect(patch.channels["2"].program).toBe(64)
        expect(patch.channels["5"].program).toBe(32)
      })

      it("should include pitch bend values", () => {
        midiController.channel.sendPitchBend(8192, 1)
        midiController.channel.sendPitchBend(12000, 3)

        const patch = midiController.patch.get()

        expect(patch.channels["1"].pitchBend).toBe(8192)
        expect(patch.channels["3"].pitchBend).toBe(12000)
      })

      it("should include channel pressure values", () => {
        midiController.channel.sendMonoPressure(100, 2)
        midiController.channel.sendMonoPressure(80, 4)

        const patch = midiController.patch.get()

        expect(patch.channels["2"].monoPressure).toBe(100)
        expect(patch.channels["4"].monoPressure).toBe(80)
      })

      it("should include polyphonic pressure values", () => {
        midiController.channel.sendPolyPressure(60, 100, 1)
        midiController.channel.sendPolyPressure(64, 90, 1)
        midiController.channel.sendPolyPressure(60, 80, 3)

        const patch = midiController.patch.get()

        expect(patch.channels["1"].polyPressure["60"]).toBe(100)
        expect(patch.channels["1"].polyPressure["64"]).toBe(90)
        expect(patch.channels["3"].polyPressure["60"]).toBe(80)
      })

      it("should include all state types in single patch", () => {
        // Set all types of state
        midiController.channel.sendCC(74, 100, 1)
        midiController.channel.sendPC(64, 1)
        midiController.channel.sendPitchBend(8192, 1)
        midiController.channel.sendMonoPressure(90, 1)
        midiController.channel.sendPolyPressure(60, 85, 1)

        const patch = midiController.patch.get()

        expect(patch.channels["1"].ccs["74"]).toBe(100)
        expect(patch.channels["1"].program).toBe(64)
        expect(patch.channels["1"].pitchBend).toBe(8192)
        expect(patch.channels["1"].monoPressure).toBe(90)
        expect(patch.channels["1"].polyPressure["60"]).toBe(85)
      })

      it("should include device information", () => {
        const patch = midiController.patch.get()

        expect(patch.device).toBe("Test Output 1")
      })

      it("should handle null device", async () => {
        await midiController.device.disconnect()
        const patch = midiController.patch.get()

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

        const patch = midiController.patch.get()

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

        await midiController.patch.set(patch)

        expect(midiController.channel.getCC(74, 1)).toBe(100)
        expect(midiController.channel.getCC(71, 1)).toBe(64)
        expect(mockOutputs[0].send).toHaveBeenCalled()
      })

      it("should throw error for invalid patch", async () => {
        await expect(midiController.patch.set(null)).rejects.toThrow("Invalid patch format")
        await expect(midiController.patch.set({})).rejects.toThrow("Invalid patch format")
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

        await midiController.patch.set(patch)

        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x90, 60, 100]))
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0x90, 64, 0]))
      })

      it("should apply program change from patch", async () => {
        const patch = {
          name: "Test Patch",
          channels: {
            2: {
              program: 64,
            },
            5: {
              program: 32,
            },
          },
        }

        await midiController.patch.set(patch)

        expect(midiController.channel.getPC(2)).toBe(64)
        expect(midiController.channel.getPC(5)).toBe(32)
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xc1, 64]))
        expect(mockOutputs[0].send).toHaveBeenCalledWith(new Uint8Array([0xc4, 32]))
      })

      it("should apply pitch bend from patch", async () => {
        const patch = {
          name: "Test Patch",
          channels: {
            1: {
              pitchBend: 8192,
            },
            3: {
              pitchBend: 12000,
            },
          },
        }

        await midiController.patch.set(patch)

        expect(midiController.channel.getPitchBend(1)).toBe(8192)
        expect(midiController.channel.getPitchBend(3)).toBe(12000)
      })

      it("should apply channel pressure from patch", async () => {
        const patch = {
          name: "Test Patch",
          channels: {
            2: {
              monoPressure: 100,
            },
            4: {
              monoPressure: 80,
            },
          },
        }

        await midiController.patch.set(patch)

        expect(midiController.channel.getMonoPressure(2)).toBe(100)
        expect(midiController.channel.getMonoPressure(4)).toBe(80)
      })

      it("should apply polyphonic pressure from patch", async () => {
        const patch = {
          name: "Test Patch",
          channels: {
            1: {
              polyPressure: {
                60: 100,
                64: 90,
              },
            },
            3: {
              polyPressure: {
                60: 80,
              },
            },
          },
        }

        await midiController.patch.set(patch)

        expect(midiController.channel.getPolyPressure(60, 1)).toBe(100)
        expect(midiController.channel.getPolyPressure(64, 1)).toBe(90)
        expect(midiController.channel.getPolyPressure(60, 3)).toBe(80)
      })

      it("should apply all state types from patch", async () => {
        const patch = {
          name: "Test Patch",
          channels: {
            1: {
              ccs: {
                74: 100,
              },
              program: 64,
              pitchBend: 8192,
              monoPressure: 90,
              polyPressure: {
                60: 85,
              },
            },
          },
        }

        await midiController.patch.set(patch)

        expect(midiController.channel.getCC(74, 1)).toBe(100)
        expect(midiController.channel.getPC(1)).toBe(64)
        expect(midiController.channel.getPitchBend(1)).toBe(8192)
        expect(midiController.channel.getMonoPressure(1)).toBe(90)
        expect(midiController.channel.getPolyPressure(60, 1)).toBe(85)
      })

      it("should emit PATCH_LOADED event", async () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.PATCH_LOADED, spy)

        const patch = {
          name: "Test Patch",
          channels: {
            1: { ccs: { 74: 100 } },
          },
        }

        await midiController.patch.set(patch)

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

        await midiController.patch.set(patch)

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

        await midiController.patch.set(patch)

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

        await midiController.patch.set(patch)

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

        await midiController.patch.set(patch)

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

        await midiController.patch.set(patch)

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

        await midiController.patch.set(patch)

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

        await midiController.patch.set(patch)

        expect(parseFloat(element1.value)).toBe(100)
        const expectedValue = 20 + (63 / 127) * (20000 - 20)
        expect(Math.round(parseFloat(element2.value))).toBe(Math.round(expectedValue))
        expect(element1.dispatchEvent).toHaveBeenCalled()
        expect(element2.dispatchEvent).toHaveBeenCalled()
      })

      it("should handle elements without min/max attributes", async () => {
        // Test case where config has no min/max, so it reads from element attributes
        const element = {
          value: "50",
          // No min/max properties directly on element
          addEventListener: vi.fn(),
          getAttribute: vi.fn((attr) => {
            if (attr === "min") return "0"
            if (attr === "max") return "127"
            return null
          }),
          dispatchEvent: vi.fn(),
        }

        midiController.bind(element, { cc: 74, channel: 2 })
        // No min/max in config

        const patch = {
          name: "Test Patch",
          channels: {
            2: { ccs: { 74: 100 } },
          },
          settings: {},
        }

        await midiController.patch.set(patch)

        // Should have accessed element attributes
        expect(element.getAttribute).toHaveBeenCalled()
        expect(element.dispatchEvent).toHaveBeenCalled()
      })

      it("should handle elements without config.cc in settings", async () => {
        // This tests line 535 where binding.config.cc matches bindingKey
        // We need a case where settings has a cc that doesn't match any binding
        const element = {
          value: "50",
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
          settings: {
            cc75: { min: 10, max: 1000 }, // CC 75, not 74 - should not match
          },
        }

        await midiController.patch.set(patch)

        // CC 74 binding should not be affected by cc75 settings
        expect(element.min).toBe("0") // Should remain unchanged
        expect(element.max).toBe("127") // Should remain unchanged
      })
    })

    describe("patch versioning", () => {
      it("should apply v1.0 patches", async () => {
        const patch = {
          version: "1.0",
          channels: { 1: { ccs: { 74: 100 } } },
        }
        await midiController.patch.set(patch)
        expect(midiController.channel.getCC(74, 1)).toBe(100)
      })

      it("should warn on unknown version", async () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const patch = {
          version: "99.0",
          channels: { 1: { ccs: { 74: 100 } } },
        }
        await midiController.patch.set(patch)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown patch version: 99.0"))
        consoleSpy.mockRestore()
      })

      it("should default to v1.0 for patches without version", async () => {
        const patch = {
          channels: { 1: { ccs: { 74: 100 } } },
        }
        await midiController.patch.set(patch)
        expect(midiController.channel.getCC(74, 1)).toBe(100)
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
        const key = midiController.patch.save("Test Patch", patch)

        expect(key).toBe("midiwire_patch_Test Patch")
        expect(localStorage.setItem).toHaveBeenCalledWith("midiwire_patch_Test Patch", JSON.stringify(patch))
      })

      it("should use getPatch() if no patch provided", () => {
        midiController.channel.sendCC(74, 100, 1)

        midiController.patch.save("My Patch")

        expect(localStorage.setItem).toHaveBeenCalled()
        const savedData = JSON.parse(localStorage.setItem.mock.calls[0][1])
        expect(savedData.name).toBe("My Patch")
        expect(savedData.channels["1"].ccs["74"]).toBe(100)
      })

      it("should emit PATCH_SAVED event", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.PATCH_SAVED, spy)

        midiController.patch.save("Test Patch")

        expect(spy).toHaveBeenCalled()
        expect(spy.mock.calls[0][0]).toHaveProperty("name", "Test Patch")
      })

      it("should handle localStorage errors", () => {
        localStorage.setItem = vi.fn().mockImplementation(() => {
          throw new Error("Quota exceeded")
        })

        expect(() => midiController.patch.save("Test Patch")).toThrow("Quota exceeded")
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

        const loaded = midiController.patch.load("Test Patch")

        expect(loaded).toEqual(patch)
        expect(localStorage.getItem).toHaveBeenCalledWith("midiwire_patch_Test Patch")
      })

      it("should return null if patch not found", () => {
        localStorage.getItem = vi.fn().mockReturnValue(null)

        const loaded = midiController.patch.load("Nonexistent")

        expect(loaded).toBeNull()
      })

      it("should emit PATCH_LOADED event", () => {
        const patch = { name: "Test Patch", channels: { 1: { ccs: { 74: 100 } } } }
        localStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(patch))

        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.PATCH_LOADED, spy)

        midiController.patch.load("Test Patch")

        expect(spy).toHaveBeenCalledWith({ name: "Test Patch", patch })
      })

      it("should handle JSON parse errors", () => {
        localStorage.getItem = vi.fn().mockReturnValue("invalid json")
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        const loaded = midiController.patch.load("Test Patch")

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
        const result = midiController.patch.delete("Test Patch")

        expect(result).toBe(true)
        expect(localStorage.removeItem).toHaveBeenCalledWith("midiwire_patch_Test Patch")
      })

      it("should emit PATCH_DELETED event", () => {
        const spy = vi.fn()
        midiController.on(CONTROLLER_EVENTS.PATCH_DELETED, spy)

        midiController.patch.delete("Test Patch")

        expect(spy).toHaveBeenCalledWith({ name: "Test Patch" })
      })

      it("should handle errors gracefully", () => {
        localStorage.removeItem = vi.fn().mockImplementation(() => {
          throw new Error("Storage error")
        })
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        const result = midiController.patch.delete("Test Patch")

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

        const patches = midiController.patch.list()

        expect(patches).toHaveLength(2)
        expect(patches[0].name).toBe("A")
        expect(patches[0].patch).toEqual(patchA)
        expect(patches[1].name).toBe("B")
        expect(patches[1].patch).toEqual(patchB)
      })

      it("should filter out invalid patches", () => {
        localStorage.getItem = vi.fn(() => null)

        const patches = midiController.patch.list()

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

        const patches = midiController.patch.list()

        expect(patches[0].name).toBe("A")
        expect(patches[1].name).toBe("B")
      })

      it("should handle errors in listPatches gracefully", () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        // Make localStorage.length throw an error
        Object.defineProperty(localStorage, "length", {
          get: () => {
            throw new Error("Storage access denied")
          },
        })

        const patches = midiController.patch.list()

        expect(consoleSpy).toHaveBeenCalledWith("Failed to list patches:", expect.any(Error))
        expect(patches).toEqual([]) // Should return empty array on error

        consoleSpy.mockRestore()
      })
    })
  })
})
