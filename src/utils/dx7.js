/**
 * DX7 Bank loader for parsing Yamaha DX7 SYX files
 *
 * Based on Dexed implementation by Pascal Gauthier
 * @see https://github.com/asb2m10/dexed
 */

import { DX7ParseError, DX7ValidationError } from "../core/errors.js"

/**
 * @typedef {Object} DX7OperatorJSON - JSON representation of a DX7 operator
 * @property {number} id - Operator number (1-6)
 * @property {Object} osc - Oscillator parameters
 * @property {Object} eg - Envelope parameters
 * @property {Object} key - Key scaling parameters
 * @property {Object} output - Output parameters
 * @property {Object} scale - Keyboard scaling parameters
 */

/**
 * @typedef {Object} DX7VoiceJSON - JSON representation of a DX7 voice
 * @property {string} name - Voice/patch name
 * @property {DX7OperatorJSON[]} operators - Array of 6 operators
 * @property {Object} pitchEG - Pitch envelope parameters
 * @property {Object} lfo - LFO parameters
 * @property {Object} global - Global voice parameters
 */

/**
 * @typedef {Object} DX7VoiceIndexJSON - JSON representation of a DX7 voice with index
 * @property {number} index - Voice index (1-32)
 * @property {string} name - Voice/patch name
 * @property {DX7OperatorJSON[]} operators - Array of 6 operators
 * @property {Object} pitchEG - Pitch envelope parameters
 * @property {Object} lfo - LFO parameters
 * @property {Object} global - Global voice parameters
 */

/**
 * @typedef {Object} DX7BankJSON - JSON representation of a DX7 bank
 * @property {string} version - Version string (e.g., "1.0")
 * @property {string} name - Bank name (e.g., filename)
 * @property {DX7VoiceIndexJSON[]} voices - Array of 32 voices
 */

/**
 * DX7 Voice (patch) structure
 * Each voice is 128 bytes in packed format
 */
export class DX7Voice {
  // Packed format (128 bytes)
  // See: DX7 Service Manual, Voice Memory Format
  static PACKED_SIZE = 128
  static PACKED_OP_SIZE = 17 // 17 bytes per operator in packed format
  static NUM_OPERATORS = 6

  // Packed operator parameter offsets (within each 17-byte operator block)
  static PACKED_OP_EG_RATE_1 = 0
  static PACKED_OP_EG_RATE_2 = 1
  static PACKED_OP_EG_RATE_3 = 2
  static PACKED_OP_EG_RATE_4 = 3
  static PACKED_OP_EG_LEVEL_1 = 4
  static PACKED_OP_EG_LEVEL_2 = 5
  static PACKED_OP_EG_LEVEL_3 = 6
  static PACKED_OP_EG_LEVEL_4 = 7
  static PACKED_OP_BREAK_POINT = 8
  static PACKED_OP_L_SCALE_DEPTH = 9
  static PACKED_OP_R_SCALE_DEPTH = 10
  static PACKED_OP_CURVES = 11 // LC and RC packed
  static PACKED_OP_RATE_SCALING = 12 // RS and DET packed
  static PACKED_OP_MOD_SENS = 13 // AMS and KVS packed
  static PACKED_OP_OUTPUT_LEVEL = 14
  static PACKED_OP_MODE_FREQ = 15 // Mode and Freq Coarse packed
  static PACKED_OP_DETUNE_FINE = 16 // OSC Detune and Freq Fine packed

  // Packed voice offsets (after 6 operators = bytes 102+)
  static PACKED_PITCH_EG_RATE_1 = 102
  static PACKED_PITCH_EG_RATE_2 = 103
  static PACKED_PITCH_EG_RATE_3 = 104
  static PACKED_PITCH_EG_RATE_4 = 105
  static PACKED_PITCH_EG_LEVEL_1 = 106
  static PACKED_PITCH_EG_LEVEL_2 = 107
  static PACKED_PITCH_EG_LEVEL_3 = 108
  static PACKED_PITCH_EG_LEVEL_4 = 109
  static OFFSET_ALGORITHM = 110
  static OFFSET_FEEDBACK = 111 // Also contains OSC Sync
  static OFFSET_LFO_SPEED = 112
  static OFFSET_LFO_DELAY = 113
  static OFFSET_LFO_PM_DEPTH = 114
  static OFFSET_LFO_AM_DEPTH = 115
  static OFFSET_LFO_SYNC_WAVE = 116 // LFO sync, wave, and PM sensitivity packed
  static OFFSET_TRANSPOSE = 117
  static OFFSET_AMP_MOD_SENS = 118
  static OFFSET_EG_BIAS_SENS = 119

  // Voice name (bytes 118-127)
  // IMPORTANT: Byte 118 serves dual-purpose in DX7 hardware:
  // 1. First character of voice name (as ASCII)
  // 2. Amp Mod Sensitivity parameter (as numeric value 0-127)
  // Both interpretations are used when converting to unpacked format
  static PACKED_NAME_START = 118
  static NAME_LENGTH = 10

  // Unpacked format (169 bytes)
  static UNPACKED_SIZE = 169 // Total unpacked size (159 params + 10 name)
  static UNPACKED_OP_SIZE = 23 // 23 bytes per operator in unpacked format

  // Unpacked operator parameter offsets (within each 23-byte operator block)
  static UNPACKED_OP_EG_RATE_1 = 0
  static UNPACKED_OP_EG_RATE_2 = 1
  static UNPACKED_OP_EG_RATE_3 = 2
  static UNPACKED_OP_EG_RATE_4 = 3
  static UNPACKED_OP_EG_LEVEL_1 = 4
  static UNPACKED_OP_EG_LEVEL_2 = 5
  static UNPACKED_OP_EG_LEVEL_3 = 6
  static UNPACKED_OP_EG_LEVEL_4 = 7
  static UNPACKED_OP_BREAK_POINT = 8
  static UNPACKED_OP_L_SCALE_DEPTH = 9
  static UNPACKED_OP_R_SCALE_DEPTH = 10
  static UNPACKED_OP_L_CURVE = 11
  static UNPACKED_OP_R_CURVE = 12
  static UNPACKED_OP_RATE_SCALING = 13
  static UNPACKED_OP_DETUNE = 14
  static UNPACKED_OP_AMP_MOD_SENS = 15
  static UNPACKED_OP_OUTPUT_LEVEL = 16
  static UNPACKED_OP_MODE = 17 // Mode (0=ratio, 1=fixed)
  static UNPACKED_OP_KEY_VEL_SENS = 18
  static UNPACKED_OP_FREQ_COARSE = 19
  static UNPACKED_OP_OSC_DETUNE = 20
  static UNPACKED_OP_FREQ_FINE = 21

