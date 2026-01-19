import { MIDIValidationError } from "../core/errors.js"

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Normalize a value from input range to MIDI range (0-127)
 * @param {number} value - Input value
 * @param {number} inputMin - Input minimum
 * @param {number} inputMax - Input maximum
 * @param {boolean} [invert=false] - Invert the output
 * @returns {number} MIDI value (0-127)
 */
export function normalizeValue(value, inputMin, inputMax, invert = false) {
  // Normalize to 0-1
  const normalized = (value - inputMin) / (inputMax - inputMin)

  // Invert if requested
  const final = invert ? 1 - normalized : normalized

  // Scale to MIDI range (0-127)
  const midiValue = final * 127

  return clamp(Math.round(midiValue), 0, 127)
}

/**
 * Denormalize a MIDI value (0-127) to a custom range
 * @param {number} midiValue - MIDI value (0-127)
 * @param {number} outputMin - Output minimum
 * @param {number} outputMax - Output maximum
 * @param {boolean} [invert=false] - Invert the input
 * @returns {number}
 */
export function denormalizeValue(midiValue, outputMin, outputMax, invert = false) {
  // Normalize MIDI value to 0-1
  let normalized = clamp(midiValue, 0, 127) / 127

  // Invert if requested
  if (invert) {
    normalized = 1 - normalized
  }

  // Scale to output range
  return outputMin + normalized * (outputMax - outputMin)
}

/**
 * Convert a note name to MIDI note number
 * @param {string} noteName - Note name (e.g., "C4", "A#3", "Bb5")
 * @returns {number} MIDI note number (0-127)
 * @throws {MIDIValidationError} If noteName is not a valid note format
 */
export function noteNameToNumber(noteName) {
  const notes = {
    C: 0,
    "C#": 1,
    DB: 1,
    D: 2,
    "D#": 3,
    EB: 3,
    E: 4,
    F: 5,
    "F#": 6,
    GB: 6,
    G: 7,
    "G#": 8,
    AB: 8,
    A: 9,
    "A#": 10,
    BB: 10,
    B: 11,
  }

  const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/i)
  if (!match) {
    throw new MIDIValidationError(`Invalid note name: ${noteName}`, "note", noteName)
  }

  const [, note, octave] = match
  const noteValue = notes[note.toUpperCase()]

  if (noteValue === undefined) {
    throw new MIDIValidationError(`Invalid note: ${note}`, "note", note)
  }

  const midiNote = (parseInt(octave, 10) + 1) * 12 + noteValue
  return clamp(midiNote, 0, 127)
}

/**
 * Convert MIDI note number to note name
 * @param {number} noteNumber - MIDI note number (0-127)
 * @param {boolean} [useFlats=false] - Use flats instead of sharps
 * @returns {string} Note name (e.g., "C4")
 */
export function noteNumberToName(noteNumber, useFlats = false) {
  const sharps = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const flats = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

  const notes = useFlats ? flats : sharps
  const octave = Math.floor(noteNumber / 12) - 1
  const note = notes[noteNumber % 12]

  return `${note}${octave}`
}

/**
 * Convert frequency (Hz) to nearest MIDI note number
 * @param {number} frequency - Frequency in Hz
 * @returns {number} MIDI note number
 */
export function frequencyToNote(frequency) {
  const noteNumber = 69 + 12 * Math.log2(frequency / 440)
  return clamp(Math.round(noteNumber), 0, 127)
}

/**
 * Convert MIDI note number to frequency (Hz)
 * @param {number} noteNumber - MIDI note number
 * @returns {number} Frequency in Hz
 */
export function noteToFrequency(noteNumber) {
  return 440 * 2 ** ((noteNumber - 69) / 12)
}

/**
 * Get CC name for common controller numbers
 * @param {number} cc - CC number
 * @returns {string} CC name or "CC {number}"
 */
export function getCCName(cc) {
  const names = {
    0: "Bank Select",
    1: "Modulation",
    2: "Breath Controller",
    4: "Foot Controller",
    5: "Portamento Time",
    7: "Volume",
    8: "Balance",
    10: "Pan",
    11: "Expression",
    64: "Sustain Pedal",
    65: "Portamento",
    66: "Sostenuto",
    67: "Soft Pedal",
    68: "Legato",
    71: "Resonance",
    72: "Release Time",
    73: "Attack Time",
    74: "Cutoff",
    75: "Decay Time",
    76: "Vibrato Rate",
    77: "Vibrato Depth",
    78: "Vibrato Delay",
    84: "Portamento Control",
    91: "Reverb",
    92: "Tremolo",
    93: "Chorus",
    94: "Detune",
    95: "Phaser",
    120: "All Sound Off",
    121: "Reset All Controllers",
    123: "All Notes Off",
  }

  return names[cc] || `CC ${cc}`
}

/**
 * Encode a 14-bit value into MSB and LSB (7-bit each)
 * @param {number} value - 14-bit value (0-16383)
 * @returns {{msb: number, lsb: number}} MSB and LSB values
 */
export function encode14BitValue(value) {
  const clamped = clamp(Math.round(value), 0, 16383)
  return {
    msb: (clamped >> 7) & 0x7f,
    lsb: clamped & 0x7f,
  }
}

/**
 * Decode MSB and LSB (7-bit each) into a 14-bit value
 * @param {number} msb - Most significant byte (0-127)
 * @param {number} lsb - Least significant byte (0-127)
 * @returns {number} 14-bit value (0-16383)
 */
export function decode14BitValue(msb, lsb) {
  return (clamp(msb, 0, 127) << 7) | clamp(lsb, 0, 127)
}

/**
 * Normalize a 14-bit value from input range
 * @param {number} value - Input value
 * @param {number} inputMin - Input minimum
 * @param {number} inputMax - Input maximum
 * @param {boolean} [invert=false] - Invert the output
 * @returns {{msb: number, lsb: number}} MSB and LSB values
 */
export function normalize14BitValue(value, inputMin, inputMax, invert = false) {
  // Normalize to 0-1
  const normalized = (value - inputMin) / (inputMax - inputMin)

  // Invert if requested
  const final = invert ? 1 - normalized : normalized

  // Scale to 14-bit range (0-16383)
  const value14Bit = final * 16383

  return encode14BitValue(value14Bit)
}

/**
 * Denormalize a 14-bit value to a custom range
 * @param {number} msb - Most significant byte (0-127)
 * @param {number} lsb - Least significant byte (0-127)
 * @param {number} outputMin - Output minimum
 * @param {number} outputMax - Output maximum
 * @param {boolean} [invert=false] - Invert the input
 * @returns {number} Denormalized value
 */
export function denormalize14BitValue(msb, lsb, outputMin, outputMax, invert = false) {
  const value14Bit = decode14BitValue(msb, lsb)

  // Normalize to 0-1
  let normalized = value14Bit / 16383

  // Invert if requested
  if (invert) {
    normalized = 1 - normalized
  }

  // Scale to output range
  return outputMin + normalized * (outputMax - outputMin)
}
