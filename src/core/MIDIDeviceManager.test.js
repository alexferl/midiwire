import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONTROLLER_EVENTS } from "./MIDIController.js"
import { MIDIDeviceManager } from "./MIDIDeviceManager.js"

describe("MIDIDeviceManager", () => {
  // Core functionality tests
  describe("Constructor and Initialization", () => {
    it("should initialize with default options", () => {
      const manager = new MIDIDeviceManager()

      expect(manager.midi).toBe(null)
      expect(manager.channel).toBe(1)
      expect(manager.currentOutput).toBe(null)
      expect(manager.currentInput).toBe(null)
    })

    it("should initialize with custom options", () => {
      const statusCallback = vi.fn()
      const connectionCallback = vi.fn()
      const manager = new MIDIDeviceManager({
        midiController: { device: {} },
        onStatusUpdate: statusCallback,
        onConnectionUpdate: connectionCallback,
        channel: 5,
      })

      expect(manager.midi).toBeDefined()
      expect(manager.channel).toBe(5)
      expect(manager.onStatusUpdate).toBe(statusCallback)
      expect(manager.onConnectionUpdate).toBe(connectionCallback)
    })
  })

  // Status and connection callback tests
  describe("Status and Connection Events", () => {
    it("should call onStatusUpdate when status changes", () => {
      const statusCallback = vi.fn()
      const manager = new MIDIDeviceManager({ onStatusUpdate: statusCallback })

      manager.updateStatus("Connected", "connected")

      expect(statusCallback).toHaveBeenCalledWith("Connected", "connected")
    })

    it("should call onConnectionUpdate when connection status changes", () => {
      const connectionCallback = vi.fn()
      const mockMidi = { device: {} }
      const manager = new MIDIDeviceManager({
        midiController: mockMidi,
        onConnectionUpdate: connectionCallback,
      })

      manager.currentOutput = { name: "Output 1" }
      manager.currentInput = { name: "Input 1" }
      manager.updateConnectionStatus()

      expect(connectionCallback).toHaveBeenCalledWith({ name: "Output 1" }, { name: "Input 1" }, mockMidi)
    })
  })

  // SetupSelectors is the main API
  describe("setupSelectors() - Main API", () => {
    describe("setupSelectors() - Error Handling", () => {
      it("should throw error if MIDI not initialized", async () => {
        const manager = new MIDIDeviceManager()
        await expect(manager.setupSelectors({})).rejects.toThrow("MIDI controller not initialized")
      })
    })

    describe("setupSelectors() - Output Device Setup", () => {
      let manager
      let mockMidi

      beforeEach(() => {
        mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([
              { name: "Output 1", id: "1" },
              { name: "Output 2", id: "2" },
            ]),
            connectOutput: vi.fn().mockResolvedValue(undefined),
            disconnectOutput: vi.fn().mockResolvedValue(undefined),
            getCurrentOutput: vi.fn().mockReturnValue({ name: "Output 1", id: "1" }),
          },
          options: { outputChannel: 1 },
        }
        manager = new MIDIDeviceManager({ midiController: mockMidi })
      })

      it("should populate output selector with devices", async () => {
        const outputSelect = document.createElement("select")

        await manager.setupSelectors({ output: outputSelect })

        expect(outputSelect.innerHTML).toContain("Output 1")
        expect(outputSelect.innerHTML).toContain("Output 2")
        expect(outputSelect.disabled).toBe(false)
      })

      it("should connect device when selected", async () => {
        const outputSelect = document.createElement("select")
        let connectCalled = false

        await manager.setupSelectors(
          { output: outputSelect },
          {
            onConnect: ({ device, type }) => {
              connectCalled = true
              expect(type).toBe("output")
              expect(device.name).toBe("Output 1")
            },
          },
        )

        outputSelect.value = "0"
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockMidi.device.connectOutput).toHaveBeenCalledWith(0)
        expect(manager.currentOutput.name).toBe("Output 1")
        expect(connectCalled).toBe(true)
      })

      it("should disconnect device when cleared", async () => {
        const outputSelect = document.createElement("select")
        let disconnectCalled = false

        await manager.setupSelectors(
          { output: outputSelect },
          {
            onDisconnect: ({ type }) => {
              disconnectCalled = true
              expect(type).toBe("output")
            },
          },
        )

        // Connect first
        outputSelect.value = "0"
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Then disconnect
        outputSelect.value = ""
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockMidi.device.disconnectOutput).toHaveBeenCalled()
        expect(manager.currentOutput).toBe(null)
        expect(disconnectCalled).toBe(true)
      })

      it("should handle device connection failure", async () => {
        const statusUpdates = []
        mockMidi.device.connectOutput = vi.fn().mockRejectedValue(new Error("Connection failed"))

        const manager = new MIDIDeviceManager({
          midiController: mockMidi,
          onStatusUpdate: (message, state) => statusUpdates.push({ message, state }),
        })

        const outputSelect = document.createElement("select")
        await manager.setupSelectors({ output: outputSelect })

        outputSelect.value = "0"
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(statusUpdates.some((u) => u.message.includes("Connection failed"))).toBe(true)
        expect(statusUpdates.some((u) => u.state === "error")).toBe(true)
      })
    })

    describe("setupSelectors() - Input Device Setup", () => {
      let manager
      let mockMidi

      beforeEach(() => {
        mockMidi = {
          on: vi.fn(),
          device: {
            getInputs: vi.fn().mockReturnValue([
              { name: "Input 1", id: "1" },
              { name: "Input 2", id: "2" },
            ]),
            connectInput: vi.fn().mockResolvedValue(undefined),
            disconnectInput: vi.fn().mockResolvedValue(undefined),
            getCurrentInput: vi.fn().mockReturnValue({ name: "Input 2", id: "2" }),
          },
          options: { inputChannel: 1 },
        }
        manager = new MIDIDeviceManager({ midiController: mockMidi })
      })

      it("should populate input selector with devices", async () => {
        const inputSelect = document.createElement("select")

        await manager.setupSelectors({ input: inputSelect })

        expect(inputSelect.innerHTML).toContain("Input 1")
        expect(inputSelect.innerHTML).toContain("Input 2")
        expect(inputSelect.disabled).toBe(false)
      })

      it("should connect input device when selected", async () => {
        const inputSelect = document.createElement("select")
        let connectCalled = false

        mockMidi.device.getCurrentInput.mockReturnValue({ name: "Input 2", id: "2" })

        await manager.setupSelectors(
          { input: inputSelect },
          {
            onConnect: ({ device, type }) => {
              connectCalled = true
              expect(type).toBe("input")
              expect(device.name).toBe("Input 2")
            },
          },
        )

        inputSelect.value = "1"
        inputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockMidi.device.connectInput).toHaveBeenCalledWith(1)
        expect(connectCalled).toBe(true)
      })

      it("should disconnect input device when cleared", async () => {
        const inputSelect = document.createElement("select")
        let disconnectCalled = false

        await manager.setupSelectors(
          { input: inputSelect },
          {
            onDisconnect: ({ type }) => {
              disconnectCalled = true
              expect(type).toBe("input")
            },
          },
        )

        inputSelect.value = "0"
        inputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        inputSelect.value = ""
        inputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockMidi.device.disconnectInput).toHaveBeenCalled()
        expect(disconnectCalled).toBe(true)
      })
    })

    describe("setupSelectors() - Channel Selection", () => {
      it("should setup channel selector and update MIDI channel", async () => {
        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([]),
          },
          options: { outputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({ midiController: mockMidi })

        const channelSelect = document.createElement("select")
        channelSelect.innerHTML = "<option value='1'>1</option><option value='5'>5</option>"

        await manager.setupSelectors({ channel: channelSelect })

        channelSelect.value = "5"
        channelSelect.dispatchEvent(new Event("change"))

        expect(mockMidi.options.outputChannel).toBe(5)
      })
    })

    describe("setupSelectors() - Combined Setup", () => {
      it("should setup output and channel together", async () => {
        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([{ name: "Device", id: "1" }]),
            connectOutput: vi.fn().mockResolvedValue(undefined),
            getCurrentOutput: vi.fn().mockReturnValue({ name: "Device", id: "1" }),
          },
          options: { outputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({ midiController: mockMidi })

        const outputSelect = document.createElement("select")
        const channelSelect = document.createElement("select")
        channelSelect.innerHTML = "<option value='1'>1</option>"

        const result = await manager.setupSelectors({
          output: outputSelect,
          channel: channelSelect,
        })

        expect(result).toBe(mockMidi) // Should return MIDI controller
        expect(outputSelect.innerHTML).toContain("Device")
      })

      it("should setup all selectors at once", async () => {
        const manager = new MIDIDeviceManager({
          midiController: {
            on: vi.fn(),
            device: {
              getOutputs: vi.fn().mockReturnValue([{ name: "Output", id: "1" }]),
              getInputs: vi.fn().mockReturnValue([{ name: "Input", id: "1" }]),
              connectOutput: vi.fn().mockResolvedValue(undefined),
              connectInput: vi.fn().mockResolvedValue(undefined),
              getCurrentOutput: vi.fn(),
              getCurrentInput: vi.fn(),
            },
            options: { outputChannel: 1, inputChannel: 1 },
          },
        })

        const outputSelect = document.createElement("select")
        const inputSelect = document.createElement("select")
        const channelSelect = document.createElement("select")
        channelSelect.innerHTML = "<option value='1'>1</option>"

        await manager.setupSelectors({
          output: outputSelect,
          input: inputSelect,
          channel: channelSelect,
        })

        expect(outputSelect.innerHTML).toContain("Output")
        expect(inputSelect.innerHTML).toContain("Input")
      })
    })

    describe("setupSelectors() - Callback Options", () => {
      it("should work without onConnect callback", async () => {
        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([{ name: "Output 1", id: "1" }]),
            connectOutput: vi.fn().mockResolvedValue(undefined),
            getCurrentOutput: vi.fn().mockReturnValue({ name: "Output 1", id: "1" }),
          },
          options: { outputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({ midiController: mockMidi })
        const outputSelect = document.createElement("select")

        await expect(manager.setupSelectors({ output: outputSelect }, {})).resolves.not.toThrow()

        outputSelect.value = "0"
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockMidi.device.connectOutput).toHaveBeenCalled()
      })

      it("should work without onDisconnect callback", async () => {
        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([{ name: "Output 1", id: "1" }]),
            connectOutput: vi.fn().mockResolvedValue(undefined),
            disconnectOutput: vi.fn().mockResolvedValue(undefined),
            getCurrentOutput: vi.fn().mockReturnValue({ name: "Output 1", id: "1" }),
          },
          options: { outputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({ midiController: mockMidi })
        const outputSelect = document.createElement("select")

        await manager.setupSelectors({ output: outputSelect }, {})

        outputSelect.value = "0"
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        outputSelect.value = ""
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockMidi.device.disconnectOutput).toHaveBeenCalled()
      })
    })

    describe("setupSelectors() - String Selectors", () => {
      it("should accept string selectors and resolve them to elements", async () => {
        // Create elements with IDs that match our test selectors
        const outputElement = document.createElement("select")
        outputElement.id = "test-output-select"
        document.body.appendChild(outputElement)

        const inputElement = document.createElement("select")
        inputElement.id = "test-input-select"
        document.body.appendChild(inputElement)

        const channelElement = document.createElement("select")
        channelElement.id = "test-channel-select"
        document.body.appendChild(channelElement)

        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([{ name: "Output 1", id: "1" }]),
            getInputs: vi.fn().mockReturnValue([{ name: "Input 1", id: "1" }]),
            getCurrentInput: vi.fn().mockReturnValue(null),
          },
          options: { outputChannel: 1, inputChannel: 1 },
        }

        const manager = new MIDIDeviceManager({ midiController: mockMidi })

        // Call setupSelectors with string selectors
        await manager.setupSelectors({
          output: "#test-output-select",
          input: "#test-input-select",
          channel: "#test-channel-select",
        })

        // Verify elements were populated
        expect(outputElement.innerHTML).toContain("Output 1")
        expect(inputElement.innerHTML).toContain("Input 1")

        // Cleanup
        document.body.removeChild(outputElement)
        document.body.removeChild(inputElement)
        document.body.removeChild(channelElement)
      })

      it("should handle null/undefined selectors gracefully", async () => {
        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([]),
            getInputs: vi.fn().mockReturnValue([]),
          },
          options: { outputChannel: 1, inputChannel: 1 },
        }

        const manager = new MIDIDeviceManager({ midiController: mockMidi })

        // Should not throw with null/undefined selectors
        await expect(
          manager.setupSelectors({
            output: null,
            input: undefined,
            channel: "#non-existent",
          }),
        ).resolves.not.toThrow()
      })

      it("should warn when string selector is not found", async () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([]),
            getInputs: vi.fn().mockReturnValue([]),
          },
          options: { outputChannel: 1 },
        }

        const manager = new MIDIDeviceManager({ midiController: mockMidi })

        // Use non-existent selector
        await manager.setupSelectors({
          output: "#does-not-exist",
        })

        // Should have warned about missing element
        expect(consoleWarnSpy).toHaveBeenCalledWith('MIDIDeviceManager: Selector "#does-not-exist" not found')

        consoleWarnSpy.mockRestore()
      })

      it("should work with mixed element and string selectors", async () => {
        const outputElement = document.createElement("select")
        outputElement.id = "mixed-output"
        document.body.appendChild(outputElement)

        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([{ name: "Output 1", id: "1" }]),
            getInputs: vi.fn().mockReturnValue([{ name: "Input 1", id: "1" }]),
            getCurrentInput: vi.fn().mockReturnValue(null),
          },
          options: { outputChannel: 1, inputChannel: 1 },
        }

        const manager = new MIDIDeviceManager({ midiController: mockMidi })

        const inputElement = document.createElement("select")

        // Mix: output as string, input as element
        await manager.setupSelectors({
          output: "#mixed-output",
          input: inputElement,
        })

        expect(outputElement.innerHTML).toContain("Output 1")
        expect(inputElement.innerHTML).toContain("Input 1")

        document.body.removeChild(outputElement)
      })
    })
  })

  // External MIDI device events tests
  describe("External MIDI Device Events", () => {
    describe("Output device connection/disconnection events", () => {
      it("should handle external output device connection", async () => {
        const statusUpdates = []
        const mockMidi = {
          on: vi.fn(),
          device: { getOutputs: vi.fn().mockReturnValue([]) },
          options: { outputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({
          midiController: mockMidi,
          onStatusUpdate: (message, state) => statusUpdates.push({ message, state }),
        })

        await manager.setupSelectors({ output: document.createElement("select") })

        const connectHandler = mockMidi.on.mock.calls.find(
          (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_CONNECTED,
        )?.[1]

        connectHandler({ name: "Keyboard", id: "1" })

        expect(statusUpdates.some((u) => u.message.includes("Output device connected: Keyboard"))).toBe(true)
        expect(statusUpdates.some((u) => u.state === "connected")).toBe(true)
      })

      it("should handle external output device disconnection of current device", async () => {
        const statusUpdates = []
        const mockMidi = {
          on: vi.fn(),
          device: {
            getOutputs: vi.fn().mockReturnValue([{ name: "Output 1", id: "1" }]),
            connectOutput: vi.fn().mockResolvedValue(undefined),
            disconnectOutput: vi.fn().mockResolvedValue(undefined),
            getCurrentOutput: vi.fn().mockReturnValue({ name: "Output 1", id: "1" }),
          },
          options: { outputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({
          midiController: mockMidi,
          onStatusUpdate: (message, state) => statusUpdates.push({ message, state }),
        })

        const outputSelect = document.createElement("select")
        await manager.setupSelectors({ output: outputSelect })

        // Connect device
        outputSelect.value = "0"
        outputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(manager.currentOutput).toEqual({ name: "Output 1", id: "1" })

        // Disconnect externally
        const disconnectHandler = mockMidi.on.mock.calls.find(
          (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED,
        )?.[1]

        disconnectHandler({ name: "Output 1", id: "1" })

        expect(manager.currentOutput).toBe(null)
        expect(statusUpdates.some((u) => u.message.includes("Output device disconnected"))).toBe(true)
      })
    })

    describe("Input device connection/disconnection events", () => {
      it("should handle external input device connection", async () => {
        const statusUpdates = []
        const mockMidi = {
          on: vi.fn(),
          device: {
            getInputs: vi.fn().mockReturnValue([]),
            getCurrentInput: vi.fn().mockReturnValue(null),
          },
          options: { inputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({
          midiController: mockMidi,
          onStatusUpdate: (message, state) => statusUpdates.push({ message, state }),
        })

        await manager.setupSelectors({ input: document.createElement("select") })

        const connectHandler = mockMidi.on.mock.calls.find(
          (call) => call[0] === CONTROLLER_EVENTS.DEV_IN_CONNECTED,
        )?.[1]

        connectHandler({ name: "Keyboard", id: "1" })

        expect(statusUpdates.some((u) => u.message.includes("Input device connected: Keyboard"))).toBe(true)
      })

      it("should handle external input device disconnection of current device", async () => {
        const statusUpdates = []
        const mockMidi = {
          on: vi.fn(),
          device: {
            getInputs: vi.fn().mockReturnValue([{ name: "Keyboard", id: "1" }]),
            connectInput: vi.fn().mockResolvedValue(undefined),
            disconnectInput: vi.fn().mockResolvedValue(undefined),
            getCurrentInput: vi.fn().mockReturnValue({ name: "Keyboard", id: "1" }),
          },
          options: { inputChannel: 1 },
        }
        const manager = new MIDIDeviceManager({
          midiController: mockMidi,
          onStatusUpdate: (message, state) => statusUpdates.push({ message, state }),
        })

        const inputSelect = document.createElement("select")
        await manager.setupSelectors({ input: inputSelect })

        // Connect
        inputSelect.value = "0"
        inputSelect.dispatchEvent(new Event("change"))
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Disconnect externally
        const disconnectHandler = mockMidi.on.mock.calls.find(
          (call) => call[0] === CONTROLLER_EVENTS.DEV_IN_DISCONNECTED,
        )?.[1]

        disconnectHandler({ name: "Keyboard", id: "1" })

        expect(statusUpdates.some((u) => u.message.includes("Input device disconnected"))).toBe(true)
      })
    })
  })

  // _setupDeviceChangeListeners tests
  describe("_setupDeviceChangeListeners() - String Selectors", () => {
    let manager
    let mockMidi
    let mockOutputSelect
    let mockInputSelect

    beforeEach(() => {
      mockOutputSelect = document.createElement("select")
      mockOutputSelect.id = "output-select"
      mockInputSelect = document.createElement("select")
      mockInputSelect.id = "input-select"
      document.body.appendChild(mockOutputSelect)
      document.body.appendChild(mockInputSelect)

      mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([]),
          getInputs: vi.fn().mockReturnValue([]),
          getCurrentInput: vi.fn().mockReturnValue(null),
        },
        options: { outputChannel: 1, inputChannel: 1 },
      }
      manager = new MIDIDeviceManager({ midiController: mockMidi })
    })

    afterEach(() => {
      document.body.removeChild(mockOutputSelect)
      document.body.removeChild(mockInputSelect)
    })

    it("should accept string selectors for output element", () => {
      manager._setupDeviceChangeListeners({ output: mockOutputSelect })

      expect(mockMidi.on).toHaveBeenCalled()
    })

    it("should accept string selectors for input element", () => {
      manager._setupDeviceChangeListeners({ input: mockInputSelect })

      expect(mockMidi.on).toHaveBeenCalled()
    })

    it("should accept string selectors for both output and input elements", () => {
      manager._setupDeviceChangeListeners({
        output: mockOutputSelect,
        input: mockInputSelect,
      })

      expect(mockMidi.on).toHaveBeenCalled()
    })

    it("should handle missing elements with string selectors", () => {
      // Suppress console.warn for this test
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      manager._setupDeviceChangeListeners({
        output: null,
        input: null,
      })

      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it("should clear output select value on disconnect when using string selector", () => {
      manager.currentOutput = { name: "Test Output" }

      manager._setupDeviceChangeListeners({
        output: mockOutputSelect,
      })

      // Find the disconnect handler for output
      const disconnectCalls = mockMidi.on.mock.calls.filter(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED,
      )
      expect(disconnectCalls.length).toBe(1)

      const disconnectHandler = disconnectCalls[0][1]
      disconnectHandler({ name: "Test Output" })

      expect(mockOutputSelect.value).toBe("")
    })

    it("should clear input select value on disconnect when using string selector", () => {
      manager._setupDeviceChangeListeners({
        input: mockInputSelect,
      })

      // Find the disconnect handler for input
      const disconnectCalls = mockMidi.on.mock.calls.filter((call) => call[0] === CONTROLLER_EVENTS.DEV_IN_DISCONNECTED)
      expect(disconnectCalls.length).toBe(1)

      const disconnectHandler = disconnectCalls[0][1]
      disconnectHandler({ name: "Test Input" })

      expect(mockInputSelect.value).toBe("")
    })

    it("should call onDeviceListChange callback when output device connects", async () => {
      mockMidi.device.getOutputs = vi.fn().mockReturnValue([{ name: "New Device", id: "1" }])
      const mockCallback = vi.fn()

      manager._setupDeviceChangeListeners({ output: mockOutputSelect }, mockCallback)

      // Find the connect handler for output
      const connectCalls = mockMidi.on.mock.calls.filter((call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_CONNECTED)
      expect(connectCalls.length).toBe(1)

      const connectHandler = connectCalls[0][1]
      await connectHandler({ name: "New Device", id: "1" })

      expect(mockCallback).toHaveBeenCalled()
    })

    it("should call onDeviceListChange callback when output device disconnects", async () => {
      const mockCallback = vi.fn()

      manager._setupDeviceChangeListeners({ output: mockOutputSelect }, mockCallback)

      // Find the disconnect handler for output
      const disconnectCalls = mockMidi.on.mock.calls.filter(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED,
      )
      expect(disconnectCalls.length).toBe(1)

      const disconnectHandler = disconnectCalls[0][1]
      await disconnectHandler({ name: "Test Output" })

      expect(mockCallback).toHaveBeenCalled()
    })

    it("should call onDeviceListChange callback when input device connects", async () => {
      mockMidi.device.getInputs = vi.fn().mockReturnValue([{ name: "New Input", id: "1" }])
      const mockCallback = vi.fn()

      manager._setupDeviceChangeListeners({ input: mockInputSelect }, mockCallback)

      // Find the connect handler for input
      const connectCalls = mockMidi.on.mock.calls.filter((call) => call[0] === CONTROLLER_EVENTS.DEV_IN_CONNECTED)
      expect(connectCalls.length).toBe(1)

      const connectHandler = connectCalls[0][1]
      await connectHandler({ name: "New Input", id: "1" })

      expect(mockCallback).toHaveBeenCalled()
    })

    it("should call onDeviceListChange callback when input device disconnects", async () => {
      const mockCallback = vi.fn()

      manager._setupDeviceChangeListeners({ input: mockInputSelect }, mockCallback)

      // Find the disconnect handler for input
      const disconnectCalls = mockMidi.on.mock.calls.filter((call) => call[0] === CONTROLLER_EVENTS.DEV_IN_DISCONNECTED)
      expect(disconnectCalls.length).toBe(1)

      const disconnectHandler = disconnectCalls[0][1]
      await disconnectHandler({ name: "Test Input" })

      expect(mockCallback).toHaveBeenCalled()
    })

    it("should call onDeviceListChange callback for both output and input elements", async () => {
      mockMidi.device.getOutputs = vi.fn().mockReturnValue([{ name: "New Output", id: "1" }])
      mockMidi.device.getInputs = vi.fn().mockReturnValue([{ name: "New Input", id: "1" }])
      const mockCallback = vi.fn()

      manager._setupDeviceChangeListeners({ output: mockOutputSelect, input: mockInputSelect }, mockCallback)

      // Find all handlers
      const outputConnectHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_CONNECTED,
      )?.[1]
      const outputDisconnectHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED,
      )?.[1]
      const inputConnectHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_IN_CONNECTED,
      )?.[1]
      const inputDisconnectHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_IN_DISCONNECTED,
      )?.[1]

      // Test all four callbacks
      await outputConnectHandler({ name: "New Output", id: "1" })
      expect(mockCallback).toHaveBeenCalledTimes(1)

      await outputDisconnectHandler({ name: "Output", id: "1" })
      expect(mockCallback).toHaveBeenCalledTimes(2)

      await inputConnectHandler({ name: "New Input", id: "1" })
      expect(mockCallback).toHaveBeenCalledTimes(3)

      await inputDisconnectHandler({ name: "Input", id: "1" })
      expect(mockCallback).toHaveBeenCalledTimes(4)
    })
  })

  // Internal method tests
  describe("Internal Methods - Guard Clauses", () => {
    it("should return early in _setupDeviceChangeListeners without MIDI", () => {
      const manager = new MIDIDeviceManager({ midiController: null })

      expect(() => {
        manager._setupDeviceChangeListeners({}, () => {})
      }).not.toThrow()
    })

    it("should return empty array from _getOutputDevices without MIDI", () => {
      const manager = new MIDIDeviceManager({ midiController: null })

      const devices = manager._getOutputDevices()
      expect(devices).toEqual([])
    })

    it("should return empty array from _getInputDevices without MIDI", () => {
      const manager = new MIDIDeviceManager({ midiController: null })

      const devices = manager._getInputDevices()
      expect(devices).toEqual([])
    })

    it("should return early from _populateOutputDeviceList without MIDI or element", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: { getOutputs: vi.fn().mockReturnValue([]) },
        options: { outputChannel: 1 },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      await expect(manager._populateOutputDeviceList(null)).resolves.toBeUndefined()

      await expect(manager._populateOutputDeviceList(document.createElement("select"))).resolves.toBeUndefined()
    })

    it("should return early from _populateInputDeviceList without MIDI or element", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: { getInputs: vi.fn().mockReturnValue([]) },
        options: { inputChannel: 1 },
      }
      let manager = new MIDIDeviceManager({ midiController: mockMidi })

      await expect(manager._populateInputDeviceList(null)).resolves.toBeUndefined()

      manager = new MIDIDeviceManager({ midiController: null })
      await expect(manager._populateInputDeviceList(document.createElement("select"))).resolves.toBeUndefined()
    })

    it("should return early from _connectOutputDeviceSelection without MIDI or element", () => {
      const mockMidi = {
        on: vi.fn(),
        device: { getOutputs: vi.fn().mockReturnValue([]) },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      expect(() => manager._connectOutputDeviceSelection(null)).not.toThrow()

      expect(() => manager._connectOutputDeviceSelection(document.createElement("select"))).not.toThrow()
    })

    it("should return early from _connectInputDeviceSelection without MIDI or element", () => {
      const mockMidi = {
        on: vi.fn(),
        device: { getInputs: vi.fn().mockReturnValue([]) },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      expect(() => manager._connectInputDeviceSelection(null)).not.toThrow()

      expect(() => manager._connectInputDeviceSelection(document.createElement("select"))).not.toThrow()
    })

    it("should return early from _connectChannelSelection without MIDI or element", () => {
      const mockMidi = {
        on: vi.fn(),
        device: { getOutputs: vi.fn().mockReturnValue([]) },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      expect(() => manager._connectChannelSelection(null, "output")).not.toThrow()

      expect(() => manager._connectChannelSelection(document.createElement("select"), "output")).not.toThrow()
    })
  })

  describe("Internal Methods - Device List Management", () => {
    it("should call onChange callback after populating device list", async () => {
      let onChangeCalled = false
      const mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([
            { name: "Output 1", id: "1" },
            { name: "Output 2", id: "2" },
          ]),
        },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      const outputSelect = document.createElement("select")
      const onChange = () => {
        onChangeCalled = true
      }

      await manager._populateOutputDeviceList(outputSelect, onChange)

      expect(onChangeCalled).toBe(true)
    })

    it("should handle missing onChange callback gracefully", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([{ name: "Output 1", id: "1" }]),
        },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      const outputSelect = document.createElement("select")

      await expect(manager._populateOutputDeviceList(outputSelect)).resolves.toBeUndefined()
    })

    it("should show 'No devices connected' when no devices available", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: { getOutputs: vi.fn().mockReturnValue([]) },
        options: { outputChannel: 1 },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      const outputSelect = document.createElement("select")
      await manager._populateOutputDeviceList(outputSelect)

      expect(outputSelect.innerHTML).toContain("No devices connected")
      expect(outputSelect.disabled).toBe(true)
    })

    it("should clear select value when current device no longer exists", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([
            { name: "Output 1", id: "1" },
            { name: "Output 2", id: "2" },
          ]),
        },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })
      manager.currentOutput = { name: "Output 3", id: "3" } // Not in list

      const outputSelect = document.createElement("select")
      await manager._populateOutputDeviceList(outputSelect)

      expect(outputSelect.value).toBe("")
      expect(outputSelect.innerHTML).not.toContain("Output 3")
    })

    it("should maintain select value when current device exists", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([
            { name: "Output 1", id: "1" },
            { name: "Output 2", id: "2" },
          ]),
        },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })
      manager.currentOutput = { name: "Output 1", id: "1" } // IS in list

      const outputSelect = document.createElement("select")
      await manager._populateOutputDeviceList(outputSelect)

      expect(outputSelect.value).toBe("0")
    })
  })

  // Edge cases
  describe("Edge Cases and Error Conditions", () => {
    it("should handle concurrent output connections", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([
            { name: "Output 1", id: "1" },
            { name: "Output 2", id: "2" },
          ]),
          connectOutput: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50))),
          getCurrentOutput: vi.fn().mockReturnValue({ name: "Output 1", id: "1" }),
        },
        options: { outputChannel: 1 },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      const outputSelect = document.createElement("select")
      let connectCount = 0

      await manager.setupSelectors(
        { output: outputSelect },
        {
          onConnect: async () => {
            connectCount++
            await new Promise((resolve) => setTimeout(resolve, 10))
          },
        },
      )

      // Rapid changes should only connect once due to isConnecting flag
      outputSelect.value = "0"
      outputSelect.dispatchEvent(new Event("change"))
      outputSelect.dispatchEvent(new Event("change"))

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(connectCount).toBe(1)
      expect(mockMidi.device.connectOutput).toHaveBeenCalledTimes(1)
    })

    it("should clear output select value when current device disconnects externally", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([{ name: "Output 1", id: "1" }]),
          connectOutput: vi.fn().mockResolvedValue(undefined),
          disconnectOutput: vi.fn().mockResolvedValue(undefined),
          getCurrentOutput: vi.fn().mockReturnValue({ name: "Output 1", id: "1" }),
        },
        options: { outputChannel: 1 },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      const outputSelect = document.createElement("select")
      outputSelect.innerHTML = "<option value='0'>Output 1</option>"

      await manager.setupSelectors({ output: outputSelect })

      // Connect
      outputSelect.value = "0"
      outputSelect.dispatchEvent(new Event("change"))
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(outputSelect.value).toBe("0")

      // External disconnection
      const disconnectHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED,
      )?.[1]

      disconnectHandler({ name: "Output 1", id: "1" })

      expect(outputSelect.value).toBe("")
      expect(manager.currentOutput).toBe(null)
    })

    it("should not clear select value when different device disconnects externally", async () => {
      const mockMidi = {
        on: vi.fn(),
        device: {
          getOutputs: vi.fn().mockReturnValue([
            { name: "Output 1", id: "1" },
            { name: "Output 2", id: "2" },
          ]),
          connectOutput: vi.fn().mockResolvedValue(undefined),
          getCurrentOutput: vi.fn().mockReturnValue({ name: "Output 1", id: "1" }),
        },
        options: { outputChannel: 1 },
      }
      const manager = new MIDIDeviceManager({ midiController: mockMidi })

      const outputSelect = document.createElement("select")
      outputSelect.innerHTML = "<option value='0'>Output 1</option><option value='1'>Output 2</option>"

      await manager.setupSelectors({ output: outputSelect })

      // Connect Output 1
      outputSelect.value = "0"
      outputSelect.dispatchEvent(new Event("change"))
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Disconnect Output 2 (different device)
      const disconnectHandler = mockMidi.on.mock.calls.find(
        (call) => call[0] === CONTROLLER_EVENTS.DEV_OUT_DISCONNECTED,
      )?.[1]

      disconnectHandler({ name: "Output 2", id: "2" })

      // Should NOT clear since it's a different device
      expect(outputSelect.value).toBe("0")
      expect(manager.currentOutput).toEqual({ name: "Output 1", id: "1" })
    })
  })
})
