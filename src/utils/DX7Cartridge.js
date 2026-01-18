/**
 * DX7 Cartridge loader for parsing Yamaha DX7 SYX files
 *
 * Based on Dexed implementation by Pascal Gauthier
 * @see https://github.com/asb2m10/dexed
 */

/**
 * DX7 Patch/Program structure
 * Each patch is 128 bytes in packed format
 */
export class DX7Patch {
  // Constants for packed format offsets
  static OFFSET_NAME = 118
  static NAME_LENGTH = 10
  static OFFSET_ALGORITHM = 110
  static OFFSET_FEEDBACK = 111
  static OFFSET_LFO_SPEED = 112
  static OFFSET_LFO_DELAY = 113
  static OFFSET_TRANSPOSE = 117

  // Constants for unpacked format
  static UNPACKED_OP_SIZE = 23 // 23 bytes per operator in unpacked format

  /**
   * Create a DX7Patch from raw 128-byte data
   * @param {Array<number>} data - 128 bytes of patch data
   * @param {number} index - Patch index (0-31)
   */
  constructor(data, index = 0) {
    if (data.length !== 128) {
      throw new Error(`Invalid patch data length: expected 128 bytes, got ${data.length}`)
    }

    this.index = index
    this.data = new Uint8Array(data)
    this.name = this._extractName()
  }

  /**
   * Extract the patch name from the data (10 characters at offset 118)
   * @private
   */
  _extractName() {
    const nameBytes = this.data.slice(118, 128)
    // Normalize DX7 special characters
    const normalized = Array.from(nameBytes).map((byte) => {
      let c = byte & 0x7f // Strip high bit
      // Dexed special character mappings
      if (c === 92) c = 89 // Yen symbol -> 'Y'
      if (c === 126) c = 62 // '→' -> '>'
      if (c === 127) c = 60 // '←' -> '<'
      // Replace non-printable chars with space
      if (c < 32 || c > 126) c = 32
      return String.fromCharCode(c)
    })
    return normalized.join("").trim()
  }

  /**
   * Get a raw parameter value from the packed data
   * @param {number} offset - Byte offset in the patch data (0-127)
   * @returns {number} Parameter value (0-127)
   */
  getParameter(offset) {
    if (offset < 0 || offset >= 128) {
      throw new Error(`Parameter offset out of range: ${offset} (must be 0-127)`)
    }
    return this.data[offset] & 0x7f
  }

  /**
   * Get a parameter value from the unpacked 169-byte format
   * @param {number} offset - Byte offset in the unpacked data (0-168)
   * @returns {number} Parameter value (0-127)
   */
  getUnpackedParameter(offset) {
    if (offset < 0 || offset >= 169) {
      throw new Error(`Unpacked parameter offset out of range: ${offset} (must be 0-168)`)
    }
    const unpacked = this.unpack()
    return unpacked[offset] & 0x7f
  }

  /**
   * Set a raw parameter value in the packed data
   * @param {number} offset - Byte offset in the patch data
   * @param {number} value - Parameter value (0-127)
   */
  setParameter(offset, value) {
    if (offset < 0 || offset >= 128) {
      throw new Error(`Parameter offset out of range: ${offset} (must be 0-127)`)
    }
    this.data[offset] = value & 0x7f
    // Update name if name bytes changed
    if (offset >= DX7Patch.OFFSET_NAME && offset < DX7Patch.OFFSET_NAME + DX7Patch.NAME_LENGTH) {
      this.name = this._extractName()
    }
  }

