import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { DX7Bank } from "./DX7Bank.js"
import { DX7Voice } from "./DX7Voice.js"

describe("DX7Voice", () => {
  describe("constructor", () => {
    it("should create a voice from 128 bytes of data", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      const voice = new DX7Voice(data, 5)

      expect(voice.index).toBe(5)
      expect(voice.data.length).toBe(DX7Voice.PACKED_SIZE)
      expect(voice.name).toBe("")
    })

    it("should throw error for invalid data length", () => {
      expect(() => new DX7Voice([1, 2, 3])).toThrow("Invalid voice data length")
      expect(() => new DX7Voice(new Array(DX7Voice.PACKED_SIZE - 1).fill(0))).toThrow("Invalid voice data length")
      expect(() => new DX7Voice(new Array(DX7Voice.PACKED_SIZE + 1).fill(0))).toThrow("Invalid voice data length")
    })

    it("should extract voice name correctly", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      // Set name bytes (offset 118-127) to 'TEST VOICE'
      const name = "TEST VOICE"
      for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
        data[DX7Voice.PACKED_NAME_START + i] = name.charCodeAt(i) || DX7Voice.CHAR_SPACE
      }

      const voice = new DX7Voice(data)
      expect(voice.name).toBe("TEST VOICE")
    })

    it("should normalize DX7 special characters", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      // Set special characters
      data[DX7Voice.PACKED_NAME_START] = DX7Voice.CHAR_YEN
      data[DX7Voice.PACKED_NAME_START + 1] = DX7Voice.CHAR_ARROW_RIGHT
      data[DX7Voice.PACKED_NAME_START + 2] = DX7Voice.CHAR_ARROW_LEFT
      data[121] = DX7Voice.CHAR_SPACE

      const voice = new DX7Voice(data)
      expect(voice.name).toBe("Y><") // Position 121 is space, trim removes trailing spaces
    })
  })

  describe("getParameter and setParameter", () => {
    it("should get and set parameters correctly", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      const voice = new DX7Voice(data)

      // Set parameter at offset 10 to value 64
      voice.setParameter(10, 64)
      expect(voice.getParameter(10)).toBe(64)
    })

    it("should mask values to 7-bit range", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      const voice = new DX7Voice(data)

      voice.setParameter(10, 200) // Should be masked to 72 (200 & DX7Voice.MASK_7BIT)
      expect(voice.getParameter(10)).toBe(72)
    })

    it("should update name when name bytes change", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      const voice = new DX7Voice(data)

      // Set name bytes
      voice.setParameter(DX7Voice.PACKED_NAME_START, "A".charCodeAt(0))
      voice.setParameter(DX7Voice.PACKED_NAME_START + 1, "B".charCodeAt(0))
      voice.setParameter(DX7Voice.PACKED_NAME_START + 2, "C".charCodeAt(0))

      expect(voice.name).toBe("ABC")
    })
  })

  describe("unpacked parameter caching", () => {
    it("should cache unpacked data and invalidate on setParameter", () => {
      const voice = DX7Voice.createDefault()

      // First call populates cache
      voice.getUnpackedParameter(0)
      const cached1 = voice._unpackedCache

      // Second call reuses cache
      voice.getUnpackedParameter(0)
      expect(voice._unpackedCache).toBe(cached1)

      // setParameter invalidates cache
      voice.setParameter(85, 50)
      expect(voice._unpackedCache).toBeNull()

      // Next call repopulates
      voice.getUnpackedParameter(0)
      expect(voice._unpackedCache).not.toBeNull()
    })

    it("should throw error for invalid getParameter offset", () => {
      const voice = DX7Voice.createDefault()

      expect(() => voice.getParameter(-1)).toThrow("Parameter offset out of range")
      expect(() => voice.getParameter(DX7Voice.PACKED_SIZE)).toThrow("Parameter offset out of range")
      expect(() => voice.getParameter(1000)).toThrow("Parameter offset out of range")
    })

    it("should throw error for invalid setParameter offset", () => {
      const voice = DX7Voice.createDefault()

      expect(() => voice.setParameter(-1, 0)).toThrow("Parameter offset out of range")
      expect(() => voice.setParameter(DX7Voice.PACKED_SIZE, 0)).toThrow("Parameter offset out of range")
      expect(() => voice.setParameter(1000, 0)).toThrow("Parameter offset out of range")
    })
  })

  describe("getUnpackedParameter", () => {
    it("should read algorithm from unpacked data", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      // Algorithm is at packed[110], maps to unpacked[146]
      data[DX7Voice.OFFSET_ALGORITHM] = 5 // Algorithm 6 (0-indexed)

      const voice = new DX7Voice(data)
      expect(voice.getUnpackedParameter(DX7Voice.UNPACKED_ALGORITHM)).toBe(5)
    })

    it("should read feedback from unpacked data", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      // Feedback is at packed[111], maps to unpacked[147]
      data[DX7Voice.OFFSET_FEEDBACK] = 7 | 0 // Max feedback, OSC Sync is 0
      // Bit 3 is OSC Sync, bits 0-2 are Feedback

      const voice = new DX7Voice(data)
      expect(voice.getUnpackedParameter(DX7Voice.UNPACKED_FEEDBACK)).toBe(7)
    })

    it("should read LFO speed from unpacked data", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      // LFO Speed is at packed[112], maps to unpacked[149]
      data[DX7Voice.OFFSET_LFO_SPEED] = 50

      const voice = new DX7Voice(data)
      expect(voice.getUnpackedParameter(DX7Voice.UNPACKED_LFO_SPEED)).toBe(50)
    })
  })

  describe("unpack", () => {
    it("should unpack 128-byte data to 165-byte format", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      const voice = new DX7Voice(data)
      const unpacked = voice.unpack()

      expect(unpacked.length).toBe(DX7Voice.UNPACKED_SIZE)
    })

    it("should unpack with correct operator structure", () => {
      const data = new Array(DX7Voice.PACKED_SIZE).fill(0)
      // DX7 stores operators in reverse order: OP6 at packed[0], OP1 at packed[85-101]
      // Set OP1 values at packed[85-101]
      data[85] = 10 // OP1 EG Rate 1 at packed[85]
      data[89] = 20 // OP1 EG Level 1 at packed[89] (85 + 4)
      // Set OP2 EG Rate 4 at packed[71] (packed[68-84] is OP2, EG rates are bytes 0-3)
      data[71] = 30 // OP2 EG Rate 4 at packed[68+3]

      const voice = new DX7Voice(data)
      const unpacked = voice.unpack()

      expect(unpacked[0]).toBe(10) // OP1 EG Rate 1 <- packed[85]
      expect(unpacked[4]).toBe(20) // OP1 EG Level 1 <- packed[89]
      // OP2 EG Rate 1-4: unpacked[23-26] <- packed[68-71]
      expect(unpacked[23]).toBe(data[68]) // OP2 EG Rate 1 <- packed[68]
      expect(unpacked[26]).toBe(30) // OP2 EG Rate 4 <- packed[71]
    })
  })

  describe("pack", () => {
    it("should pack 169-byte data to 128-byte format", () => {
      const unpacked = new Array(DX7Voice.UNPACKED_SIZE).fill(0)
      const packed = DX7Voice.pack(unpacked)

      expect(packed.length).toBe(DX7Voice.PACKED_SIZE)
    })

    it("should throw error for invalid unpacked length", () => {
      expect(() => DX7Voice.pack(new Array(100).fill(0))).toThrow("Invalid unpacked data length")
      expect(() => DX7Voice.pack(new Array(200).fill(0))).toThrow("Invalid unpacked data length")
    })

    it("should pack and unpack correctly", () => {
      const originalData = new Array(DX7Voice.PACKED_SIZE).fill(0)
      originalData[0] = 50
      originalData[10] = 100
      originalData[DX7Voice.OFFSET_ALGORITHM] = 5 // Algorithm 6 (packed[110])

      const voice = new DX7Voice(originalData)
      const unpacked = voice.unpack()
      const repacked = DX7Voice.pack(unpacked)

      expect(repacked.length).toBe(DX7Voice.PACKED_SIZE)
      expect(repacked[0]).toBe(50)
      expect(repacked[10]).toBe(100)
      expect(repacked[DX7Voice.OFFSET_ALGORITHM]).toBe(5) // Algorithm preserved
    })
  })

  describe("fromUnpacked", () => {
    it("should create a voice from unpacked data", () => {
      const unpacked = new Array(DX7Voice.UNPACKED_SIZE).fill(0)
      unpacked[0] = 99 // OP1 EG Rate 1
      unpacked[4] = 50 // OP1 EG Level 1

      const voice = DX7Voice.fromUnpacked(unpacked, 3)

      expect(voice.index).toBe(3)
      expect(voice.data.length).toBe(DX7Voice.PACKED_SIZE)
      // OP1 data goes to packed[85-101] (operators are stored in reverse order)
      expect(voice.getParameter(85)).toBe(99) // OP1 EG Rate 1 at packed[85]
    })
  })

  describe("createDefault", () => {
    it("should create a default voice", () => {
      const voice = DX7Voice.createDefault(7)

      expect(voice.index).toBe(7)
      expect(voice.data.length).toBe(DX7Voice.PACKED_SIZE)
      expect(voice.name).toBe("Init Voice")
    })

    it("should create a valid voice that can be unpacked", () => {
      const voice = DX7Voice.createDefault()
      const unpacked = voice.unpack()

      expect(unpacked.length).toBe(DX7Voice.UNPACKED_SIZE) // 159 parameters + 10 name bytes
      expect(unpacked[0]).toBe(99) // Default EG rate
      // Note: Algorithm position varies based on createDefault implementation
      // The key test is that pack/unpack round-trip works correctly
    })
  })

  describe("fromSysEx", () => {
    it("should create a voice from packed voice data", () => {
      const data = new Uint8Array(DX7Voice.PACKED_SIZE)
      data.fill(0)
      // Set some values to verify they're preserved
      data[0] = 42
      data[85] = 99 // OP1 EG Rate 1

      const voice = DX7Voice.fromSysEx(data, 5)
      expect(voice).toBeInstanceOf(DX7Voice)
      expect(voice.index).toBe(5)
      expect(voice.getParameter(0)).toBe(42)
      expect(voice.getParameter(85)).toBe(99)
    })

    it("should create a voice from VCED SysEx data", () => {
      // Create VCED SysEx data
      const data = new Uint8Array(DX7Voice.VCED_SIZE)
      data[0] = DX7Voice.VCED_SYSEX_START
      data[1] = DX7Voice.VCED_YAMAHA_ID
      data[2] = DX7Voice.VCED_SUB_STATUS
      data[3] = DX7Voice.VCED_FORMAT_SINGLE
      data[4] = DX7Voice.VCED_BYTE_COUNT_MSB
      data[5] = DX7Voice.VCED_BYTE_COUNT_LSB

      // Fill VCED data area (155 bytes)
      const vcedDataStart = 6
      for (let i = 0; i < DX7Voice.VCED_DATA_SIZE; i++) {
        data[vcedDataStart + i] = 0
      }

      // Set some recognizable values in the VCED data
      // VCED stores operators in reverse order: OP6, OP5, OP4, OP3, OP2, OP1
      // OP6 EG Rate 1 at VCED offset 0 -> unpacked OP6 EG Rate 1 at offset 115
      data[vcedDataStart + 0] = 77
      // OP1 EG Rate 1 at VCED offset 105 -> unpacked OP1 EG Rate 1 at offset 0
      data[vcedDataStart + 105] = 88
      // OP3 EG Rate 1 at VCED offset 42 -> unpacked OP4 EG Rate 1 at offset 69
      data[vcedDataStart + 42] = 99
      // Add checksum (last byte before F7)
      const voiceData = data.subarray(6, 161)
      data[161] = DX7Bank._calculateChecksum(voiceData, DX7Voice.VCED_DATA_SIZE)
      data[162] = DX7Voice.VCED_SYSEX_END

      const voice = DX7Voice.fromSysEx(data)
      expect(voice).toBeInstanceOf(DX7Voice)
      // Verify VCED data was converted correctly
      const unpacked = voice.unpack()
      expect(unpacked[115]).toBe(77) // OP6 EG Rate 1
      expect(unpacked[0]).toBe(88) // OP1 EG Rate 1
      expect(unpacked[69]).toBe(99) // OP4 EG Rate 1 (from OP3 in VCED)
    })

    it("should accept optional index parameter", () => {
      const data = new Uint8Array(DX7Voice.PACKED_SIZE).fill(0)
      const voice = DX7Voice.fromSysEx(data, 10)
      expect(voice.index).toBe(10)
    })

    it("should default to index 0 when not provided", () => {
      const data = new Uint8Array(DX7Voice.PACKED_SIZE).fill(0)
      const voice = DX7Voice.fromSysEx(data)
      expect(voice.index).toBe(0)
    })

    it("should throw error for invalid VCED header", () => {
      const data = new Uint8Array(DX7Voice.VCED_SIZE)
      data[0] = 0xf0 // SysEx start
      data[1] = 0x43 // Correct Yamaha ID
      data[2] = 0x00 // Sub-status
      data[3] = 0x01 // Wrong format (should be 0x00 for single voice)
      data[4] = 0x01 // MSB
      data[5] = 0x1b // LSB

      expect(() => DX7Voice.fromSysEx(data)).toThrow("Invalid VCED header")
    })

    it("should throw error for invalid data length", () => {
      expect(() => DX7Voice.fromSysEx(new Uint8Array(100))).toThrow("Invalid data length")
    })

    it("should throw error for invalid data length", () => {
      expect(() => DX7Voice.fromSysEx(new Uint8Array(100))).toThrow("Invalid data length")
      expect(() => DX7Voice.fromSysEx(new Uint8Array(DX7Voice.VCED_SIZE - 1).fill(0))).toThrow("Invalid data length")
    })

    it("should round-trip through toSysEx() and fromSysEx()", () => {
      const original = DX7Voice.createDefault()
      original.setParameter(0, 123)
      original.setParameter(85, 77) // OP1 EG Rate 1
      original.setParameter(89, 88) // OP1 EG Level 1

      // Export to SysEx
      const sysex = original.toSysEx()

      // Import using fromSysEx
      const imported = DX7Voice.fromSysEx(sysex)

      // Verify data matches
      expect(imported.getParameter(0)).toBe(123)
      expect(imported.getParameter(85)).toBe(77)
      expect(imported.getParameter(89)).toBe(88)
    })

    it("should handle real DX7 voice from ROM", () => {
      const fs = require("node:fs")
      const path = require("node:path")

      const fixturesPath = path.join(__dirname, "../../../fixtures/ROM1A.syx")
      const data = fs.readFileSync(fixturesPath)
      const bank = new DX7Bank(data)

      // Get BASS 1 voice
      const bass1original = bank.getVoice(14)

      // Export to SysEx
      const sysex = bass1original.toSysEx()

      // Reconstruct using fromSysEx
      const bass1reconstructed = DX7Voice.fromSysEx(sysex, 14)

      // Compare unpacked parameters (they should be identical)
      const originalUnpacked = bass1original.unpack()
      const reconstructedUnpacked = bass1reconstructed.unpack()

      for (let i = 0; i < DX7Voice.UNPACKED_SIZE; i++) {
        expect(reconstructedUnpacked[i]).toBe(originalUnpacked[i])
      }

      expect(bass1reconstructed.name).toBe(bass1original.name)
      expect(bass1reconstructed.index).toBe(14)
    })
  })

  describe("fromJSON", () => {
    it("should create a voice from minimal JSON", () => {
      const minimalJson = {
        name: "Test Voice",
        operators: Array(6).fill({
          id: 1,
          osc: {
            detune: 0,
            freq: { coarse: 0, fine: 0, mode: "RATIO" },
          },
          eg: {
            rates: [99, 99, 99, 99],
            levels: [99, 99, 99, 0],
          },
          key: {
            velocity: 0,
            scaling: 0,
            breakPoint: "C3",
          },
          output: {
            level: 99,
            ampModSens: 0,
          },
          scale: {
            left: { depth: 0, curve: "-LN" },
            right: { depth: 0, curve: "-LN" },
          },
        }),
        pitchEG: {
          rates: [99, 99, 99, 99],
          levels: [50, 50, 50, 50],
        },
        lfo: {
          speed: 35,
          delay: 0,
          pmDepth: 0,
          amDepth: 0,
          keySync: false,
          wave: "TRIANGLE",
        },
        global: {
          algorithm: 1,
          feedback: 0,
          oscKeySync: false,
          pitchModSens: 3,
          transpose: 0,
          ampModSens: 0,
        },
      }

      const voice = DX7Voice.fromJSON(minimalJson)
      expect(voice).toBeInstanceOf(DX7Voice)
      expect(voice.name).toBe("Test Voice")
    })

    it("should round-trip a voice through JSON", () => {
      const original = DX7Voice.createDefault()

      // Modify some parameters
      original.setParameter(0, 50)
      original.setParameter(4, 75)

      // Export to JSON
      const json = original.toJSON()

      // Import back from JSON
      const reconstructed = DX7Voice.fromJSON(json)

      // Compare all parameters
      for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
        expect(reconstructed.getParameter(i)).toBe(original.getParameter(i))
      }

      expect(reconstructed.name).toBe(original.name)
    })

    it("should handle real DX7 voice from ROM", () => {
      const fs = require("node:fs")
      const path = require("node:path")

      const fixturesPath = path.join(__dirname, "../../../fixtures/ROM1A.syx")
      const data = fs.readFileSync(fixturesPath)
      const bank = new DX7Bank(data)

      // Get BASS 1 voice
      const bass1 = bank.getVoice(14)
      const json = bass1.toJSON()

      // Reconstruct from JSON
      const reconstructed = DX7Voice.fromJSON(json)

      // Compare unpacked parameters (they should be identical)
      const originalUnpacked = bass1.unpack()
      const reconstructedUnpacked = reconstructed.unpack()

      for (let i = 0; i < DX7Voice.UNPACKED_SIZE; i++) {
        expect(reconstructedUnpacked[i]).toBe(originalUnpacked[i])
      }
    })

    it("should validate JSON structure", () => {
      expect(() => DX7Voice.fromJSON(null)).toThrow("Invalid JSON")
      expect(() => DX7Voice.fromJSON("not an object")).toThrow("Invalid JSON")
      expect(() => DX7Voice.fromJSON({})).toThrow("Invalid operators array")
      expect(() => DX7Voice.fromJSON({ name: "Test", operators: [] })).toThrow("Invalid operators array")
    })

    it("should validate operator data", () => {
      const invalidOp = {
        name: "Test",
        operators: [
          {
            // Missing required eg.rates array
            osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
            eg: {},
            key: { velocity: 0, scaling: 0, breakPoint: "C3" },
            output: { level: 99, ampModSens: 0 },
            scale: {
              left: { depth: 0, curve: "-LN" },
              right: { depth: 0, curve: "-LN" },
            },
          },
        ],
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      expect(() => DX7Voice.fromJSON(invalidOp)).toThrow("Invalid EG rates")
    })

    it("should validate parameter ranges", () => {
      const json = {
        name: "Test",
        operators: [
          {
            id: 1,
            osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
            eg: {
              rates: [100, 99, 99, 99], // 100 is out of range (0-99)
              levels: [99, 99, 99, 0],
            },
            key: { velocity: 0, scaling: 0, breakPoint: "C3" },
            output: { level: 99, ampModSens: 0 },
            scale: {
              left: { depth: 0, curve: "-LN" },
              right: { depth: 0, curve: "-LN" },
            },
          },
        ],
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      // Fill remaining operators
      for (let i = 1; i < 6; i++) {
        json.operators.push(JSON.parse(JSON.stringify(json.operators[0])))
        json.operators[i].id = i + 1
      }

      expect(() => DX7Voice.fromJSON(json)).toThrow("out of range")
    })

    it("should parse note names correctly", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "A-1" }, // Very low note
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      const voice = DX7Voice.fromJSON(json)
      expect(voice).toBeInstanceOf(DX7Voice)
    })

    it("should handle invalid note names gracefully", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "INVALID" }, // Invalid note name
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      const voice = DX7Voice.fromJSON(json)
      // Should default to C3 (MIDI note 60) for invalid note names
      expect(voice).toBeInstanceOf(DX7Voice)
    })

    it("should throw error for invalid getUnpackedParameter offset", () => {
      const voice = DX7Voice.createDefault()

      expect(() => voice.getUnpackedParameter(-1)).toThrow("Unpacked parameter offset out of range")
      expect(() => voice.getUnpackedParameter(DX7Voice.UNPACKED_SIZE)).toThrow("Unpacked parameter offset out of range")
      expect(() => voice.getUnpackedParameter(1000)).toThrow("Unpacked parameter offset out of range")
    })

    it("should throw error for missing required parameter in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: undefined, transpose: 0, ampModSens: 0 }, // Missing pitchModSens (no default)
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Missing required parameter")
    })

    it("should throw error for invalid parameter value in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: "invalid", transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid parameter value")
    })

    it("should throw error for invalid operator data in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill(null), // Invalid operator data
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid operator data")
    })

    it("should throw error for invalid EG levels array in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99] }, // Wrong length
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid EG levels")
    })

    it("should throw error for invalid EG rates array in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: null, levels: [99, 99, 99, 0] }, // Wrong type
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid EG rates")
    })

    it("should throw error for invalid pitch EG rates in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99], levels: [50, 50, 50, 50] }, // Wrong length
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid pitch EG rates")
    })

    it("should throw error for invalid pitch EG levels in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: "invalid" }, // Wrong type
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid pitch EG levels")
    })

    it("should throw error for invalid LFO data in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: null, // Invalid LFO data
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid LFO data")
    })

    it("should throw error for invalid global data in fromJSON", () => {
      const json = {
        name: "Test",
        operators: Array(6).fill({
          id: 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
        }),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
        global: "invalid", // Invalid global data
      }

      json.operators.forEach((op, i) => {
        op.id = i + 1
      })

      expect(() => DX7Voice.fromJSON(json)).toThrow("Invalid global data")
    })

    it("should handle different curve and wave names", () => {
      const curves = ["-LN", "-EX", "+EX", "+LN"]
      const waves = ["TRIANGLE", "SAW DOWN", "SAW UP", "SQUARE", "SINE", "SAMPLE & HOLD"]

      const json = {
        name: "Test",
        operators: Array.from({ length: 6 }, (_, i) => ({
          id: i + 1,
          osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
          eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
          key: { velocity: 0, scaling: 0, breakPoint: "C3" },
          output: { level: 99, ampModSens: 0 },
          scale: {
            left: { depth: 0, curve: curves[i % curves.length] },
            right: { depth: 0, curve: curves[(i + 1) % curves.length] },
          },
        })),
        pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
        lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: waves[2] },
        global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
      }

      const voice = DX7Voice.fromJSON(json)
      expect(voice).toBeInstanceOf(DX7Voice)

      // Verify curves were set correctly
      const unpacked = voice.unpack()
      for (let op = 0; op < 6; op++) {
        const opOffset = op * DX7Voice.UNPACKED_OP_SIZE
        expect(unpacked[opOffset + DX7Voice.UNPACKED_OP_L_CURVE]).toBe(curves.indexOf(curves[op % curves.length]))
        expect(unpacked[opOffset + DX7Voice.UNPACKED_OP_R_CURVE]).toBe(curves.indexOf(curves[(op + 1) % curves.length]))
      }
    })
  })

  describe("fromFile error handling", () => {
    it("should reject invalid VCED header", async () => {
      // Create data with invalid VCED header
      const data = new Uint8Array(DX7Voice.VCED_SIZE)
      data[0] = 0xf0 // SysEx start
      data[1] = 0x43 // Wrong Yamaha ID (should be 0x43 for Yamaha, but we're checking all header bytes)
      data[2] = 0x00 // Sub-status
      data[3] = 0x01 // Wrong format (should be 0x00 for single voice)
      data[4] = 0x1b // MSB of byte count
      data[5] = 0x00 // LSB of byte count
      // Fill with dummy data
      for (let i = 6; i < DX7Voice.VCED_SIZE - 1; i++) {
        data[i] = 0
      }
      data[DX7Voice.VCED_SIZE - 1] = 0xf7 // SysEx end

      const blob = new Blob([data])
      const file = new File([blob], "invalid.syx")

      await expect(DX7Voice.fromFile(file)).rejects.toThrow("Invalid VCED header")
    })

    it("should handle FileReader error", async () => {
      // Mock FileReader to trigger onerror
      const originalFileReader = global.FileReader
      global.FileReader = class MockFileReader {
        constructor() {
          setTimeout(() => {
            this.onerror(new Error("File read error"))
          }, 0)
        }
        readAsArrayBuffer() {
          // Do nothing - error will be triggered in constructor
        }
      }

      const file = new File([""], "test.syx")
      await expect(DX7Voice.fromFile(file)).rejects.toThrow("Failed to read file")

      // Restore original FileReader
      global.FileReader = originalFileReader
    })
  })

  describe("Helper Methods", () => {
    let voice

    beforeEach(() => {
      voice = DX7Voice.createDefault()
    })

    describe("_unpackOperatorEG", () => {
      it("should correctly unpack operator EG rates", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Set specific EG rates for OP1 (at packed offset 85-88)
        packed[85] = 99 // EG Rate 1
        packed[86] = 75 // EG Rate 2
        packed[87] = 50 // EG Rate 3
        packed[88] = 25 // EG Rate 4

        voice._unpackOperatorEG(packed, unpacked, 85, 0)

        expect(unpacked[0]).toBe(99)
        expect(unpacked[1]).toBe(75)
        expect(unpacked[2]).toBe(50)
        expect(unpacked[3]).toBe(25)
      })

      it("should correctly unpack operator EG levels", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Set specific EG levels for OP1
        packed[89] = 99 // EG Level 1
        packed[90] = 80 // EG Level 2
        packed[91] = 40 // EG Level 3
        packed[92] = 0 // EG Level 4

        voice._unpackOperatorEG(packed, unpacked, 85, 0)

        expect(unpacked[4]).toBe(99)
        expect(unpacked[5]).toBe(80)
        expect(unpacked[6]).toBe(40)
        expect(unpacked[7]).toBe(0)
      })

      it("should handle maximum EG values (99)", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Set all to max
        for (let i = 0; i < 8; i++) {
          packed[85 + i] = 99
        }

        voice._unpackOperatorEG(packed, unpacked, 85, 0)

        for (let i = 0; i < 8; i++) {
          expect(unpacked[i]).toBe(99)
        }
      })

      it("should handle minimum EG values (0)", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // All zeros (default)
        voice._unpackOperatorEG(packed, unpacked, 85, 0)

        for (let i = 0; i < 8; i++) {
          expect(unpacked[i]).toBe(0)
        }
      })

      it("should apply 7-bit mask to EG values", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Set values with bit 7 set (should be masked off)
        packed[85] = 0xff // Should become 0x7F (127)
        packed[86] = 0x80 // Should become 0x00 (0)

        voice._unpackOperatorEG(packed, unpacked, 85, 0)

        expect(unpacked[0]).toBe(127)
        expect(unpacked[1]).toBe(0)
      })
    })

    describe("_unpackOperatorScaling", () => {
      it("should correctly unpack break point", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[93] = 60 // Break point at C3 (MIDI note 60)

        voice._unpackOperatorScaling(packed, unpacked, 85, 0)

        expect(unpacked[8]).toBe(60)
      })

      it("should correctly unpack scaling depths", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[94] = 50 // Left scale depth
        packed[95] = 75 // Right scale depth

        voice._unpackOperatorScaling(packed, unpacked, 85, 0)

        expect(unpacked[9]).toBe(50)
        expect(unpacked[10]).toBe(75)
      })

      it("should handle full range of break points (0-127)", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[93] = 0
        voice._unpackOperatorScaling(packed, unpacked, 85, 0)
        expect(unpacked[8]).toBe(0)

        packed[93] = 127
        voice._unpackOperatorScaling(packed, unpacked, 85, 0)
        expect(unpacked[8]).toBe(127)
      })
    })

    describe("_unpackOperatorPackedParams", () => {
      it("should correctly unpack left and right curves", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Curves byte: bits 0-1 = LC, bits 2-3 = RC
        packed[96] = 0b00001011 // LC=3 (11), RC=2 (10)

        voice._unpackOperatorPackedParams(packed, unpacked, 85, 0)

        expect(unpacked[11]).toBe(3) // Left curve
        expect(unpacked[12]).toBe(2) // Right curve
      })

      it("should handle all curve combinations", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        const testCases = [
          { lc: 0, rc: 0, byte: 0b00000000 },
          { lc: 1, rc: 1, byte: 0b00000101 },
          { lc: 2, rc: 2, byte: 0b00001010 },
          { lc: 3, rc: 3, byte: 0b00001111 },
        ]

        testCases.forEach((tc) => {
          packed[96] = tc.byte
          voice._unpackOperatorPackedParams(packed, unpacked, 85, 0)
          expect(unpacked[11]).toBe(tc.lc)
          expect(unpacked[12]).toBe(tc.rc)
        })
      })

      it("should correctly extract rate scaling and detune", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Rate scaling byte: bits 0-2 = RS, bits 3-6 = DET
        packed[97] = 0b01011101 // RS=5 (101), DET=11 (1011)

        voice._unpackOperatorPackedParams(packed, unpacked, 85, 0)

        expect(unpacked[13]).toBe(5) // Rate scaling (3 bits)
        expect(unpacked[14]).toBe(11) // Detune (4 bits)
      })

      it("should handle maximum rate scaling and detune", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Max RS=7 (111), Max DET=15 (1111)
        packed[97] = 0b01111111

        voice._unpackOperatorPackedParams(packed, unpacked, 85, 0)

        expect(unpacked[13]).toBe(7) // Rate scaling max (3 bits)
        expect(unpacked[14]).toBe(15) // Detune max (4 bits)
      })

      it("should correctly extract amp mod and key velocity sensitivity", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Mod sens byte: bits 0-1 = AMS, bits 2-4 = KVS
        packed[98] = 0b00011011 // AMS=3 (11), KVS=6 (110)

        voice._unpackOperatorPackedParams(packed, unpacked, 85, 0)

        expect(unpacked[15]).toBe(3) // Amp mod sens (2 bits)
        expect(unpacked[18]).toBe(6) // Key velocity sens (3 bits)
      })

      it("should correctly unpack output level", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[99] = 99 // Output level

        voice._unpackOperatorPackedParams(packed, unpacked, 85, 0)

        expect(unpacked[16]).toBe(99)
      })
    })

    describe("_unpackOperatorFrequency", () => {
      it("should correctly unpack frequency mode (ratio vs fixed)", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Test ratio mode
        packed[100] = 0b00001010 // Mode=0 (ratio), Coarse=5
        voice._unpackOperatorFrequency(packed, unpacked, 85, 0)
        expect(unpacked[17]).toBe(0) // Ratio mode
        expect(unpacked[19]).toBe(5) // Coarse freq

        // Test fixed mode
        packed[100] = 0b00001011 // Mode=1 (fixed), Coarse=5
        voice._unpackOperatorFrequency(packed, unpacked, 85, 0)
        expect(unpacked[17]).toBe(1) // Fixed mode
        expect(unpacked[19]).toBe(5) // Coarse freq
      })

      it("should handle maximum frequency coarse value (31)", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Max coarse = 31 (5 bits)
        packed[100] = 0b00111111 // Mode=1, Coarse=31

        voice._unpackOperatorFrequency(packed, unpacked, 85, 0)

        expect(unpacked[19]).toBe(31) // Coarse max (5 bits)
      })

      it("should correctly unpack OSC detune and frequency fine", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Detune/Fine byte: bits 0-2 = OSC DET, bits 3-6 = FREQ FINE
        packed[101] = 0b01011101 // Detune=5 (101), Fine=11 (1011)

        voice._unpackOperatorFrequency(packed, unpacked, 85, 0)

        expect(unpacked[20]).toBe(5) // OSC Detune (3 bits)
        expect(unpacked[21]).toBe(11) // Fine freq (4 bits)
      })

      it("should handle maximum detune and fine frequency", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Max Detune=7 (111), Max Fine=15 (1111)
        packed[101] = 0b01111111

        voice._unpackOperatorFrequency(packed, unpacked, 85, 0)

        expect(unpacked[20]).toBe(7) // OSC Detune max (3 bits)
        expect(unpacked[21]).toBe(15) // Fine freq max (4 bits)
      })
    })

    describe("_unpackOperator", () => {
      it("should call all sub-helpers in correct order", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Set test values in all sections
        packed[85] = 99 // EG Rate 1
        packed[93] = 60 // Break point
        packed[96] = 0b1111 // Curves
        packed[100] = 0b11111 // Freq

        voice._unpackOperator(packed, unpacked, 85, 0)

        // Verify each section was unpacked
        expect(unpacked[0]).toBe(99) // EG
        expect(unpacked[8]).toBe(60) // Scaling
        expect(unpacked[11]).toBe(3) // Curves
        expect(unpacked[17]).toBe(1) // Mode
      })
    })

    describe("_unpackOperators", () => {
      it("should correctly reverse operator order", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Mark each operator with unique value at EG Rate 1
        for (let op = 0; op < 6; op++) {
          const offset = op * 17
          packed[offset] = (op + 1) * 10 // OP6=10, OP5=20, ..., OP1=60
        }

        voice._unpackOperators(packed, unpacked)

        // Verify reversal: unpacked OP1 should have value from packed OP6 position
        expect(unpacked[0]).toBe(60) // OP1 (from packed[85])
        expect(unpacked[23]).toBe(50) // OP2 (from packed[68])
        expect(unpacked[46]).toBe(40) // OP3 (from packed[51])
        expect(unpacked[69]).toBe(30) // OP4 (from packed[34])
        expect(unpacked[92]).toBe(20) // OP5 (from packed[17])
        expect(unpacked[115]).toBe(10) // OP6 (from packed[0])
      })

      it("should unpack all 6 operators completely", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Fill with test data
        for (let i = 0; i < 102; i++) {
          packed[i] = i % 128
        }

        voice._unpackOperators(packed, unpacked)

        // Verify all operator sections have data
        for (let op = 0; op < 6; op++) {
          const offset = op * DX7Voice.UNPACKED_OP_SIZE
          // Check that at least one value was unpacked (not all zeros)
          let hasData = false
          for (let i = 0; i < DX7Voice.UNPACKED_OP_SIZE; i++) {
            if (unpacked[offset + i] !== 0) {
              hasData = true
              break
            }
          }
          expect(hasData).toBe(true)
        }
      })
    })

    describe("_unpackPitchEG", () => {
      it("should correctly unpack pitch EG rates", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[102] = 95 // Rate 1
        packed[103] = 67 // Rate 2
        packed[104] = 95 // Rate 3
        packed[105] = 60 // Rate 4

        voice._unpackPitchEG(packed, unpacked)

        expect(unpacked[138]).toBe(95)
        expect(unpacked[139]).toBe(67)
        expect(unpacked[140]).toBe(95)
        expect(unpacked[141]).toBe(60)
      })

      it("should correctly unpack pitch EG levels", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[106] = 50 // Level 1
        packed[107] = 50 // Level 2
        packed[108] = 50 // Level 3
        packed[109] = 50 // Level 4

        voice._unpackPitchEG(packed, unpacked)

        expect(unpacked[142]).toBe(50)
        expect(unpacked[143]).toBe(50)
        expect(unpacked[144]).toBe(50)
        expect(unpacked[145]).toBe(50)
      })

      it("should handle maximum pitch EG values", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        for (let i = 102; i <= 109; i++) {
          packed[i] = 99
        }

        voice._unpackPitchEG(packed, unpacked)

        for (let i = 138; i <= 145; i++) {
          expect(unpacked[i]).toBe(99)
        }
      })
    })

    describe("_unpackGlobalParams", () => {
      it("should correctly unpack algorithm", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[110] = 16 // Algorithm 17 (0-indexed)

        voice._unpackGlobalParams(packed, unpacked)

        expect(unpacked[146]).toBe(16)
      })

      it("should correctly unpack feedback and OSC sync", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // Feedback byte: bits 0-2 = Feedback, bit 3 = OSC Sync
        packed[111] = 0b00001111 // Feedback=7, OSC Sync=1

        voice._unpackGlobalParams(packed, unpacked)

        expect(unpacked[147]).toBe(7) // Feedback
        expect(unpacked[148]).toBe(1) // OSC Sync
      })

      it("should correctly unpack LFO parameters", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[112] = 35 // LFO Speed
        packed[113] = 10 // LFO Delay
        packed[114] = 5 // LFO PM Depth
        packed[115] = 3 // LFO AM Depth

        voice._unpackGlobalParams(packed, unpacked)

        expect(unpacked[149]).toBe(35)
        expect(unpacked[150]).toBe(10)
        expect(unpacked[151]).toBe(5)
        expect(unpacked[152]).toBe(3)
      })

      it("should correctly unpack LFO sync, wave, and PM sens", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        // LFO params byte: bit 0 = Key Sync, bits 1-3 = Wave, bits 4-6 = PM Sens
        packed[116] = 0b00110101 // Key Sync=1, Wave=2 (010), PM Sens=3 (011)

        voice._unpackGlobalParams(packed, unpacked)

        expect(unpacked[153]).toBe(1) // LFO Key Sync
        expect(unpacked[154]).toBe(2) // LFO Wave
        expect(unpacked[155]).toBe(3) // LFO PM Sens
      })

      it("should correctly unpack transpose", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        packed[117] = 12 // Transpose = C0 - 12 semitones

        voice._unpackGlobalParams(packed, unpacked)

        expect(unpacked[157]).toBe(12)
      })
    })

    describe("_unpackName", () => {
      it("should correctly copy voice name", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        const name = "TEST VOICE"
        for (let i = 0; i < name.length; i++) {
          packed[118 + i] = name.charCodeAt(i)
        }

        voice._unpackName(packed, unpacked)

        for (let i = 0; i < name.length; i++) {
          expect(unpacked[159 + i]).toBe(name.charCodeAt(i))
        }
      })

      it("should handle full 10-character names", () => {
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)

        const name = "BRASS     " // 10 chars
        for (let i = 0; i < 10; i++) {
          packed[118 + i] = name.charCodeAt(i)
        }

        voice._unpackName(packed, unpacked)

        for (let i = 0; i < 10; i++) {
          expect(unpacked[159 + i]).toBe(name.charCodeAt(i))
        }
      })
    })

    describe("_packOperatorEG", () => {
      it("should correctly pack operator EG rates", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[0] = 99
        unpacked[1] = 75
        unpacked[2] = 50
        unpacked[3] = 25

        DX7Voice._packOperatorEG(unpacked, packed, 0, 85)

        expect(packed[85]).toBe(99)
        expect(packed[86]).toBe(75)
        expect(packed[87]).toBe(50)
        expect(packed[88]).toBe(25)
      })

      it("should correctly pack operator EG levels", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[4] = 99
        unpacked[5] = 80
        unpacked[6] = 40
        unpacked[7] = 0

        DX7Voice._packOperatorEG(unpacked, packed, 0, 85)

        expect(packed[89]).toBe(99)
        expect(packed[90]).toBe(80)
        expect(packed[91]).toBe(40)
        expect(packed[92]).toBe(0)
      })
    })

    describe("_packOperatorScaling", () => {
      it("should correctly pack keyboard scaling parameters", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[8] = 60 // Break point
        unpacked[9] = 50 // Left scale depth
        unpacked[10] = 75 // Right scale depth

        DX7Voice._packOperatorScaling(unpacked, packed, 0, 85)

        expect(packed[93]).toBe(60)
        expect(packed[94]).toBe(50)
        expect(packed[95]).toBe(75)
      })
    })

    describe("_packOperatorPackedParams", () => {
      it("should correctly combine left and right curves", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[11] = 3 // Left curve
        unpacked[12] = 2 // Right curve

        DX7Voice._packOperatorPackedParams(unpacked, packed, 0, 85)

        expect(packed[96]).toBe(0b00001011) // LC=3, RC=2
      })

      it("should correctly combine rate scaling and detune", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[13] = 5 // Rate scaling
        unpacked[14] = 11 // Detune

        DX7Voice._packOperatorPackedParams(unpacked, packed, 0, 85)

        expect(packed[97]).toBe(0b01011101) // RS=5, DET=11
      })

      it("should correctly combine amp mod and key velocity sens", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[15] = 3 // Amp mod sens
        unpacked[18] = 6 // Key velocity sens

        DX7Voice._packOperatorPackedParams(unpacked, packed, 0, 85)

        expect(packed[98]).toBe(0b00011011) // AMS=3, KVS=6
      })

      it("should apply bit masks correctly", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        // Set values beyond their bit ranges
        unpacked[11] = 0xff // LC should be masked to 2 bits (3)
        unpacked[12] = 0xff // RC should be masked to 2 bits (3)

        DX7Voice._packOperatorPackedParams(unpacked, packed, 0, 85)

        expect(packed[96]).toBe(0b00001111) // Both maxed at 3
      })
    })

    describe("_packOperatorFrequency", () => {
      it("should correctly combine mode and frequency coarse", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[17] = 1 // Mode (fixed)
        unpacked[19] = 5 // Coarse

        DX7Voice._packOperatorFrequency(unpacked, packed, 0, 85)

        expect(packed[100]).toBe(0b00001011) // Mode=1, Coarse=5
      })

      it("should correctly combine OSC detune and fine frequency", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[20] = 5 // OSC Detune
        unpacked[21] = 11 // Fine freq

        DX7Voice._packOperatorFrequency(unpacked, packed, 0, 85)

        expect(packed[101]).toBe(0b01011101) // Detune=5, Fine=11
      })
    })

    describe("_packOperators", () => {
      it("should correctly reverse operator order when packing", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        // Mark each operator with unique value at EG Rate 1
        for (let op = 0; op < 6; op++) {
          const offset = op * DX7Voice.UNPACKED_OP_SIZE // 23 bytes per operator
          unpacked[offset] = (op + 1) * 10 // OP1=10, OP2=20, OP3=30, OP4=40, OP5=50, OP6=60
        }

        DX7Voice._packOperators(unpacked, packed)

        // Verify reversal: DX7 packed format has operators reversed
        expect(packed[85]).toBe(10) // OP1 data -> packed[85]
        expect(packed[68]).toBe(20) // OP2 data -> packed[68]
        expect(packed[51]).toBe(30) // OP3 data -> packed[51]
        expect(packed[34]).toBe(40) // OP4 data -> packed[34]
        expect(packed[17]).toBe(50) // OP5 data -> packed[17]
        expect(packed[0]).toBe(60) // OP6 data -> packed[0]
      })
    })

    describe("_packPitchEG", () => {
      it("should correctly pack pitch EG rates and levels", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[138] = 95
        unpacked[139] = 67
        unpacked[140] = 95
        unpacked[141] = 60
        unpacked[142] = 50
        unpacked[143] = 50
        unpacked[144] = 50
        unpacked[145] = 50

        DX7Voice._packPitchEG(unpacked, packed)

        expect(packed[102]).toBe(95)
        expect(packed[103]).toBe(67)
        expect(packed[104]).toBe(95)
        expect(packed[105]).toBe(60)
        expect(packed[106]).toBe(50)
        expect(packed[107]).toBe(50)
        expect(packed[108]).toBe(50)
        expect(packed[109]).toBe(50)
      })
    })

    describe("_packGlobalParams", () => {
      it("should correctly pack algorithm", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[146] = 16

        DX7Voice._packGlobalParams(unpacked, packed)

        expect(packed[110]).toBe(16)
      })

      it("should correctly combine feedback and OSC sync", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[147] = 7 // Feedback
        unpacked[148] = 1 // OSC Sync

        DX7Voice._packGlobalParams(unpacked, packed)

        expect(packed[111]).toBe(0b00001111) // Feedback=7, Sync=1
      })

      it("should correctly pack LFO parameters", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[149] = 35
        unpacked[150] = 10
        unpacked[151] = 5
        unpacked[152] = 3

        DX7Voice._packGlobalParams(unpacked, packed)

        expect(packed[112]).toBe(35)
        expect(packed[113]).toBe(10)
        expect(packed[114]).toBe(5)
        expect(packed[115]).toBe(3)
      })

      it("should correctly combine LFO sync, wave, and PM sens", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        unpacked[153] = 1 // Key Sync
        unpacked[154] = 2 // Wave
        unpacked[155] = 3 // PM Sens

        DX7Voice._packGlobalParams(unpacked, packed)

        expect(packed[116]).toBe(0b00110101)
      })
    })

    describe("_packName", () => {
      it("should correctly copy voice name", () => {
        const unpacked = new Uint8Array(DX7Voice.UNPACKED_SIZE)
        const packed = new Uint8Array(DX7Voice.PACKED_SIZE)

        const name = "TEST VOICE"
        for (let i = 0; i < name.length; i++) {
          unpacked[159 + i] = name.charCodeAt(i)
        }

        DX7Voice._packName(unpacked, packed)

        for (let i = 0; i < name.length; i++) {
          expect(packed[118 + i]).toBe(name.charCodeAt(i))
        }
      })
    })

    describe("pack/unpack round-trip with helpers", () => {
      it("should maintain data integrity through unpack->pack cycle", () => {
        const originalData = new Array(DX7Voice.PACKED_SIZE).fill(0)

        // Set various test values
        originalData[0] = 50 // OP6 EG Rate 1
        originalData[85] = 99 // OP1 EG Rate 1
        originalData[110] = 16 // Algorithm
        originalData[111] = 7 // Feedback

        const voice = new DX7Voice(originalData)
        const unpacked = voice.unpack()
        const repacked = DX7Voice.pack(unpacked)

        for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
          expect(repacked[i]).toBe(originalData[i] & 0x7f)
        }
      })

      it("should handle complex voice data correctly", () => {
        // Use the real ROM data test case
        const voice = DX7Voice.createDefault()
        const unpacked1 = voice.unpack()
        const packed = DX7Voice.pack(unpacked1)
        const voice2 = new DX7Voice(packed)
        const unpacked2 = voice2.unpack()

        // Both unpacked versions should be identical
        for (let i = 0; i < DX7Voice.UNPACKED_SIZE; i++) {
          expect(unpacked2[i]).toBe(unpacked1[i])
        }
      })
    })
  })
})

