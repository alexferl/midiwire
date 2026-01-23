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
- 📝 **Fully documented** - [Comprehensive API documentation](docs/API.md) with examples

## Installation

```bash
npm install midiwire
```

Or use directly in the browser from a CDN like [jsDelivr](https://www.jsdelivr.com/package/npm/midiwire):

```html
<!-- Always gets the latest version -->
<script type="module">
  import { createMIDIController } from 'https://cdn.jsdelivr.net/npm/midiwire/+esm';
</script>

<!-- Or specify a version if needed -->
<script type="module">
  import { createMIDIController } from 'https://cdn.jsdelivr.net/npm/midiwire@0.3.1/+esm';
</script>
```

## Quick Start

### HTML Data Attributes (Easiest)

```html
<!DOCTYPE html>
<html lang="en">
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
import { createMIDIController } from "midiwire";

const midi = await createMIDIController({
  channel: 1,
  output: "My Synth"
});

// Bind controls
const cutoff = document.querySelector("#cutoff");
midi.bind(cutoff, { cc: 74 });

// Send MIDI
midi.channel.sendCC(74, 64);
```

### Full API Documentation

For complete API documentation with examples, see **[API.md](./docs/API.md)**.

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