  /**
   * Unpack the patch data to 169-byte unpacked format
   * This converts the packed 128-byte format to the full DX7 parameter set
   * @returns {Uint8Array} 169 bytes of unpacked patch data (138 operator + 8 pitch EG + 13 global + 10 name = 169 bytes)
   */
  unpack() {
    const packed = this.data
    const unpacked = new Uint8Array(169) // 159 for parameters + 10 for name

    // Operators (6 operators × 17 bytes each in packed format)
    // Note: DX7 stores operators in reverse order in packed format
    // OP1 data is at the end (packed offset 85-101), OP6 data is at the beginning (packed offset 0-16)
    for (let op = 0; op < 6; op++) {
      // Calculate source and destination offsets
      // op=0 is OP1, which is at packed offset 85, unpacked offset 0
      // op=5 is OP6, which is at packed offset 0, unpacked offset 115
      const src = (5 - op) * 17 // Source offset in packed data
      const dst = op * 23 // Destination offset in unpacked data (23 bytes per operator)

      // EG rates and levels (4 bytes each) - bytes 0-7
      for (let i = 0; i < 4; i++) {
        unpacked[dst + i] = packed[src + i] & 0x7f
      }
      for (let i = 0; i < 4; i++) {
        unpacked[dst + 4 + i] = packed[src + 4 + i] & 0x7f
      }

      // Break point and scaling depths - bytes 8-10
      unpacked[dst + 8] = packed[src + 8] & 0x7f // Break Point
      unpacked[dst + 9] = packed[src + 9] & 0x7f // L Scale Depth
      unpacked[dst + 10] = packed[src + 10] & 0x7f // R Scale Depth

      // Key scales (bits 0-1 = LC, bits 2-3 = RC) - byte 11
      const byte11 = packed[src + 11] & 0x7f
      unpacked[dst + 11] = byte11 & 0x03 // LC (Left Curve) - bits 0-1
      unpacked[dst + 12] = (byte11 >> 2) & 0x03 // RC (Right Curve) - bits 2-3

      // Rate scaling and detune (bits 0-2 = RS, bits 3-6 = DET) - byte 12
      const byte12 = packed[src + 12] & 0x7f
      unpacked[dst + 13] = byte12 & 0x07 // RS (Rate Scaling) - bits 0-2
      unpacked[dst + 14] = (byte12 >> 3) & 0x0f // DET (Detune) - bits 3-6

      // Amp mod sensitivity and key velocity sensitivity (bits 0-1 = AMS, bits 2-4 = KVS) - byte 13
      const byte13 = packed[src + 13] & 0x7f
      unpacked[dst + 15] = byte13 & 0x03 // AMS (Amp Mod Sensitivity) - bits 0-1
      unpacked[dst + 18] = (byte13 >> 2) & 0x07 // KVS (Key Velocity Sensitivity) - bits 2-4

      // Output level - byte 14
      unpacked[dst + 16] = packed[src + 14] & 0x7f // Output Level

      // Mode, AM modulation, frequency (bits 0 = MODE, bits 1-3 = AMOD, bits 4-6 = FREQ) - byte 15
      const modeByte = packed[src + 15] & 0x7f
      unpacked[dst + 17] = modeByte & 0x01 // Mode (0=ratio, 1=fixed)
      unpacked[dst + 19] = (modeByte >> 1) & 0x1f // Frequency coarse (5 bits: 0-31)

      // OSC detune and frequency fine (bits 0-2 = OSC DET, bits 3-6 = FREQ FINE) - byte 16
      const detuneFine = packed[src + 16] & 0x7f
      unpacked[dst + 20] = detuneFine & 0x07 // OSC Detune
      unpacked[dst + 21] = (detuneFine >> 3) & 0x0f // Frequency Fine
    }

    // Pitch EG rates and levels
    // After operators (6 × 23 bytes = 138), Pitch EG goes at indices 138-145
    // Pitch EG Rates are at packed[102-105], Pitch EG Levels at packed[106-109]
    for (let i = 0; i < 4; i++) {
      unpacked[138 + i] = packed[102 + i] & 0x7f // Pitch EG Rate
    }
    for (let i = 0; i < 4; i++) {
      unpacked[142 + i] = packed[106 + i] & 0x7f // Pitch EG Level
    }

    // After unpacking 6 operators (6 × 23 unpacked bytes = 138 bytes)
    // After unpacking Pitch EG (8 unpacked bytes) = total 146 unpacked bytes
    // Global parameters start at unpacked[146]

    // Algorithm at packed byte 110
    unpacked[146] = packed[DX7Patch.OFFSET_ALGORITHM] & 0x1f // Algorithm - bits 0-4

    // Feedback and OSC Sync combined in byte 111 (bits 0-2 = Feedback, bit 3 = OSC Sync)
    const feedbackOscSync = packed[DX7Patch.OFFSET_FEEDBACK] & 0x7f
    unpacked[147] = feedbackOscSync & 0x07 // Feedback - bits 0-2
    unpacked[148] = (feedbackOscSync >> 3) & 0x01 // OSC Sync - bit 3

    unpacked[149] = packed[DX7Patch.OFFSET_LFO_SPEED] & 0x7f // LFO Speed
    unpacked[150] = packed[DX7Patch.OFFSET_LFO_DELAY] & 0x7f // LFO Delay
    unpacked[151] = packed[114] & 0x7f // LFO Pitch Mod Depth
    unpacked[152] = packed[115] & 0x7f // LFO Amplitude Mod Depth

    // LFO Key Sync, Wave, Pitch Mod Sensitivity packed in byte 116
    const byte116 = packed[116] & 0x7f
    unpacked[153] = byte116 & 0x01 // LFO Key Sync - bit 0
    unpacked[154] = (byte116 >> 1) & 0x07 // LFO Wave - bits 1-3
    unpacked[155] = (byte116 >> 4) & 0x07 // LFO Pitch Mod Sensitivity - bits 4-6

    unpacked[156] = packed[118] & 0x7f // Amplitude Mod Sensitivity
    unpacked[157] = packed[DX7Patch.OFFSET_TRANSPOSE] & 0x7f // Transpose (byte 117)

    unpacked[158] = 0 // EG Bias Sensitivity (packed byte 119) - not exposed in unpacked

    // Read patch name (10 bytes at packed[118-127])
    // Store at unpacked[159-168] (after 159 bytes of parameters)
    for (let i = 0; i < DX7Patch.NAME_LENGTH; i++) {
      unpacked[159 + i] = packed[DX7Patch.OFFSET_NAME + i] & 0x7f
    }

    return unpacked
  }

