import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMIDIController } from "../index.js"
import { EventEmitter } from "./EventEmitter.js"
import { CONTROLLER_EVENTS } from "./MIDIController.js"
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
      expect(deviceManager.output.getDevices()).toEqual([])
    })

    it("should return list of devices from MIDI connection", () => {
      const mockDevices = [
        { id: "1", name: "Device 1", manufacturer: "Company A" },
        { id: "2", name: "Device 2", manufacturer: "Company B" },
      ]
      const mockMidi = {
        device: {
          getOutputs: () => mockDevices,
        },
      }
      deviceManager.midi = mockMidi

      expect(deviceManager.output.getDevices()).toEqual(mockDevices)
    })
  })

  describe("getInputDevices", () => {
    it("should return empty array when no MIDI connection", () => {
      expect(deviceManager.input.getDevices()).toEqual([])
    })

    it("should return list of input devices from MIDI connection", () => {
      const mockInputDevices = [
        { id: "input-1", name: "Keyboard", manufacturer: "Company A" },
        { id: "input-2", name: "Pad Controller", manufacturer: "Company B" },
      ]
      const mockMidi = {
        device: {
          getInputs: () => mockInputDevices,
        },
      }
      deviceManager.midi = mockMidi

      expect(deviceManager.input.getDevices()).toEqual(mockInputDevices)
    })
  })

  describe("connectOutputDeviceSelection", () => {
    it("should connect to selected device", async () => {
      const mockMidi = {
        device: {
          connectOutput: vi.fn().mockResolvedValue(undefined),
          getCurrentOutput: vi.fn().mockReturnValue({ name: "Device 1", id: "1" }),
          getOutputs: vi.fn().mockReturnValue([
            { id: "1", name: "Device 1", manufacturer: "Company A" },
            { id: "2", name: "Device 2", manufacturer: "Company B" },
          ]),
        },
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
      deviceManager.output.connectDeviceSelection(select, async (_midi, device) => {
        connectedDevice = device
      })

      // Simulate selecting device
      select.value = "0"
      select.dispatchEvent(new Event("change"))

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockMidi.device.connectOutput).toHaveBeenCalledWith(0)
      expect(connectedDevice).toEqual({ name: "Device 1", id: "1" })
      expect(deviceManager.currentDevice).toEqual({ name: "Device 1", id: "1" })
    })

    it("should disconnect when selecting empty option", async () => {
      const mockMidi = {
        device: {
          connectOutput: vi.fn(),
          disconnectOutput: vi.fn(),
        },
        getCurrentOutput: vi.fn(),
      }
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const select = document.createElement("select")
      deviceManager.output.connectDeviceSelection(select)

      // Select empty option
      select.value = ""
      select.dispatchEvent(new Event("change"))

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockMidi.device.disconnectOutput).toHaveBeenCalled()
      expect(deviceManager.currentDevice).toBe(null)
      expect(statusUpdates).toContainEqual({
        message: "Output device disconnected",
        state: "error",
      })
    })

    it("should prevent concurrent connections", async () => {
      const mockMidi = {
        device: {
          connectOutput: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50))),
          getCurrentOutput: vi.fn().mockReturnValue({ name: "Device 1", id: "1" }),
          getOutputs: vi.fn().mockReturnValue([{ id: "1", name: "Device 1", manufacturer: "Company A" }]),
        },
        connection: {
          on: vi.fn(),
          disconnect: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML = '<option value="">Select a device</option><option value="0">Device 1</option>'

      let connectCount = 0
      deviceManager.output.connectDeviceSelection(select, async () => {
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
    it("should update output channel when selection changes", () => {
      const mockMidi = {
        options: { outputChannel: 1 },
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

      deviceManager.output.connectChannelSelection(select)

      select.value = "5"
      select.dispatchEvent(new Event("change"))

      expect(mockMidi.options.outputChannel).toBe(5)
    })

    it("should update input channel when selection changes", () => {
      const mockMidi = {
        options: { inputChannel: 1 },
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

      deviceManager.input.connectChannelSelection(select)

      select.value = "3"
      select.dispatchEvent(new Event("change"))

      expect(mockMidi.options.inputChannel).toBe(3)
    })

    it("should return early if no select element provided", () => {
      const mockMidi = {
        options: { outputChannel: 1 },
      }
      deviceManager.setMIDI(mockMidi)

      // Should not throw when null select element is provided
      expect(() => {
        deviceManager.output.connectChannelSelection(null)
      }).not.toThrow()

      // Verify no event listener was added
      const select = document.createElement("select")
      select.value = "5"
      select.dispatchEvent(new Event("change"))
      expect(mockMidi.options.outputChannel).toBe(1) // Should remain unchanged
    })

    it("should return early if no MIDI connection", () => {
      deviceManager.midi = null

      const select = document.createElement("select")
      select.innerHTML = ""
      for (let i = 1; i <= 16; i++) {
        const option = document.createElement("option")
        option.value = i
        option.textContent = i
        select.appendChild(option)
      }

      deviceManager.output.connectChannelSelection(select)

      // Should not throw when midi is null
      expect(() => {
        select.value = "5"
        select.dispatchEvent(new Event("change"))
      }).not.toThrow()
    })

    it("should handle missing options object gracefully", () => {
      const mockMidi = { options: {} }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML = ""
      for (let i = 1; i <= 16; i++) {
        const option = document.createElement("option")
        option.value = i
        option.textContent = i
        select.appendChild(option)
      }

      deviceManager.output.connectChannelSelection(select)

      // Should create outputChannel property if it doesn't exist
      select.value = "5"
      select.dispatchEvent(new Event("change"))
      expect(mockMidi.options.outputChannel).toBe(5)
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

      const midi = await createMIDIController({ autoConnect: false, inputChannel: 3, outputChannel: 3 })
      deviceManager.setMIDI(midi)

      expect(midi.options.inputChannel).toBe(3)
      expect(midi.options.outputChannel).toBe(3)
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
      const mockMidi = new EventEmitter()
      deviceManager.setMIDI(mockMidi)

      const onDeviceListChange = vi.fn()
      deviceManager.setupDeviceListeners(onDeviceListChange)

      // Emit DEV_OUT_CONNECTED event
      const device = { name: "Device 1", id: "1" }
      mockMidi.emit(CONTROLLER_EVENTS.DEV_OUT_CONNECTED, device)

      expect(statusUpdates).toContainEqual({
        message: "Output device connected: Device 1",
        state: "connected",
      })
      expect(onDeviceListChange).toHaveBeenCalled()
    })

    it("should set up device disconnection event listeners", () => {
      const mockMidi = new EventEmitter()
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const onDeviceListChange = vi.fn()
      deviceManager.setupDeviceListeners(onDeviceListChange)

      // Emit DEV_OUT_DISCONNECTED event
      const device = { name: "Device 1", id: "1" }
      mockMidi.emit(CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED, device)

      expect(statusUpdates).toContainEqual({
        message: "Output device disconnected: Device 1",
        state: "error",
      })
      expect(deviceManager.currentDevice).toBe(null)
      expect(onDeviceListChange).toHaveBeenCalled()
    })

    it("should not clear currentDevice if different device disconnected", () => {
      const mockMidi = new EventEmitter()
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const onDeviceListChange = vi.fn()
      deviceManager.setupDeviceListeners(onDeviceListChange)

      // Emit DEV_OUT_DISCONNECTED for different device
      const device = { name: "Device 2", id: "2" }
      mockMidi.emit(CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED, device)

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

  describe("populateOutputDeviceList", () => {
    it("should populate select element with devices", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [
            { id: "1", name: "Device 1", manufacturer: "Company A" },
            { id: "2", name: "Device 2", manufacturer: "Company B" },
          ],
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      deviceManager.output.populateDeviceList(select)

      expect(select.innerHTML).toContain('value=""')
      expect(select.innerHTML).toContain('value="0"')
      expect(select.innerHTML).toContain("Device 1")
      expect(select.innerHTML).toContain("Device 2")
      expect(statusUpdates).toContainEqual({
        message: "Select a device",
        state: "",
      })
    })

    it("should show no devices message when no outputs", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [],
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      deviceManager.output.populateDeviceList(select)

      expect(select.innerHTML).toContain("No devices connected")
      expect(statusUpdates).toContainEqual({
        message: "No devices connected",
        state: "error",
      })
    })

    it("should call onChange callback if provided", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [{ id: "1", name: "Device 1", manufacturer: "Company A" }],
        },
      }
      deviceManager.setMIDI(mockMidi)

      const onChange = vi.fn()
      const select = document.createElement("select")

      deviceManager.output.populateDeviceList(select, onChange)

      expect(onChange).toHaveBeenCalled()
    })

    it("should return early if no select element", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [{ id: "1", name: "Device 1", manufacturer: "Company A" }],
        },
      }
      deviceManager.setMIDI(mockMidi)

      statusUpdates = []
      deviceManager.output.populateDeviceList(null)

      expect(statusUpdates).toEqual([]) // No status updates should occur
    })

    it("should keep current device selected if still available", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [
            { id: "1", name: "Device 1", manufacturer: "Company A" },
            { id: "2", name: "Device 2", manufacturer: "Company B" },
          ],
        },
      }
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      const select = document.createElement("select")
      deviceManager.output.populateDeviceList(select)

      expect(select.value).toBe("0") // Device 1 is at index 0
      expect(deviceManager.currentDevice).toEqual({ name: "Device 1" })
    })

    it("should clear selection and currentDevice if device disconnected", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [{ id: "2", name: "Device 2", manufacturer: "Company B" }],
        },
      }
      deviceManager.setMIDI(mockMidi)
      deviceManager.currentDevice = { name: "Device 1" }

      statusUpdates = []
      connectionUpdates = []
      const select = document.createElement("select")
      deviceManager.output.populateDeviceList(select)

      expect(select.value).toBe("") // Selection cleared
      expect(deviceManager.currentDevice).toBe(null) // Current device cleared
      expect(connectionUpdates).toContainEqual({
        device: null,
        midi: mockMidi,
      })
    })
  })

  describe("populateInputDeviceList", () => {
    it("should populate select element with input devices", async () => {
      const mockMidi = {
        device: {
          getInputs: () => [
            { id: "1", name: "Input 1", manufacturer: "Company A" },
            { id: "2", name: "Input 2", manufacturer: "Company B" },
          ],
          getCurrentInput: () => null,
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      await deviceManager.input.populateDeviceList(select)

      expect(select.innerHTML).toContain('<option value="">Select a device</option>')
      expect(select.innerHTML).toContain('<option value="0">Input 1</option>')
      expect(select.innerHTML).toContain('<option value="1">Input 2</option>')
      expect(select.value).toBe("")
    })

    it("should show no input devices message when no inputs", async () => {
      const mockMidi = {
        device: {
          getInputs: () => [],
          getCurrentInput: () => null,
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      await deviceManager.input.populateDeviceList(select)

      expect(select.innerHTML).toContain("No devices connected")
    })

    it("should call onChange callback if provided", async () => {
      const mockMidi = {
        device: {
          getInputs: () => [{ id: "1", name: "Input 1", manufacturer: "Company A" }],
          getCurrentInput: () => null,
        },
      }
      deviceManager.setMIDI(mockMidi)

      const onChange = vi.fn()
      const select = document.createElement("select")

      await deviceManager.input.populateDeviceList(select, onChange)

      expect(onChange).toHaveBeenCalled()
    })

    it("should return early if no select element", async () => {
      const mockMidi = {
        device: {
          getInputs: () => [{ id: "1", name: "Input 1", manufacturer: "Company A" }],
          getCurrentInput: () => null,
        },
      }
      deviceManager.setMIDI(mockMidi)

      // Should not throw
      await deviceManager.input.populateDeviceList(null)
    })

    it("should keep current input selected if still available", async () => {
      const mockMidi = {
        device: {
          getInputs: () => [
            { id: "1", name: "Input 1", manufacturer: "Company A" },
            { id: "2", name: "Input 2", manufacturer: "Company B" },
          ],
          getCurrentInput: () => ({ name: "Input 1", id: "1" }),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      await deviceManager.input.populateDeviceList(select)

      expect(select.value).toBe("0") // Input 1 is at index 0
    })

    it("should clear selection if current input was disconnected", async () => {
      const mockMidi = {
        device: {
          getInputs: () => [{ id: "2", name: "Input 2", manufacturer: "Company B" }],
          getCurrentInput: () => ({ name: "Input 1", id: "1" }),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      await deviceManager.input.populateDeviceList(select)

      expect(select.value).toBe("") // Selection cleared
    })
  })

  describe("connectInputDeviceSelection", () => {
    it("should connect to selected input device", async () => {
      const mockMidi = {
        device: {
          connectInput: vi.fn().mockResolvedValue(undefined),
          getCurrentInput: vi.fn().mockReturnValue({ name: "Input 1", id: "1" }),
          getInputs: vi.fn().mockReturnValue([
            { id: "1", name: "Input 1", manufacturer: "Company A" },
            { id: "2", name: "Input 2", manufacturer: "Company B" },
          ]),
        },
        connection: {
          on: vi.fn(),
          disconnect: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML =
        '<option value="">Select a device</option><option value="0">Input 1</option><option value="1">Input 2</option>'

      let connectedDevice = null
      deviceManager.input.connectDeviceSelection(select, async (_midi, device) => {
        connectedDevice = device
      })

      // Simulate selecting device
      select.value = "0"
      select.dispatchEvent(new Event("change"))

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockMidi.device.connectInput).toHaveBeenCalledWith(0)
      expect(connectedDevice).toEqual({ name: "Input 1", id: "1" })
    })

    it("should disconnect when selecting empty option", async () => {
      const mockMidi = {
        device: {
          connectInput: vi.fn().mockResolvedValue(undefined),
          disconnectInput: vi.fn().mockResolvedValue(undefined),
          getCurrentInput: vi.fn().mockReturnValue({ name: "Input 1", id: "1" }),
          getInputs: vi.fn().mockReturnValue([{ id: "1", name: "Input 1", manufacturer: "Company A" }]),
        },
        connection: {
          on: vi.fn(),
          disconnect: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML = '<option value="">Select a device</option><option value="0">Input 1</option>'

      deviceManager.input.connectDeviceSelection(select)

      // Select a device first
      select.value = "0"
      select.dispatchEvent(new Event("change"))
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Now select empty option
      statusUpdates = []
      select.value = ""
      select.dispatchEvent(new Event("change"))
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockMidi.device.disconnectInput).toHaveBeenCalled()
      expect(statusUpdates).toContainEqual({
        message: "Input device disconnected",
        state: "error",
      })
    })

    it("should prevent concurrent connections", async () => {
      const mockMidi = {
        device: {
          connectInput: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50))),
          getCurrentInput: vi.fn().mockReturnValue({ name: "Input 1", id: "1" }),
          getInputs: vi.fn().mockReturnValue([{ id: "1", name: "Input 1", manufacturer: "Company A" }]),
        },
        connection: {
          on: vi.fn(),
          disconnect: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)

      const select = document.createElement("select")
      select.innerHTML = '<option value="">Select a device</option><option value="0">Input 1</option>'

      let connectCount = 0
      deviceManager.input.connectDeviceSelection(select, async () => {
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

    it("should return early if no select element", () => {
      const mockMidi = {
        device: {
          connectInput: vi.fn(),
        },
      }
      deviceManager.setMIDI(mockMidi)

      deviceManager.input.connectDeviceSelection(null)

      expect(mockMidi.device.connectInput).not.toHaveBeenCalled()
    })

    it("should return early if no midi", () => {
      const select = document.createElement("select")
      deviceManager.input.connectDeviceSelection(select)

      // Should not throw
      select.dispatchEvent(new Event("change"))
    })
  })

  describe("isOutputDeviceConnected", () => {
    it("should return true if output device is connected", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [
            { id: "1", name: "Device 1", manufacturer: "Company A" },
            { id: "2", name: "Device 2", manufacturer: "Company B" },
          ],
        },
      }
      deviceManager.setMIDI(mockMidi)

      expect(deviceManager.output.isDeviceConnected("Device 1")).toBe(true)
      expect(deviceManager.output.isDeviceConnected("Device 2")).toBe(true)
    })

    it("should return false if output device is not connected", () => {
      const mockMidi = {
        device: {
          getOutputs: () => [{ id: "1", name: "Device 1", manufacturer: "Company A" }],
        },
      }
      deviceManager.setMIDI(mockMidi)

      expect(deviceManager.output.isDeviceConnected("Device 2")).toBe(false)
    })

    it("should return false if no midi", () => {
      expect(deviceManager.output.isDeviceConnected("Device 1")).toBe(false)
    })
  })

  describe("isInputDeviceConnected", () => {
    it("should return true if input device is connected", () => {
      const mockMidi = {
        device: {
          getInputs: () => [
            { id: "1", name: "Input 1", manufacturer: "Company A" },
            { id: "2", name: "Input 2", manufacturer: "Company B" },
          ],
        },
      }
      deviceManager.setMIDI(mockMidi)

      expect(deviceManager.input.isDeviceConnected("Input 1")).toBe(true)
      expect(deviceManager.input.isDeviceConnected("Input 2")).toBe(true)
    })

    it("should return false if input device is not connected", () => {
      const mockMidi = {
        device: {
          getInputs: () => [{ id: "1", name: "Input 1", manufacturer: "Company A" }],
        },
      }
      deviceManager.setMIDI(mockMidi)

      expect(deviceManager.input.isDeviceConnected("Input 2")).toBe(false)
    })

    it("should return false if no midi", () => {
      expect(deviceManager.input.isDeviceConnected("Input 1")).toBe(false)
    })
  })

  describe("setupDeviceListeners for input events", () => {
    let mockMidi
    let onDeviceListChange

    beforeEach(() => {
      mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([]),
          getInputs: vi.fn().mockReturnValue([]),
        },
      }
      onDeviceListChange = vi.fn()
      deviceManager.setMIDI(mockMidi)
    })

    it("should listen for DEV_IN_CONNECTED events", () => {
      deviceManager.setupDeviceListeners(onDeviceListChange)

      const inConnectedHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_IN_CONNECTED,
      )?.[1]

      expect(inConnectedHandler).toBeDefined()

      // Simulate input device connection
      inConnectedHandler?.({ name: "Input 1", id: "1" })

      expect(statusUpdates).toContainEqual({
        message: "Input device connected: Input 1",
        state: "connected",
      })
      expect(onDeviceListChange).toHaveBeenCalled()
    })

    it("should listen for DEV_IN_DISCONNECTED events", () => {
      deviceManager.setupDeviceListeners(onDeviceListChange)

      const inDisconnectedHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_IN_DISCONNECTED,
      )?.[1]

      expect(inDisconnectedHandler).toBeDefined()

      // Simulate input device disconnection
      inDisconnectedHandler?.({ name: "Input 1", id: "1" })

      expect(statusUpdates).toContainEqual({
        message: "Input device disconnected: Input 1",
        state: "error",
      })
      expect(onDeviceListChange).toHaveBeenCalled()
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
      inputChannel: 2,
      outputChannel: 2,
    })

    expect(deviceManager).toBeInstanceOf(MIDIDeviceManager)
    expect(deviceManager.midi).toBeDefined()
    expect(deviceManager.midi.options.inputChannel).toBe(2)
    expect(deviceManager.midi.options.outputChannel).toBe(2)
  })

  it("should auto-connect to specified device if output option provided", async () => {
    const { createMIDIDeviceManager } = await import("../../src/index.js")

    const deviceManager = await createMIDIDeviceManager({
      output: "Test Output Device",
      inputChannel: 1,
      outputChannel: 1,
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
      inputChannel: 1,
      outputChannel: 1,
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

    expect(deviceManager.midi.options.inputChannel).toBe(1)
    expect(deviceManager.midi.options.outputChannel).toBe(1)
    // sysex option is passed to MIDIConnection, not stored in options
    expect(deviceManager.channel).toBe(1)
  })
})