  // Unpacked pitch EG offsets (after 6 operators = index 138+)
  static UNPACKED_PITCH_EG_RATE_1 = 138
  static UNPACKED_PITCH_EG_RATE_2 = 139
  static UNPACKED_PITCH_EG_RATE_3 = 140
  static UNPACKED_PITCH_EG_RATE_4 = 141
  static UNPACKED_PITCH_EG_LEVEL_1 = 142
  static UNPACKED_PITCH_EG_LEVEL_2 = 143
  static UNPACKED_PITCH_EG_LEVEL_3 = 144
  static UNPACKED_PITCH_EG_LEVEL_4 = 145

  // Unpacked global parameters (after pitch EG = index 146+)
  static UNPACKED_ALGORITHM = 146
  static UNPACKED_FEEDBACK = 147
  static UNPACKED_OSC_SYNC = 148
  static UNPACKED_LFO_SPEED = 149
  static UNPACKED_LFO_DELAY = 150
  static UNPACKED_LFO_PM_DEPTH = 151
  static UNPACKED_LFO_AM_DEPTH = 152
  static UNPACKED_LFO_KEY_SYNC = 153
  static UNPACKED_LFO_WAVE = 154
  static UNPACKED_LFO_PM_SENS = 155
  static UNPACKED_AMP_MOD_SENS = 156
  static UNPACKED_TRANSPOSE = 157
  static UNPACKED_EG_BIAS_SENS = 158
  static UNPACKED_NAME_START = 159

  // VCED (single voice SysEx) format - for DX7 single patch dumps
  static VCED_SIZE = 163 // Total VCED sysex size (6 header + 155 data + 1 checksum + 1 end)
  static VCED_HEADER_SIZE = 6
  static VCED_DATA_SIZE = 155 // Voice data bytes (6 operators × 21 bytes + 8 pitch EG + 11 global + 10 name)

  // VCED header bytes - DX7 single voice dump format
  static VCED_SYSEX_START = 0xf0 // SysEx Message Start
  static VCED_YAMAHA_ID = 0x43 // Yamaha manufacturer ID
  static VCED_SUB_STATUS = 0x00
  static VCED_FORMAT_SINGLE = 0x00 // Single voice format identifier
  static VCED_BYTE_COUNT_MSB = 0x01 // High byte of data length (1)
  static VCED_BYTE_COUNT_LSB = 0x1b // Low byte of data length (27 in decimal = 155 bytes)
  static VCED_SYSEX_END = 0xf7 // SysEx Message End

  // Bit masks
  static MASK_7BIT = 0x7f // Standard 7-bit MIDI data mask
  static MASK_2BIT = 0x03 // For 2-bit values (curves)
  static MASK_3BIT = 0x07 // For 3-bit values (RS, detune)
  static MASK_4BIT = 0x0f // For 4-bit values (detune, fine freq)
  static MASK_5BIT = 0x1f // For 5-bit values (algorithm, freq coarse)
  static MASK_1BIT = 0x01 // For 1-bit values (mode, sync)

  // Parameter value ranges
  static TRANSPOSE_CENTER = 24 // MIDI note 24 = C0 (center of DX7 transpose range: -24 to +24 semitones)

  // Special character mappings - for Japanese DX7 character set compatibility
  static CHAR_YEN = 92 // Japanese Yen symbol (¥) maps to ASCII backslash
  static CHAR_ARROW_RIGHT = 126 // Right arrow (→) maps to ASCII tilde
  static CHAR_ARROW_LEFT = 127 // Left arrow (←) maps to ASCII DEL
  static CHAR_REPLACEMENT_Y = 89 // Replace Yen symbol with 'Y'
  static CHAR_REPLACEMENT_GT = 62 // Right arrow with '>'
  static CHAR_REPLACEMENT_LT = 60 // Left arrow with '<'
  static CHAR_SPACE = 32 // Standard space character
  static CHAR_MIN_PRINTABLE = 32 // Minimum ASCII printable character
  static CHAR_MAX_PRINTABLE = 126 // Maximum ASCII printable character

  // Default voice values
  static DEFAULT_EG_RATE = 99
  static DEFAULT_EG_LEVEL_MAX = 99
  static DEFAULT_EG_LEVEL_MIN = 0
  static DEFAULT_BREAK_POINT = 60 // MIDI note 60 = C3
  static DEFAULT_OUTPUT_LEVEL = 99
  static DEFAULT_PITCH_EG_LEVEL = 50
  static DEFAULT_LFO_SPEED = 35
  static DEFAULT_LFO_PM_SENS = 3
  static DEFAULT_ALGORITHM = 0
  static DEFAULT_FEEDBACK = 0

  // MIDI notes
  static MIDI_OCTAVE_OFFSET = -2 // For displaying MIDI notes (MIDI 0 = C-2)
  static MIDI_BREAK_POINT_OFFSET = 21 // Offset for breakpoint display

  /**
   * Create a DX7Voice from raw 128-byte data
   * @param {Array<number>|Uint8Array} data - 128 bytes of voice data
   * @param {number} index - Voice index (0-31)
   * @throws {DX7ValidationError} If data length is not exactly 128 bytes
   */
  constructor(data, index = 0) {
    if (data.length !== DX7Voice.PACKED_SIZE) {
      throw new DX7ValidationError(
        `Invalid voice data length: expected ${DX7Voice.PACKED_SIZE} bytes, got ${data.length}`,
        "length",
        data.length,
      )
    }

    this.index = index
    this.data = new Uint8Array(data)
    this.name = this._extractName()
  }

  /**
   * Extract the voice name from the data (10 characters at offset 118)
   * @private
   */
  _extractName() {
    const nameBytes = this.data.subarray(
      DX7Voice.PACKED_NAME_START,
      DX7Voice.PACKED_NAME_START + DX7Voice.NAME_LENGTH,
    )
    // Normalize DX7 special characters
    const normalized = Array.from(nameBytes).map((byte) => {
      let c = byte & DX7Voice.MASK_7BIT
      // Dexed special character mappings
      if (c === DX7Voice.CHAR_YEN) c = DX7Voice.CHAR_REPLACEMENT_Y
      if (c === DX7Voice.CHAR_ARROW_RIGHT) c = DX7Voice.CHAR_REPLACEMENT_GT
      if (c === DX7Voice.CHAR_ARROW_LEFT) c = DX7Voice.CHAR_REPLACEMENT_LT
      if (c < DX7Voice.CHAR_MIN_PRINTABLE || c > DX7Voice.CHAR_MAX_PRINTABLE)
        c = DX7Voice.CHAR_SPACE
      return String.fromCharCode(c)
    })
    return normalized.join("").trim()
  }

  /**
   * Get a raw parameter value from the packed data
   * @param {number} offset - Byte offset in the voice data (0-127)
   * @returns {number} Parameter value (0-127)
   * @throws {DX7ValidationError} If offset is out of range
   */
  getParameter(offset) {
    if (offset < 0 || offset >= DX7Voice.PACKED_SIZE) {
      throw new DX7ValidationError(
        `Parameter offset out of range: ${offset} (must be 0-${DX7Voice.PACKED_SIZE - 1})`,
        "offset",
        offset,
      )
    }
    return this.data[offset] & DX7Voice.MASK_7BIT
  }