  /**
   * Pack 169-byte unpacked data to 128-byte format
   * @param {Array<number>|Uint8Array} unpacked - 169 bytes of unpacked data (159 parameters + 10 name bytes)
   * @returns {Uint8Array} 128 bytes of packed data
   */
  static pack(unpacked) {
    if (unpacked.length !== 169) {
      throw new Error(`Invalid unpacked data length: expected 169 bytes, got ${unpacked.length}`)
    }

    const packed = new Uint8Array(128)
    let src = 0
    let dst = 0

    // Pack operators (6 operators × 17 bytes each in packed format)
    // DX7 stores operators in reverse order: OP1 data goes to packed[85-101], OP6 to packed[0-16]
    for (let op = 0; op < 6; op++) {
      const opSrc = op * DX7Patch.UNPACKED_OP_SIZE // Read OP1-OP6 sequentially from unpacked
      const opDst = (5 - op) * 17 // Write in reverse: OP1→packed[85], OP6→packed[0]

      // EG rates and levels - bytes 0-7
      for (let i = 0; i < 4; i++) {
        packed[opDst + i] = unpacked[opSrc + i]
      }
      for (let i = 0; i < 4; i++) {
        packed[opDst + 4 + i] = unpacked[opSrc + 4 + i]
      }

      // Break point and scaling depths - bytes 8-10
      packed[opDst + 8] = unpacked[opSrc + 8] // Break Point
      packed[opDst + 9] = unpacked[opSrc + 9] // L Scale Depth
      packed[opDst + 10] = unpacked[opSrc + 10] // R Scale Depth

      // Key scales (LC and RC) combined - byte 11
      const lc = unpacked[opSrc + 11] & 0x03
      const rc = unpacked[opSrc + 12] & 0x03
      packed[opDst + 11] = lc | (rc << 2)

      // Rate scaling and detune combined - byte 12
      const rs = unpacked[opSrc + 13] & 0x07
      const det = unpacked[opSrc + 14] & 0x0f
      packed[opDst + 12] = rs | (det << 3)

      // Amp mod sensitivity and key velocity sensitivity combined - byte 13
      const ams = unpacked[opSrc + 15] & 0x03
      const kvs = unpacked[opSrc + 18] & 0x07
      packed[opDst + 13] = ams | (kvs << 2)

      // Output level - byte 14
      packed[opDst + 14] = unpacked[opSrc + 16] // Output Level

      // Mode, AM modulation, frequency combined - byte 15
      const mode = unpacked[opSrc + 17] & 0x01
      const freq = unpacked[opSrc + 19] & 0x1f // 5 bits
      packed[opDst + 15] = mode | (freq << 1)

      // OSC detune and frequency fine combined - byte 16
      const oscDetune = unpacked[opSrc + 20] & 0x07
      const freqFine = unpacked[opSrc + 21] & 0x0f
      packed[opDst + 16] = oscDetune | (freqFine << 3)
    }

    // After operators, src should be at 138 (6 * 23)
    src = 138
    // After operators, dst should be at 102 (6 * 17)
    dst = 102

    // Pitch EG rates and levels - bytes 102-109
    for (let i = 0; i < 4; i++) {
      packed[dst++] = unpacked[src++]
    }
    for (let i = 0; i < 4; i++) {
      packed[dst++] = unpacked[src++]
    }

    // Now at packed byte 110, unpacked index is 146 (after 6 operators + Pitch EG)
    // Algorithm - byte 110
    packed[DX7Patch.OFFSET_ALGORITHM] = unpacked[src++] // Algorithm

    // Feedback and OSC Sync combined - byte 111
    const feedback = unpacked[src++] & 0x07
    const oscSync = unpacked[src++] & 0x01
    packed[DX7Patch.OFFSET_FEEDBACK] = feedback | (oscSync << 3)

    packed[DX7Patch.OFFSET_LFO_SPEED] = unpacked[src++] // LFO Speed
    packed[DX7Patch.OFFSET_LFO_DELAY] = unpacked[src++] // LFO Delay
    packed[114] = unpacked[src++] // LFO Pitch Mod Depth
    packed[115] = unpacked[src++] // LFO Amplitude Mod Depth

    // LFO Key Sync, Wave, Pitch Mod Sensitivity combined - byte 116
    const lfoKeySync = unpacked[src++] & 0x01
    const lfoWave = unpacked[src++] & 0x07
    const lfoPitchSens = unpacked[src++] & 0x07
    packed[116] = lfoKeySync | (lfoWave << 1) | (lfoPitchSens << 4)

    packed[118] = unpacked[src++] // Amplitude Mod Sensitivity
    packed[DX7Patch.OFFSET_TRANSPOSE] = unpacked[src++] // Transpose (byte 117)

    // packed[119] is EG Bias Sensitivity
    packed[119] = unpacked[src++] // EG Bias Sensitivity

    // Write patch name (10 bytes at packed[118-127])
    // Read from unpacked[159-168] (after 159 bytes of parameters)
    for (let i = 0; i < DX7Patch.NAME_LENGTH; i++) {
      packed[DX7Patch.OFFSET_NAME + i] = unpacked[159 + i]
    }

    return packed
  }