describe("Real DX7 Single Voice File (ROM1A_BASS____1.syx)", () => {
  let bank
  let voice
  let romBank
  let _romBass1

  beforeAll(async () => {
    // Load the single voice file from fixtures directory using DX7Voice.fromFile
    const fs = await import("node:fs")
    const path = await import("node:path")

    const fixturesPath = path.join(__dirname, "../../../fixtures/ROM1A_BASS____1.syx")
    const data = fs.readFileSync(fixturesPath)
    const blob = new Blob([data])
    const file = new File([blob], "ROM1A_BASS____1.syx")
    voice = await DX7Voice.fromFile(file)

    // Create a bank with the single voice for API compatibility
    bank = new DX7Bank()
    bank.voices.fill(DX7Voice.createDefault())
    bank.voices[0] = voice
    bank.name = "ROM1A_BASS____1.syx"

    // Load the full ROM bank for comparison
    const romPath = path.join(__dirname, "../../../fixtures/ROM1A.syx")
    const romData = fs.readFileSync(romPath)
    romBank = new DX7Bank(romData)
    _romBass1 = romBank.getVoice(14) // BASS 1 is at index 14 in ROM1A
  })

  describe("basic file properties", () => {
    it("should load as a bank with one voice", () => {
      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
      expect(voice.name).toBe("BASS    1")
    })

    it("should have valid voice parameters", () => {
      expect(voice).not.toBeNull()
      expect(voice.data.length).toBe(DX7Voice.PACKED_SIZE)

      // All parameters should be in valid range (0-127)
      for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
        const param = voice.getParameter(i)
        expect(param).toBeGreaterThanOrEqual(0)
        expect(param).toBeLessThanOrEqual(127)
      }
    })

    it("should have correct voice name", () => {
      expect(voice.name).toBe("BASS    1")
    })
  })

  describe("single voice conversion", () => {
    it("should convert to SysEx single voice format", () => {
      const sysex = voice.toSysEx()

      expect(sysex.length).toBe(DX7Voice.VCED_SIZE)
      expect(sysex[0]).toBe(DX7Voice.VCED_SYSEX_START)
      expect(sysex[1]).toBe(DX7Voice.VCED_YAMAHA_ID)
      expect(sysex[2]).toBe(DX7Voice.VCED_SUB_STATUS)
      expect(sysex[3]).toBe(DX7Voice.VCED_FORMAT_SINGLE)
      expect(sysex[DX7Voice.VCED_SIZE - 1]).toBe(DX7Voice.VCED_SYSEX_END)
    })

    it("should maintain data integrity through toSysEx conversion", () => {
      const sysex = voice.toSysEx()

      // Verify the SysEx structure
      expect(sysex.length).toBe(DX7Voice.VCED_SIZE)

      // Verify the voice data section (bytes 6-160) contains valid parameters
      const voiceDataSection = sysex.slice(6, 161)
      expect(voiceDataSection.length).toBe(155)

      // Each byte should be valid 7-bit MIDI data
      for (let i = 0; i < voiceDataSection.length; i++) {
        expect(voiceDataSection[i]).toBeGreaterThanOrEqual(0)
        expect(voiceDataSection[i]).toBeLessThanOrEqual(127)
      }
    })

    it("should create valid checksum", () => {
      const sysex = voice.toSysEx()
      const checksum = sysex[161]

      // Manually calculate checksum
      let sum = 0
      for (let i = 6; i < 161; i++) {
        sum += sysex[i]
      }
      const expectedChecksum = (DX7Bank.CHECKSUM_MODULO - (sum % DX7Bank.CHECKSUM_MODULO)) & DX7Voice.MASK_7BIT

      expect(checksum).toBe(expectedChecksum)
    })
  })

  describe("single voice pack/unpack", () => {
    it("should unpack and repack correctly", () => {
      const unpacked = voice.unpack()
      const repacked = DX7Voice.pack(unpacked)
      const newVoice = new DX7Voice(repacked, 0)

      expect(newVoice.name).toBe(voice.name)

      // Compare all packed bytes
      for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
        expect(newVoice.data[i]).toBe(voice.data[i] & DX7Voice.MASK_7BIT)
      }
    })

    it("should produce correct JSON representation", () => {
      const json = voice.toJSON()
      expect(json.name).toBe("BASS    1")
      expect(json.operators).toHaveLength(6)
      expect(json.global.algorithm).toBe(16)
      expect(json.global.feedback).toBe(7)
    })
  })

  describe("edge cases for single voice files", () => {
    it("should reject single voice files via DX7Bank.fromFile", async () => {
      const fs = await import("node:fs")
      const path = await import("node:path")

      const fixturesPath = path.join(__dirname, "../../../fixtures/ROM1A_BASS____1.syx")
      const data = fs.readFileSync(fixturesPath)
      const blob = new Blob([data])
      const file = new File([blob], "ROM1A_BASS____1.syx")

      // DX7Bank.fromFile should reject single voice files
      await expect(DX7Bank.fromFile(file)).rejects.toThrow(
        "This is a single voice file. Use DX7Voice.fromFile() instead.",
      )
    })

    it("should handle single voice in voice array correctly", () => {
      // Single voice should be in slot 0
      expect(voice.index).toBe(0)

      // All voices should be valid
      for (let i = 0; i < DX7Bank.NUM_VOICES; i++) {
        const v = bank.getVoice(i)
        expect(v).not.toBeNull()
        expect(v.data.length).toBe(DX7Voice.PACKED_SIZE)
      }
    })

    it("should match ALL parameter values exactly", async () => {
      // Load the bank (ROM1A.syx) to get BASS 1 from slot 15 (index 14)
      const bankBass1 = romBank.getVoice(14) // BASS 1 in ROM1A
      const bankJson = bankBass1.toJSON()

      // Load the single voice file (ROM1A_BASS____1.syx)
      const singleVoiceJson = voice.toJSON()

      // Verify all operator parameters match
      for (let i = 0; i < DX7Voice.NUM_OPERATORS; i++) {
        const singleOp = singleVoiceJson.operators[i]
        const bankOp = bankJson.operators[i]

        // OSC parameters
        expect(singleOp.osc.detune).toBe(bankOp.osc.detune)
        expect(singleOp.osc.freq.coarse).toBe(bankOp.osc.freq.coarse)
        expect(singleOp.osc.freq.fine).toBe(bankOp.osc.freq.fine)
        expect(singleOp.osc.freq.mode).toBe(bankOp.osc.freq.mode)

        // EG rates and levels
        expect(singleOp.eg.rates).toEqual(bankOp.eg.rates)
        expect(singleOp.eg.levels).toEqual(bankOp.eg.levels)

        // KEY parameters (including velocity)
        expect(singleOp.key.velocity).toBe(bankOp.key.velocity)
        expect(singleOp.key.scaling).toBe(bankOp.key.scaling)
        expect(singleOp.key.breakPoint).toBe(bankOp.key.breakPoint)

        // OUTPUT parameters
        expect(singleOp.output.level).toBe(bankOp.output.level)
        expect(singleOp.output.ampModSens).toBe(bankOp.output.ampModSens)

        // SCALE parameters
        expect(singleOp.scale.left.depth).toBe(bankOp.scale.left.depth)
        expect(singleOp.scale.left.curve).toBe(bankOp.scale.left.curve)
        expect(singleOp.scale.right.depth).toBe(bankOp.scale.right.depth)
        expect(singleOp.scale.right.curve).toBe(bankOp.scale.right.curve)
      }

      // Pitch EG
      expect(singleVoiceJson.pitchEG.rates).toEqual(bankJson.pitchEG.rates)
      expect(singleVoiceJson.pitchEG.levels).toEqual(bankJson.pitchEG.levels)

      // LFO parameters
      expect(singleVoiceJson.lfo.speed).toBe(bankJson.lfo.speed)
      expect(singleVoiceJson.lfo.delay).toBe(bankJson.lfo.delay)
      expect(singleVoiceJson.lfo.pmDepth).toBe(bankJson.lfo.pmDepth)
      expect(singleVoiceJson.lfo.amDepth).toBe(bankJson.lfo.amDepth)
      expect(singleVoiceJson.lfo.keySync).toBe(bankJson.lfo.keySync)
      expect(singleVoiceJson.lfo.wave).toBe(bankJson.lfo.wave)

      // Global parameters
      expect(singleVoiceJson.global.algorithm).toBe(bankJson.global.algorithm)
      expect(singleVoiceJson.global.feedback).toBe(bankJson.global.feedback)
      expect(singleVoiceJson.global.oscKeySync).toBe(bankJson.global.oscKeySync)
      expect(singleVoiceJson.global.pitchModSens).toBe(bankJson.global.pitchModSens)
      expect(singleVoiceJson.global.transpose).toBe(bankJson.global.transpose)

      // Name should match
      expect(singleVoiceJson.name).toBe(bankJson.name)
    })
  })
})
