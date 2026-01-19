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
 * Validate 14-bit MIDI CC number (0-31 for MSB)
 * @param {number} cc - CC number
 * @returns {boolean}
 */
export function isValid14BitCC(cc) {
  return Number.isInteger(cc) && cc >= 0 && cc <= 31
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

/**
 * Validate MIDI program change number
 * @param {number} program - Program number
 * @returns {boolean}
 */
export function isValidProgramChange(program) {
  return Number.isInteger(program) && program >= 0 && program <= 127
}

/**
 * Validate pitch bend value (14-bit)
 * @param {number} value - Pitch bend value (0-16383, where 8192 is center)
 * @returns {boolean}
 */
export function isValidPitchBend(value) {
  return Number.isInteger(value) && value >= 0 && value <= 16383
}

/**
 * Validate pitch bend MSB and LSB separately
 * @param {number} msb - Most significant byte (0-127)
 * @param {number} lsb - Least significant byte (0-127)
 * @returns {boolean}
 */
export function isValidPitchBendBytes(msb, lsb) {
  return Number.isInteger(msb) && msb >= 0 && msb <= 127 && Number.isInteger(lsb) && lsb >= 0 && lsb <= 127
}