  /**
   * Create a patch from unpacked 169-byte data
   * @param {Array<number>|Uint8Array} unpacked - 169 bytes of unpacked data (159 parameters + 10 name bytes)
   * @param {number} index - Patch index
   * @returns {DX7Patch}
   */
  static fromUnpacked(unpacked, index = 0) {
    const packed = DX7Patch.pack(unpacked)
    return new DX7Patch(packed, index)
  }

  /**
   * Create a default/empty patch
   * @param {number} index - Patch index
   * @returns {DX7Patch}
   */
  static createDefault(index = 0) {
    // Default DX7 patch (similar to "Init Voice")
    const unpacked = new Uint8Array(169) // 159 parameters + 10 name bytes

    // Default operator settings
    for (let op = 0; op < 6; op++) {
      const opOffset = op * DX7Patch.UNPACKED_OP_SIZE
      // EG rates (all 99)
      unpacked[opOffset + 0] = 99
      unpacked[opOffset + 1] = 99
      unpacked[opOffset + 2] = 99
      unpacked[opOffset + 3] = 99
      // EG levels
      unpacked[opOffset + 4] = 99
      unpacked[opOffset + 5] = 99
      unpacked[opOffset + 6] = 99
      unpacked[opOffset + 7] = 0
      // Break point
      unpacked[opOffset + 8] = 60
      // Scale depths
      unpacked[opOffset + 9] = 0
      unpacked[opOffset + 10] = 0
      // Key scales
      unpacked[opOffset + 11] = 0
      unpacked[opOffset + 12] = 0
      // Rate scaling
      unpacked[opOffset + 13] = 0
      // Amp mod sensitivity
      unpacked[opOffset + 14] = 0
      // Key velocity sensitivity
      unpacked[opOffset + 15] = 0
      // Output level
      unpacked[opOffset + 16] = 99
      // Operator parameters
      unpacked[opOffset + 17] = 0 // Mode (0=ratio, 1=fixed)
      unpacked[opOffset + 18] = 0 // AM modulation sensitivity
      unpacked[opOffset + 19] = 0 // Frequency coarse
      unpacked[opOffset + 20] = 0 // OSC detune
      unpacked[opOffset + 21] = 0 // Frequency fine
      unpacked[opOffset + 22] = 0 // Padding/unused
    }

    // Pitch EG rates (indices 138-141)
    unpacked[138] = 99
    unpacked[139] = 99
    unpacked[140] = 99
    unpacked[141] = 99

    // Pitch EG levels (indices 142-145)
    unpacked[142] = 50
    unpacked[143] = 50
    unpacked[144] = 50
    unpacked[145] = 50

    // Global params start at unpacked[146]
    const globalOffset = 146

    // Algorithm (1)
    unpacked[globalOffset + 0] = 0
    // Feedback (0)
    unpacked[globalOffset + 1] = 0
    // OSC sync (off)
    unpacked[globalOffset + 2] = 0
    // LFO speed
    unpacked[globalOffset + 3] = 35
    // LFO delay
    unpacked[globalOffset + 4] = 0
    // LFO pitch mod depth
    unpacked[globalOffset + 5] = 0
    // LFO amplitude mod depth
    unpacked[globalOffset + 6] = 0
    // LFO sync (off), wave (triangle), pitch mod sensitivity (3)
    unpacked[globalOffset + 7] = 0
    unpacked[globalOffset + 8] = 0
    unpacked[globalOffset + 9] = 3
    // Amplitude mod sensitivity
    unpacked[globalOffset + 10] = 0
    // Transpose (0 = C)
    unpacked[globalOffset + 11] = 0
    // EG bias sensitivity
    unpacked[globalOffset + 12] = 0

    // Set name to "Init Voice" in unpacked array (indices 159-168)
    const name = "Init Voice"
    for (let i = 0; i < 10; i++) {
      unpacked[159 + i] = i < name.length ? name.charCodeAt(i) : 32 // Space for empty slots
    }

    // Pack the data (this will read name from unpacked[155-164] and write to packed[118-127])
    const packed = DX7Patch.pack(unpacked)

    return new DX7Patch(packed, index)
  }