  /**
   * Get a parameter value from the unpacked 169-byte format
   * @param {number} offset - Byte offset in the unpacked data (0-168)
   * @returns {number} Parameter value (0-127)
   * @throws {DX7ValidationError} If offset is out of range
   */
  getUnpackedParameter(offset) {
    if (offset < 0 || offset >= DX7Voice.UNPACKED_SIZE) {
      throw new DX7ValidationError(
        `Unpacked parameter offset out of range: ${offset} (must be 0-${DX7Voice.UNPACKED_SIZE - 1})`,
        "offset",
        offset,
      )
    }
    const unpacked = this.unpack()
    return unpacked[offset] & DX7Voice.MASK_7BIT
  }

  /**
   * Set a raw parameter value in the packed data
   * @param {number} offset - Byte offset in the voice data
   * @param {number} value - Parameter value (0-127)
   */
  setParameter(offset, value) {
    if (offset < 0 || offset >= DX7Voice.PACKED_SIZE) {
      throw new DX7ValidationError(
        `Parameter offset out of range: ${offset} (must be 0-${DX7Voice.PACKED_SIZE - 1})`,
        "offset",
        offset,
      )
    }
    this.data[offset] = value & DX7Voice.MASK_7BIT
    // Update name if name bytes changed
    if (
      offset >= DX7Voice.PACKED_NAME_START &&
      offset < DX7Voice.PACKED_NAME_START + DX7Voice.NAME_LENGTH
    ) {
      this.name = this._extractName()
    }
  }

