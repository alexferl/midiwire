import { DX7ParseError, DX7ValidationError } from "../../core/errors.js"
import { DX7Voice } from "./DX7Voice.js"

/**
 * Represents a DX7 bank (collection of 32 voices) loaded from a SYX file.
 * DX7 banks contain 32 voices in a packed 128-byte format with a 6-byte SysEx header,
 * 4096 bytes of voice data, 1 byte checksum, and 0xF7 trailer. Provides methods for
 * loading from files, converting to/from SysEx format, and manipulating voices.
 *
 * @example
 * // Load from file
 * const fileInput = document.getElementById("file-input");
 * fileInput.addEventListener("change", async (e) => {
 *   const file = e.target.files[0];
 *   const bank = await DX7Bank.fromFile(file);
 *   console.log(bank.getVoiceNames());
 * });
 *
 * @example
 * // Create from SysEx data
 * const syxData = new Uint8Array([0xF0, 0x43, 0x00, 0x09, 0x20, 0x00, 0xF7]);
 * const bank = DX7Bank.fromSysEx(syxData, "My Bank");
 *
 * @example
 * // Manipulate voices
 * const bank = new DX7Bank();
 * const voice = DX7Voice.fromName("BASS 1");
 * bank.replaceVoice(0, voice); // Replace first voice
 * console.log(bank.getVoice(0).name); // "BASS 1"
 *
 * @example
 * // Export to SysEx
 * const bank = await DX7Bank.fromFile(file);
 * const syxData = bank.toSysEx();
 * download(syxData, "my-bank.syx");
 *
 * @example
 * // Convert to JSON for storage
 * const bank = await DX7Bank.fromFile(file);
 * const json = bank.toJSON();
 * localStorage.setItem("dx7-bank", JSON.stringify(json));
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
   * Create a DX7Bank instance. Can be initialized with SYX data or created empty.
   * When data is provided, it's validated and parsed. When no data is provided,
   * the bank is initialized with 32 default "Init Voice" patches.
   *
   * @param {Array<number>|ArrayBuffer|Uint8Array} [data] - Bank SYX data (4104 bytes with SysEx wrapper or 4096 bytes raw)
   * @param {string} [name=""] - Optional bank name (e.g., filename without extension)
   * @returns {DX7Bank}
   *
   * @example
   * // Create empty bank with default voices
   * const bank = new DX7Bank();
   * console.log(bank.getVoiceNames()); // ["Init Voice", "Init Voice", ...]
   *
   * @example
   * // Create from SysEx data
   * const syxData = new Uint8Array([0xF0, 0x43, 0x00, 0x09, 0x20, 0x00, 0xF7]);
   * const bank = new DX7Bank(syxData, "My Bank");
   *
   * @example
   * // Create from raw voice data (no SysEx wrapper)
   * const voiceData = new Uint8Array(4096); // 32 voices × 128 bytes
   * const bank = new DX7Bank(voiceData, "Raw Bank");
   */
  constructor(data, name = "") {
    this.voices = new Array(DX7Bank.NUM_VOICES)
    this.name = name

    if (data) {
      this._load(data)
    } else {
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
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

    // Check if we have raw voice data or full SysEx
    let voiceData
    let offset = 0

    // Remove SysEx wrapper if present
    if (bytes[0] === DX7Bank.SYSEX_START) {
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
      voiceData = bytes.subarray(DX7Bank.SYSEX_HEADER_SIZE, DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE)
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

    if (voiceData.length !== DX7Bank.VOICE_DATA_SIZE) {
      throw new DX7ValidationError(
        `Invalid voice data length: expected ${DX7Bank.VOICE_DATA_SIZE} bytes, got ${voiceData.length}`,
        "length",
        voiceData.length,
      )
    }

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

    this.voices = new Array(DX7Bank.NUM_VOICES)
    for (let i = 0; i < DX7Bank.NUM_VOICES; i++) {
      const voiceStart = i * DX7Bank.VOICE_SIZE
      const singleVoiceData = voiceData.subarray(voiceStart, voiceStart + DX7Bank.VOICE_SIZE)
      this.voices[i] = new DX7Voice(singleVoiceData, i)
    }
  }

  /**
   * Replace a voice at the specified index (0-31). Validates the index and creates a copy
   * of the voice data to ensure the bank maintains its own independent copy.
   *
   * @param {number} index - Voice index (0-31)
   * @param {DX7Voice} voice - Voice to insert
   * @returns {void}
   * @throws {DX7ValidationError} If index is out of range (0-31)
   *
   * @example
   * // Replace first voice with a custom voice
   * const bank = await DX7Bank.fromFile(file);
   * const customVoice = DX7Voice.fromName("LEAD 1");
   * bank.replaceVoice(0, customVoice);
   * console.log(bank.getVoice(0).name); // "LEAD 1"
   *
   * @example
   * // Swap voices between banks
   * const bank1 = await DX7Bank.fromFile(file1);
   * const bank2 = await DX7Bank.fromFile(file2);
   * const voiceFromBank2 = bank2.getVoice(5);
   * bank1.replaceVoice(0, voiceFromBank2); // Copy voice from bank2 to bank1
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
            // This is a single voice file
            reject(new DX7ParseError("This is a single voice file. Use DX7Voice.fromFile() instead.", "format", 3))
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
   * Create a DX7Bank from SysEx data
   * @param {Array<number>|ArrayBuffer|Uint8Array} data - SysEx data (4104 bytes with header/footer) or raw voice data (4096 bytes)
   * @param {string} name - Optional bank name
   * @returns {DX7Bank}
   * @throws {DX7ParseError} If SysEx header is invalid
   * @throws {DX7ValidationError} If data length is invalid
   */
  static fromSysEx(data, name = "") {
    return new DX7Bank(data, name)
  }

  /**
   * Create a DX7Bank from a JSON object
   * @param {DX7BankJSON} json - JSON representation of a DX7 bank
   * @returns {DX7Bank}
   * @throws {DX7ValidationError} If JSON structure is invalid
   */
  static fromJSON(json) {
    if (!json || typeof json !== "object") {
      throw new DX7ValidationError("Invalid JSON: expected object", "json", json)
    }

    const bank = new DX7Bank()

    bank.name = json.name || ""

    if (!Array.isArray(json.voices)) {
      throw new DX7ValidationError("Invalid voices array", "voices", json.voices)
    }

    if (json.voices.length !== DX7Bank.NUM_VOICES) {
      console.warn(
        `Bank JSON has ${json.voices.length} voices, expected ${DX7Bank.NUM_VOICES}. Missing voices will be filled with defaults.`,
      )
    }

    const numVoices = Math.min(json.voices.length, DX7Bank.NUM_VOICES)
    for (let i = 0; i < numVoices; i++) {
      const voiceData = json.voices[i]
      if (!voiceData || typeof voiceData !== "object") {
        console.warn(`Invalid voice data at index ${i}, using default voice`)
        continue
      }

      try {
        // Remove index field if it exists (it's added for display but not needed for reconstruction)
        const { index, ...voiceJson } = voiceData
        const voice = DX7Voice.fromJSON(voiceJson, i)
        bank.replaceVoice(i, voice)
      } catch (err) {
        console.warn(`Failed to load voice at index ${i}: ${err.message}, using default voice`)
      }
    }

    return bank
  }

  /**
   * Export bank to SysEx format
   * @returns {Uint8Array} Full SysEx data (4104 bytes)
   */
  toSysEx() {
    const result = new Uint8Array(DX7Bank.SYSEX_SIZE)
    let offset = 0

    DX7Bank.SYSEX_HEADER.forEach((byte) => {
      result[offset++] = byte
    })

    for (const voice of this.voices) {
      for (let i = 0; i < DX7Bank.VOICE_SIZE; i++) {
        result[offset++] = voice.data[i]
      }
    }

    const voiceData = result.subarray(DX7Bank.SYSEX_HEADER_SIZE, DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE)
    result[offset++] = DX7Bank._calculateChecksum(voiceData, DX7Bank.VOICE_DATA_SIZE)

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
      // Voice indices are 0-based internally, but shown as 1-32 to users
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