  /**
   * Export patch to DX7 single voice SysEx format (VCED format)
   * This is useful for synths that only support single patch dumps (e.g., KORG Volca FM)
   * Converts from 169-byte unpacked format to 155-byte VCED format
   * @returns {Uint8Array} Single voice SysEx data (163 bytes)
   */
  toSysEx() {
    const unpacked = this.unpack() // 169 bytes in our internal format
    const result = new Uint8Array(163) // 6 header + 155 data + 1 checksum + 1 end
    let offset = 0

    // DX7 single voice dump header: F0 43 00 00 01 1B
    result[offset++] = 0xf0
    result[offset++] = 0x43
    result[offset++] = 0x00
    result[offset++] = 0x00
    result[offset++] = 0x01
    result[offset++] = 0x1b

    // Convert operators: 6 × 21 bytes = 126 bytes
    // VCED expects operators in reverse order: OP6, OP5, OP4, OP3, OP2, OP1
    for (let op = 5; op >= 0; op--) {
      const src = op * 23 // Source offset in our 23-byte per operator format

      // Copy 21 bytes per operator, skipping bytes 18 and 22 in our format
      result[offset++] = unpacked[src + 0]   // EG Rate 1
      result[offset++] = unpacked[src + 1]   // EG Rate 2
      result[offset++] = unpacked[src + 2]   // EG Rate 3
      result[offset++] = unpacked[src + 3]   // EG Rate 4
      result[offset++] = unpacked[src + 4]   // EG Level 1
      result[offset++] = unpacked[src + 5]   // EG Level 2
      result[offset++] = unpacked[src + 6]   // EG Level 3
      result[offset++] = unpacked[src + 7]   // EG Level 4
      result[offset++] = unpacked[src + 8]   // Break Point
      result[offset++] = unpacked[src + 9]   // L Scale Depth
      result[offset++] = unpacked[src + 10]  // R Scale Depth
      result[offset++] = unpacked[src + 11]  // L Key Scale
      result[offset++] = unpacked[src + 12]  // R Key Scale
      result[offset++] = unpacked[src + 13]  // Rate Scaling
      result[offset++] = unpacked[src + 14]  // A Mod Sens
      result[offset++] = unpacked[src + 15]  // Key Velocity
      result[offset++] = unpacked[src + 16]  // Output Level
      result[offset++] = unpacked[src + 17]  // Mode (0=Ratio, 1=Fixed)
      result[offset++] = unpacked[src + 19]  // Freq Coarse (skip byte 18)
      result[offset++] = unpacked[src + 21]  // Freq Fine (skip byte 20)
      result[offset++] = unpacked[src + 20]  // Detune
      // Skip unpacked[src + 18] and unpacked[src + 22] (not in VCED format)
    }

    // Pitch EG: 8 bytes (Rates 1-4, Levels 1-4)
    result[offset++] = unpacked[138]  // Rate 1
    result[offset++] = unpacked[139]  // Rate 2
    result[offset++] = unpacked[140]  // Rate 3
    result[offset++] = unpacked[141]  // Rate 4
    result[offset++] = unpacked[142]  // Level 1
    result[offset++] = unpacked[143]  // Level 2
    result[offset++] = unpacked[144]  // Level 3
    result[offset++] = unpacked[145]  // Level 4

    // Algorithm and global parameters: 11 bytes
    result[offset++] = unpacked[146]  // Algorithm
    result[offset++] = unpacked[147]  // Feedback / OSC Key Sync
    result[offset++] = unpacked[148]  // LFO Speed
    result[offset++] = unpacked[149]  // LFO Delay
    result[offset++] = unpacked[150]  // LFO Pitch Mod Depth
    result[offset++] = unpacked[151]  // LFO Am Mod Depth
    result[offset++] = unpacked[153]  // LFO Key Sync / Wave
    result[offset++] = unpacked[154]  // LFO Sync (in high nibble)
    result[offset++] = unpacked[155]  // Pitch Mod Sensitivity
    result[offset++] = unpacked[156]  // Pitch EG Bias Point (maybe?)
    result[offset++] = unpacked[157]  // Pitch EG Bias Sensitivity (maybe?)

    // Voice name: 10 bytes (unpacked[159-168])
    for (let i = 0; i < 10; i++) {
      result[offset++] = unpacked[159 + i]
    }

    // Calculate checksum on 155 bytes of data (bytes 6-160)
    const dataForChecksum = result.slice(6, 161)
    const checksum = DX7Cartridge._calculateChecksum(dataForChecksum, 155)
    result[offset++] = checksum

    // SysEx end
    result[offset++] = 0xf7

    return result
  }

