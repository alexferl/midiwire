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

  // Process data in groups of 7 bytes
  for (let i = 0; i < data.length; i += 7) {
    const group = data.slice(i, i + 7)
    let headerByte = 0
    const dataBytes = []

    // Process each byte in the group
    for (let j = 0; j < group.length; j++) {
      const byte = group[j]
      // Check if MSB (bit 7) is set
      if (byte & 0x80) {
        headerByte |= 1 << j
      }
      // Add the lower 7 bits as a data byte
      dataBytes.push(byte & 0x7f)
    }

    // Add header byte followed by the data bytes
    // Note: result length may not be a multiple of 8
    result.push(headerByte, ...dataBytes)
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

  // Process data in groups of 8 bytes (1 header + 7 data bytes)
  for (let i = 0; i < data.length; i += 8) {
    const headerByte = data[i]
    // Calculate how many data bytes are in this group (1-7)
    const groupSize = Math.min(7, data.length - i - 1)

    // Process the data bytes in this group
    for (let j = 0; j < groupSize; j++) {
      let byte = data[i + 1 + j]

      // Reconstruct the 8-bit value using header bit
      if (headerByte & (1 << j)) {
        byte |= 0x80
      }

      result.push(byte)
    }
  }

  return result
}
