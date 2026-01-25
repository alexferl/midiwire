# midiwire [![CI](https://github.com/alexferl/midiwire/actions/workflows/ci.yml/badge.svg)](https://github.com/alexferl/midiwire/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/alexferl/midiwire/branch/master/graph/badge.svg)](https://codecov.io/gh/alexferl/midiwire) ![npm version](https://img.shields.io/npm/v/midiwire.svg) [![Web MIDI API](https://img.shields.io/badge/Web%20MIDI-API%20Support-orange.svg)](https://caniuse.com/midi)

A modern, declarative JavaScript library for creating browser-based MIDI controllers. Build synth patch editors, hardware controllers, and MIDI utilities with simple HTML data attributes or a powerful programmatic API.

> **WARNING**: This library is pre-1.0 and the API may change at any time without notice.

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
- 📝 **Fully documented** - [Comprehensive API documentation](https://alexferl.github.io/midiwire/module-midiwire.html) with examples

## Installation

```bash
npm install midiwire
```

Or use directly in the browser from a CDN like [jsDelivr](https://www.jsdelivr.com/package/npm/midiwire):

```html
<!-- Always gets the latest version -->
<script type="module">
  import { createMIDIController } from "https://cdn.jsdelivr.net/npm/midiwire/+esm";
</script>

<!-- Or specify a version if needed -->
<script type="module">
  import { createMIDIController } from "https://cdn.jsdelivr.net/npm/midiwire@0.7.0/+esm";
</script>
```

## Quick Start

midiwire provides three API levels to match your needs. Choose the one that fits your project:

### High-Level API: `MIDIDeviceManager`

For complete web UI integration with automatic device selectors and status management.

```javascript
import { MIDIDeviceManager } from "midiwire";

const manager = new MIDIDeviceManager({
  onStatusUpdate: (msg, state) => console.log(msg),
  onConnectionUpdate: (output, input) => console.log("Connected!"),
});

// Setup all selectors at once (returns MIDIController)
const midi = await manager.setupSelectors({
  output: "#output-select",
  input: "#input-select",
  channel: "#channel-select",
  onConnect: ({ device, type }) => console.log(`${type}: ${device.name}`)
});

// Use the MIDI controller directly
midi.channel.sendCC(1, 100);
```

**Best for**: Complete web applications with device selection UI

### Mid-Level API: `MIDIController`

The main programmatic API for device management, MIDI messaging, and patch handling.

```javascript
import { MIDIController, CONTROLLER_EVENTS } from "midiwire";

const midi = new MIDIController({ outputChannel: 1 });
await midi.init();

// Send MIDI messages
midi.channel.sendCC(74, 64);
midi.channel.sendNoteOn(60, 100);

// Device management
await midi.device.connect("My Synth");
const devices = midi.device.getOutputs();

// Patch management
midi.patch.save("My Settings");
```

**Best for**: Programmatic MIDI control, synth editors, and controllers

### Low-Level API: `MIDIConnection`

Direct Web MIDI API wrapper for raw MIDI access and custom implementations.

```javascript
import { MIDIConnection } from "midiwire";

const connection = new MIDIConnection({ sysex: true });
await connection.requestAccess();
await connection.connect("My Device");

// Send raw MIDI
connection.send([0x90, 60, 100]); // Note on
connection.sendSysEx([0x41, 0x10, 0x42]); // SysEx
```

**Best for**: Custom MIDI implementations and direct protocol control

### Full API Documentation

For complete API documentation with examples, see **[API Documentation](https://alexferl.github.io/midiwire/module-midiwire.html)**.

## Use Cases

- 🎹 **Synth patch editors** - Control hardware synths from your browser
- 🎚️ **MIDI controllers** - Build custom web-based MIDI controllers
- 📊 **Parameter automation** - Record and playback MIDI CC changes
- 🔧 **Device configuration** - Use SysEx to configure MIDI hardware
- 🎵 **Educational tools** - Teach MIDI concepts with interactive demos
- 🎛️ **DAW integration** - Control DAW parameters from web interfaces

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

# Generate API docs
npm run docs

# Lint
npm run lint
```

## Browser Support

Requires browsers with [Web MIDI API](https://caniuse.com/midi) support:
- ✅ Chrome/Edge 43+
- ✅ Firefox 108+
- ✅ Opera 30+
- ❌ Safari (not supported)

**Note:** SysEx requires explicit user permission in Chrome.

## License

[MIT](LICENSE)

## Credits

- Inspired by [synthmata/ccynthmata](https://github.com/synthmata/ccynthmata).
- DX7 implementation based on the work of [asb2m10/dexed](https://github.com/asb2m10/dexed)