  /**
   * Unpack the voice data to 169-byte unpacked format
   * This converts the packed 128-byte format to the full DX7 parameter set
   * @returns {Uint8Array} 169 bytes of unpacked voice data (138 operator + 8 pitch EG + 13 global + 10 name = 169 bytes)
   */
  unpack() {
    const packed = this.data
    const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

    // Operators (6 operators × 17 bytes each in packed format)
    // Note: DX7 stores operators in reverse order in packed format
    // OP1 data is at the end (packed offset 85-101), OP6 data is at the beginning (packed offset 0-16)
    for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
      // Calculate source and destination offsets
      // op=0 is OP1, which is at packed offset 85, unpacked offset 0
      // op=5 is OP6, which is at packed offset 0, unpacked offset 115
      const src = (DX7Voice.NUM_OPERATORS - 1 - op) * DX7Voice.PACKED_OP_SIZE // Source offset in packed data
      const dst = op * DX7Voice.UNPACKED_OP_SIZE // Destination offset in unpacked data

      // EG rates and levels (4 bytes each) - bytes 0-7
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_1] =
        packed[src + DX7Voice.PACKED_OP_EG_RATE_1] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_2] =
        packed[src + DX7Voice.PACKED_OP_EG_RATE_2] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_3] =
        packed[src + DX7Voice.PACKED_OP_EG_RATE_3] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_4] =
        packed[src + DX7Voice.PACKED_OP_EG_RATE_4] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_1] =
        packed[src + DX7Voice.PACKED_OP_EG_LEVEL_1] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_2] =
        packed[src + DX7Voice.PACKED_OP_EG_LEVEL_2] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_3] =
        packed[src + DX7Voice.PACKED_OP_EG_LEVEL_3] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_4] =
        packed[src + DX7Voice.PACKED_OP_EG_LEVEL_4] & DX7Voice.MASK_7BIT

      // Break point and scaling depths - bytes 8-10
      unpacked[dst + DX7Voice.UNPACKED_OP_BREAK_POINT] =
        packed[src + DX7Voice.PACKED_OP_BREAK_POINT] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH] =
        packed[src + DX7Voice.PACKED_OP_L_SCALE_DEPTH] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH] =
        packed[src + DX7Voice.PACKED_OP_R_SCALE_DEPTH] & DX7Voice.MASK_7BIT

      // Key scales (bits 0-1 = LC, bits 2-3 = RC)
      const curves = packed[src + DX7Voice.PACKED_OP_CURVES] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_L_CURVE] = curves & DX7Voice.MASK_2BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_R_CURVE] = (curves >> 2) & DX7Voice.MASK_2BIT

      // Rate scaling and detune (bits 0-2 = RS, bits 3-6 = DET)
      const rateScaling = packed[src + DX7Voice.PACKED_OP_RATE_SCALING] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_RATE_SCALING] = rateScaling & DX7Voice.MASK_3BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_DETUNE] = (rateScaling >> 3) & DX7Voice.MASK_4BIT

      // Amp mod sensitivity and key velocity sensitivity (bits 0-1 = AMS, bits 2-4 = KVS)
      const modSens = packed[src + DX7Voice.PACKED_OP_MOD_SENS] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_AMP_MOD_SENS] = modSens & DX7Voice.MASK_2BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_KEY_VEL_SENS] = (modSens >> 2) & DX7Voice.MASK_3BIT

      // Output level
      unpacked[dst + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL] =
        packed[src + DX7Voice.PACKED_OP_OUTPUT_LEVEL] & DX7Voice.MASK_7BIT

      // Mode, frequency (bits 0 = MODE, bits 1-5 = FREQ)
      const modeFreq = packed[src + DX7Voice.PACKED_OP_MODE_FREQ] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_MODE] = modeFreq & DX7Voice.MASK_1BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_FREQ_COARSE] = (modeFreq >> 1) & DX7Voice.MASK_5BIT

      // OSC detune and frequency fine (bits 0-2 = OSC DET, bits 3-6 = FREQ FINE)
      const detuneFine = packed[src + DX7Voice.PACKED_OP_DETUNE_FINE] & DX7Voice.MASK_7BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_OSC_DETUNE] = detuneFine & DX7Voice.MASK_3BIT
      unpacked[dst + DX7Voice.UNPACKED_OP_FREQ_FINE] = (detuneFine >> 3) & DX7Voice.MASK_4BIT
    }

    // Pitch EG rates and levels
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1] =
      packed[DX7Voice.PACKED_PITCH_EG_RATE_1] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2] =
      packed[DX7Voice.PACKED_PITCH_EG_RATE_2] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3] =
      packed[DX7Voice.PACKED_PITCH_EG_RATE_3] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4] =
      packed[DX7Voice.PACKED_PITCH_EG_RATE_4] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1] =
      packed[DX7Voice.PACKED_PITCH_EG_LEVEL_1] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2] =
      packed[DX7Voice.PACKED_PITCH_EG_LEVEL_2] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3] =
      packed[DX7Voice.PACKED_PITCH_EG_LEVEL_3] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4] =
      packed[DX7Voice.PACKED_PITCH_EG_LEVEL_4] & DX7Voice.MASK_7BIT

    // Global parameters
    unpacked[DX7Voice.UNPACKED_ALGORITHM] = packed[DX7Voice.OFFSET_ALGORITHM] & DX7Voice.MASK_5BIT

    // Feedback and OSC Sync combined (bits 0-2 = Feedback, bit 3 = OSC Sync)
    const feedbackOscSync = packed[DX7Voice.OFFSET_FEEDBACK] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_FEEDBACK] = feedbackOscSync & DX7Voice.MASK_3BIT
    unpacked[DX7Voice.UNPACKED_OSC_SYNC] = (feedbackOscSync >> 3) & DX7Voice.MASK_1BIT

    unpacked[DX7Voice.UNPACKED_LFO_SPEED] = packed[DX7Voice.OFFSET_LFO_SPEED] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_DELAY] = packed[DX7Voice.OFFSET_LFO_DELAY] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH] =
      packed[DX7Voice.OFFSET_LFO_PM_DEPTH] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH] =
      packed[DX7Voice.OFFSET_LFO_AM_DEPTH] & DX7Voice.MASK_7BIT

    // LFO Key Sync, Wave, Pitch Mod Sensitivity packed
    const lfoParams = packed[DX7Voice.OFFSET_LFO_SYNC_WAVE] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] = lfoParams & DX7Voice.MASK_1BIT
    unpacked[DX7Voice.UNPACKED_LFO_WAVE] = (lfoParams >> 1) & DX7Voice.MASK_3BIT
    unpacked[DX7Voice.UNPACKED_LFO_PM_SENS] = (lfoParams >> 4) & DX7Voice.MASK_3BIT

    unpacked[DX7Voice.UNPACKED_AMP_MOD_SENS] =
      packed[DX7Voice.OFFSET_AMP_MOD_SENS] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_TRANSPOSE] = packed[DX7Voice.OFFSET_TRANSPOSE] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_EG_BIAS_SENS] =
      packed[DX7Voice.OFFSET_EG_BIAS_SENS] & DX7Voice.MASK_7BIT

    // Copy voice name
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      unpacked[DX7Voice.UNPACKED_NAME_START + i] =
        packed[DX7Voice.PACKED_NAME_START + i] & DX7Voice.MASK_7BIT
    }

    return unpacked
  }

  /**
   * Pack 169-byte unpacked data to 128-byte format
   * @param {Array<number>|Uint8Array} unpacked - 169 bytes of unpacked data (159 parameters + 10 name bytes)
   * @returns {Uint8Array} 128 bytes of packed data
   */
  static pack(unpacked) {
    if (unpacked.length !== DX7Voice.UNPACKED_SIZE) {
      throw new DX7ValidationError(
        `Invalid unpacked data length: expected ${DX7Voice.UNPACKED_SIZE} bytes, got ${unpacked.length}`,
        "length",
        unpacked.length,
      )
    }

    const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

    // Pack operators (6 operators × 17 bytes each in packed format)
    // DX7 stores operators in reverse order: OP1 data goes to packed[85-101], OP6 to packed[0-16]
    for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
      const opSrc = op * DX7Voice.UNPACKED_OP_SIZE // Read OP1-OP6 sequentially from unpacked
      const opDst = (DX7Voice.NUM_OPERATORS - 1 - op) * DX7Voice.PACKED_OP_SIZE // Write in reverse

      // EG rates and levels - bytes 0-7
      packed[opDst + DX7Voice.PACKED_OP_EG_RATE_1] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_RATE_1]
      packed[opDst + DX7Voice.PACKED_OP_EG_RATE_2] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_RATE_2]
      packed[opDst + DX7Voice.PACKED_OP_EG_RATE_3] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_RATE_3]
      packed[opDst + DX7Voice.PACKED_OP_EG_RATE_4] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_RATE_4]
      packed[opDst + DX7Voice.PACKED_OP_EG_LEVEL_1] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_LEVEL_1]
      packed[opDst + DX7Voice.PACKED_OP_EG_LEVEL_2] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_LEVEL_2]
      packed[opDst + DX7Voice.PACKED_OP_EG_LEVEL_3] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_LEVEL_3]
      packed[opDst + DX7Voice.PACKED_OP_EG_LEVEL_4] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_EG_LEVEL_4]

      // Break point and scaling depths
      packed[opDst + DX7Voice.PACKED_OP_BREAK_POINT] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_BREAK_POINT]
      packed[opDst + DX7Voice.PACKED_OP_L_SCALE_DEPTH] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH]
      packed[opDst + DX7Voice.PACKED_OP_R_SCALE_DEPTH] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH]

      // Key scales (LC and RC) combined
      const lc = unpacked[opSrc + DX7Voice.UNPACKED_OP_L_CURVE] & DX7Voice.MASK_2BIT
      const rc = unpacked[opSrc + DX7Voice.UNPACKED_OP_R_CURVE] & DX7Voice.MASK_2BIT
      packed[opDst + DX7Voice.PACKED_OP_CURVES] = lc | (rc << 2)

      // Rate scaling and detune combined
      const rs = unpacked[opSrc + DX7Voice.UNPACKED_OP_RATE_SCALING] & DX7Voice.MASK_3BIT
      const det = unpacked[opSrc + DX7Voice.UNPACKED_OP_DETUNE] & DX7Voice.MASK_4BIT
      packed[opDst + DX7Voice.PACKED_OP_RATE_SCALING] = rs | (det << 3)

      // Amp mod sensitivity and key velocity sensitivity combined
      const ams = unpacked[opSrc + DX7Voice.UNPACKED_OP_AMP_MOD_SENS] & DX7Voice.MASK_2BIT
      const kvs = unpacked[opSrc + DX7Voice.UNPACKED_OP_KEY_VEL_SENS] & DX7Voice.MASK_3BIT
      packed[opDst + DX7Voice.PACKED_OP_MOD_SENS] = ams | (kvs << 2)

      // Output level
      packed[opDst + DX7Voice.PACKED_OP_OUTPUT_LEVEL] =
        unpacked[opSrc + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL]

      // Mode and frequency combined
      const mode = unpacked[opSrc + DX7Voice.UNPACKED_OP_MODE] & DX7Voice.MASK_1BIT
      const freq = unpacked[opSrc + DX7Voice.UNPACKED_OP_FREQ_COARSE] & DX7Voice.MASK_5BIT
      packed[opDst + DX7Voice.PACKED_OP_MODE_FREQ] = mode | (freq << 1)

      // OSC detune and frequency fine combined
      const oscDetune = unpacked[opSrc + DX7Voice.UNPACKED_OP_OSC_DETUNE] & DX7Voice.MASK_3BIT
      const freqFine = unpacked[opSrc + DX7Voice.UNPACKED_OP_FREQ_FINE] & DX7Voice.MASK_4BIT
      packed[opDst + DX7Voice.PACKED_OP_DETUNE_FINE] = oscDetune | (freqFine << 3)
    }

    // Pitch EG rates and levels
    packed[DX7Voice.PACKED_PITCH_EG_RATE_1] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1]
    packed[DX7Voice.PACKED_PITCH_EG_RATE_2] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2]
    packed[DX7Voice.PACKED_PITCH_EG_RATE_3] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3]
    packed[DX7Voice.PACKED_PITCH_EG_RATE_4] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4]
    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_1] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1]
    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_2] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2]
    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_3] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3]
    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_4] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4]
    packed[DX7Voice.OFFSET_ALGORITHM] = unpacked[DX7Voice.UNPACKED_ALGORITHM]

    // Feedback and OSC Sync combined
    const feedback = unpacked[DX7Voice.UNPACKED_FEEDBACK] & DX7Voice.MASK_3BIT
    const oscSync = unpacked[DX7Voice.UNPACKED_OSC_SYNC] & DX7Voice.MASK_1BIT
    packed[DX7Voice.OFFSET_FEEDBACK] = feedback | (oscSync << 3)

    packed[DX7Voice.OFFSET_LFO_SPEED] = unpacked[DX7Voice.UNPACKED_LFO_SPEED]
    packed[DX7Voice.OFFSET_LFO_DELAY] = unpacked[DX7Voice.UNPACKED_LFO_DELAY]
    packed[DX7Voice.OFFSET_LFO_PM_DEPTH] = unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH]
    packed[DX7Voice.OFFSET_LFO_AM_DEPTH] = unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH]

    // LFO Key Sync, Wave, Pitch Mod Sensitivity combined
    const lfoKeySync = unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] & DX7Voice.MASK_1BIT
    const lfoWave = unpacked[DX7Voice.UNPACKED_LFO_WAVE] & DX7Voice.MASK_3BIT
    const lfoPitchSens = unpacked[DX7Voice.UNPACKED_LFO_PM_SENS] & DX7Voice.MASK_3BIT
    packed[DX7Voice.OFFSET_LFO_SYNC_WAVE] = lfoKeySync | (lfoWave << 1) | (lfoPitchSens << 4)

    packed[DX7Voice.OFFSET_AMP_MOD_SENS] = unpacked[DX7Voice.UNPACKED_AMP_MOD_SENS]
    packed[DX7Voice.OFFSET_TRANSPOSE] = unpacked[DX7Voice.UNPACKED_TRANSPOSE]
    packed[DX7Voice.OFFSET_EG_BIAS_SENS] = unpacked[DX7Voice.UNPACKED_EG_BIAS_SENS]

    // Write voice name
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      packed[DX7Voice.PACKED_NAME_START + i] = unpacked[DX7Voice.UNPACKED_NAME_START + i]
    }

    return packed
  }

  /**
   * Create a default/empty voice
   * @param {number} index - Voice index
   * @returns {DX7Voice}
   */
  static createDefault(index = 0) {
    const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

    // Default operator settings
    for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
      const opOffset = op * DX7Voice.UNPACKED_OP_SIZE

      // EG rates
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_1] = DX7Voice.DEFAULT_EG_RATE
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_2] = DX7Voice.DEFAULT_EG_RATE
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_3] = DX7Voice.DEFAULT_EG_RATE
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_4] = DX7Voice.DEFAULT_EG_RATE

      // EG levels
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_1] = DX7Voice.DEFAULT_EG_LEVEL_MAX
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_2] = DX7Voice.DEFAULT_EG_LEVEL_MAX
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_3] = DX7Voice.DEFAULT_EG_LEVEL_MAX
      unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_4] = DX7Voice.DEFAULT_EG_LEVEL_MIN

      // Break point, scaling, curves
      unpacked[opOffset + DX7Voice.UNPACKED_OP_BREAK_POINT] = DX7Voice.DEFAULT_BREAK_POINT
      unpacked[opOffset + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_L_CURVE] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_R_CURVE] = 0

      // Rate scaling, detune, sensitivities
      unpacked[opOffset + DX7Voice.UNPACKED_OP_RATE_SCALING] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_AMP_MOD_SENS] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_KEY_VEL_SENS] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL] = DX7Voice.DEFAULT_OUTPUT_LEVEL

      // Oscillator parameters
      unpacked[opOffset + DX7Voice.UNPACKED_OP_MODE] = 0 // Ratio mode
      unpacked[opOffset + DX7Voice.UNPACKED_OP_FREQ_COARSE] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_OSC_DETUNE] = 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_FREQ_FINE] = 0
    }

    // Pitch EG rates
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1] = DX7Voice.DEFAULT_EG_RATE
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2] = DX7Voice.DEFAULT_EG_RATE
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3] = DX7Voice.DEFAULT_EG_RATE
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4] = DX7Voice.DEFAULT_EG_RATE

    // Pitch EG levels
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1] = DX7Voice.DEFAULT_PITCH_EG_LEVEL
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2] = DX7Voice.DEFAULT_PITCH_EG_LEVEL
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3] = DX7Voice.DEFAULT_PITCH_EG_LEVEL
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4] = DX7Voice.DEFAULT_PITCH_EG_LEVEL

    // Global params
    unpacked[DX7Voice.UNPACKED_ALGORITHM] = DX7Voice.DEFAULT_ALGORITHM
    unpacked[DX7Voice.UNPACKED_FEEDBACK] = DX7Voice.DEFAULT_FEEDBACK
    unpacked[DX7Voice.UNPACKED_OSC_SYNC] = 0
    unpacked[DX7Voice.UNPACKED_LFO_SPEED] = DX7Voice.DEFAULT_LFO_SPEED
    unpacked[DX7Voice.UNPACKED_LFO_DELAY] = 0
    unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH] = 0
    unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH] = 0
    unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] = 0
    unpacked[DX7Voice.UNPACKED_LFO_WAVE] = 0
    unpacked[DX7Voice.UNPACKED_LFO_PM_SENS] = DX7Voice.DEFAULT_LFO_PM_SENS
    unpacked[DX7Voice.UNPACKED_AMP_MOD_SENS] = 0
    unpacked[DX7Voice.UNPACKED_TRANSPOSE] = DX7Voice.TRANSPOSE_CENTER
    unpacked[DX7Voice.UNPACKED_EG_BIAS_SENS] = 0

    // Set name to "Init Voice"
    const name = "Init Voice"
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      unpacked[DX7Voice.UNPACKED_NAME_START + i] =
        i < name.length ? name.charCodeAt(i) : DX7Voice.CHAR_SPACE
    }

    const packed = DX7Voice.pack(unpacked)
    return new DX7Voice(packed, index)
  }

  /**
   * Create a voice from unpacked 169-byte data
   * @param {Array<number>|Uint8Array} unpacked - 169 bytes of unpacked data (159 parameters + 10 name bytes)
   * @param {number} index - Voice index
   * @returns {DX7Voice}
   */
  static fromUnpacked(unpacked, index = 0) {
    const packed = DX7Voice.pack(unpacked)
    return new DX7Voice(packed, index)
  }

  /**
   * Load a DX7 voice from a single voice SYX file
   * @param {File|Blob} file - SYX file (single voice in VCED format)
   * @returns {Promise<DX7Voice>}
   * @throws {DX7ParseError} If file has invalid VCED header
   * @throws {Error} If file cannot be read (FileReader error)
   */
  static async fromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const bytes = new Uint8Array(e.target.result)

          // Verify VCED header
          if (
            bytes[0] !== DX7Voice.VCED_SYSEX_START ||
            bytes[1] !== DX7Voice.VCED_YAMAHA_ID ||
            bytes[2] !== DX7Voice.VCED_SUB_STATUS ||
            bytes[3] !== DX7Voice.VCED_FORMAT_SINGLE ||
            bytes[4] !== DX7Voice.VCED_BYTE_COUNT_MSB ||
            bytes[5] !== DX7Voice.VCED_BYTE_COUNT_LSB
          ) {
            throw new DX7ParseError("Invalid VCED header", "header", 0)
          }

          // Extract the 155 bytes of voice data
          const voiceData = bytes.subarray(
            DX7Voice.VCED_HEADER_SIZE,
            DX7Voice.VCED_HEADER_SIZE + DX7Voice.VCED_DATA_SIZE,
          )

          // Verify checksum
          const checksum = bytes[DX7Voice.VCED_HEADER_SIZE + DX7Voice.VCED_DATA_SIZE]
          const calculatedChecksum = DX7Bank._calculateChecksum(voiceData, DX7Voice.VCED_DATA_SIZE)

          if (checksum !== calculatedChecksum) {
            console.warn(
              `DX7 VCED checksum mismatch (expected ${calculatedChecksum.toString(16)}, got ${checksum.toString(16)}). This is common with vintage SysEx files.`,
            )
          }

          // Convert VCED data to unpacked format (169 bytes)
          const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

          let offset = 0

          // Operators: 6 × 21 bytes = 126 bytes
          // VCED stores operators in reverse order: OP6, OP5, OP4, OP3, OP2, OP1
          for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
            const dst = (DX7Voice.NUM_OPERATORS - 1 - op) * DX7Voice.UNPACKED_OP_SIZE

            // Copy operator parameters
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_1] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_2] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_3] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_4] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_1] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_2] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_3] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_4] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_BREAK_POINT] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_L_CURVE] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_R_CURVE] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_RATE_SCALING] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_DETUNE] = voiceData[offset++]
            // Amp mod sensitivity and key velocity sensitivity are packed in VCED
            const modSens = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_AMP_MOD_SENS] = modSens & DX7Voice.MASK_2BIT
            unpacked[dst + DX7Voice.UNPACKED_OP_KEY_VEL_SENS] = (modSens >> 2) & DX7Voice.MASK_3BIT
            unpacked[dst + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_MODE] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_FREQ_COARSE] = voiceData[offset++]
            // FREQ_FINE and OSC_DETUNE order swapped from unpacked format
            unpacked[dst + DX7Voice.UNPACKED_OP_FREQ_FINE] = voiceData[offset++]
            unpacked[dst + DX7Voice.UNPACKED_OP_OSC_DETUNE] = voiceData[offset++]
          }

          // Pitch EG: 8 bytes
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4] = voiceData[offset++]

          // Algorithm and global parameters: 11 bytes
          unpacked[DX7Voice.UNPACKED_ALGORITHM] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_FEEDBACK] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_OSC_SYNC] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_LFO_SPEED] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_LFO_DELAY] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_LFO_WAVE] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_LFO_PM_SENS] = voiceData[offset++]
          unpacked[DX7Voice.UNPACKED_TRANSPOSE] = voiceData[offset++]

          // Voice name: 10 bytes
          for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
            unpacked[DX7Voice.UNPACKED_NAME_START + i] = voiceData[offset++]
          }

          // Pack to 128-byte format
          const packed = DX7Voice.pack(unpacked)
          resolve(new DX7Voice(packed, 0))
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Export voice to DX7 single voice SysEx format (VCED format)
   * This is useful for synths that only support single voice dumps (e.g., KORG Volca FM)
   * Converts from 169-byte unpacked format to 155-byte VCED format
   * @returns {Uint8Array} Single voice SysEx data (163 bytes)
   */
  toSysEx() {
    const unpacked = this.unpack()
    const result = new Uint8Array(DX7Voice.VCED_SIZE)
    let offset = 0

    // DX7 single voice dump header
    result[offset++] = DX7Voice.VCED_SYSEX_START
    result[offset++] = DX7Voice.VCED_YAMAHA_ID
    result[offset++] = DX7Voice.VCED_SUB_STATUS
    result[offset++] = DX7Voice.VCED_FORMAT_SINGLE
    result[offset++] = DX7Voice.VCED_BYTE_COUNT_MSB
    result[offset++] = DX7Voice.VCED_BYTE_COUNT_LSB

    // Convert operators: 6 × 21 bytes = 126 bytes
    // VCED expects operators in reverse order: OP6, OP5, OP4, OP3, OP2, OP1
    for (let op = DX7Voice.NUM_OPERATORS - 1; op >= 0; op--) {
      const src = op * DX7Voice.UNPACKED_OP_SIZE

      // Copy 21 bytes per operator, skipping bytes 18 and 22 in our format
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_1]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_2]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_3]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_4]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_1]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_2]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_3]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_4]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_BREAK_POINT]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_L_CURVE]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_R_CURVE]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_RATE_SCALING]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_DETUNE]
      // Pack amp mod sensitivity and key velocity sensitivity for VCED
      const ams = unpacked[src + DX7Voice.UNPACKED_OP_AMP_MOD_SENS] & DX7Voice.MASK_2BIT
      const kvs = unpacked[src + DX7Voice.UNPACKED_OP_KEY_VEL_SENS] & DX7Voice.MASK_3BIT
      result[offset++] = ams | (kvs << 2)
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_MODE]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_FREQ_COARSE]
      // VCED has OSC_DETUNE before FREQ_FINE (opposite of unpacked format)
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_OSC_DETUNE]
      result[offset++] = unpacked[src + DX7Voice.UNPACKED_OP_FREQ_FINE]
    }

    // Pitch EG: 8 bytes (Rates 1-4, Levels 1-4)
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1]
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2]
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3]
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4]
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1]
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2]
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3]
    result[offset++] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4]

    // Algorithm and global parameters: 11 bytes
    result[offset++] = unpacked[DX7Voice.UNPACKED_ALGORITHM]
    result[offset++] = unpacked[DX7Voice.UNPACKED_FEEDBACK]
    result[offset++] = unpacked[DX7Voice.UNPACKED_OSC_SYNC]
    result[offset++] = unpacked[DX7Voice.UNPACKED_LFO_SPEED]
    result[offset++] = unpacked[DX7Voice.UNPACKED_LFO_DELAY]
    result[offset++] = unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH]
    result[offset++] = unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH]
    result[offset++] = unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC]
    result[offset++] = unpacked[DX7Voice.UNPACKED_LFO_WAVE]
    result[offset++] = unpacked[DX7Voice.UNPACKED_LFO_PM_SENS]
    result[offset++] = unpacked[DX7Voice.UNPACKED_TRANSPOSE]

    // Voice name: 10 bytes
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      result[offset++] = unpacked[DX7Voice.UNPACKED_NAME_START + i]
    }

    // Calculate checksum on 155 bytes of data
    const dataForChecksum = result.subarray(
      DX7Voice.VCED_HEADER_SIZE,
      DX7Voice.VCED_HEADER_SIZE + DX7Voice.VCED_DATA_SIZE,
    )
    result[offset++] = DX7Bank._calculateChecksum(dataForChecksum, DX7Voice.VCED_DATA_SIZE)

    // SysEx end
    result[offset++] = DX7Voice.VCED_SYSEX_END

    return result
  }

  /**
   * Convert voice to JSON format
   * @returns {object} Voice data in JSON format
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
      const octave = Math.floor(midiNote / 12) + DX7Voice.MIDI_OCTAVE_OFFSET
      const note = notes[midiNote % 12]
      return `${note}${octave}`
    }

    // Extract operator data
    for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
      const opOffset = op * DX7Voice.UNPACKED_OP_SIZE
      const mode = unpacked[opOffset + DX7Voice.UNPACKED_OP_MODE] === 0 ? "RATIO" : "FIXED"

      operators.push({
        id: op + 1,
        osc: {
          detune: unpacked[opOffset + DX7Voice.UNPACKED_OP_OSC_DETUNE],
          freq: {
            coarse: unpacked[opOffset + DX7Voice.UNPACKED_OP_FREQ_COARSE],
            fine: unpacked[opOffset + DX7Voice.UNPACKED_OP_FREQ_FINE],
            mode: mode,
          },
        },
        eg: {
          rates: [
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_1],
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_2],
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_3],
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_RATE_4],
          ],
          levels: [
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_1],
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_2],
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_3],
            unpacked[opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_4],
          ],
        },
        key: {
          velocity: unpacked[opOffset + DX7Voice.UNPACKED_OP_KEY_VEL_SENS],
          scaling: unpacked[opOffset + DX7Voice.UNPACKED_OP_RATE_SCALING],
          breakPoint: getNoteName(
            unpacked[opOffset + DX7Voice.UNPACKED_OP_BREAK_POINT] +
              DX7Voice.MIDI_BREAK_POINT_OFFSET,
          ),
        },
        output: {
          level: unpacked[opOffset + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL],
          ampModSens: unpacked[opOffset + DX7Voice.UNPACKED_OP_AMP_MOD_SENS],
        },
        scale: {
          left: {
            depth: unpacked[opOffset + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH],
            curve: getKeyScaleCurve(unpacked[opOffset + DX7Voice.UNPACKED_OP_L_CURVE]),
          },
          right: {
            depth: unpacked[opOffset + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH],
            curve: getKeyScaleCurve(unpacked[opOffset + DX7Voice.UNPACKED_OP_R_CURVE]),
          },
        },
      })
    }

    return {
      name: this.name || "(Empty)",
      operators: operators,
      pitchEG: {
        rates: [
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1],
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2],
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3],
          unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4],
        ],
        levels: [
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1],
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2],
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3],
          unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4],
        ],
      },
      lfo: {
        speed: unpacked[DX7Voice.UNPACKED_LFO_SPEED],
        delay: unpacked[DX7Voice.UNPACKED_LFO_DELAY],
        pmDepth: unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH],
        amDepth: unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH],
        keySync: unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] === 1,
        wave: getLFOWave(unpacked[DX7Voice.UNPACKED_LFO_WAVE]),
      },
      global: {
        algorithm: unpacked[DX7Voice.UNPACKED_ALGORITHM] + 1,
        feedback: unpacked[DX7Voice.UNPACKED_FEEDBACK],
        oscKeySync: unpacked[DX7Voice.UNPACKED_OSC_SYNC] === 1,
        pitchModSens: unpacked[DX7Voice.UNPACKED_LFO_PM_SENS],
        transpose: unpacked[DX7Voice.UNPACKED_TRANSPOSE] - DX7Voice.TRANSPOSE_CENTER,
      },
    }
  }
}

/**
 * DX7Bank - Represents a DX7 bank loaded from a SYX file
 * Contains 32 voices in the packed 128-byte format
 */
