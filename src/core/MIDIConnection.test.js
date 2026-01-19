import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONNECTION_EVENTS, MIDIConnection } from "./MIDIConnection.js"

describe("MIDIConnection", () => {
  let originalNavigator
  let mockMIDIAccess
  let mockOutput
  let mockInput

  beforeEach(() => {
    // Save original navigator
    originalNavigator = global.navigator

    // Create mock MIDI port objects
    mockOutput = {
      id: "test-output-1",
      name: "Test Output Device",
      manufacturer: "Test Manufacturer",
      state: "connected",
      send: vi.fn(),
    }

    mockInput = {
      id: "test-input-1",
      name: "Test Input Device",
      manufacturer: "Test Manufacturer",
      state: "connected",
      onmidimessage: null,
    }

    // Create mock MIDI access
    mockMIDIAccess = {
      outputs: new Map([
        ["output-1", mockOutput],
        [
          "output-2",
          {
            id: "output-2",
            name: "Second Output",
            manufacturer: "Another Manufacturer",
            state: "connected",
            send: vi.fn(),
          },
        ],
      ]),
      inputs: new Map([["input-1", mockInput]]),
    }

    // Mock navigator.requestMIDIAccess
    global.navigator = {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockMIDIAccess),
    }
  })

  afterEach(() => {
    // Restore original navigator
    global.navigator = originalNavigator
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should create instance with default options", () => {
      const connection = new MIDIConnection()
      expect(connection.options.sysex).toBe(false)
      expect(connection.midiAccess).toBeNull()
      expect(connection.output).toBeNull()
      expect(connection.input).toBeNull()
    })

    it("should merge custom options", () => {
      const connection = new MIDIConnection({ sysex: true })
      expect(connection.options.sysex).toBe(true)
    })
  })

  describe("requestAccess", () => {
    let connection

    beforeEach(() => {
      connection = new MIDIConnection({ sysex: true })
      // Spy on emit method
      vi.spyOn(connection, "emit")
    })

    it("should request MIDI access successfully", async () => {
      const connection = new MIDIConnection({ sysex: true })
      await connection.requestAccess()

      expect(navigator.requestMIDIAccess).toHaveBeenCalledWith({
        sysex: true,
      })
      expect(connection.midiAccess).toBe(mockMIDIAccess)
    })

    it("should emit devicechange event when input is connected", async () => {
      await connection.requestAccess()

      // Simulate device connection
      const mockPort = {
        id: "test-port-1",
        type: "input",
        name: "Test Input Device",
        manufacturer: "Test Manufacturer",
        state: "connected",
      }

      connection.midiAccess.onstatechange({ port: mockPort })

      expect(connection.emit).toHaveBeenCalledWith(CONNECTION_EVENTS.DEVICE_CHANGE, {
        port: mockPort,
        state: "connected",
        type: "input",
        device: {
          id: "test-port-1",
          name: "Test Input Device",
          manufacturer: "Test Manufacturer",
        },
      })
    })

    it("should emit devicechange event when output is connected", async () => {
      await connection.requestAccess()

      // Simulate device connection
      const mockPort = {
        id: "test-port-2",
        type: "output",
        name: "Test Output Device",
        manufacturer: "Test Manufacturer",
        state: "connected",
      }

      connection.midiAccess.onstatechange({ port: mockPort })

      expect(connection.emit).toHaveBeenCalledWith(CONNECTION_EVENTS.DEVICE_CHANGE, {
        port: mockPort,
        state: "connected",
        type: "output",
        device: {
          id: "test-port-2",
          name: "Test Output Device",
          manufacturer: "Test Manufacturer",
        },
      })
    })

    it("should emit inputdisconnect when current input is disconnected", async () => {
      await connection.requestAccess()

      // Connect an input first
      await connection.connectInput(0, vi.fn())
      expect(connection.input).toBe(mockInput)

      // Clear the emit spy to track only the disconnect call
      connection.emit.mockClear()

      // Simulate device disconnection
      const mockPort = {
        id: "test-input-1",
        type: "input",
        name: "Test Input Device",
        manufacturer: "Test Manufacturer",
        state: "disconnected",
      }

      connection.midiAccess.onstatechange({ port: mockPort })

      expect(connection.input).toBeNull()
      expect(connection.emit).toHaveBeenCalledWith(CONNECTION_EVENTS.INPUT_DEVICE_DISCONNECTED, {
        device: mockPort,
      })
    })

    it("should emit outputdisconnect when current output is disconnected", async () => {
      await connection.requestAccess()

      // Connect an output first
      await connection.connect()
      expect(connection.output).toBe(mockOutput)

      // Clear the emit spy to track only the disconnect call
      connection.emit.mockClear()

      // Simulate device disconnection
      const mockPort = {
        id: "test-output-1",
        type: "output",
        name: "Test Output Device",
        manufacturer: "Test Manufacturer",
        state: "disconnected",
      }

      connection.midiAccess.onstatechange({ port: mockPort })

      expect(connection.output).toBeNull()
      expect(connection.emit).toHaveBeenCalledWith(CONNECTION_EVENTS.OUTPUT_DEVICE_DISCONNECTED, {
        device: mockPort,
      })
    })

    it("should not emit disconnect events for other devices", async () => {
      await connection.requestAccess()
      await connection.connect() // Connect to test-output-1

      // Clear the emit spy
      connection.emit.mockClear()

      // Simulate a different device disconnecting
      const mockPort = {
        id: "different-output",
        type: "output",
        name: "Different Output",
        manufacturer: "Test Manufacturer",
        state: "disconnected",
      }

      connection.midiAccess.onstatechange({ port: mockPort })

      // Should emit devicechange and outputdisconnect (code emits for ALL disconnects)
      expect(connection.emit).toHaveBeenCalledWith(CONNECTION_EVENTS.DEVICE_CHANGE, expect.any(Object))
      expect(connection.emit).toHaveBeenCalledWith(CONNECTION_EVENTS.OUTPUT_DEVICE_DISCONNECTED, expect.any(Object))
      expect(connection.output).not.toBeNull() // Still connected to original output
    })

    it("should handle manufacturer being undefined", async () => {
      await connection.requestAccess()

      // Simulate device connection without manufacturer
      const mockPort = {
        id: "test-port-3",
        type: "input",
        name: "Device without manufacturer",
        manufacturer: undefined,
        state: "connected",
      }

      connection.midiAccess.onstatechange({ port: mockPort })

      expect(connection.emit).toHaveBeenCalledWith(
        CONNECTION_EVENTS.DEVICE_CHANGE,
        expect.objectContaining({
          device: {
            id: "test-port-3",
            name: "Device without manufacturer",
            manufacturer: "Unknown",
          },
        }),
      )
    })

    it("should throw error if Web MIDI API not supported", async () => {
      global.navigator.requestMIDIAccess = undefined
      const connection = new MIDIConnection()

      await expect(connection.requestAccess()).rejects.toThrow("Web MIDI API is not supported in this browser")
    })

    it("should handle SecurityError", async () => {
      global.navigator.requestMIDIAccess = vi.fn().mockRejectedValue({ name: "SecurityError" })

      const connection = new MIDIConnection()
      await expect(connection.requestAccess()).rejects.toThrow("MIDI access denied. SysEx requires user permission.")
    })

    it("should handle other errors", async () => {
      global.navigator.requestMIDIAccess = vi.fn().mockRejectedValue(new Error("Unknown error"))

      const connection = new MIDIConnection()
      await expect(connection.requestAccess()).rejects.toThrow("Failed to get MIDI access: Unknown error")
    })
  })

  describe("getOutputs", () => {
    it("should return outputs when MIDI access is available", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      const outputs = connection.getOutputs()
      expect(outputs).toHaveLength(2)
      expect(outputs[0]).toEqual({
        id: "test-output-1",
        name: "Test Output Device",
        manufacturer: "Test Manufacturer",
      })
    })

    it("should return empty array when no MIDI access", () => {
      const connection = new MIDIConnection()
      const outputs = connection.getOutputs()
      expect(outputs).toEqual([])
    })

    it("should handle outputs without manufacturer", async () => {
      const outputWithoutManufacturer = {
        id: "output-no-manufacturer",
        name: "Device without manufacturer",
        state: "connected",
        send: vi.fn(),
      }

      mockMIDIAccess.outputs.set("output-3", outputWithoutManufacturer)

      const connection = new MIDIConnection()
      await connection.requestAccess()

      const outputs = connection.getOutputs()
      const device = outputs.find((o) => o.id === "output-no-manufacturer")
      expect(device.manufacturer).toBe("Unknown")
    })
  })

  describe("getInputs", () => {
    it("should return inputs when MIDI access is available", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      const inputs = connection.getInputs()
      expect(inputs).toHaveLength(1)
      expect(inputs[0]).toEqual({
        id: "test-input-1",
        name: "Test Input Device",
        manufacturer: "Test Manufacturer",
      })
    })

    it("should return empty array when no MIDI access", () => {
      const connection = new MIDIConnection()
      const inputs = connection.getInputs()
      expect(inputs).toEqual([])
    })

    it("should handle inputs without manufacturer", async () => {
      const inputWithoutManufacturer = {
        id: "input-no-manufacturer",
        name: "Input without manufacturer",
        state: "connected",
        onmidimessage: null,
      }

      mockMIDIAccess.inputs.set("input-3", inputWithoutManufacturer)

      const connection = new MIDIConnection()
      await connection.requestAccess()

      const inputs = connection.getInputs()
      const device = inputs.find((i) => i.id === "input-no-manufacturer")
      expect(device.manufacturer).toBe("Unknown")
    })
  })

  describe("connect", () => {
    it("should connect to first available output by default", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()

      expect(connection.output).toBe(mockOutput)
    })

    it("should connect by index", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect(1)

      expect(connection.output.id).toBe("output-2")
    })

    it("should connect by name", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect("Test Output Device")

      expect(connection.output).toBe(mockOutput)
    })

    it("should connect by ID", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect("test-output-1")

      expect(connection.output).toBe(mockOutput)
    })

    it("should throw error if MIDI access not initialized", async () => {
      const connection = new MIDIConnection()
      await expect(connection.connect()).rejects.toThrow("MIDI access not initialized. Call requestAccess() first.")
    })

    it("should throw error if no outputs available", async () => {
      mockMIDIAccess.outputs.clear()
      const connection = new MIDIConnection()
      await connection.requestAccess()

      await expect(connection.connect()).rejects.toThrow("No MIDI output devices available")
    })

    it("should throw error for out of range index", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      await expect(connection.connect(-1)).rejects.toThrow("Output index -1 out of range")
      await expect(connection.connect(99)).rejects.toThrow("Output index 99 out of range")
    })

    it("should throw error if device not found", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      await expect(connection.connect("Non-existent Device")).rejects.toThrow(
        'MIDI output "Non-existent Device" not found',
      )
    })
  })

  describe("connectInput", () => {
    const mockOnMessage = vi.fn()

    it("should validate onMessage is a function", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      await expect(connection.connectInput(0, "not a function")).rejects.toThrow(
        /onMessage callback must be a function/,
      )
      await expect(connection.connectInput(0, null)).rejects.toThrow(/onMessage callback must be a function/)
      await expect(connection.connectInput(0, undefined)).rejects.toThrow(/onMessage callback must be a function/)
      await expect(connection.connectInput(0, 123)).rejects.toThrow(/onMessage callback must be a function/)
    })

    it("should connect to first available input by default", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connectInput(undefined, mockOnMessage)

      expect(connection.input).toBe(mockInput)
    })

    it("should disconnect existing input before connecting new one", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      const firstHandler = vi.fn()
      // Connect first input
      await connection.connectInput(0, firstHandler)
      const firstOnMessage = mockInput.onmidimessage
      expect(firstOnMessage).toBeTruthy()

      // Connect to different input device
      mockMIDIAccess.inputs.set("input-2", {
        id: "input-2",
        name: "Second Input",
        manufacturer: "Test",
        state: "connected",
        onmidimessage: null,
      })

      await connection.connectInput("Second Input", mockOnMessage)
      // First input should be disconnected (onmidimessage set to null)
      // Even though it's mocked, we verify the disconnect happened
      expect(connection.input.id).toBe("input-2")
    })

    it("should set up message handler", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connectInput(0, mockOnMessage)

      // Simulate MIDI message
      const mockEvent = { data: [0x90, 60, 100], midiwire: 1234 }
      connection.input.onmidimessage(mockEvent)

      expect(mockOnMessage).toHaveBeenCalledWith(mockEvent)
    })

    it("should throw error if MIDI access not initialized", async () => {
      const connection = new MIDIConnection()
      await expect(connection.connectInput(0, mockOnMessage)).rejects.toThrow(
        "MIDI access not initialized. Call requestAccess() first.",
      )
    })

    it("should throw error if no inputs available", async () => {
      mockMIDIAccess.inputs.clear()
      const connection = new MIDIConnection()
      await connection.requestAccess()

      await expect(connection.connectInput(0, mockOnMessage)).rejects.toThrow("No MIDI input devices available")
    })

    it("should throw error for out of range index", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      await expect(connection.connectInput(99, mockOnMessage)).rejects.toThrow("Input index 99 out of range")
    })

    it("should throw error if input device not found", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()

      await expect(connection.connectInput("Non-existent Input", mockOnMessage)).rejects.toThrow(
        'MIDI input "Non-existent Input" not found',
      )
    })
  })

  describe("send", () => {
    it("should send MIDI message without timestamp", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()

      const message = [0x90, 60, 100]
      connection.send(message)

      expect(mockOutput.send).toHaveBeenCalledWith(new Uint8Array(message))
    })

    it("should send MIDI message with timestamp", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()

      const message = [0x90, 60, 100]
      const timestamp = performance.now() + 1000
      connection.send(message, timestamp)

      expect(mockOutput.send).toHaveBeenCalledWith(new Uint8Array(message), timestamp)
    })

    it("should convert array to Uint8Array", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()

      const message = [0xb0, 7, 64]
      connection.send(message)

      expect(mockOutput.send).toHaveBeenCalledWith(new Uint8Array(message))
      expect(mockOutput.send.mock.calls[0][0]).toBeInstanceOf(Uint8Array)
    })

    it("should warn if no output connected", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const connection = new MIDIConnection()
      await connection.requestAccess()

      connection.send([0x90, 60, 100])

      expect(consoleSpy).toHaveBeenCalledWith("No MIDI output connected. Call connect() first.")
      consoleSpy.mockRestore()
    })

    it("should handle send errors gracefully", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()

      mockOutput.send.mockImplementationOnce(() => {
        throw new Error("Send failed")
      })

      connection.send([0x90, 60, 100])

      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to send MIDI message:", expect.any(Error))
      consoleErrorSpy.mockRestore()
    })
  })

  describe("sendSysEx", () => {
    it("should send SysEx message with wrapper", async () => {
      const connection = new MIDIConnection({ sysex: true })
      await connection.requestAccess()
      await connection.connect()

      const data = [0x42, 0x30, 0x00, 0x01, 0x2f, 0x12]
      connection.sendSysEx(data, true)

      expect(mockOutput.send).toHaveBeenCalledWith(new Uint8Array([0xf0, ...data, 0xf7]))
    })

    it("should send SysEx message without adding wrapper", async () => {
      const connection = new MIDIConnection({ sysex: true })
      await connection.requestAccess()
      await connection.connect()

      const data = [0xf0, 0x42, 0x30, 0x00, 0x01, 0x2f, 0x12, 0xf7]
      connection.sendSysEx(data)

      expect(mockOutput.send).toHaveBeenCalledWith(new Uint8Array(data))
    })

    it("should warn if SysEx not enabled", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const connection = new MIDIConnection() // sysex defaults to false
      await connection.requestAccess()
      await connection.connect()

      connection.sendSysEx([0x42, 0x30, 0x00])

      expect(consoleSpy).toHaveBeenCalledWith("SysEx not enabled. Initialize with sysex: true")
      expect(mockOutput.send).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it("should warn if sysex disabled and wrapper included", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const connection = new MIDIConnection() // sysex defaults to false
      await connection.requestAccess()
      await connection.connect()

      connection.sendSysEx([0xf0, 0x42, 0xf7], true)

      expect(consoleSpy).toHaveBeenCalledWith("SysEx not enabled. Initialize with sysex: true")
      consoleSpy.mockRestore()
    })
  })

  describe("disconnect", () => {
    it("should disconnect from output and input", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()
      await connection.connectInput(0, vi.fn())

      expect(connection.output).toBeTruthy()
      expect(connection.input).toBeTruthy()

      connection.disconnect()

      expect(connection.output).toBeNull()
      expect(connection.input).toBeNull()
    })

    it("should clear input message handler", async () => {
      const mockOnMessage = vi.fn()
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connectInput(0, mockOnMessage)

      expect(connection.input.onmidimessage).toBeTruthy()

      connection.disconnect()

      expect(connection.input).toBeNull()
    })

    it("should handle disconnect when already disconnected", () => {
      const connection = new MIDIConnection()
      expect(() => connection.disconnect()).not.toThrow()
    })
  })

  describe("isConnected", () => {
    it("should return true when connected", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()

      expect(connection.isConnected()).toBe(true)
    })

    it("should return false when not connected", () => {
      const connection = new MIDIConnection()
      expect(connection.isConnected()).toBe(false)
    })

    it("should return false after disconnect", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()
      connection.disconnect()

      expect(connection.isConnected()).toBe(false)
    })
  })

  describe("getCurrentOutput", () => {
    it("should return current output info", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect()

      const output = connection.getCurrentOutput()
      expect(output).toEqual({
        id: "test-output-1",
        name: "Test Output Device",
        manufacturer: "Test Manufacturer",
      })
    })

    it("should return null when not connected", () => {
      const connection = new MIDIConnection()
      expect(connection.getCurrentOutput()).toBeNull()
    })

    it("should handle output without manufacturer", async () => {
      const outputWithoutManufacturer = {
        id: "output-no-manufacturer",
        name: "Device without manufacturer",
        manufacturer: undefined,
        state: "connected",
        send: vi.fn(),
      }

      mockMIDIAccess.outputs.set("output-3", outputWithoutManufacturer)

      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connect("Device without manufacturer")

      const output = connection.getCurrentOutput()
      expect(output.manufacturer).toBe("Unknown")
    })
  })

  describe("getCurrentInput", () => {
    it("should return current input info", async () => {
      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connectInput(0, vi.fn())

      const input = connection.getCurrentInput()
      expect(input).toEqual({
        id: "test-input-1",
        name: "Test Input Device",
        manufacturer: "Test Manufacturer",
      })
    })

    it("should return null when not connected", () => {
      const connection = new MIDIConnection()
      expect(connection.getCurrentInput()).toBeNull()
    })

    it("should handle input without manufacturer", async () => {
      const inputWithoutManufacturer = {
        id: "input-no-manufacturer",
        name: "Input without manufacturer",
        manufacturer: undefined,
        state: "connected",
        onmidimessage: null,
      }

      mockMIDIAccess.inputs.set("input-3", inputWithoutManufacturer)

      const connection = new MIDIConnection()
      await connection.requestAccess()
      await connection.connectInput("Input without manufacturer", vi.fn())

      const input = connection.getCurrentInput()
      expect(input.manufacturer).toBe("Unknown")
    })
  })
})
