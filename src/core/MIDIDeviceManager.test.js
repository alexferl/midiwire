import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMIDIController } from "../index.js"
import { EventEmitter } from "./EventEmitter.js"
import { CONNECTION_EVENTS } from "./MIDIConnection.js"
import { MIDIDeviceManager } from "./MIDIDeviceManager.js"

describe("MIDIDeviceManager", () => {
  let deviceManager
  let statusUpdates = []
  let connectionUpdates = []

  beforeEach(() => {
    statusUpdates = []
    connectionUpdates = []
    deviceManager = new MIDIDeviceManager({
      onStatusUpdate: (message, state) => {
        statusUpdates.push({ message, state })
      },
      onConnectionUpdate: (device, midi) => {
        connectionUpdates.push({ device, midi })
      },
      channel: 1,
    })
  })

  describe("constructor", () => {
    it("should initialize with default options", () => {
      const dm = new MIDIDeviceManager()
      expect(dm.midi).toBe(null)
      expect(dm.currentDevice).toBe(null)
      expect(dm.isConnecting).toBe(false)
      expect(dm.channel).toBe(1)
    })

    it("should initialize with custom options", () => {
      const mockMidi = { connection: new EventEmitter() }
      const dm = new MIDIDeviceManager({
        midiController: mockMidi,
        channel: 5,
        onStatusUpdate: () => {},
        onConnectionUpdate: () => {},
      })
      expect(dm.midi).toBe(mockMidi)
      expect(dm.channel).toBe(5)
    })
  })

  describe("setMIDI", () => {
    it("should set the MIDI controller", () => {
      const mockMidi = {
        connection: new EventEmitter(),
      }
      deviceManager.setMIDI(mockMidi)
      expect(deviceManager.midi).toBe(mockMidi)
    })
  })

  describe("getOutputDevices", () => {
    it("should return empty array when no MIDI connection", () => {
      expect(deviceManager.getOutputDevices()).toEqual([])
    })

    it("should return list of devices from MIDI connection", () => {
      const mockDevices = [
        { id: "1", name: "Device 1", manufacturer: "Company A" },
        { id: "2", name: "Device 2", manufacturer: "Company B" },
      ]
      const mockMidi = {
        connection: {
          getOutputs: () => mockDevices,
        },
      }
      deviceManager.midi = mockMidi

      expect(deviceManager.getOutputDevices()).toEqual(mockDevices)
    })
  })

  describe("getInputDevices", () => {
    it("should return empty array when no MIDI connection", () => {
      expect(deviceManager.getInputDevices()).toEqual([])
    })

    it("should return list of input devices from MIDI connection", () => {
      const mockInputDevices = [
        { id: "input-1", name: "Keyboard", manufacturer: "Company A" },
        { id: "input-2", name: "Pad Controller", manufacturer: "Company B" },
      ]
      const mockMidi = {
        connection: {
          getInputs: () => mockInputDevices,
        },
      }
      deviceManager.midi = mockMidi

      expect(deviceManager.getInputDevices()).toEqual(mockInputDevices)
    })
  })

  describe("isDeviceConnected", () => {
    it("should return false when no MIDI connection", () => {
      expect(deviceManager.isDeviceConnected("Device 1")).toBe(false)
    })

    it("should return true if device is connected", () => {
      const mockMidi = {
        connection: {
          getOutputs: () => [
            { id: "1", name: "Device 1", manufacturer: "Company A" },
            { id: "2", name: "Device 2", manufacturer: "Company B" },
          ],
        },
      }
      deviceManager.midi = mockMidi

      expect(deviceManager.isDeviceConnected("Device 1")).toBe(true)
      expect(deviceManager.isDeviceConnected("Device 3")).toBe(false)
    })
  })

  describe("connectDeviceSelection", () => {
    it("should connect to selected device", async () => {
      const mockMidi = {
        connectOutput: vi.fn().mockResolvedValue(undefined),
        getCurrentOutput: vi.fn().mockReturnValue({ name: "Device 1" }),
        connection: {
          on: vi.fn(),
          disconnect: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML =
        '<option value="">Select a device</option><option value="0">Device 1</option><option value="1">Device 2</option>'

      let connectedDevice = null
      deviceManager.connectDeviceSelection(select, async (_midi, device) => {
        connectedDevice = device
      })

      // Simulate selecting device
      select.value = "0"
      select.dispatchEvent(new Event("change"))

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockMidi.connectOutput).toHaveBeenCalledWith(0)
      expect(connectedDevice).toEqual({ name: "Device 1" })
      expect(deviceManager.currentDevice).toEqual({ name: "Device 1" })
    })

    it("should disconnect when selecting empty option", async () => {
      const mockMidi = {
        connectOutput: vi.fn(),
        getCurrentOutput: vi.fn(),
        connection: {
          on: vi.fn(),
          disconnect: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const select = document.createElement("select")
      deviceManager.connectDeviceSelection(select)

      // Select empty option
      select.value = ""
      select.dispatchEvent(new Event("change"))

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockMidi.connection.disconnect).toHaveBeenCalled()
      expect(deviceManager.currentDevice).toBe(null)
      expect(statusUpdates).toContainEqual({
        message: "Disconnected",
        state: "",
      })
    })

    it("should prevent concurrent connections", async () => {
      const mockMidi = {
        connectOutput: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50))),
        getCurrentOutput: vi.fn().mockReturnValue({ name: "Device 1" }),
        connection: {
          on: vi.fn(),
          disconnect: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML = '<option value="">Select a device</option><option value="0">Device 1</option>'

      let connectCount = 0
      deviceManager.connectDeviceSelection(select, async () => {
        connectCount++
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Trigger change twice rapidly
      select.value = "0"
      select.dispatchEvent(new Event("change"))
      select.dispatchEvent(new Event("change"))

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(connectCount).toBe(1) // Should only connect once
    })
  })

  describe("connectChannelSelection", () => {
    it("should update channel when selection changes", () => {
      const mockMidi = {
        options: { channel: 1 },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML = ""
      for (let i = 1; i <= 16; i++) {
        const option = document.createElement("option")
        option.value = i
        option.textContent = i
        select.appendChild(option)
      }

      deviceManager.connectChannelSelection(select)

      select.value = "5"
      select.dispatchEvent(new Event("change"))

      expect(mockMidi.options.channel).toBe(5)
    })
  })

  describe("integration with createMIDIController", () => {
    it("should work with real MIDIController", async () => {
      // Mock navigator.requestMIDIAccess
      global.navigator.requestMIDIAccess = vi.fn().mockResolvedValue({
        outputs: new Map(),
        inputs: new Map(),
        onstatechange: null,
      })

      const midi = await createMIDIController({ autoConnect: false, channel: 3 })
      deviceManager.setMIDI(midi)

      expect(midi.options.channel).toBe(3)
      expect(deviceManager.midi).toBe(midi)
    })
  })

  describe("updateStatus", () => {
    it("should call onStatusUpdate with message and state", () => {
      deviceManager.updateStatus("Test message", "test-state")

      expect(statusUpdates).toContainEqual({
        message: "Test message",
        state: "test-state",
      })
    })

    it("should call onStatusUpdate with message and empty state", () => {
      deviceManager.updateStatus("Test message")

      expect(statusUpdates).toContainEqual({
        message: "Test message",
        state: "",
      })
    })
  })

  describe("updateConnectionStatus", () => {
    it("should call onConnectionUpdate with current device and midi", () => {
      const mockMidi = { connection: {} }
      const mockDevice = { name: "Test Device" }

      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = mockDevice

      deviceManager.updateConnectionStatus()

      expect(connectionUpdates).toContainEqual({
        device: mockDevice,
        midi: mockMidi,
      })
    })

    it("should call onConnectionUpdate with null device", () => {
      const mockMidi = { connection: {} }

      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = null

      deviceManager.updateConnectionStatus()

      expect(connectionUpdates).toContainEqual({
        device: null,
        midi: mockMidi,
      })
    })
  })

  describe("setupDeviceListeners", () => {
    it("should set up device connection event listeners", () => {
      const mockConnection = new EventEmitter()
      const mockMidi = { connection: mockConnection }

      deviceManager.setMIDI(mockMidi)

      const onDeviceListChange = vi.fn()
      deviceManager.setupDeviceListeners(onDeviceListChange)

      // Emit OUT_DEV_CONNECTED event
      const device = { name: "Device 1", id: "1" }
      mockConnection.emit(CONNECTION_EVENTS.OUT_DEV_CONNECTED, { device })

      expect(statusUpdates).toContainEqual({
        message: "Device connected: Device 1",
        state: "connected",
      })
      expect(onDeviceListChange).toHaveBeenCalled()
    })

    it("should set up device disconnection event listeners", () => {
      const mockConnection = new EventEmitter()
      const mockMidi = { connection: mockConnection }

      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const onDeviceListChange = vi.fn()
      deviceManager.setupDeviceListeners(onDeviceListChange)

      // Emit OUT_DEV_DISCONNECTED event
      const device = { name: "Device 1", id: "1" }
      mockConnection.emit(CONNECTION_EVENTS.OUT_DEV_DISCONNECTED, { device })

      expect(statusUpdates).toContainEqual({
        message: "Device disconnected: Device 1",
        state: "error",
      })
      expect(deviceManager.currentDevice).toBe(null)
      expect(onDeviceListChange).toHaveBeenCalled()
    })

    it("should not clear currentDevice if different device disconnected", () => {
      const mockConnection = new EventEmitter()
      const mockMidi = { connection: mockConnection }

      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const onDeviceListChange = vi.fn()
      deviceManager.setupDeviceListeners(onDeviceListChange)

      // Emit OUT_DEV_DISCONNECTED for different device
      const device = { name: "Device 2", id: "2" }
      mockConnection.emit(CONNECTION_EVENTS.OUT_DEV_DISCONNECTED, { device })

      expect(deviceManager.currentDevice).toEqual({ name: "Device 1" })
      expect(onDeviceListChange).toHaveBeenCalled()
    })

    it("should return early if no MIDI connection", () => {
      deviceManager.midi = null

      const onDeviceListChange = vi.fn()
      deviceManager.setupDeviceListeners(onDeviceListChange)

      // Should not throw error and onDeviceListChange should not be called
      expect(onDeviceListChange).not.toHaveBeenCalled()
    })
  })

  describe("populateDeviceList", () => {
    it("should populate select element with devices", () => {
      const mockMidi = {
        connection: {
          getOutputs: () => [
            { id: "1", name: "Device 1", manufacturer: "Company A" },
            { id: "2", name: "Device 2", manufacturer: "Company B" },
          ],
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      deviceManager.populateDeviceList(select)

      expect(select.innerHTML).toContain('value=""')
      expect(select.innerHTML).toContain('value="0"')
      expect(select.innerHTML).toContain("Device 1")
      expect(select.innerHTML).toContain("Device 2")
      expect(statusUpdates).toContainEqual({
        message: "Select a MIDI device",
        state: "",
      })
    })

    it("should show no devices message when no outputs", () => {
      const mockMidi = {
        connection: {
          getOutputs: () => [],
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      deviceManager.populateDeviceList(select)

      expect(select.innerHTML).toContain("No MIDI devices found")
      expect(statusUpdates).toContainEqual({
        message: "No MIDI devices available",
        state: "error",
      })
    })

    it("should call onChange callback if provided", () => {
      const mockMidi = {
        connection: {
          getOutputs: () => [{ id: "1", name: "Device 1", manufacturer: "Company A" }],
        },
      }
      deviceManager.setMIDI(mockMidi)

      const onChange = vi.fn()
      const select = document.createElement("select")

      deviceManager.populateDeviceList(select, onChange)

      expect(onChange).toHaveBeenCalled()
    })

    it("should return early if no select element", () => {
      const mockMidi = {
        connection: {
          getOutputs: () => [{ id: "1", name: "Device 1", manufacturer: "Company A" }],
        },
      }
      deviceManager.setMIDI(mockMidi)

      statusUpdates = []
      deviceManager.populateDeviceList(null)

      expect(statusUpdates).toEqual([]) // No status updates should occur
    })

    it("should keep current device selected if still available", () => {
      const mockMidi = {
        connection: {
          getOutputs: () => [
            { id: "1", name: "Device 1", manufacturer: "Company A" },
            { id: "2", name: "Device 2", manufacturer: "Company B" },
          ],
        },
      }
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const select = document.createElement("select")
      deviceManager.populateDeviceList(select)

      expect(select.value).toBe("0") // Device 1 is at index 0
      expect(deviceManager.currentDevice).toEqual({ name: "Device 1" })
    })

    it("should clear selection and currentDevice if device disconnected", () => {
      const mockMidi = {
        connection: {
          getOutputs: () => [{ id: "2", name: "Device 2", manufacturer: "Company B" }],
        },
      }
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      statusUpdates = []
      connectionUpdates = []
      const select = document.createElement("select")
      deviceManager.populateDeviceList(select)

      expect(select.value).toBe("") // Selection cleared
      expect(deviceManager.currentDevice).toBe(null) // Current device cleared
      expect(connectionUpdates).toContainEqual({
        device: null,
        midi: mockMidi,
      })
    })
  })
})

describe("createMIDIDeviceManager", () => {
  let originalNavigator
  let _coverageCallback
  let mockOutput

  beforeEach(() => {
    originalNavigator = global.navigator
    _coverageCallback = vi.fn()

    mockOutput = {
      id: "test-output-1",
      name: "Test Output Device",
      manufacturer: "Test Manufacturer",
      state: "connected",
      send: vi.fn(),
    }

    global.navigator = {
      requestMIDIAccess: vi.fn().mockResolvedValue({
        outputs: new Map([
          ["test-output-1", mockOutput],
          [
            "test-output-2",
            {
              id: "test-output-2",
              name: "Test Output 2",
              manufacturer: "Test Manufacturer",
              state: "connected",
              send: vi.fn(),
            },
          ],
        ]),
        inputs: new Map(),
        onstatechange: null,
        addEventListener: vi.fn(),
      }),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
    global.navigator = originalNavigator
  })

  it("should create a MIDIDeviceManager with integrated MIDIController", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const deviceManager = await createMIDIDeviceManager({
      channel: 2,
    })

    expect(deviceManager).toBeInstanceOf(MIDIDeviceManager)
    expect(deviceManager.midi).toBeDefined()
    expect(deviceManager.midi.options.channel).toBe(2)
  })

  it("should auto-connect to specified device if output option provided", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const deviceManager = await createMIDIDeviceManager({
      output: "Test Output Device",
      channel: 1,
    })

    expect(deviceManager.currentDevice).toEqual({
      id: "test-output-1",
      name: "Test Output Device",
      manufacturer: "Test Manufacturer",
    })
    // Device is connected if currentDevice is set
  })

  it("should call onReady callback when initialization completes", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const onReady = vi.fn()

    const deviceManager = await createMIDIDeviceManager({
      onReady,
      channel: 1,
    })

    expect(onReady).toHaveBeenCalledWith(deviceManager.midi, deviceManager)
  })

  it("should handle onStatusUpdate callback", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const statusUpdates = []
    const deviceManager = await createMIDIDeviceManager({
      onStatusUpdate: (message, state) => {
        statusUpdates.push({ message, state })
      },
      channel: 1,
    })

    deviceManager.updateStatus("Test status", "connected")

    expect(statusUpdates).toContainEqual({ message: "Test status", state: "connected" })
  })

  it("should handle onConnectionUpdate callback", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const connectionUpdates = []
    const deviceManager = await createMIDIDeviceManager({
      onConnectionUpdate: (device, midi) => {
        connectionUpdates.push({ device, midi })
      },
      channel: 1,
    })

    // Simulate a connection update
    deviceManager.onConnectionUpdate({ name: "Test Device" }, deviceManager.midi)

    expect(connectionUpdates).toContainEqual({
      device: { name: "Test Device" },
      midi: deviceManager.midi,
    })
  })

  it("should pass through options to MIDIController", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const deviceManager = await createMIDIDeviceManager({
      channel: 5,
      sysex: true,
      selector: "[data-midi-cc]",
      watchDOM: true,
    })

    expect(deviceManager.midi.options.channel).toBe(5)
    // sysex is passed to MIDIConnection constructor
    expect(deviceManager.midi.connection.options.sysex).toBe(true)
    expect(deviceManager.midi._binder).toBeDefined() // Auto-binding was enabled
  })

  it("should handle auto-connect errors gracefully", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const onError = vi.fn()

    const deviceManager = await createMIDIDeviceManager({
      output: "Non-existent Device",
      onError,
      channel: 1,
    })

    expect(onError).toHaveBeenCalled()
    expect(deviceManager.currentDevice).toBe(null)
  })

  it("should use default values when options not provided", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const deviceManager = await createMIDIDeviceManager()

    expect(deviceManager.midi.options.channel).toBe(1)
    // sysex option is passed to MIDIConnection, not stored in options
    expect(deviceManager.channel).toBe(1)
  })
})