export class DX7Bank {
  // SysEx header
  static SYSEX_START = 0xf0
  static SYSEX_END = 0xf7
  static SYSEX_YAMAHA_ID = 0x43
  static SYSEX_SUB_STATUS = 0x00
  static SYSEX_FORMAT_32_VOICES = 0x09
  static SYSEX_BYTE_COUNT_MSB = 0x20
  static SYSEX_BYTE_COUNT_LSB = 0x00
  static SYSEX_HEADER = [
    DX7Bank.SYSEX_START,
    DX7Bank.SYSEX_YAMAHA_ID,
    DX7Bank.SYSEX_SUB_STATUS,
    DX7Bank.SYSEX_FORMAT_32_VOICES,
    DX7Bank.SYSEX_BYTE_COUNT_MSB,
    DX7Bank.SYSEX_BYTE_COUNT_LSB,
  ]
  static SYSEX_HEADER_SIZE = 6

  // Bank structure
  static VOICE_DATA_SIZE = 4096 // 32 voices × 128 bytes
  static SYSEX_SIZE = 4104 // Header(6) + Data(4096) + Checksum(1) + End(1)
  static VOICE_SIZE = 128 // Bytes per voice in packed format
  static NUM_VOICES = 32

  // Checksum
  static CHECKSUM_MODULO = 128
  static MASK_7BIT = 0x7f

