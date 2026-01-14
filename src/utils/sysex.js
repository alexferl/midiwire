/**
 * SysEx utility functions
 */

/**
 * Parse a SysEx message
 * @param {Array<number>} data - Raw MIDI data
 * @returns {Object|null} Parsed SysEx data or null if not SysEx
 */
export function parseSysEx(data) {
  if (data[0] !== 0xf0 || data[data.length - 1] !== 0xf7) {
    return null
  }

  return {
    manufacturerId: data[1],
    payload: data.slice(2, -1),
    raw: data,
  }
}

/**
 * Create a SysEx message
 * @param {number} manufacturerId - Manufacturer ID
 * @param {Array<number>} payload - SysEx payload data
 * @returns {Array<number>} Complete SysEx message with F0/F7
 */
export function createSysEx(manufacturerId, payload) {
  return [0xf0, manufacturerId, ...payload, 0xf7]
}

/**
 * Check if data is a SysEx message
 * @param {Array<number>} data - MIDI data
 * @returns {boolean}
 */
export function isSysEx(data) {
  return data.length >= 2 && data[0] === 0xf0 && data[data.length - 1] === 0xf7
}

/**
 * Encode 8-bit data to 7-bit MIDI format
 * @param {Array<number>} data - 8-bit data array
 * @returns {Array<number>} 7-bit encoded data
 */
export function encode7Bit(data) {
  const result = []
  let buffer = 0
  let bitCount = 0

  for (const byte of data) {
    buffer |= (byte & 0x7f) << bitCount
    bitCount += 7

    if (bitCount >= 7) {
      result.push(buffer & 0x7f)
      buffer >>= 7
      bitCount -= 7
    }
  }

  if (bitCount > 0) {
    result.push(buffer & 0x7f)
  }

  return result
}

/**
 * Decode 7-bit MIDI format to 8-bit data
 * @param {Array<number>} data - 7-bit encoded data
 * @returns {Array<number>} 8-bit decoded data
 */
export function decode7Bit(data) {
  const result = []
  let buffer = 0
  let bitCount = 0

  for (const byte of data) {
    buffer |= (byte & 0x7f) << bitCount
    bitCount += 7

    while (bitCount >= 8) {
      result.push(buffer & 0xff)
      buffer >>= 8
      bitCount -= 8
    }
  }

  return result
}