  /**
   * Convert patch to JSON format
   * @returns {object} Patch data in JSON format
   */
  toJSON() {
    const unpacked = this.unpack()
    const operators = []

    // Helper function to get key scale curve string
    const getKeyScaleCurve = (value) => {
      const curves = ["-LN", "-EX", "+EX", "+LN"]
      return curves[value] || "UNKNOWN"
    }

    // Helper function to get LFO wave string
    const getLFOWave = (value) => {
      const waves = ["TRIANGLE", "SAW DOWN", "SAW UP", "SQUARE", "SINE", "SAMPLE & HOLD"]
      return waves[value] || "UNKNOWN"
    }

    // Helper function to convert MIDI note to note name
    const getNoteName = (midiNote) => {
      const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
      const octave = Math.floor(midiNote / 12) - 2
      const note = notes[midiNote % 12]
      return `${note}${octave}`
    }

    // Extract operator data
    for (let op = 0; op < 6; op++) {
      const opOffset = op * 23 // Each operator is 23 bytes in unpacked format
      const mode = unpacked[opOffset + 17] === 0 ? "RATIO" : "FIXED"

      operators.push({
        id: op + 1,
        osc: {
          detune: unpacked[opOffset + 20],
          freq: {
            coarse: unpacked[opOffset + 19],
            fine: unpacked[opOffset + 21],
            mode: mode,
          },
        },
        eg: {
          rates: [
            unpacked[opOffset],
            unpacked[opOffset + 1],
            unpacked[opOffset + 2],
            unpacked[opOffset + 3],
          ],
          levels: [
            unpacked[opOffset + 4],
            unpacked[opOffset + 5],
            unpacked[opOffset + 6],
            unpacked[opOffset + 7],
          ],
        },
        key: {
          velocity: unpacked[opOffset + 18],
          scaling: unpacked[opOffset + 13],
          breakPoint: getNoteName(unpacked[opOffset + 8] + 21),
        },
        output: {
          level: unpacked[opOffset + 16],
          ampModSens: unpacked[opOffset + 15],
        },
        scale: {
          left: {
            depth: unpacked[opOffset + 9],
            curve: getKeyScaleCurve(unpacked[opOffset + 11]),
          },
          right: {
            depth: unpacked[opOffset + 10],
            curve: getKeyScaleCurve(unpacked[opOffset + 12]),
          },
        },
      })
    }

    return {
      name: this.name || "(Empty)",
      operators: operators,
      pitchEG: {
        rates: [unpacked[138], unpacked[139], unpacked[140], unpacked[141]],
        levels: [unpacked[142], unpacked[143], unpacked[144], unpacked[145]],
      },
      lfo: {
        speed: unpacked[149],
        delay: unpacked[150],
        pmDepth: unpacked[151],
        amDepth: unpacked[152],
        keySync: unpacked[153] === 1,
        wave: getLFOWave(unpacked[154]),
      },
      global: {
        algorithm: unpacked[146] + 1,
        feedback: unpacked[147],
        oscKeySync: unpacked[148] === 1,
        pitchModSens: unpacked[155],
        transpose: unpacked[157] - 24, // Convert to signed value (-24 to +24)
      },
    }
  }
}

