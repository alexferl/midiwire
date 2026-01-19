# midiwire

A modern, declarative JavaScript library for creating browser-based MIDI controllers. Build synth patch editors, hardware controllers, and MIDI utilities with simple HTML data attributes or a powerful programmatic API.

## Features

- 🎛️ **Declarative HTML binding** - Use `data-midi-cc` attributes for instant MIDI control
- 🎹 **Full Web MIDI API** - Native browser MIDI support (Chrome, Firefox, Opera)
- 🔌 **Bidirectional MIDI** - Send and receive MIDI messages
- 🎼 **SysEx support** - Send/receive System Exclusive messages for device control
- 🎛️ **14-bit CC support** - High-resolution MIDI (0-16383) with automatic MSB/LSB handling
- ⏱️ **Debouncing** - Prevent MIDI device overload with configurable debouncing
- 🔌 **Hotplug support** - Detect and handle device connections/disconnections
- 💾 **Patch management** - Save/load patches with automatic element sync and versioning
- 🎹 **DX7 support** - Load and create Yamaha DX7 voice (patch) banks (.syx files)
- 📦 **Zero dependencies** - Lightweight and fast
- 🔧 **Flexible API** - Works with data attributes or programmatically
- 🎨 **Framework agnostic** - Use with vanilla JS, React, Vue, or anything else
- 📝 **Fully documented** - JSDoc types for excellent IDE support

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
  - [HTML Data Attributes](#html-data-attributes-easiest)
  - [Programmatic API](#programmatic-api)
  - [SysEx and Bidirectional MIDI](#sysex-and-bidirectional-midi)
  - [Device Manager](#device-manager-high-level-convenience-api)
- [Key Features](#key-features)
  - [Declarative Data Attributes](#declarative-data-attributes)
  - [14-bit MIDI Control](#14-bit-midi-control)
  - [Debouncing](#debouncing)
  - [Custom Controls](#custom-controls-svg-knobs-canvas-etc)
  - [Send MIDI Messages](#send-midi-messages)
  - [Receive MIDI Messages](#receive-midi-messages)
  - [Device Management](#device-management)
  - [Patch Management](#patch-management)
    - [Automatic Patch Creation](#automatic-patch-creation)
    - [Apply Patches](#apply-patches)
    - [Patch Storage](#patch-storage)
    - [Advanced: Working with Settings](#advanced-working-with-settings)
  - [Utility Functions](#utility-functions)
    - [MIDI Note Utilities](#midi-note-utilities)
    - [14-bit MIDI Control](#14-bit-midi-control-1)
    - [SysEx Utilities](#sysex-utilities)
    - [MIDI Validators](#midi-validators)
  - [DX7 Bank Support](#dx7-bank-support)
  - [Working with Raw Data](#working-with-raw-data)
  - [Device Change Events](#device-change-events)
  - [Connection Status](#connection-status)
  - [MIDIConnection Class](#midiconnection-class-advanced)
  - [MIDI Event Constants](#midi-event-constants)
    - [Shorthand Aliases](#shorthand-aliases-optional)
- [Use Cases](#use-cases)
- [Browser Support](#browser-support)
- [Examples](#examples)
- [Development](#development)
- [License](#license)
- [Credits](#credits)

## Installation

```bash
npm install midiwire
```

Or use directly in the browser:

```html
<script type="module">
  import { createMIDIController } from "./dist/midiwire.es.js";
</script>
```

## Quick Start

### HTML Data Attributes (Easiest)

```html
<!DOCTYPE html>
<html>
<body>
  <h1>Synth Editor</h1>

  <label>
    Filter Cutoff
    <input type="range" min="0" max="127" data-midi-cc="74">
  </label>

  <label>
    Resonance
    <input type="range" min="0" max="127" data-midi-cc="71">
  </label>

  <script type="module">
    import { createMIDIController } from "midiwire";

    await createMIDIController({
      channel: 1,
      selector: "[data-midi-cc]"
    });
  </script>
</body>
</html>
```

### Programmatic API

```javascript
import { createMIDIController, CONTROLLER_EVENTS } from "midiwire";

// Initialize
const midi = await createMIDIController({
  channel: 1,
  output: "My Synth"
});

// Bind controls manually
const cutoff = document.querySelector("#cutoff");
midi.bind(cutoff, { cc: 74, min: 0, max: 127 });

// Bind with custom onInput callback for custom controls
const knob = document.querySelector("#custom-knob");
midi.bind(knob, {
  cc: 75,
  min: 0,
  max: 100,
  onInput: (value) => {
    // Update custom control display
    console.log("New value:", value);
  }
});

// Send CC directly
midi.sendCC(74, 64);

// Listen to events
midi.on(CONTROLLER_EVENTS.CC_SEND, ({ cc, value, channel }) => {
  console.log(`CC ${cc}: ${value} on channel ${channel}`);
});
```

### SysEx and Bidirectional MIDI

```javascript
import { createMIDIController, CONTROLLER_EVENTS, parseSysEx } from "midiwire";

// Enable SysEx and connect input/output
const midi = await createMIDIController({
  channel: 1,
  sysex: true,
  input: "My Synth",
  output: "My Synth"
});

// Send SysEx message
midi.sendSysEx([0x42, 0x30, 0x00, 0x01, 0x2F, 0x12]);

// Receive SysEx messages
midi.on(CONTROLLER_EVENTS.SYSEX_RECV, ({ data }) => {
  const parsed = parseSysEx(data);
  console.log("Manufacturer ID:", parsed.manufacturerId);
  console.log("Payload:", parsed.payload);
});

// Receive CC messages
midi.on(CONTROLLER_EVENTS.CC_RECV, ({ cc, value, channel }) => {
  console.log(`Received CC ${cc}: ${value} on channel ${channel}`);
});
```

### Device Manager (High-Level Convenience API)

For quick prototypes and demos, use `createMIDIDeviceManager` which bundles a MIDIController with device management utilities:

```javascript
import { createMIDIDeviceManager, CONTROLLER_EVENTS } from "midiwire";

// Check browser support first
if (!navigator.requestMIDIAccess) {
  console.error("Web MIDI API not supported in this browser.");
  // Handle unsupported browser (e.g., Safari)
}

const deviceManager = await createMIDIDeviceManager({
  sysex: true,
  onStatusUpdate: (message, state) => {
    // Update UI: "Connected to: My Synth", "Error: Device not found", etc.
    console.log(`${state}: ${message}`);
  },
  onConnectionUpdate: (device, midi) => {
    // Device connected/disconnected
    console.log("Current device:", device?.name || "None");
  },
  onReady: (midi) => {
    // Setup complete
    console.log("MIDI ready!");

    // Populate device dropdowns
    const select = document.querySelector("#device-select");
    select.innerHTML = midi.getOutputs()
      .map(d => `<option value="${d.id}">${d.name}</option>`)
      .join("");

    select.addEventListener("change", (e) => {
      midi.setOutput(e.target.value);
    });

    // Listen for SysEx
    midi.on(CONTROLLER_EVENTS.SYSEX_RECV, ({ data }) => {
      console.log("Received:", data);
    });
  }
});
```

## Key Features

### Declarative Data Attributes
```html
<!-- Standard 7-bit CC -->
<input type="range"
       data-midi-cc="74"
       data-midi-channel="1"
       data-midi-label="Filter Cutoff">

<!-- 14-bit CC (high-resolution) -->
<input type="range"
       data-midi-msb="74"
       data-midi-lsb="75"
       data-midi-channel="1"
       data-midi-label="Fine Pitch">
```

### 14-bit MIDI Control
For high-resolution MIDI control (0-16383 range), use MSB/LSB pairs:

```javascript
// Programmatic 14-bit CC binding
midi.bind(fineControl, {
  msb: 74,      // CC 74 (MSB)
  lsb: 75,      // CC 75 (LSB)
  is14Bit: true,
  min: 0,
  max: 16383
});

// Or declarative with data attributes
<input type="range" min="0" max="16383" data-midi-msb="74" data-midi-lsb="75">
```

### Debouncing
Prevent MIDI device overload by adding debouncing to high-frequency controls:

```javascript
// Debounce for 100ms
midi.bind(filterSlider, { cc: 74 }, { debounce: 100 });

// With data attributes
<input type="range" data-midi-cc="74" data-midi-debounce="100">
```

### Custom Controls (SVG Knobs, Canvas, etc.)

For custom UI controls that don't use standard `<input>` elements, use the `onInput` callback to create bidirectional sync:

```javascript
// Custom SVG knob or canvas control
const knob = document.querySelector("#custom-knob");
midi.bind(knob, {
  cc: 74,
  min: 0,
  max: 127,
  onInput: (value) => {
    // Update your custom control's visual state
    updateKnobVisual(knob, value);
    knob.dataset.currentValue = value;
  }
});

// When user interacts with the knob, trigger MIDI send
knob.addEventListener("mousedown", (e) => {
  // ... drag logic calculates newValue ...
  knob.value = newValue;  // Update element value
  if (knob.onInput) {
    knob.onInput(newValue);  // Trigger MIDI send
  }
});
```

This enables custom controls to:
- Send MIDI when the user interacts with them
- Update their visuals when MIDI is received or patches are loaded
- Maintain sync with external MIDI controllers

### Send MIDI Messages
```javascript
midi.sendCC(74, 100);              // Control Change
midi.sendNoteOn(60, 100);          // Note On
midi.sendNoteOff(60);              // Note Off
midi.sendSysEx([0x42, 0x30, ...]);  // System Exclusive
```

### Receive MIDI Messages
```javascript
import { CONTROLLER_EVENTS } from "midiwire";

// Control Change (received from MIDI device)
midi.on(CONTROLLER_EVENTS.CC_RECV, ({ cc, value, channel }) => {
  // Handle incoming CC
});

// SysEx messages
midi.on(CONTROLLER_EVENTS.SYSEX_RECV, ({ data }) => {
  // Handle incoming SysEx
});

// Note messages
midi.on(CONTROLLER_EVENTS.NOTE_ON_RECV, ({ note, velocity, channel }) => {
  // Handle incoming note on
});

midi.on(CONTROLLER_EVENTS.NOTE_OFF_RECV, ({ note, channel }) => {
  // Handle incoming note off
});
```

### Device Management
```javascript
// List devices
const outputs = midi.getOutputs();
const inputs = midi.getInputs();

// Switch devices
await midi.setOutput("My Synth");
await midi.connectInput("My Synth");

// Get current devices
midi.getCurrentOutput();
midi.getCurrentInput();
```

### Patch Management

Save, load, and organize synth patches with automatic element synchronization.

#### Automatic Patch Creation

```javascript
// Create a patch from current state (includes all CC values and control settings)
const patch = midi.getPatch("My Awesome Sound");
console.log(patch);
// {
//   name: "My Awesome Sound",
//   device: "My Synth",
//   timestamp: "2026-01-14T...",
//   version: "1.0",
//   channels: {
//     "1": { ccs: { "74": 100, "71": 64 }, notes: {} }
//   },
//   settings: {
//     "cc74": {
//       min: 20,
//       max: 20000,
//       invert: false,
//       is14Bit: false,
//       label: "Filter Cutoff",     // From data-midi-label
//       elementId: "cutoff-slider"  // From element id
//     }
//   }
// }
```

#### Apply Patches

When applying a patch with `setPatch()`, midiwire automatically:
- Sends all CC values to your MIDI device
- Updates bound control elements to match the saved values
- Converts MIDI values (0-127) back to element ranges (respecting min/max)
- Handles inverted controls
- Dispatches input events to trigger any UI updates

```javascript
// Load and apply a patch
const loaded = midi.loadPatch("My Awesome Sound");
if (loaded) {
  await midi.setPatch(loaded);
}

// Or apply a patch you created
await midi.setPatch({
  name: "Manual Voice",
  channels: {
    "1": {
      ccs: {
        "74": 100,  // Filter cutoff
        "71": 64    // Resonance
      }
    }
  }
  // Settings are optional - element configs are used if not provided
});
```

#### Patch Storage

```javascript
// Save to localStorage (persists between sessions)
midi.savePatch("My Awesome Sound");

// List all saved patches
const allPatches = midi.listPatches();
// [{ name: "My Awesome Sound", patch: {...} }, ...]

// Delete a patch
midi.deletePatch("My Awesome Sound");

// Export/import patches (for sharing or backup)
const patchData = JSON.stringify(midi.getPatch("My Sound"));
// Send to server, download as file, etc.

// Import and apply
const imported = JSON.parse(patchData);
await midi.setPatch(imported);
```

#### Advanced: Working with Settings

Settings store the configuration of your controls, allowing patches to restore:
- Custom min/max ranges (e.g., frequency in Hz)
- Inverted controls (e.g., resonance on some synths)
- Channel assignments
- 14-bit CC configurations

```javascript
// Bind a control with custom range
midi.bind(filterSlider, {
  cc: 74,
  min: 20,     // 20 Hz
  max: 20000,  // 20 kHz
  channel: 1
});

// Save the complete configuration
midi.savePatch("Bass Voice");

// Later: load and everything is restored correctly
const bassPatch = midi.loadPatch("Bass Voice");
await midi.setPatch(bassPatch); // Slider shows frequency, not 0-127
```

### Utility Functions

midiwire includes comprehensive utility functions for MIDI data manipulation:

#### MIDI Note Utilities

```javascript
import { noteNameToNumber, noteNumberToName, noteToFrequency, frequencyToNote } from "midiwire";

// Convert note names to MIDI numbers
const midiNote = noteNameToNumber("C4"); // 60
const noteName = noteNumberToName(60); // "C4"

// Frequency conversions
const freq = noteToFrequency(69); // 440.00 Hz (A4)
const noteFromFreq = frequencyToNote(440); // 69
```

#### 14-bit MIDI Control

Functions for working with high-resolution (0-16383) MIDI values:

```javascript
import { encode14BitValue, decode14BitValue, denormalize14BitValue } from "midiwire";

// Encode 14-bit value to MSB/LSB
const { msb, lsb } = encode14BitValue(8192); // Center value
console.log(msb, lsb); // 64, 0

// Decode MSB/LSB back to 14-bit
const value = decode14BitValue(64, 0); // 8192

// Convert MIDI value back to custom range
const frequency = denormalize14BitValue(8192, 20, 20000); // 10010 Hz
```

#### SysEx Utilities

Create and manipulate System Exclusive messages:

```javascript
import { createSysEx, isSysEx, encode7Bit, decode7Bit } from "midiwire";

// Create SysEx message
createSysEx(0x43, [0x20, 0x7F, 0x1C]);
// Returns: [0xF0, 0x43, 0x20, 0x7F, 0x1C, 0xF7]

// Check if data is SysEx
isSysEx([0xF0, 0x43, 0xF7]); // true

// Encode/decode 8-bit data to 7-bit MIDI format
const encoded = encode7Bit([0xFF, 0xFE, 0xFD]);
const decoded = decode7Bit(encoded);
```

#### MIDI Validators

Validate MIDI parameters before use:

```javascript
import { isValidChannel, isValidCC, isValidNote, isValidMIDIValue } from "midiwire";

// Validate MIDI parameters
if (isValidChannel(channel)) {
  midi.sendCC(cc, value);
}

// All validation functions
isValidChannel(1)        // true (1-16)
isValidCC(74)            // true (0-127)
isValid14BitCC(31)       // true (0-31 for MSB)
isValidMIDIValue(100)    // true (0-127)
isValidNote(60)          // true (0-127)
isValidVelocity(100)     // true (0-127)
isValidProgramChange(5)  // true (0-127)
isValidPitchBend(8192)   // true (0-16383)
```

See the [API documentation](https://github.com/alexferl/midiwire) for complete utility function reference.

### DX7 Bank Support

Load, create, and manipulate Yamaha DX7 voice (patch) banks (.syx files):

```javascript
import { DX7Bank, DX7Voice } from "midiwire";

// Load a bank from a file
const bank = await DX7Bank.fromFile(fileInput.files[0]);

// Get all voices
const voices = bank.getVoices();
console.log(`Loaded ${voices.length} voices`);

// Get a specific voice
const voice = bank.getVoice(0);
console.log("Voice name:", voice.name);

// Read parameters (0-127 range)
const algorithm = voice.getParameter(110); // Algorithm 1-32
const feedback = voice.getParameter(111);  // Feedback 0-7
const lfoSpeed = voice.getParameter(112);  // LFO speed

// Create a new voice
const newPatch = DX7Voice.createDefault();
newPatch.setParameter(0, 50);   // EG Rate 1
newPatch.setParameter(110, 5);  // Algorithm 6

// Set voice name (10 characters max)
const name = "SUPER BASS";
for (let i = 0; i < name.length; i++) {
  newPatch.setParameter(118 + i, name.charCodeAt(i));
}

// Replace voice in bank
bank.replaceVoice(0, newPatch);

// Find voices by name
const bassPatch = bank.findVoiceByName("BASS");
if (bassPatch) {
  console.log(`Found "${bassPatch.name}" at index ${bassPatch.index}`);
}

// Export to SYX format
const sysexData = bank.toSysex();
const blob = new Blob([sysexData], { type: "application/octet-stream" });

// Unpack to 155-byte format (for detailed parameter access)
const unpacked = voice.unpack();
// unpacked[0] = OP1 EG Rate 1
// unpacked[4] = OP1 EG Level 1
// ... full DX7 parameter set

// Access parameters in unpacked format (0-168 range)
const unpackedAlgorithm = voice.getUnpackedParameter(146); // Algorithm 1-32
const operator1Level = voice.getUnpackedParameter(16); // OP1 output level

// Create voice from unpacked data
const customUnpacked = new Uint8Array(169);
// ... fill with your parameters ...
const customVoice = DX7Voice.fromUnpacked(customUnpacked);

// Export single voice to SYX format (VCED)
const singleVoiceSysex = voice.toSysEx();
// Useful for synths that only accept single voice dumps (e.g., KORG Volca FM)

// Add voice to first empty slot in bank
const newBank = new DX7Bank();
const slotIndex = newBank.addVoice(customVoice);
console.log(`Added voice to slot ${slotIndex}`);

// Convert to JSON for storage or transmission
const voiceJSON = voice.toJSON();
const bankJSON = bank.toJSON();
console.log(voiceJSON.name); // Voice name
console.log(bankJSON.voices[0].name); // First voice name
```

### Working with Raw Data

For advanced use cases, work directly with packed/unpacked formats:

```javascript
// Pack unpacked data (169 bytes) to DX7 format (128 bytes)
const unpackedData = new Uint8Array(169);
// ... fill with parameters ...
const packedData = DX7Voice.pack(unpackedData);

// Create voice from packed data
const voiceFromPacked = new DX7Voice(packedData, 0);
```

See [`examples/dx7.html`](examples/dx7.html) for a working demo with file upload, voice visualization, and export.

### Device Change Events

midiwire detects when MIDI devices are connected or disconnected:

```javascript
import { CONNECTION_EVENTS, createMIDIController } from "midiwire";

const midi = await createMIDIController({ ... });

// Listen for all device changes
midi.connection.on(CONNECTION_EVENTS.DEVICE_CHANGE, ({ port, state, type, device }) => {
  console.log(`${device.name} ${type} ${state}`);
});

// Specific device events
midi.connection.on(CONNECTION_EVENTS.INPUT_DEVICE_CONNECTED, ({ device }) => {
  console.log("Input connected:", device.name);
});

midi.connection.on(CONNECTION_EVENTS.INPUT_DEVICE_DISCONNECTED, ({ device }) => {
  console.log("Input disconnected:", device.name);
});

midi.connection.on(CONNECTION_EVENTS.OUTPUT_DEVICE_CONNECTED, ({ device }) => {
  console.log("Output connected:", device.name);
});

midi.connection.on(CONNECTION_EVENTS.OUTPUT_DEVICE_DISCONNECTED, ({ device }) => {
  console.log("Output disconnected:", device.name);
});
```

### Connection Status

Check if MIDI connection is established before sending messages:

```javascript
// Check if output is connected before sending
if (midi.connection.isConnected()) {
  midi.sendCC(74, 100);
}

// Check connection status
const status = {
  output: midi.getCurrentOutput(),
  input: midi.getCurrentInput(),
  isConnected: midi.connection.isConnected()
};

// Get connection instance for advanced usage
const connection = midi.connection;
connection.send([0x90, 60, 100]);  // Send raw MIDI bytes
```

For bidirectional MIDI, ensure both input and output are connected:

```javascript
// Full duplex MIDI
const midi = await createMIDIController({
  input: "My Synth",
  output: "My Synth"
});

// Then send/receive will work bidirectionally
midi.sendCC(74, 100);  // Send to synth
// MIDI sent from synth knobs will trigger CC_RECV events
```

### MIDIConnection Class (Advanced)

For low-level MIDI access, use the `MIDIConnection` class accessible via `midi.connection`:

```javascript
import { createMIDIController, CONNECTION_EVENTS } from "midiwire";

const midi = await createMIDIController({ sysex: true });
const connection = midi.connection;

// Get all available devices
const outputs = connection.getOutputs();
const inputs = connection.getInputs();
console.log('Available outputs:', outputs);
console.log('Available inputs:', inputs);

// Connect to specific devices
await connection.connect("My Synth");        // By name
await connection.connect(0);                 // By index
await connection.connectInput("My Synth", (event) => {
  console.log('MIDI message received:', event.data);
});

// Send raw MIDI messages
connection.send([0x90, 60, 100]);  // Note on
connection.send([0x80, 60, 0]);    // Note off

// Send SysEx messages
connection.sendSysEx([0x43, 0x20, 0x7F, 0x1C]);

// Check connection status
if (connection.isConnected()) {
  console.log('Connected to:', connection.getCurrentOutput().name);
}

// Get current device info
const outputInfo = connection.getCurrentOutput();
const inputInfo = connection.getCurrentInput();

// Disconnect devices
connection.disconnect();
```

### MIDI Event Constants
```javascript
import { CONTROLLER_EVENTS, CONNECTION_EVENTS } from "midiwire";

// Controller events (from MIDIController):
CONTROLLER_EVENTS.READY              // "ready" - MIDI initialized
CONTROLLER_EVENTS.ERROR              // "error" - Error occurred
CONTROLLER_EVENTS.CC_SEND            // "cc-send" - CC sent
CONTROLLER_EVENTS.CC_RECV            // "cc-recv" - CC received
CONTROLLER_EVENTS.NOTE_ON_SEND       // "note-on-send" - Note On sent
CONTROLLER_EVENTS.NOTE_ON_RECV       // "note-on-recv" - Note On received
CONTROLLER_EVENTS.NOTE_OFF_SEND      // "note-off-send" - Note Off sent
CONTROLLER_EVENTS.NOTE_OFF_RECV      // "note-off-recv" - Note Off received
CONTROLLER_EVENTS.SYSEX_SEND         // "sysex-send" - SysEx sent
CONTROLLER_EVENTS.SYSEX_RECV         // "sysex-recv" - SysEx received
CONTROLLER_EVENTS.OUTPUT_CHANGED     // "output-changed" - Output device changed
CONTROLLER_EVENTS.INPUT_CONNECTED    // "input-connected" - Input device connected
CONTROLLER_EVENTS.DESTROYED          // "destroyed" - MIDI controller destroyed
CONTROLLER_EVENTS.MIDI_MSG           // "midi-msg" - Raw MIDI message
CONTROLLER_EVENTS.PATCH_SAVED        // "patch-saved" - Patch saved to storage
CONTROLLER_EVENTS.PATCH_LOADED       // "patch-loaded" - Patch loaded/applied
CONTROLLER_EVENTS.PATCH_DELETED      // "patch-deleted" - Patch deleted from storage

// Connection events (from MIDIConnection):
CONNECTION_EVENTS.DEVICE_CHANGE               // "device-change" - Any device change
CONNECTION_EVENTS.INPUT_DEVICE_CONNECTED      // "input-device-connected"
CONNECTION_EVENTS.INPUT_DEVICE_DISCONNECTED   // "input-device-disconnected"
CONNECTION_EVENTS.OUTPUT_DEVICE_CONNECTED     // "output-device-connected"
CONNECTION_EVENTS.OUTPUT_DEVICE_DISCONNECTED  // "output-device-disconnected"
```

#### Shorthand Aliases (Optional)

For cleaner code, use the shorthand aliases:

```javascript
import { CTRL, CONN } from "midiwire";

// Same events, shorter names
midi.on(CTRL.CC_SEND, handler);
midi.connection.on(CONN.DEVICE_CHANGE, handler);

// Real-world example
midi.on(CTRL.ERROR, ({ message }) => {
  console.error("MIDI Error:", message);
});

midi.on(CTRL.PATCH_LOADED, ({ patch }) => {
  console.log(`Loaded patch: ${patch.name}`);
});
```

## Use Cases

- 🎹 **Synth patch editors** - Control hardware synths from your browser
- 🎚️ **MIDI controllers** - Build custom web-based MIDI controllers
- 📊 **Parameter automation** - Record and playback MIDI CC changes
- 🔧 **Device configuration** - Use SysEx to configure MIDI hardware
- 🎵 **Educational tools** - Teach MIDI concepts with interactive demos
- 🎛️ **DAW integration** - Control DAW parameters from web interfaces

## Browser Support

Requires browsers with [Web MIDI API](https://caniuse.com/midi) support:
- ✅ Chrome/Edge 43+
- ✅ Firefox 108+
- ✅ Opera 30+
- ❌ Safari (not supported)

**Note:** SysEx requires explicit user permission in Chrome.

## Examples

Check out the [`examples/`](examples) folder for working demos:
- [`template.html`](examples/template.html) - Quick-start template for rapid prototyping (start here!)
- [`basic.html`](examples/basic.html) - Simple CC control with data attributes
- [`advanced.html`](examples/advanced.html) - All features showcase (ranges, inversion, 14-bit, debouncing)
- [`programmatic.html`](examples/programmatic.html) - Manual binding and custom SVG/canvas controls
- [`patches.html`](examples/patches.html) - Complete patch management system with localStorage
- [`sysex.html`](examples/sysex.html) - SysEx communication and device inquiry
- [`dx7.html`](examples/dx7.html) - Load and create Yamaha DX7 voice banks

## Development

```bash
# Install dependencies
npm install

# Start dev server with examples
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## License

[MIT](LICENSE)

## Credits

- Inspired by [synthmata/ccynthmata](https://github.com/synthmata/ccynthmata).
- DX7 implementation based on the work of [asb2m10/dexed](https://github.com/asb2m10/dexed) and various DX7 SysEx documentation resources.
