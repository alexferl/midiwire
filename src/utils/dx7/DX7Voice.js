/**
 * DX7 Bank loader for parsing Yamaha DX7 SYX files
 *
 * Based on Dexed implementation by Pascal Gauthier
 * @see https://github.com/asb2m10/dexed
 */

import { DX7ParseError, DX7ValidationError } from "../../core/errors.js"
import { DX7Bank } from "./DX7Bank.js"

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
    this._unpackedCache = null
  }

  /**
   * Extract the voice name from the data (10 characters at offset 118)
   * @private
   */
  _extractName() {
    const nameBytes = this.data.subarray(DX7Voice.PACKED_NAME_START, DX7Voice.PACKED_NAME_START + DX7Voice.NAME_LENGTH)
    const normalized = Array.from(nameBytes).map((byte) => {
      let c = byte & DX7Voice.MASK_7BIT
      // Dexed special character mappings
      if (c === DX7Voice.CHAR_YEN) c = DX7Voice.CHAR_REPLACEMENT_Y
      if (c === DX7Voice.CHAR_ARROW_RIGHT) c = DX7Voice.CHAR_REPLACEMENT_GT
      if (c === DX7Voice.CHAR_ARROW_LEFT) c = DX7Voice.CHAR_REPLACEMENT_LT
      if (c < DX7Voice.CHAR_MIN_PRINTABLE || c > DX7Voice.CHAR_MAX_PRINTABLE) c = DX7Voice.CHAR_SPACE
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

    if (!this._unpackedCache) {
      this._unpackedCache = this.unpack()
    }

    return this._unpackedCache[offset] & DX7Voice.MASK_7BIT
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
    this._unpackedCache = null

    // Update name if name bytes changed
    if (offset >= DX7Voice.PACKED_NAME_START && offset < DX7Voice.PACKED_NAME_START + DX7Voice.NAME_LENGTH) {
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

    this._unpackOperators(packed, unpacked)
    this._unpackPitchEG(packed, unpacked)
    this._unpackGlobalParams(packed, unpacked)
    this._unpackName(packed, unpacked)

    return unpacked
  }

  /**
   * Unpack all 6 operators from packed to unpacked format
   * @private
   */
  _unpackOperators(packed, unpacked) {
    for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
      // DX7 stores operators in reverse: OP1 at end, OP6 at start
      const src = (DX7Voice.NUM_OPERATORS - 1 - op) * DX7Voice.PACKED_OP_SIZE
      const dst = op * DX7Voice.UNPACKED_OP_SIZE

      this._unpackOperator(packed, unpacked, src, dst)
    }
  }

  /**
   * Unpack a single operator's parameters
   * @private
   */
  _unpackOperator(packed, unpacked, src, dst) {
    this._unpackOperatorEG(packed, unpacked, src, dst)
    this._unpackOperatorScaling(packed, unpacked, src, dst)
    this._unpackOperatorPackedParams(packed, unpacked, src, dst)
    this._unpackOperatorFrequency(packed, unpacked, src, dst)
  }

  /**
   * Unpack operator EG rates and levels
   * @private
   */
  _unpackOperatorEG(packed, unpacked, src, dst) {
    // EG rates (4 bytes)
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_1] = packed[src + DX7Voice.PACKED_OP_EG_RATE_1] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_2] = packed[src + DX7Voice.PACKED_OP_EG_RATE_2] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_3] = packed[src + DX7Voice.PACKED_OP_EG_RATE_3] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_RATE_4] = packed[src + DX7Voice.PACKED_OP_EG_RATE_4] & DX7Voice.MASK_7BIT

    // EG levels (4 bytes)
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_1] = packed[src + DX7Voice.PACKED_OP_EG_LEVEL_1] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_2] = packed[src + DX7Voice.PACKED_OP_EG_LEVEL_2] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_3] = packed[src + DX7Voice.PACKED_OP_EG_LEVEL_3] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_EG_LEVEL_4] = packed[src + DX7Voice.PACKED_OP_EG_LEVEL_4] & DX7Voice.MASK_7BIT
  }

  /**
   * Unpack operator keyboard scaling parameters
   * @private
   */
  _unpackOperatorScaling(packed, unpacked, src, dst) {
    unpacked[dst + DX7Voice.UNPACKED_OP_BREAK_POINT] = packed[src + DX7Voice.PACKED_OP_BREAK_POINT] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH] =
      packed[src + DX7Voice.PACKED_OP_L_SCALE_DEPTH] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH] =
      packed[src + DX7Voice.PACKED_OP_R_SCALE_DEPTH] & DX7Voice.MASK_7BIT
  }

  /**
   * Unpack operator bit-packed parameters (curves, rate scaling, mod sens)
   * @private
   */
  _unpackOperatorPackedParams(packed, unpacked, src, dst) {
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
  }

  /**
   * Unpack operator frequency parameters
   * @private
   */
  _unpackOperatorFrequency(packed, unpacked, src, dst) {
    // Mode and frequency (bits 0 = MODE, bits 1-5 = FREQ)
    const modeFreq = packed[src + DX7Voice.PACKED_OP_MODE_FREQ] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_MODE] = modeFreq & DX7Voice.MASK_1BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_FREQ_COARSE] = (modeFreq >> 1) & DX7Voice.MASK_5BIT

    // OSC detune and frequency fine (bits 0-2 = OSC DET, bits 3-6 = FREQ FINE)
    const detuneFine = packed[src + DX7Voice.PACKED_OP_DETUNE_FINE] & DX7Voice.MASK_7BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_OSC_DETUNE] = detuneFine & DX7Voice.MASK_3BIT
    unpacked[dst + DX7Voice.UNPACKED_OP_FREQ_FINE] = (detuneFine >> 3) & DX7Voice.MASK_4BIT
  }

  /**
   * Unpack pitch envelope generator parameters
   * @private
   */
  _unpackPitchEG(packed, unpacked) {
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1] = packed[DX7Voice.PACKED_PITCH_EG_RATE_1] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2] = packed[DX7Voice.PACKED_PITCH_EG_RATE_2] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3] = packed[DX7Voice.PACKED_PITCH_EG_RATE_3] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4] = packed[DX7Voice.PACKED_PITCH_EG_RATE_4] & DX7Voice.MASK_7BIT

    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1] = packed[DX7Voice.PACKED_PITCH_EG_LEVEL_1] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2] = packed[DX7Voice.PACKED_PITCH_EG_LEVEL_2] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3] = packed[DX7Voice.PACKED_PITCH_EG_LEVEL_3] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4] = packed[DX7Voice.PACKED_PITCH_EG_LEVEL_4] & DX7Voice.MASK_7BIT
  }

  /**
   * Unpack global voice parameters (algorithm, feedback, LFO, etc.)
   * @private
   */
  _unpackGlobalParams(packed, unpacked) {
    unpacked[DX7Voice.UNPACKED_ALGORITHM] = packed[DX7Voice.OFFSET_ALGORITHM] & DX7Voice.MASK_5BIT

    // Feedback and OSC Sync combined (bits 0-2 = Feedback, bit 3 = OSC Sync)
    const feedbackOscSync = packed[DX7Voice.OFFSET_FEEDBACK] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_FEEDBACK] = feedbackOscSync & DX7Voice.MASK_3BIT
    unpacked[DX7Voice.UNPACKED_OSC_SYNC] = (feedbackOscSync >> 3) & DX7Voice.MASK_1BIT

    unpacked[DX7Voice.UNPACKED_LFO_SPEED] = packed[DX7Voice.OFFSET_LFO_SPEED] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_DELAY] = packed[DX7Voice.OFFSET_LFO_DELAY] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH] = packed[DX7Voice.OFFSET_LFO_PM_DEPTH] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH] = packed[DX7Voice.OFFSET_LFO_AM_DEPTH] & DX7Voice.MASK_7BIT

    // LFO Key Sync, Wave, Pitch Mod Sensitivity packed
    const lfoParams = packed[DX7Voice.OFFSET_LFO_SYNC_WAVE] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] = lfoParams & DX7Voice.MASK_1BIT
    unpacked[DX7Voice.UNPACKED_LFO_WAVE] = (lfoParams >> 1) & DX7Voice.MASK_3BIT
    unpacked[DX7Voice.UNPACKED_LFO_PM_SENS] = (lfoParams >> 4) & DX7Voice.MASK_3BIT

    unpacked[DX7Voice.UNPACKED_AMP_MOD_SENS] = packed[DX7Voice.OFFSET_AMP_MOD_SENS] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_TRANSPOSE] = packed[DX7Voice.OFFSET_TRANSPOSE] & DX7Voice.MASK_7BIT
    unpacked[DX7Voice.UNPACKED_EG_BIAS_SENS] = packed[DX7Voice.OFFSET_EG_BIAS_SENS] & DX7Voice.MASK_7BIT
  }

  /**
   * Copy voice name from packed to unpacked format
   * @private
   */
  _unpackName(packed, unpacked) {
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      unpacked[DX7Voice.UNPACKED_NAME_START + i] = packed[DX7Voice.PACKED_NAME_START + i] & DX7Voice.MASK_7BIT
    }
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

    DX7Voice._packOperators(unpacked, packed)
    DX7Voice._packPitchEG(unpacked, packed)
    DX7Voice._packGlobalParams(unpacked, packed)
    DX7Voice._packName(unpacked, packed)

    return packed
  }

  /**
   * Pack all 6 operators from unpacked to packed format
   * @private
   */
  static _packOperators(unpacked, packed) {
    for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
      // DX7 stores operators in reverse: OP1 goes to packed[85-101], OP6 to packed[0-16]
      const src = op * DX7Voice.UNPACKED_OP_SIZE
      const dst = (DX7Voice.NUM_OPERATORS - 1 - op) * DX7Voice.PACKED_OP_SIZE

      DX7Voice._packOperator(unpacked, packed, src, dst)
    }
  }

  /**
   * Pack a single operator's parameters
   * @private
   */
  static _packOperator(unpacked, packed, src, dst) {
    DX7Voice._packOperatorEG(unpacked, packed, src, dst)
    DX7Voice._packOperatorScaling(unpacked, packed, src, dst)
    DX7Voice._packOperatorPackedParams(unpacked, packed, src, dst)
    DX7Voice._packOperatorFrequency(unpacked, packed, src, dst)
  }

  /**
   * Pack operator EG rates and levels
   * @private
   */
  static _packOperatorEG(unpacked, packed, src, dst) {
    // EG rates (4 bytes)
    packed[dst + DX7Voice.PACKED_OP_EG_RATE_1] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_1]
    packed[dst + DX7Voice.PACKED_OP_EG_RATE_2] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_2]
    packed[dst + DX7Voice.PACKED_OP_EG_RATE_3] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_3]
    packed[dst + DX7Voice.PACKED_OP_EG_RATE_4] = unpacked[src + DX7Voice.UNPACKED_OP_EG_RATE_4]

    // EG levels (4 bytes)
    packed[dst + DX7Voice.PACKED_OP_EG_LEVEL_1] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_1]
    packed[dst + DX7Voice.PACKED_OP_EG_LEVEL_2] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_2]
    packed[dst + DX7Voice.PACKED_OP_EG_LEVEL_3] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_3]
    packed[dst + DX7Voice.PACKED_OP_EG_LEVEL_4] = unpacked[src + DX7Voice.UNPACKED_OP_EG_LEVEL_4]
  }

  /**
   * Pack operator keyboard scaling parameters
   * @private
   */
  static _packOperatorScaling(unpacked, packed, src, dst) {
    packed[dst + DX7Voice.PACKED_OP_BREAK_POINT] = unpacked[src + DX7Voice.UNPACKED_OP_BREAK_POINT]
    packed[dst + DX7Voice.PACKED_OP_L_SCALE_DEPTH] = unpacked[src + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH]
    packed[dst + DX7Voice.PACKED_OP_R_SCALE_DEPTH] = unpacked[src + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH]
  }

  /**
   * Pack operator bit-packed parameters
   * @private
   */
  static _packOperatorPackedParams(unpacked, packed, src, dst) {
    // Combine key scales (LC and RC)
    const lc = unpacked[src + DX7Voice.UNPACKED_OP_L_CURVE] & DX7Voice.MASK_2BIT
    const rc = unpacked[src + DX7Voice.UNPACKED_OP_R_CURVE] & DX7Voice.MASK_2BIT
    packed[dst + DX7Voice.PACKED_OP_CURVES] = lc | (rc << 2)

    // Combine rate scaling and detune
    const rs = unpacked[src + DX7Voice.UNPACKED_OP_RATE_SCALING] & DX7Voice.MASK_3BIT
    const det = unpacked[src + DX7Voice.UNPACKED_OP_DETUNE] & DX7Voice.MASK_4BIT
    packed[dst + DX7Voice.PACKED_OP_RATE_SCALING] = rs | (det << 3)

    // Combine amp mod sensitivity and key velocity sensitivity
    const ams = unpacked[src + DX7Voice.UNPACKED_OP_AMP_MOD_SENS] & DX7Voice.MASK_2BIT
    const kvs = unpacked[src + DX7Voice.UNPACKED_OP_KEY_VEL_SENS] & DX7Voice.MASK_3BIT
    packed[dst + DX7Voice.PACKED_OP_MOD_SENS] = ams | (kvs << 2)

    // Output level
    packed[dst + DX7Voice.PACKED_OP_OUTPUT_LEVEL] = unpacked[src + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL]
  }

  /**
   * Pack operator frequency parameters
   * @private
   */
  static _packOperatorFrequency(unpacked, packed, src, dst) {
    // Combine mode and frequency
    const mode = unpacked[src + DX7Voice.UNPACKED_OP_MODE] & DX7Voice.MASK_1BIT
    const freq = unpacked[src + DX7Voice.UNPACKED_OP_FREQ_COARSE] & DX7Voice.MASK_5BIT
    packed[dst + DX7Voice.PACKED_OP_MODE_FREQ] = mode | (freq << 1)

    // Combine OSC detune and frequency fine
    const oscDetune = unpacked[src + DX7Voice.UNPACKED_OP_OSC_DETUNE] & DX7Voice.MASK_3BIT
    const freqFine = unpacked[src + DX7Voice.UNPACKED_OP_FREQ_FINE] & DX7Voice.MASK_4BIT
    packed[dst + DX7Voice.PACKED_OP_DETUNE_FINE] = oscDetune | (freqFine << 3)
  }

  /**
   * Pack pitch envelope generator parameters
   * @private
   */
  static _packPitchEG(unpacked, packed) {
    packed[DX7Voice.PACKED_PITCH_EG_RATE_1] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_1]
    packed[DX7Voice.PACKED_PITCH_EG_RATE_2] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_2]
    packed[DX7Voice.PACKED_PITCH_EG_RATE_3] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_3]
    packed[DX7Voice.PACKED_PITCH_EG_RATE_4] = unpacked[DX7Voice.UNPACKED_PITCH_EG_RATE_4]

    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_1] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_1]
    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_2] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_2]
    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_3] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_3]
    packed[DX7Voice.PACKED_PITCH_EG_LEVEL_4] = unpacked[DX7Voice.UNPACKED_PITCH_EG_LEVEL_4]
  }

  /**
   * Pack global voice parameters (algorithm, feedback, LFO, etc.)
   * @private
   */
  static _packGlobalParams(unpacked, packed) {
    packed[DX7Voice.OFFSET_ALGORITHM] = unpacked[DX7Voice.UNPACKED_ALGORITHM]

    // Combine feedback and OSC Sync
    const feedback = unpacked[DX7Voice.UNPACKED_FEEDBACK] & DX7Voice.MASK_3BIT
    const oscSync = unpacked[DX7Voice.UNPACKED_OSC_SYNC] & DX7Voice.MASK_1BIT
    packed[DX7Voice.OFFSET_FEEDBACK] = feedback | (oscSync << 3)

    packed[DX7Voice.OFFSET_LFO_SPEED] = unpacked[DX7Voice.UNPACKED_LFO_SPEED]
    packed[DX7Voice.OFFSET_LFO_DELAY] = unpacked[DX7Voice.UNPACKED_LFO_DELAY]
    packed[DX7Voice.OFFSET_LFO_PM_DEPTH] = unpacked[DX7Voice.UNPACKED_LFO_PM_DEPTH]
    packed[DX7Voice.OFFSET_LFO_AM_DEPTH] = unpacked[DX7Voice.UNPACKED_LFO_AM_DEPTH]

    // Combine LFO Key Sync, Wave, Pitch Mod Sensitivity
    const lfoKeySync = unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] & DX7Voice.MASK_1BIT
    const lfoWave = unpacked[DX7Voice.UNPACKED_LFO_WAVE] & DX7Voice.MASK_3BIT
    const lfoPitchSens = unpacked[DX7Voice.UNPACKED_LFO_PM_SENS] & DX7Voice.MASK_3BIT
    packed[DX7Voice.OFFSET_LFO_SYNC_WAVE] = lfoKeySync | (lfoWave << 1) | (lfoPitchSens << 4)

    packed[DX7Voice.OFFSET_AMP_MOD_SENS] = unpacked[DX7Voice.UNPACKED_AMP_MOD_SENS]
    packed[DX7Voice.OFFSET_TRANSPOSE] = unpacked[DX7Voice.UNPACKED_TRANSPOSE]
    packed[DX7Voice.OFFSET_EG_BIAS_SENS] = unpacked[DX7Voice.UNPACKED_EG_BIAS_SENS]
  }

  /**
   * Copy voice name from unpacked to packed format
   * @private
   */
  static _packName(unpacked, packed) {
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      packed[DX7Voice.PACKED_NAME_START + i] = unpacked[DX7Voice.UNPACKED_NAME_START + i]
    }
  }

  /**
   * Create a default/empty voice
   * @param {number} index - Voice index
   * @returns {DX7Voice}
   */
  static createDefault(index = 0) {
    const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

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
      unpacked[opOffset + DX7Voice.UNPACKED_OP_DETUNE] = 7 // Detune center (actual detune = value - 7)
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

    const name = "Init Voice"
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      unpacked[DX7Voice.UNPACKED_NAME_START + i] = i < name.length ? name.charCodeAt(i) : DX7Voice.CHAR_SPACE
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
   * Create a DX7Voice from SysEx data
   * @param {Array<number>|ArrayBuffer|Uint8Array} data - Voice data (128 bytes of packed voice data) or VCED SysEx data (163 bytes with header/footer)
   * @param {number} index - Voice index (optional, defaults to 0)
   * @returns {DX7Voice}
   * @throws {DX7ParseError} If VCED header is invalid
   * @throws {DX7ValidationError} If data length is invalid
   */
  static fromSysEx(data, index = 0) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

    // Check if we have raw voice data or full VCED SysEx
    let voiceData

    // Remove VCED wrapper if present
    if (bytes[0] === DX7Voice.VCED_SYSEX_START) {
      // Validate VCED header
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

      // Extract voice data (skip header and footer)
      voiceData = bytes.subarray(DX7Voice.VCED_HEADER_SIZE, DX7Voice.VCED_HEADER_SIZE + DX7Voice.VCED_DATA_SIZE)
    } else if (bytes.length === DX7Voice.PACKED_SIZE) {
      // Raw voice data, no SysEx wrapper
      voiceData = bytes
    } else {
      throw new DX7ValidationError(
        `Invalid data length: expected ${DX7Voice.PACKED_SIZE} or ${DX7Voice.VCED_SIZE} bytes, got ${bytes.length}`,
        "length",
        bytes.length,
      )
    }

    // Validate voice data length
    if (voiceData.length !== DX7Voice.VCED_DATA_SIZE && voiceData.length !== DX7Voice.PACKED_SIZE) {
      throw new DX7ValidationError(
        `Invalid voice data length: expected ${DX7Voice.VCED_DATA_SIZE} or ${DX7Voice.PACKED_SIZE} bytes, got ${voiceData.length}`,
        "length",
        voiceData.length,
      )
    }

    // If we have VCED data (155 bytes), convert it to packed format
    if (voiceData.length === DX7Voice.VCED_DATA_SIZE) {
      // Convert VCED to unpacked format first
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
      return new DX7Voice(packed, index)
    }

    // We already have packed data
    return new DX7Voice(voiceData, index)
  }

  /**
   * Create a DX7Voice from a JSON object
   * @param {DX7VoiceJSON} json - JSON representation of a DX7 voice
   * @param {number} index - Voice index (optional, defaults to 0)
   * @returns {DX7Voice}
   * @throws {DX7ValidationError} If JSON structure is invalid
   */
  static fromJSON(json, index = 0) {
    if (!json || typeof json !== "object") {
      throw new DX7ValidationError("Invalid JSON: expected object", "json", json)
    }

    const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

    const setParam = (offset, value, name, min = 0, max = 127) => {
      if (value === undefined || value === null) {
        throw new DX7ValidationError(`Missing required parameter: ${name}`, name, value)
      }
      const numValue = Number(value)
      if (Number.isNaN(numValue)) {
        throw new DX7ValidationError(`Invalid parameter value for ${name}: ${value}`, name, value)
      }
      if (numValue < min || numValue > max) {
        throw new DX7ValidationError(
          `Parameter ${name} out of range: ${numValue} (must be ${min}-${max})`,
          name,
          numValue,
        )
      }
      unpacked[offset] = Math.floor(numValue)
    }

    const getCurveValue = (curveName) => {
      const curves = { "-LN": 0, "-EX": 1, "+EX": 2, "+LN": 3 }
      return curves[curveName] !== undefined ? curves[curveName] : 0
    }

    const getWaveValue = (waveName) => {
      const waves = {
        TRIANGLE: 0,
        "SAW DOWN": 1,
        "SAW UP": 2,
        SQUARE: 3,
        SINE: 4,
        "SAMPLE & HOLD": 5,
      }
      return waves[waveName] !== undefined ? waves[waveName] : 0
    }

    const parseNoteName = (noteName) => {
      if (!noteName || typeof noteName !== "string") return 60 // Default to C3

      const match = noteName.trim().match(/^([A-G]#?)(-?\d+)$/)
      if (!match) return 60

      const [, note, octaveStr] = match
      const octave = parseInt(octaveStr, 10)

      const noteMap = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 }
      const noteValue = noteMap[note.toUpperCase()]
      if (noteValue === undefined) return 60

      return (octave - DX7Voice.MIDI_OCTAVE_OFFSET) * 12 + noteValue
    }

    if (!Array.isArray(json.operators)) {
      throw new DX7ValidationError("Invalid operators array: expected array", "operators", json.operators)
    }

    // Validate each operator's data structure first (before checking length)
    // This ensures we get specific validation errors (e.g., "Invalid EG rates")
    // rather than generic length errors when data is malformed
    for (let op = 0; op < json.operators.length; op++) {
      const opData = json.operators[op]

      if (!opData || typeof opData !== "object") {
        throw new DX7ValidationError(`Invalid operator data at index ${op}`, `operators[${op}]`, opData)
      }

      // EG rates (0-99)
      if (!opData.eg || !Array.isArray(opData.eg.rates) || opData.eg.rates.length !== 4) {
        throw new DX7ValidationError(
          `Invalid EG rates for operator ${op}`,
          `operators[${op}].eg.rates`,
          opData.eg?.rates,
        )
      }

      // EG levels (0-99)
      if (!opData.eg || !Array.isArray(opData.eg.levels) || opData.eg.levels.length !== 4) {
        throw new DX7ValidationError(
          `Invalid EG levels for operator ${op}`,
          `operators[${op}].eg.levels`,
          opData.eg?.levels,
        )
      }
    }

    if (json.operators.length !== DX7Voice.NUM_OPERATORS) {
      throw new DX7ValidationError(
        `Invalid operators array: expected ${DX7Voice.NUM_OPERATORS} operators`,
        "operators",
        json.operators,
      )
    }

    for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
      const opData = json.operators[op]
      const opOffset = op * DX7Voice.UNPACKED_OP_SIZE

      // EG rates (0-99)
      if (!opData.eg || !Array.isArray(opData.eg.rates) || opData.eg.rates.length !== 4) {
        throw new DX7ValidationError(
          `Invalid EG rates for operator ${op}`,
          `operators[${op}].eg.rates`,
          opData.eg?.rates,
        )
      }
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_RATE_1, opData.eg.rates[0], `operators[${op}].eg.rates[0]`, 0, 99)
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_RATE_2, opData.eg.rates[1], `operators[${op}].eg.rates[1]`, 0, 99)
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_RATE_3, opData.eg.rates[2], `operators[${op}].eg.rates[2]`, 0, 99)
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_RATE_4, opData.eg.rates[3], `operators[${op}].eg.rates[3]`, 0, 99)

      // EG levels (0-99)
      if (!opData.eg || !Array.isArray(opData.eg.levels) || opData.eg.levels.length !== 4) {
        throw new DX7ValidationError(
          `Invalid EG levels for operator ${op}`,
          `operators[${op}].eg.levels`,
          opData.eg?.levels,
        )
      }
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_1, opData.eg.levels[0], `operators[${op}].eg.levels[0]`, 0, 99)
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_2, opData.eg.levels[1], `operators[${op}].eg.levels[1]`, 0, 99)
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_3, opData.eg.levels[2], `operators[${op}].eg.levels[2]`, 0, 99)
      setParam(opOffset + DX7Voice.UNPACKED_OP_EG_LEVEL_4, opData.eg.levels[3], `operators[${op}].eg.levels[3]`, 0, 99)

      // Break point (MIDI note number)
      const breakPoint = parseNoteName(opData.key?.breakPoint) - DX7Voice.MIDI_BREAK_POINT_OFFSET
      setParam(opOffset + DX7Voice.UNPACKED_OP_BREAK_POINT, breakPoint, `operators[${op}].key.breakPoint`, 0, 127)

      // Scale depths (0-99)
      setParam(
        opOffset + DX7Voice.UNPACKED_OP_L_SCALE_DEPTH,
        opData.scale?.left?.depth || 0,
        `operators[${op}].scale.left.depth`,
        0,
        99,
      )
      setParam(
        opOffset + DX7Voice.UNPACKED_OP_R_SCALE_DEPTH,
        opData.scale?.right?.depth || 0,
        `operators[${op}].scale.right.depth`,
        0,
        99,
      )

      // Curves
      unpacked[opOffset + DX7Voice.UNPACKED_OP_L_CURVE] = getCurveValue(opData.scale?.left?.curve || "-LN")
      unpacked[opOffset + DX7Voice.UNPACKED_OP_R_CURVE] = getCurveValue(opData.scale?.right?.curve || "-LN")

      // Rate scaling (0-7)
      setParam(
        opOffset + DX7Voice.UNPACKED_OP_RATE_SCALING,
        opData.key?.scaling || 0,
        `operators[${op}].key.scaling`,
        0,
        7,
      )

      // Detune (-7 to +7, stored as 0-14)
      const detune = Number(opData.osc?.detune) || 0
      setParam(opOffset + DX7Voice.UNPACKED_OP_DETUNE, detune + 7, `operators[${op}].osc.detune`, 0, 14)

      // Amp mod sensitivity (0-3)
      setParam(
        opOffset + DX7Voice.UNPACKED_OP_AMP_MOD_SENS,
        opData.output?.ampModSens || 0,
        `operators[${op}].output.ampModSens`,
        0,
        3,
      )

      // Output level (0-99)
      setParam(
        opOffset + DX7Voice.UNPACKED_OP_OUTPUT_LEVEL,
        opData.output?.level || 0,
        `operators[${op}].output.level`,
        0,
        99,
      )

      // Mode and frequency
      const mode = opData.osc?.freq?.mode?.toUpperCase() === "FIXED" ? 1 : 0
      const freqCoarse = Number(opData.osc?.freq?.coarse) || 0
      const freqFine = Number(opData.osc?.freq?.fine) || 0
      unpacked[opOffset + DX7Voice.UNPACKED_OP_MODE] = mode
      setParam(opOffset + DX7Voice.UNPACKED_OP_FREQ_COARSE, freqCoarse, `operators[${op}].osc.freq.coarse`, 0, 31)
      setParam(opOffset + DX7Voice.UNPACKED_OP_FREQ_FINE, freqFine, `operators[${op}].osc.freq.fine`, 0, 15)

      // Key velocity sensitivity (0-7)
      setParam(
        opOffset + DX7Voice.UNPACKED_OP_KEY_VEL_SENS,
        opData.key?.velocity || 0,
        `operators[${op}].key.velocity`,
        0,
        7,
      )
    }

    // Parse pitch EG
    if (!json.pitchEG || !Array.isArray(json.pitchEG.rates) || json.pitchEG.rates.length !== 4) {
      throw new DX7ValidationError("Invalid pitch EG rates", "pitchEG.rates", json.pitchEG?.rates)
    }
    if (!json.pitchEG || !Array.isArray(json.pitchEG.levels) || json.pitchEG.levels.length !== 4) {
      throw new DX7ValidationError("Invalid pitch EG levels", "pitchEG.levels", json.pitchEG?.levels)
    }

    setParam(DX7Voice.UNPACKED_PITCH_EG_RATE_1, json.pitchEG.rates[0], "pitchEG.rates[0]", 0, 99)
    setParam(DX7Voice.UNPACKED_PITCH_EG_RATE_2, json.pitchEG.rates[1], "pitchEG.rates[1]", 0, 99)
    setParam(DX7Voice.UNPACKED_PITCH_EG_RATE_3, json.pitchEG.rates[2], "pitchEG.rates[2]", 0, 99)
    setParam(DX7Voice.UNPACKED_PITCH_EG_RATE_4, json.pitchEG.rates[3], "pitchEG.rates[3]", 0, 99)

    setParam(DX7Voice.UNPACKED_PITCH_EG_LEVEL_1, json.pitchEG.levels[0], "pitchEG.levels[0]", 0, 99)
    setParam(DX7Voice.UNPACKED_PITCH_EG_LEVEL_2, json.pitchEG.levels[1], "pitchEG.levels[1]", 0, 99)
    setParam(DX7Voice.UNPACKED_PITCH_EG_LEVEL_3, json.pitchEG.levels[2], "pitchEG.levels[2]", 0, 99)
    setParam(DX7Voice.UNPACKED_PITCH_EG_LEVEL_4, json.pitchEG.levels[3], "pitchEG.levels[3]", 0, 99)

    // Parse LFO
    if (!json.lfo || typeof json.lfo !== "object") {
      throw new DX7ValidationError("Invalid LFO data", "lfo", json.lfo)
    }

    setParam(DX7Voice.UNPACKED_LFO_SPEED, json.lfo.speed, "lfo.speed", 0, 99)
    setParam(DX7Voice.UNPACKED_LFO_DELAY, json.lfo.delay, "lfo.delay", 0, 99)
    setParam(DX7Voice.UNPACKED_LFO_PM_DEPTH, json.lfo.pmDepth, "lfo.pmDepth", 0, 99)
    setParam(DX7Voice.UNPACKED_LFO_AM_DEPTH, json.lfo.amDepth, "lfo.amDepth", 0, 99)
    unpacked[DX7Voice.UNPACKED_LFO_KEY_SYNC] = json.lfo.keySync ? 1 : 0
    unpacked[DX7Voice.UNPACKED_LFO_WAVE] = getWaveValue(json.lfo.wave)

    // Parse global parameters
    if (!json.global || typeof json.global !== "object") {
      throw new DX7ValidationError("Invalid global data", "global", json.global)
    }

    // Algorithm (0-31 in unpacked, 1-32 in JSON)
    const algorithm = Number(json.global.algorithm) || 1
    setParam(DX7Voice.UNPACKED_ALGORITHM, algorithm - 1, "global.algorithm", 0, 31)

    // Feedback (0-7)
    setParam(DX7Voice.UNPACKED_FEEDBACK, json.global.feedback, "global.feedback", 0, 7)

    // OSC Sync
    unpacked[DX7Voice.UNPACKED_OSC_SYNC] = json.global.oscKeySync ? 1 : 0

    // Pitch Mod Sensitivity
    setParam(DX7Voice.UNPACKED_LFO_PM_SENS, json.global.pitchModSens, "global.pitchModSens", 0, 7)

    // Transpose (-24 to +24 in JSON, 0-127 in unpacked where 24 = C0)
    const transpose = Number(json.global.transpose) || 0
    setParam(DX7Voice.UNPACKED_TRANSPOSE, transpose + DX7Voice.TRANSPOSE_CENTER, "global.transpose", -24, 24)

    // Amp Mod Sensitivity (optional, defaults to 0)
    setParam(DX7Voice.UNPACKED_AMP_MOD_SENS, json.global.ampModSens || 0, "global.ampModSens", 0, 3)

    // EG Bias Sensitivity (default to 0 if not provided)
    setParam(DX7Voice.UNPACKED_EG_BIAS_SENS, json.global.egBiasSens || 0, "global.egBiasSens", 0, 7)

    // Set voice name
    const name = json.name || ""
    for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
      unpacked[DX7Voice.UNPACKED_NAME_START + i] = i < name.length ? name.charCodeAt(i) : DX7Voice.CHAR_SPACE
    }

    return DX7Voice.fromUnpacked(unpacked, index)
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

    const getKeyScaleCurve = (value) => {
      const curves = ["-LN", "-EX", "+EX", "+LN"]
      return curves[value] || "UNKNOWN"
    }

    const getLFOWave = (value) => {
      const waves = ["TRIANGLE", "SAW DOWN", "SAW UP", "SQUARE", "SINE", "SAMPLE & HOLD"]
      return waves[value] || "UNKNOWN"
    }

    const getNoteName = (midiNote) => {
      const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
      const octave = Math.floor(midiNote / 12) + DX7Voice.MIDI_OCTAVE_OFFSET
      const note = notes[midiNote % 12]
      return `${note}${octave}`
    }

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
            unpacked[opOffset + DX7Voice.UNPACKED_OP_BREAK_POINT] + DX7Voice.MIDI_BREAK_POINT_OFFSET,
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
