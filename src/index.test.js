import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMIDIController, createMIDIDeviceManager, isMIDISupported } from "./index.js"

describe("createMIDIController", () => {
  let mockMIDIAccess
  let mockOutput
  let mockInput
  let originalNavigator

  beforeEach(() => {
    originalNavigator = global.navigator

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

    mockMIDIAccess = {
      outputs: new Map([["output-1", mockOutput]]),
      inputs: new Map([["input-1", mockInput]]),
      onstatechange: null,
    }

    global.navigator = {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockMIDIAccess),
    }

    // Mock document methods for DataAttributeBinder
    global.document = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    }
  })

  afterEach(() => {
    global.navigator = originalNavigator
    vi.clearAllMocks()
  })

  it("should create and initialize a MIDIController", async () => {
    const controller = await createMIDIController()

    expect(controller).toBeDefined()
    expect(controller.initialized).toBe(true)
    expect(controller.options.outputChannel).toBe(1)
  })

  it("should merge custom options", async () => {
    const onReady = vi.fn()
    const controller = await createMIDIController({
      outputChannel: 5,
      sysex: true,
      onReady,
    })

    expect(controller.options.outputChannel).toBe(5)
    expect(controller.options.sysex).toBe(true)
    expect(onReady).toHaveBeenCalledWith(controller)
  })

  it("should connect to specified output device", async () => {
    const controller = await createMIDIController({
      output: "Test Output Device",
      autoConnect: false,
    })

    await controller.device.connect("Test Output Device")
    expect(controller.device.getCurrentOutput()?.name).toBe("Test Output Device")
  })

  it("should call onError when initialization fails", async () => {
    global.navigator.requestMIDIAccess = vi.fn().mockRejectedValue(new Error("Access denied"))
    const onError = vi.fn()

    await expect(createMIDIController({ onError })).rejects.toThrow()

    expect(onError).toHaveBeenCalled()
  })
})

describe("createMIDIDeviceManager", () => {
  let mockMIDIAccess
  let mockOutput
  let mockInput
  let originalNavigator

  beforeEach(() => {
    originalNavigator = global.navigator

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

    mockMIDIAccess = {
      outputs: new Map([["output-1", mockOutput]]),
      inputs: new Map([["input-1", mockInput]]),
      onstatechange: null,
    }

    global.navigator = {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockMIDIAccess),
    }

    global.document = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    }
  })

  afterEach(() => {
    global.navigator = originalNavigator
    vi.clearAllMocks()
  })

  it("should create and initialize a MIDIDeviceManager", async () => {
    const deviceManager = await createMIDIDeviceManager()

    expect(deviceManager).toBeDefined()
    expect(deviceManager.midi).toBeDefined()
    expect(deviceManager.midi.initialized).toBe(true)
  })

  it("should auto-connect to specified output device", async () => {
    const onConnectionUpdate = vi.fn()
    const deviceManager = await createMIDIDeviceManager({
      output: "Test Output Device",
      onConnectionUpdate,
    })

    expect(deviceManager.currentOutput).toBeDefined()
    expect(deviceManager.currentOutput.name).toBe("Test Output Device")
  })

  it("should call onReady with midi and deviceManager", async () => {
    const onReady = vi.fn()
    const deviceManager = await createMIDIDeviceManager({ onReady })

    expect(onReady).toHaveBeenCalledWith(deviceManager.midi, deviceManager)
  })

  it("should use separate input and output channels", async () => {
    const deviceManager = await createMIDIDeviceManager({
      inputChannel: 3,
      outputChannel: 7,
    })

    expect(deviceManager.midi.options.inputChannel).toBe(3)
    expect(deviceManager.midi.options.outputChannel).toBe(7)
  })
})

describe("isMIDISupported", () => {
  let originalNavigator

  beforeEach(() => {
    // Save original navigator
    originalNavigator = global.navigator
  })

  afterEach(() => {
    // Restore original navigator
    global.navigator = originalNavigator
  })

  it("should return true when navigator.requestMIDIAccess is defined", () => {
    global.navigator = {
      requestMIDIAccess: () => {},
    }

    expect(isMIDISupported()).toBe(true)
  })

  it("should return false when navigator is undefined", () => {
    // eslint-disable-next-line no-global-assign
    global.navigator = undefined

    expect(isMIDISupported()).toBe(false)
  })

  it("should return false when navigator.requestMIDIAccess is undefined", () => {
    global.navigator = {}

    expect(isMIDISupported()).toBe(false)
  })

  it("should return false when navigator.requestMIDIAccess is not a function", () => {
    global.navigator = {
      requestMIDIAccess: "not a function",
    }

    expect(isMIDISupported()).toBe(false)
  })
})