/**
 * DX7Cartridge - Represents a DX7 cartridge loaded from a SYX file
 * Contains 32 patches in the packed 128-byte format
 */
export class DX7Cartridge {
  /**
   * DX7 Cartridge SysEx constants
   * @private
   */
  static SYSEX_HEADER = [0xf0, 0x43, 0x00, 0x09, 0x20, 0x00]
  static SYSEX_SIZE = 4104 // 32 × 128 bytes = 4096 + 6 header + 2 footer
  static PATCH_SIZE = 128
  static NUM_PATCHES = 32

  /**
   * Create a DX7Cartridge
   * @param {Array<number>|ArrayBuffer|Uint8Array} data - Cartridge SYX data (optional)
   * @param {string} name - Optional cartridge name (e.g., filename)
   */
  constructor(data, name = "") {
    this.patches = new Array(DX7Cartridge.NUM_PATCHES)
    this.name = name

    if (data) {
      // Load existing data
      this._load(data)
    } else {
      // Create empty cartridge with default patches
      for (let i = 0; i < DX7Cartridge.NUM_PATCHES; i++) {
        this.patches[i] = DX7Patch.createDefault(i)
      }
    }
  }

  /**
   * Calculate DX7 SysEx checksum
   * @private
   * @param {Uint8Array} data - Data to checksum
   * @param {number} size - Number of bytes
   * @returns {number} Checksum byte
   */
  static _calculateChecksum(data, size) {
    let sum = 0
    for (let i = 0; i < size; i++) {
      sum += data[i]
    }
    return (128 - (sum % 128)) & 0x7f
  }

  /**
   * Load and validate cartridge data
   * @private
   * @param {Array<number>|ArrayBuffer|Uint8Array} data
   */
  _load(data) {
    // Convert to Uint8Array if needed
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

    // Check if we have raw voice data (4096 bytes) or full SYSEX (4104 bytes)
    let voiceData
    let offset = 0

    // Remove SYSEX wrapper if present
    if (bytes[0] === 0xf0) {
      // Verify header
      const header = bytes.slice(0, 6)
      const expectedHeader = DX7Cartridge.SYSEX_HEADER

      for (let i = 0; i < 6; i++) {
        if (header[i] !== expectedHeader[i]) {
          throw new Error(
            `Invalid SYSEX header at position ${i}: expected ${expectedHeader[i].toString(16)}, got ${header[i].toString(16)}`,
          )
        }
      }

      // Extract voice data (skip header and footer)
      voiceData = bytes.slice(6, 4102) // 4096 bytes
      offset = 6
    } else if (bytes.length === 4096) {
      // Raw voice data, no SYSEX wrapper
      voiceData = bytes
    } else {
      throw new Error(`Invalid data length: expected 4096 or 4104 bytes, got ${bytes.length}`)
    }

    // Verify total size
    if (voiceData.length !== 4096) {
      throw new Error(`Invalid voice data length: expected 4096 bytes, got ${voiceData.length}`)
    }

    // Validate checksum if we have SYSEX wrapper
    if (offset > 0 && bytes.length >= 4103) {
      const checksum = bytes[4102]
      const calculatedChecksum = DX7Cartridge._calculateChecksum(voiceData, 4096)

      if (checksum !== calculatedChecksum) {
        console.debug(
          `DX7 checksum mismatch (expected ${calculatedChecksum.toString(16)}, got ${checksum.toString(16)}). ` +
            `This is common with vintage SysEx files and the data is likely still valid.`,
        )
      }
    }

    // Extract patches (32 patches × 128 bytes each)
    this.patches = new Array(DX7Cartridge.NUM_PATCHES)
    for (let i = 0; i < DX7Cartridge.NUM_PATCHES; i++) {
      const patchStart = i * DX7Cartridge.PATCH_SIZE
      const patchData = voiceData.slice(patchStart, patchStart + DX7Cartridge.PATCH_SIZE)
      this.patches[i] = new DX7Patch(patchData, i)
    }
  }