  /**
   * Create a DX7Bank
   * @param {Array<number>|ArrayBuffer|Uint8Array} data - Bank SYX data (optional)
   * @param {string} name - Optional bank name (e.g., filename)
   */
  constructor(data, name = "") {
    this.voices = new Array(DX7Bank.NUM_VOICES)
    this.name = name

    if (data) {
      // Load existing data
      this._load(data)
    } else {
      // Create empty bank with default voices
      for (let i = 0; i < DX7Bank.NUM_VOICES; i++) {
        this.voices[i] = DX7Voice.createDefault(i)
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
    return (DX7Bank.CHECKSUM_MODULO - (sum % DX7Bank.CHECKSUM_MODULO)) & DX7Bank.MASK_7BIT
  }

  /**
   * Load and validate bank data
   * @private
   * @param {Array<number>|ArrayBuffer|Uint8Array} data
   */
  _load(data) {
    // Convert to Uint8Array if needed
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

    // Check if we have raw voice data or full SysEx
    let voiceData
    let offset = 0

    // Remove SysEx wrapper if present
    if (bytes[0] === DX7Bank.SYSEX_START) {
      // Verify header
      const header = bytes.subarray(0, DX7Bank.SYSEX_HEADER_SIZE)
      const expectedHeader = DX7Bank.SYSEX_HEADER

      for (let i = 0; i < DX7Bank.SYSEX_HEADER_SIZE; i++) {
        if (header[i] !== expectedHeader[i]) {
          throw new DX7ParseError(
            `Invalid SysEx header at position ${i}: expected ${expectedHeader[i].toString(16)}, got ${header[i].toString(16)}`,
            "header",
            i,
          )
        }
      }

      // Extract voice data (skip header and footer)
      voiceData = bytes.subarray(
        DX7Bank.SYSEX_HEADER_SIZE,
        DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE,
      )
      offset = DX7Bank.SYSEX_HEADER_SIZE
    } else if (bytes.length === DX7Bank.VOICE_DATA_SIZE) {
      // Raw voice data, no SysEx wrapper
      voiceData = bytes
    } else {
      throw new DX7ValidationError(
        `Invalid data length: expected ${DX7Bank.VOICE_DATA_SIZE} or ${DX7Bank.SYSEX_SIZE} bytes, got ${bytes.length}`,
        "length",
        bytes.length,
      )
    }

    // Verify total size
    if (voiceData.length !== DX7Bank.VOICE_DATA_SIZE) {
      throw new DX7ValidationError(
        `Invalid voice data length: expected ${DX7Bank.VOICE_DATA_SIZE} bytes, got ${voiceData.length}`,
        "length",
        voiceData.length,
      )
    }

    // Validate checksum if we have SysEx wrapper
    const checksumOffset = DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE
    if (offset > 0 && bytes.length >= checksumOffset + 1) {
      const checksum = bytes[checksumOffset]
      const calculatedChecksum = DX7Bank._calculateChecksum(voiceData, DX7Bank.VOICE_DATA_SIZE)

      if (checksum !== calculatedChecksum) {
        console.warn(
          `DX7 checksum mismatch (expected ${calculatedChecksum.toString(16)}, got ${checksum.toString(16)}). ` +
            `This is common with vintage SysEx files and the data is likely still valid.`,
        )
      }
    }

    // Extract voices
    this.voices = new Array(DX7Bank.NUM_VOICES)
    for (let i = 0; i < DX7Bank.NUM_VOICES; i++) {
      const voiceStart = i * DX7Bank.VOICE_SIZE
      const singleVoiceData = voiceData.subarray(voiceStart, voiceStart + DX7Bank.VOICE_SIZE)
      this.voices[i] = new DX7Voice(singleVoiceData, i)
    }
  }

  /**
   * Replace a voice at the specified index
   * @param {number} index - Voice index (0-31)
   * @param {DX7Voice} voice - Voice to insert
   * @throws {DX7ValidationError} If index is out of range
   */
  replaceVoice(index, voice) {
    if (index < 0 || index >= DX7Bank.NUM_VOICES) {
      throw new DX7ValidationError(`Invalid voice index: ${index}`, "index", index)
    }

    // Create a copy of the voice with the correct index
    const voiceData = new Uint8Array(voice.data)
    this.voices[index] = new DX7Voice(voiceData, index)
  }

  /**
   * Add a voice to the first empty slot
   * @param {DX7Voice} voice - Voice to add
   * @returns {number} Index where voice was added, or -1 if bank is full
   */
  addVoice(voice) {
    for (let i = 0; i < this.voices.length; i++) {
      const currentPatch = this.voices[i]
      // Check if slot is empty (all zeros or default voice)
      const isEmpty = currentPatch.name === "" || currentPatch.name === "Init Voice"
      if (isEmpty) {
        this.replaceVoice(i, voice)
        return i
      }
    }
    return -1
  }

  /**
   * Get all voices in the bank
   * @returns {DX7Voice[]}
   */
  getVoices() {
    return this.voices
  }

  /**
   * Get a specific voice by index
   * @param {number} index - Voice index (0-31)
   * @returns {DX7Voice|null}
   */
  getVoice(index) {
    if (index < 0 || index >= this.voices.length) {
      return null
    }
    return this.voices[index]
  }

  /**
   * Get all voice names
   * @returns {string[]}
   */
  getVoiceNames() {
    return this.voices.map((voice) => voice.name)
  }

  /**
   * Find a voice by name (case-insensitive, partial match)
   * @param {string} name - Voice name to search for
   * @returns {DX7Voice|null}
   */
  findVoiceByName(name) {
    const lowerName = name.toLowerCase()
    return this.voices.find((voice) => voice.name.toLowerCase().includes(lowerName)) || null
  }

  /**
   * Load a DX7 bank from a file
   * @param {File|Blob} file - SYX file to load
   * @returns {Promise<DX7Bank>}
   * @throws {DX7ParseError} If file is a single voice file
   * @throws {DX7ValidationError} If data is not valid DX7 SYX format
   * @throws {Error} If file cannot be read (FileReader error)
   */
  static async fromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const fileName = file.name || ""
          const bytes = new Uint8Array(e.target.result)

          // Check if it's a single voice file (VCED format)
          // Single voice files have format byte 0x00, banks have 0x09
          if (bytes[0] === DX7Bank.SYSEX_START && bytes[3] === DX7Voice.VCED_FORMAT_SINGLE) {
            // This is a single voice file - DX7Bank is for banks only
            reject(
              new DX7ParseError(
                "This is a single voice file. Use DX7Voice.fromFile() instead.",
                "format",
                3,
              ),
            )
          } else {
            // This is a bank file - strip file extension from name
            const bankName = fileName.replace(/\.[^/.]+$/, "")
            const bank = new DX7Bank(e.target.result, bankName)
            resolve(bank)
          }
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Export bank to SysEx format
   * @returns {Uint8Array} Full SysEx data (4104 bytes)
   */
  toSysEx() {
    const result = new Uint8Array(DX7Bank.SYSEX_SIZE)
    let offset = 0

    // Header
    DX7Bank.SYSEX_HEADER.forEach((byte) => {
      result[offset++] = byte
    })

    // Voice data (all voices)
    for (const voice of this.voices) {
      for (let i = 0; i < DX7Bank.VOICE_SIZE; i++) {
        result[offset++] = voice.data[i]
      }
    }

    // Checksum
    const voiceData = result.subarray(
      DX7Bank.SYSEX_HEADER_SIZE,
      DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE,
    )
    result[offset++] = DX7Bank._calculateChecksum(voiceData, DX7Bank.VOICE_DATA_SIZE)

    // SysEx end
    result[offset++] = DX7Bank.SYSEX_END

    return result
  }

  /**
   * Convert bank to JSON format
   * @returns {object} Bank data in JSON format
   */
  toJSON() {
    const voices = this.voices.map((voice, index) => {
      const jsonPatch = voice.toJSON()
      // Voice indices are 0-based internally, but show as 1-32 to users
      return {
        index: index + 1,
        ...jsonPatch,
      }
    })

    return {
      version: "1.0",
      name: this.name || "",
      voices: voices,
    }
  }
}
