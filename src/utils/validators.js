/**
 * Validate MIDI channel number
 * @param {number} channel - Channel number
 * @returns {boolean}
 */
export function isValidChannel(channel) {
  return Number.isInteger(channel) && channel >= 1 && channel <= 16
}

/**
 * Validate MIDI CC number
 * @param {number} cc - CC number
 * @returns {boolean}
 */
export function isValidCC(cc) {
  return Number.isInteger(cc) && cc >= 0 && cc <= 127
}

/**
 * Validate MIDI value (0-127)
 * @param {number} value - MIDI value
 * @returns {boolean}
 */
export function isValidMIDIValue(value) {
  return Number.isInteger(value) && value >= 0 && value <= 127
}

/**
 * Validate MIDI note number
 * @param {number} note - Note number
 * @returns {boolean}
 */
export function isValidNote(note) {
  return Number.isInteger(note) && note >= 0 && note <= 127
}

/**
 * Validate note velocity
 * @param {number} velocity - Velocity value
 * @returns {boolean}
 */
export function isValidVelocity(velocity) {
  return Number.isInteger(velocity) && velocity >= 0 && velocity <= 127
}