  /**
   * Replace a patch at the specified index
   * @param {number} index - Patch index (0-31)
   * @param {DX7Patch} patch - Patch to insert
   */
  replacePatch(index, patch) {
    if (index < 0 || index >= DX7Cartridge.NUM_PATCHES) {
      throw new Error(`Invalid patch index: ${index}`)
    }

    // Create a copy of the patch with the correct index
    const patchData = new Uint8Array(patch.data)
    this.patches[index] = new DX7Patch(patchData, index)
  }

  /**
   * Add a patch to the first empty slot
   * @param {DX7Patch} patch - Patch to add
   * @returns {number} Index where patch was added, or -1 if cartridge is full
   */
  addPatch(patch) {
    for (let i = 0; i < this.patches.length; i++) {
      const currentPatch = this.patches[i]
      // Check if slot is empty (all zeros or default patch)
      const isEmpty = currentPatch.name === "" || currentPatch.name === "Init Voice"
      if (isEmpty) {
        this.replacePatch(i, patch)
        return i
      }
    }
    return -1
  }

  /**
   * Get all patches in the cartridge
   * @returns {DX7Patch[]}
   */
  getPatches() {
    return this.patches
  }

  /**
   * Get a specific patch by index
   * @param {number} index - Patch index (0-31)
   * @returns {DX7Patch|null}
   */
  getPatch(index) {
    if (index < 0 || index >= this.patches.length) {
      return null
    }
    return this.patches[index]
  }

  /**
   * Get all patch names
   * @returns {string[]}
   */
  getPatchNames() {
    return this.patches.map((patch) => patch.name)
  }

  /**
   * Find a patch by name (case-insensitive, partial match)
   * @param {string} name - Patch name to search for
   * @returns {DX7Patch|null}
   */
  findPatchByName(name) {
    const lowerName = name.toLowerCase()
    return this.patches.find((patch) => patch.name.toLowerCase().includes(lowerName)) || null
  }

  /**
   * Load a DX7 cartridge from a file
   * @param {File|Blob} file - SYX file to load
   * @returns {Promise<DX7Cartridge>}
   */
  static async fromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          // Extract filename if available (File object has name property)
          const fileName = file.name || ""
          const cartridge = new DX7Cartridge(e.target.result, fileName)
          resolve(cartridge)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Export cartridge to SYSEX format
   * @returns {Uint8Array} Full SYSEX data (4104 bytes)
   */
  toSysEx() {
    const result = new Uint8Array(DX7Cartridge.SYSEX_SIZE)
    let offset = 0

    // Header
    DX7Cartridge.SYSEX_HEADER.forEach((byte) => {
      result[offset++] = byte
    })

    // Voice data (all patches)
    for (const patch of this.patches) {
      for (let i = 0; i < DX7Cartridge.PATCH_SIZE; i++) {
        result[offset++] = patch.data[i]
      }
    }

    // Checksum
    const voiceData = result.slice(6, 6 + 4096)
    const checksum = DX7Cartridge._calculateChecksum(voiceData, 4096)
    result[offset++] = checksum

    // SYSEX end
    result[offset++] = 0xf7

    return result
  }

  /**
   * Convert cartridge to JSON format
   * @returns {object} Cartridge data in JSON format
   */
  toJSON() {
    const patches = this.patches.map((patch, index) => {
      const jsonPatch = patch.toJSON()
      // Patch indices are 0-based internally, but show as 1-32 to users
      return {
        index: index + 1,
        ...jsonPatch,
      }
    })

    return {
      name: this.name || "",
      patches: patches,
    }
  }
}
