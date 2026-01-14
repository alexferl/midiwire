# midiwire

A modern, declarative JavaScript library for creating browser-based MIDI controllers. Build synth patch editors, hardware controllers, and MIDI utilities with simple HTML data attributes or a powerful programmatic API.

## Features

- 🎛️ **Declarative HTML binding** - Use `data-midi-cc` attributes for instant MIDI control
- 🎹 **Full Web MIDI API** - Native browser MIDI support (Chrome, Firefox, Opera)
- 🔌 **Bidirectional MIDI** - Send and receive MIDI messages
- 🎼 **SysEx support** - Send/receive System Exclusive messages for device control
- 📦 **Zero dependencies** - Lightweight and fast
- 🔧 **Flexible API** - Works with data attributes or programmatically
- 🎨 **Framework agnostic** - Use with vanilla JS, React, Vue, or anything else
- 📝 **Fully documented** - JSDoc types for excellent IDE support

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
import { createMIDIController, EVENTS } from "midiwire";

// Initialize
const midi = await createMIDIController({
  channel: 1,
  output: "My Synth"
});

// Bind controls manually
const cutoff = document.querySelector("#cutoff");
midi.bind(cutoff, { cc: 74, min: 0, max: 127 });

// Send CC directly
midi.sendCC(74, 64);

// Listen to events
midi.on(EVENTS.CC_SEND, ({ cc, value, channel }) => {
  console.log(`CC ${cc}: ${value} on channel ${channel}`);
});
```

### SysEx and Bidirectional MIDI

```javascript
import { createMIDIController, EVENTS, parseSysEx } from "midiwire";

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
midi.on(EVENTS.SYSEX_RECV, ({ data }) => {
  const parsed = parseSysEx(data);
  console.log("Manufacturer ID:", parsed.manufacturerId);
  console.log("Payload:", parsed.payload);
});

// Receive CC messages
midi.on(EVENTS.CC_RECV, ({ cc, value, channel }) => {
  console.log(`Received CC ${cc}: ${value} on channel ${channel}`);
});
```

## Key Features

### Declarative Data Attributes
```html
<input type="range" 
       data-midi-cc="74" 
       data-midi-channel="1"
       data-midi-label="Filter Cutoff">
```

### Send MIDI Messages
```javascript
midi.sendCC(74, 100);              // Control Change
midi.sendNoteOn(60, 100);          // Note On
midi.sendNoteOff(60);              // Note Off
midi.sendSysEx([0x42, 0x30, ...]);  // System Exclusive
```

### Receive MIDI Messages
```javascript
import { MIDI_EVENTS } from "midiwire";

// Control Change (received from MIDI device)
midi.on(MIDI_EVENTS.CC_RECV, ({ cc, value, channel }) => {
  // Handle incoming CC
});

// SysEx messages
midi.on(MIDI_EVENTS.SYSEX_RECV, ({ data }) => {
  // Handle incoming SysEx
});

// Note messages
midi.on(MIDI_EVENTS.NOTE_ON_RECV, ({ note, velocity, channel }) => {
  // Handle incoming note on
});

midi.on(MIDI_EVENTS.NOTE_OFF_RECV, ({ note, channel }) => {
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
  name: "Manual Patch",
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
midi.savePatch("Bass Patch");

// Later: load and everything is restored correctly
const bassPatch = midi.loadPatch("Bass Patch");
await midi.setPatch(bassPatch); // Slider shows frequency, not 0-127
```

### MIDI Event Constants
```javascript
import { EVENTS } from "midiwire";

// Available events:
EVENTS.READY              // 'ready' - MIDI initialized
EVENTS.ERROR              // 'error' - Error occurred
EVENTS.CC_SEND            // 'cc-send' - CC sent
EVENTS.CC_RECV            // 'cc-recv' - CC received
EVENTS.NOTE_ON_SEND       // 'note-on-send' - Note On sent
EVENTS.NOTE_ON_RECV       // 'note-on-recv' - Note On received
EVENTS.NOTE_OFF_SEND      // 'note-off-send' - Note Off sent
EVENTS.NOTE_OFF_RECV      // 'note-off-recv' - Note Off received
EVENTS.SYSEX_SEND         // 'sysex-send' - SysEx sent
EVENTS.SYSEX_RECV         // 'sysex-recv' - SysEx received
EVENTS.OUTPUT_CHANGED     // 'output-changed' - Output device changed
EVENTS.INPUT_CONNECTED    // 'input-connected' - Input device connected
EVENTS.DESTROYED          // 'destroyed' - MIDI controller destroyed
EVENTS.MIDI_MSG           // 'midi-msg' - Raw MIDI message
EVENTS.PATCH_SAVED        // 'patch-saved' - Patch saved to storage
EVENTS.PATCH_LOADED       // 'patch-loaded' - Patch loaded/applied
EVENTS.PATCH_DELETED      // 'patch-deleted' - Patch deleted from storage

// Note: Both MIDI_EVENTS (more descriptive) and EVENTS (shorter) are available
import { MIDI_EVENTS } from "midiwire"; // Also works
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

Check out the `examples/` folder for working demos:
- `basic.html` - Simple CC control with data attributes
- `advanced.html` - Custom ranges, inverted controls, dynamic binding
- `programmatic.html` - Manual binding and direct MIDI
- `sysex.html` - SysEx communication and device control
- `patches.html` - Patch management: save, load, and organize presets

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

Inspired by [ccynthmata](https://github.com/synthmata/ccynthmata) by synthmata.
