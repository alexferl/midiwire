import { beforeAll, describe, expect, it } from "vitest"
import { DX7Bank } from "./DX7Bank.js"
import { DX7Voice } from "./DX7Voice.js"

describe("DX7Bank", () => {
  describe("constructor", () => {
    it("should create empty bank with default voices", () => {
      const bank = new DX7Bank()

      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
      expect(bank.getVoice(0).name).toBe("Init Voice")
    })

    it("should load data from SYX format", () => {
      // Create minimal valid SYX data
      const data = new Uint8Array(DX7Bank.SYSEX_SIZE)
      data[0] = 0xf0
      DX7Bank.SYSEX_HEADER.forEach((byte, i) => {
        data[i] = byte
      })
      // Fill with valid voice data
      for (let i = DX7Bank.SYSEX_HEADER_SIZE; i < DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE; i++) {
        data[i] = 0
      }
      data[DX7Bank.SYSEX_SIZE - 1] = DX7Bank.MASK_7BIT

      const bank = new DX7Bank(data)
      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
    })

    it("should load raw voice data without SysEx wrapper", () => {
      // Create raw voice data (4096 bytes) without SysEx header/footer
      const data = new Uint8Array(DX7Bank.VOICE_DATA_SIZE)
      // Fill with valid voice data
      for (let i = 0; i < DX7Bank.VOICE_DATA_SIZE; i++) {
        data[i] = 0
      }

      const bank = new DX7Bank(data)
      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
      expect(bank.getVoice(0)).not.toBeNull()
      expect(bank.getVoice(0).data.length).toBe(DX7Voice.PACKED_SIZE)
    })

    it("should throw error for invalid header", () => {
      const data = new Uint8Array(DX7Bank.SYSEX_SIZE)
      data[0] = 0xf0
      data[1] = 0x42 // Wrong manufacturer

      expect(() => new DX7Bank(data)).toThrow("Invalid SysEx header")
    })

    it("should throw error for invalid length", () => {
      expect(() => new DX7Bank(new Uint8Array(100))).toThrow("Invalid data length")
    })

    it("should throw error for invalid voice data length after header validation", () => {
      // Create a scenario where voiceData has wrong length after extraction
      // This can happen if we manually create a corrupted data buffer
      const data = new Uint8Array(DX7Bank.SYSEX_HEADER_SIZE + 1000) // Too small
      data[0] = 0xf0
      DX7Bank.SYSEX_HEADER.forEach((byte, i) => {
        data[i] = byte
      })

      expect(() => new DX7Bank(data)).toThrow("Invalid voice data length")
    })
  })

  describe("_calculateChecksum", () => {
    it("should calculate checksum correctly", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5])
      const checksum = DX7Bank._calculateChecksum(data, 5)

      // Manual calculation: sum = 15, checksum = 128 - 15 = 113
      expect(checksum).toBe(113)
    })

    it("should handle large data", () => {
      const data = new Uint8Array(DX7Bank.VOICE_DATA_SIZE).fill(0) // All zeros
      const checksum = DX7Bank._calculateChecksum(data, 4096)

      expect(checksum).toBe(0) // 128 - (0 % 128) = 128, masked to 0
    })
  })

  describe("replaceVoice", () => {
    it("should replace a voice at specified index", () => {
      const bank = new DX7Bank()
      const newPatch = DX7Voice.createDefault()

      // Set a parameter to mark it as different
      newPatch.setParameter(0, 42)

      bank.replaceVoice(5, newPatch)

      expect(bank.getVoice(5).getParameter(0)).toBe(42)
    })

    it("should throw error for invalid index", () => {
      const bank = new DX7Bank()
      const voice = DX7Voice.createDefault()

      expect(() => bank.replaceVoice(-1, voice)).toThrow("Invalid voice index")
      expect(() => bank.replaceVoice(32, voice)).toThrow("Invalid voice index")
    })

    it("should create a copy of the voice", () => {
      const bank = new DX7Bank()
      const originalPatch = DX7Voice.createDefault()
      originalPatch.setParameter(0, 99)

      bank.replaceVoice(0, originalPatch)

      // Modify original voice
      originalPatch.setParameter(0, 55)

      // Bank voice should be unchanged
      expect(bank.getVoice(0).getParameter(0)).toBe(99)
    })
  })

  describe("addVoice", () => {
    it("should add voice to first empty slot", () => {
      const bank = new DX7Bank()
      const newPatch = DX7Voice.createDefault()
      newPatch.setParameter(0, 77)

      const index = bank.addVoice(newPatch)

      expect(index).toBe(0) // First slot is empty
      expect(bank.getVoice(index).getParameter(0)).toBe(77)
    })

    it("should return -1 when bank is full", () => {
      const bank = new DX7Bank()
      const newPatch = DX7Voice.createDefault()

      // Replace all voices with a named voice
      for (let i = 0; i < DX7Bank.NUM_VOICES; i++) {
        const voice = DX7Voice.createDefault()
        voice.setParameter(DX7Voice.PACKED_NAME_START, "A".charCodeAt(0)) // Set name to 'A'
        bank.replaceVoice(i, voice)
      }

      const index = bank.addVoice(newPatch)
      expect(index).toBe(-1)
    })
  })

  describe("getVoice", () => {
    it("should return voice at valid index", () => {
      const bank = new DX7Bank()
      const voice = bank.getVoice(5)

      expect(voice).not.toBeNull()
      expect(voice.index).toBe(5)
    })

    it("should return null for invalid index", () => {
      const bank = new DX7Bank()

      expect(bank.getVoice(-1)).toBeNull()
      expect(bank.getVoice(32)).toBeNull()
    })
  })

  describe("getVoices", () => {
    it("should return all voices in the bank", () => {
      const bank = new DX7Bank()
      const voices = bank.getVoices()

      expect(voices.length).toBe(DX7Bank.NUM_VOICES)
      expect(voices[0]).toBeInstanceOf(DX7Voice)
      expect(voices[0].name).toBe("Init Voice")
    })

    it("should return the internal voices array", () => {
      const bank = new DX7Bank()
      const voices = bank.getVoices()

      // Should be the same array reference
      expect(voices).toBe(bank.voices)
    })
  })

  describe("getVoiceNames", () => {
    it("should return all voice names", () => {
      const bank = new DX7Bank()
      const names = bank.getVoiceNames()

      expect(names.length).toBe(DX7Bank.NUM_VOICES)
      expect(names[0]).toBe("Init Voice")
    })
  })

  describe("findVoiceByName", () => {
    it("should find voice by exact name", () => {
      const bank = new DX7Bank()

      // Replace a voice with a named one
      const voice = DX7Voice.createDefault()
      const nameData = "SUPER BASS".split("").map((c) => c.charCodeAt(0))
      for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
        voice.setParameter(DX7Voice.PACKED_NAME_START + i, nameData[i] || 32)
      }
      bank.replaceVoice(10, voice)

      const found = bank.findVoiceByName("SUPER BASS")
      expect(found).not.toBeNull()
      expect(found.name).toBe("SUPER BASS")
    })

    it("should find voice by partial name (case-insensitive)", () => {
      const bank = new DX7Bank()

      const voice = DX7Voice.createDefault()
      const nameData = "E.PIANO 1".split("").map((c) => c.charCodeAt(0))
      for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
        voice.setParameter(DX7Voice.PACKED_NAME_START + i, nameData[i] || 32)
      }
      bank.replaceVoice(15, voice)

      const found = bank.findVoiceByName("piano")
      expect(found).not.toBeNull()
      expect(found.name).toBe("E.PIANO 1")
    })

    it("should return null when voice not found", () => {
      const bank = new DX7Bank()

      const found = bank.findVoiceByName("NONEXISTENT")
      expect(found).toBeNull()
    })
  })

  describe("toSysex", () => {
    it("should export to SYSEX format", () => {
      const bank = new DX7Bank()
      const sysex = bank.toSysEx()

      expect(sysex.length).toBe(DX7Bank.SYSEX_SIZE)
      expect(sysex[0]).toBe(DX7Bank.SYSEX_START)
      expect(sysex[DX7Bank.SYSEX_SIZE - 1]).toBe(DX7Bank.SYSEX_END)
    })

    it("should include correct header", () => {
      const bank = new DX7Bank()
      const sysex = bank.toSysEx()
      const header = sysex.slice(0, 6)

      expect(Array.from(header)).toEqual(DX7Bank.SYSEX_HEADER)
    })

    it("should maintain data integrity", () => {
      const originalBank = new DX7Bank()

      // Modify a voice
      const voice = DX7Voice.createDefault()
      voice.setParameter(0, 123)
      // Clear all name bytes first
      for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
        voice.setParameter(DX7Voice.PACKED_NAME_START + i, 32) // Space
      }
      // Set only first 2 chars
      voice.setParameter(DX7Voice.PACKED_NAME_START, "A".charCodeAt(0))
      voice.setParameter(DX7Voice.PACKED_NAME_START + 1, "B".charCodeAt(0))
      originalBank.replaceVoice(7, voice)

      // Export and reimport
      const sysex = originalBank.toSysEx()
      const newBank = new DX7Bank(sysex)

      expect(newBank.getVoice(7).getParameter(0)).toBe(123)
      expect(newBank.getVoice(7).name).toBe("AB")
    })
  })

  describe("fromFile", () => {
    it("should load bank from file", async () => {
      const data = new Uint8Array(DX7Bank.SYSEX_SIZE)
      data[0] = 0xf0
      DX7Bank.SYSEX_HEADER.forEach((byte, i) => {
        data[i] = byte
      })
      // Fill with valid voice data
      for (let i = DX7Bank.SYSEX_HEADER_SIZE; i < DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE; i++) {
        data[i] = 0
      }
      data[DX7Bank.SYSEX_SIZE - 1] = DX7Voice.MASK_7BIT

      const blob = new Blob([data])
      const file = new File([blob], "test.syx")

      const bank = await DX7Bank.fromFile(file)
      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
    })

    it("should reject on invalid file", async () => {
      const data = new Uint8Array(100) // Too small
      const blob = new Blob([data])
      const file = new File([blob], "invalid.syx")

      await expect(DX7Bank.fromFile(file)).rejects.toThrow()
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
      await expect(DX7Bank.fromFile(file)).rejects.toThrow("Failed to read file")

      // Restore original FileReader
      global.FileReader = originalFileReader
    })
  })

  describe("fromSysEx", () => {
    it("should create a bank from SysEx data", () => {
      // Create minimal valid SYX data
      const data = new Uint8Array(DX7Bank.SYSEX_SIZE)
      data[0] = 0xf0
      DX7Bank.SYSEX_HEADER.forEach((byte, i) => {
        data[i] = byte
      })
      // Fill with valid voice data
      for (let i = DX7Bank.SYSEX_HEADER_SIZE; i < DX7Bank.SYSEX_HEADER_SIZE + DX7Bank.VOICE_DATA_SIZE; i++) {
        data[i] = 0
      }
      data[DX7Bank.SYSEX_SIZE - 1] = DX7Bank.MASK_7BIT

      const bank = DX7Bank.fromSysEx(data)
      expect(bank).toBeInstanceOf(DX7Bank)
      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
    })

    it("should create a bank from raw voice data", () => {
      // Create raw voice data (4096 bytes) without SysEx header/footer
      const data = new Uint8Array(DX7Bank.VOICE_DATA_SIZE)
      // Fill with valid voice data
      for (let i = 0; i < DX7Bank.VOICE_DATA_SIZE; i++) {
        data[i] = 0
      }

      const bank = DX7Bank.fromSysEx(data)
      expect(bank).toBeInstanceOf(DX7Bank)
      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
    })

    it("should accept optional name parameter", () => {
      const data = new Uint8Array(DX7Bank.VOICE_DATA_SIZE)
      for (let i = 0; i < DX7Bank.VOICE_DATA_SIZE; i++) {
        data[i] = 0
      }

      const bank = DX7Bank.fromSysEx(data, "Test Bank")
      expect(bank.name).toBe("Test Bank")
    })

    it("should throw error for invalid SysEx header", () => {
      const data = new Uint8Array(DX7Bank.SYSEX_SIZE)
      data[0] = 0xf0
      data[1] = 0x42 // Wrong manufacturer

      expect(() => DX7Bank.fromSysEx(data)).toThrow("Invalid SysEx header")
    })

    it("should throw error for invalid data length", () => {
      expect(() => DX7Bank.fromSysEx(new Uint8Array(100))).toThrow("Invalid data length")
    })

    it("should maintain data integrity", () => {
      // Create a bank with custom data
      const originalBank = new DX7Bank()
      const voice = DX7Voice.createDefault()
      voice.setParameter(0, 123)
      originalBank.replaceVoice(7, voice)

      // Export to SysEx
      const sysex = originalBank.toSysEx()

      // Import using fromSysEx
      const importedBank = DX7Bank.fromSysEx(sysex)

      // Verify data matches
      expect(importedBank.getVoice(7).getParameter(0)).toBe(123)
    })
  })

  describe("fromJSON", () => {
    it("should create a bank from JSON", () => {
      const bank = new DX7Bank()
      const json = bank.toJSON()

      const reconstructed = DX7Bank.fromJSON(json)
      expect(reconstructed).toBeInstanceOf(DX7Bank)
      expect(reconstructed.voices.length).toBe(DX7Bank.NUM_VOICES)
    })

    it("should round-trip a bank through JSON", () => {
      const original = new DX7Bank()

      // Modify a few voices - use packed offsets that correspond to OP1 parameters
      // OP1 EG Rate 1 is at packed offset 85, OP1 EG Rate 2 is at 86
      const voice1 = DX7Voice.createDefault(0)
      voice1.setParameter(85, 42) // OP1 EG Rate 1
      original.replaceVoice(0, voice1)

      const voice2 = DX7Voice.createDefault(1)
      voice2.setParameter(89, 84) // OP1 EG Level 1
      original.replaceVoice(5, voice2)

      // Export to JSON
      const json = original.toJSON()

      // Import back from JSON
      const reconstructed = DX7Bank.fromJSON(json)

      // Compare voices - these should now match after reconstruction
      expect(reconstructed.getVoice(0).getParameter(85)).toBe(42)
      expect(reconstructed.getVoice(5).getParameter(89)).toBe(84)
    })

    it("should handle real DX7 bank from ROM", () => {
      const fs = require("node:fs")
      const path = require("node:path")

      const fixturesPath = path.join(__dirname, "../../../fixtures/ROM1A.syx")
      const data = fs.readFileSync(fixturesPath)
      const original = new DX7Bank(data, "ROM1A")

      // Export to JSON
      const json = original.toJSON()

      // Reconstruct from JSON
      const reconstructed = DX7Bank.fromJSON(json)

      // Verify bank properties
      expect(reconstructed.name).toBe("ROM1A")
      expect(reconstructed.voices.length).toBe(DX7Bank.NUM_VOICES)

      // Verify specific voice BASS 1
      const bass1original = original.getVoice(14)
      const bass1reconstructed = reconstructed.getVoice(14)

      expect(bass1reconstructed.name).toBe(bass1original.name)

      // Compare all packed bytes
      for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
        expect(bass1reconstructed.getParameter(i)).toBe(bass1original.getParameter(i))
      }
    })

    it("should validate JSON structure", () => {
      expect(() => DX7Bank.fromJSON(null)).toThrow("Invalid JSON")
      expect(() => DX7Bank.fromJSON("not an object")).toThrow("Invalid JSON")
      expect(() => DX7Bank.fromJSON({})).toThrow("Invalid voices array")
      expect(() => DX7Bank.fromJSON({ voices: "not an array" })).toThrow("Invalid voices array")
    })

    it("should handle partial voice arrays", () => {
      const bank = new DX7Bank()
      const fullJson = bank.toJSON()

      // Create JSON with only 5 voices
      const partialJson = {
        version: "1.0",
        name: "Partial Bank",
        voices: fullJson.voices.slice(0, 5),
      }

      const reconstructed = DX7Bank.fromJSON(partialJson)
      expect(reconstructed.voices.length).toBe(DX7Bank.NUM_VOICES) // Should have 32 voices

      // First 5 should be loaded, rest should be defaults
      for (let i = 0; i < 5; i++) {
        expect(reconstructed.getVoice(i).name).toBe(fullJson.voices[i].name)
      }
    })

    it("should handle invalid voice data gracefully", () => {
      const json = {
        version: "1.0",
        name: "Test Bank",
        voices: [
          {
            name: "Valid Voice",
            operators: Array(6)
              .fill(null)
              .map((_, i) => ({
                id: i + 1,
                osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
                eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
                key: { velocity: 0, scaling: 0, breakPoint: "C3" },
                output: { level: 99, ampModSens: 0 },
                scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
              })),
            pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
            lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
            global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
          },
          null, // Invalid voice
          {
            name: "Another Valid",
            operators: Array(6)
              .fill(null)
              .map((_, i) => ({
                id: i + 1,
                osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
                eg: { rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] },
                key: { velocity: 0, scaling: 0, breakPoint: "C3" },
                output: { level: 99, ampModSens: 0 },
                scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
              })),
            pitchEG: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
            lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, keySync: false, wave: "TRIANGLE" },
            global: { algorithm: 1, feedback: 0, oscKeySync: false, pitchModSens: 3, transpose: 0, ampModSens: 0 },
          },
        ],
      }

      const bank = DX7Bank.fromJSON(json)
      expect(bank).toBeInstanceOf(DX7Bank)
      expect(bank.voices[0].name).toBe("Valid Voic") // Truncated to 10 chars (DX7 limit)
      expect(bank.voices[1].name).toBe("Init Voice") // Should use default
      expect(bank.voices[2].name).toBe("Another Va") // Truncated to 10 chars
    })

    it("should preserve bank name through round-trip", () => {
      const original = new DX7Bank()
      original.name = "My Custom Bank"

      const json = original.toJSON()
      expect(json.name).toBe("My Custom Bank")

      const reconstructed = DX7Bank.fromJSON(json)
      expect(reconstructed.name).toBe("My Custom Bank")
    })
  })

  describe("bank workflow", () => {
    it("should handle complete create, modify, export workflow", () => {
      // Create empty bank
      const bank = new DX7Bank()

      // Create a custom voice
      const voice = DX7Voice.createDefault()
      voice.setParameter(0, 50)
      voice.setParameter(4, 75)
      voice.setParameter(8, 60) // Break point

      // Set voice name - clear all first then set
      const name = "MY VOICE"
      for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
        voice.setParameter(DX7Voice.PACKED_NAME_START + i, 32) // Space
      }
      for (let i = 0; i < name.length; i++) {
        voice.setParameter(DX7Voice.PACKED_NAME_START + i, name.charCodeAt(i))
      }

      // Add to bank
      bank.replaceVoice(0, voice)

      // Verify
      expect(bank.getVoice(0).name).toBe("MY VOICE")
      expect(bank.getVoice(0).getParameter(0)).toBe(50)
      expect(bank.getVoice(0).getParameter(4)).toBe(75)

      // Export to SYSEX
      const sysex = bank.toSysEx()
      expect(sysex.length).toBe(DX7Bank.SYSEX_SIZE)

      // Import back
      const importedBank = new DX7Bank(sysex)
      expect(importedBank.getVoice(0).name).toBe("MY VOICE")
    })
  })
})

describe("Real DX7 ROM Bank (ROM1A.syx)", () => {
  let bank

  beforeAll(async () => {
    // Load the real DX7 ROM file from fixtures directory
    const fs = await import("node:fs")
    const path = await import("node:path")
    const fixturesPath = path.join(__dirname, "../../../fixtures/ROM1A.syx")
    const data = fs.readFileSync(fixturesPath)
    bank = new DX7Bank(data)
  })

  describe("basic bank properties", () => {
    it("should load valid DX7 bank with 32 voices", () => {
      expect(bank.voices.length).toBe(DX7Bank.NUM_VOICES)
    })

    it("should have valid sysex structure", () => {
      const sysex = bank.toSysEx()
      expect(sysex[0]).toBe(DX7Bank.SYSEX_START) // SysEx start
      expect(sysex[DX7Bank.SYSEX_SIZE - 1]).toBe(DX7Bank.SYSEX_END) // SysEx end
      expect(sysex.length).toBe(DX7Bank.SYSEX_SIZE)
    })

    it("should have correct DX7 header", () => {
      const sysex = bank.toSysEx()
      const header = sysex.slice(0, DX7Bank.SYSEX_HEADER_SIZE)
      expect(Array.from(header)).toEqual(DX7Bank.SYSEX_HEADER)
    })
  })

  describe("voice validation", () => {
    it("should have all non-empty voice names", () => {
      const names = bank.getVoiceNames()
      names.forEach((name) => {
        expect(name.length).toBeGreaterThan(0)
        expect(name).not.toBe("")
      })
    })

    it("should find known DX7 ROM voices", () => {
      // These are well-known voices from the DX7 ROM (with actual spacing from ROM)
      expect(bank.findVoiceByName("BRASS")).not.toBeNull() // Partial match for "BRASS   1"
      expect(bank.findVoiceByName("E.PIANO")).not.toBeNull() // Partial match for "E.PIANO 1"
      expect(bank.findVoiceByName("BASS")).not.toBeNull() // Partial match for "BASS    1"
      expect(bank.findVoiceByName("PIANO")).not.toBeNull() // Partial match for "PIANO   1"
    })

    it("should have valid voice parameters", () => {
      const voice = bank.getVoice(0)
      expect(voice).not.toBeNull()
      expect(voice.data.length).toBe(DX7Voice.PACKED_SIZE)

      // All parameters should be in valid range (0-127)
      for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
        const param = voice.getParameter(i)
        expect(param).toBeGreaterThanOrEqual(0)
        expect(param).toBeLessThanOrEqual(127)
      }
    })

    it("should unpack real voices correctly", () => {
      const voice = bank.getVoice(0)
      const unpacked = voice.unpack()

      expect(unpacked.length).toBe(DX7Voice.UNPACKED_SIZE) // 159 parameters + 10 name bytes

      // Check EG rates are in valid range
      for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
        const opOffset = op * DX7Voice.UNPACKED_OP_SIZE
        for (let i = 0; i < 4; i++) {
          expect(unpacked[opOffset + i]).toBeGreaterThanOrEqual(0)
          expect(unpacked[opOffset + i]).toBeLessThanOrEqual(99) // EG rates max 99
        }
      }
    })
  })

  describe("data integrity tests", () => {
    it("should maintain data integrity through pack/unpack cycle", () => {
      const originalPatch = bank.getVoice(5)
      const unpacked = originalPatch.unpack()
      const repacked = DX7Voice.pack(unpacked)
      const newPatch = new DX7Voice(repacked, 5)

      // Compare all 128 bytes - pack/unpack normalizes the data
      // so we check that packed values match (with 7-bit mask applied)
      for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
        expect(newPatch.data[i]).toBe(originalPatch.data[i] & DX7Voice.MASK_7BIT)
      }
    })

    it("should export and reimport without data loss", () => {
      const originalSysex = bank.toSysEx()
      const newBank = new DX7Bank(originalSysex)

      // Compare all voices
      for (let i = 0; i < DX7Bank.NUM_VOICES; i++) {
        const originalPatch = bank.getVoice(i)
        const newPatch = newBank.getVoice(i)

        expect(newPatch.data.length).toBe(originalPatch.data.length)
        for (let j = 0; j < DX7Voice.PACKED_SIZE; j++) {
          expect(newPatch.data[j]).toBe(originalPatch.data[j])
        }
        expect(newPatch.name).toBe(originalPatch.name)
      }
    })

    it("should validate specific known voice parameters", () => {
      // Test a few known voices from the DX7 ROM
      const brass1 = bank.findVoiceByName("BRASS")
      expect(brass1).not.toBeNull()

      // Should have some operators active
      const unpacked = brass1.unpack()
      let activeOperators = 0
      for (let op = 0; op < DX7Voice.NUM_OPERATORS; op++) {
        const opOffset = op * DX7Voice.UNPACKED_OP_SIZE
        if (unpacked[opOffset + 16] > 0) {
          activeOperators++
        }
      }
      expect(activeOperators).toBeGreaterThan(0)
    })
  })

  describe("edge cases", () => {
    it("should handle voice extraction at all indices", () => {
      // Verify we can access all 32 voices
      for (let i = 0; i < DX7Bank.NUM_VOICES; i++) {
        const voice = bank.getVoice(i)
        expect(voice).not.toBeNull()
        expect(voice.index).toBe(i)
        expect(voice.data.length).toBe(DX7Voice.PACKED_SIZE)
      }
    })

    it("should preserve voice names exactly", () => {
      const originalNames = bank.getVoiceNames()
      const sysex = bank.toSysEx()
      const newBank = new DX7Bank(sysex)
      const newNames = newBank.getVoiceNames()

      expect(newNames).toEqual(originalNames)
    })

    it("should handle voice replacement and maintain order", () => {
      const originalPatch4 = bank.getVoice(4)
      const _originalPatch5 = bank.getVoice(5)
      const originalPatch6 = bank.getVoice(6)
      const newPatch = DX7Voice.createDefault()

      // Set a unique name (pad with spaces like DX7 does)
      const testName = "TESTPATCH"
      for (let i = 0; i < DX7Voice.NAME_LENGTH; i++) {
        newPatch.setParameter(118 + i, i < testName.length ? testName.charCodeAt(i) : DX7Voice.CHAR_SPACE)
      }

      bank.replaceVoice(5, newPatch)

      expect(bank.getVoice(5).name).toBe("TESTPATCH")
      expect(bank.getVoice(4).name).toBe(originalPatch4.name)
      expect(bank.getVoice(6).name).toBe(originalPatch6.name)
    })
  })

  describe("toJSON", () => {
    it("should convert BASS 1 voice to correct JSON format", () => {
      // Get voice 14 which is BASS 1 (based on ROM voice list)
      const bassPatch = bank.getVoice(14)
      expect(bassPatch).not.toBeNull()
      expect(bassPatch.name).toBe("BASS    1")

      const json = bassPatch.toJSON()

      // Verify voice name (includes padding)
      expect(json.name).toBe("BASS    1")

      // Verify global parameters
      expect(json.global.algorithm).toBe(16)
      expect(json.global.feedback).toBe(7)
      expect(json.global.oscKeySync).toBe(true)
      expect(json.global.pitchModSens).toBe(3)
      expect(json.global.transpose).toBe(-12)

      // Verify LFO parameters
      expect(json.lfo.speed).toBe(35)
      expect(json.lfo.delay).toBe(0)
      expect(json.lfo.pmDepth).toBe(0)
      expect(json.lfo.amDepth).toBe(0)
      expect(json.lfo.keySync).toBe(false)
      expect(json.lfo.wave).toBe("TRIANGLE")

      // Verify pitch EG
      expect(json.pitchEG.rates).toEqual([94, 67, 95, 60])
      expect(json.pitchEG.levels).toEqual([50, 50, 50, 50])

      // Verify operators count
      expect(json.operators).toHaveLength(6)

      // Verify OP1
      expect(json.operators[0]).toEqual({
        id: 1,
        osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
        eg: { rates: [95, 62, 17, 58], levels: [99, 95, 32, 0] },
        key: { velocity: 0, scaling: 7, breakPoint: "A2" },
        output: { level: 99, ampModSens: 0 },
        scale: { left: { depth: 57, curve: "+LN" }, right: { depth: 14, curve: "-LN" } },
      })

      // Verify OP2
      expect(json.operators[1]).toEqual({
        id: 2,
        osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
        eg: { rates: [99, 20, 0, 0], levels: [99, 0, 0, 0] },
        key: { velocity: 0, scaling: 7, breakPoint: "D3" },
        output: { level: 80, ampModSens: 0 },
        scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
      })

      // Verify OP3
      expect(json.operators[2]).toEqual({
        id: 3,
        osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
        eg: { rates: [88, 96, 32, 30], levels: [79, 65, 0, 0] },
        key: { velocity: 3, scaling: 6, breakPoint: "A-1" },
        output: { level: 99, ampModSens: 0 },
        scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
      })

      // Verify OP4
      expect(json.operators[3]).toEqual({
        id: 4,
        osc: { detune: 0, freq: { coarse: 5, fine: 0, mode: "RATIO" } },
        eg: { rates: [90, 42, 7, 55], levels: [90, 30, 0, 0] },
        key: { velocity: 5, scaling: 5, breakPoint: "A-1" },
        output: { level: 93, ampModSens: 0 },
        scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
      })

      // Verify OP5
      expect(json.operators[4]).toEqual({
        id: 5,
        osc: { detune: 0, freq: { coarse: 0, fine: 0, mode: "RATIO" } },
        eg: { rates: [99, 0, 0, 0], levels: [99, 0, 0, 0] },
        key: { velocity: 3, scaling: 7, breakPoint: "C#4" },
        output: { level: 62, ampModSens: 0 },
        scale: { left: { depth: 75, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
      })

      // Verify OP6
      expect(json.operators[5]).toEqual({
        id: 6,
        osc: { detune: 0, freq: { coarse: 9, fine: 0, mode: "RATIO" } },
        eg: { rates: [94, 56, 24, 55], levels: [93, 28, 0, 0] },
        key: { velocity: 7, scaling: 1, breakPoint: "A-1" },
        output: { level: 85, ampModSens: 0 },
        scale: { left: { depth: 0, curve: "-LN" }, right: { depth: 0, curve: "-LN" } },
      })
    })
  })

  describe("bank toJSON", () => {
    it("should convert entire bank to JSON format", () => {
      const json = bank.toJSON()

      // Verify bank structure
      expect(json.name).toBe("")
      expect(json.voices).toHaveLength(DX7Bank.NUM_VOICES)

      // Check first few voices have correct structure
      expect(json.voices[0].index).toBe(1)
      expect(json.voices[0].name).toBe("BRASS   1")
      expect(json.voices[0].operators).toHaveLength(6)
      expect(json.voices[0].global).toBeDefined()
      expect(json.voices[0].lfo).toBeDefined()
      expect(json.voices[0].pitchEG).toBeDefined()

      expect(json.voices[14].index).toBe(15) // BASS 1
      expect(json.voices[14].name).toBe("BASS    1")

      // All voices should have proper structure
      json.voices.forEach((voice, idx) => {
        expect(voice.index).toBe(idx + 1) // 1-based indexing
        expect(typeof voice.name).toBe("string")
        expect(voice.operators).toHaveLength(6)
        expect(voice.global).toBeDefined()
        expect(voice.lfo).toBeDefined()
        expect(voice.pitchEG).toBeDefined()
      })
    })

    it("should preserve bank name when set", () => {
      const testBank = new DX7Bank()
      testBank.name = "Test Bank"
      const json = testBank.toJSON()

      expect(json.name).toBe("Test Bank")
      expect(json.voices).toHaveLength(DX7Bank.NUM_VOICES)
    })

    it("should include all voice data in JSON", () => {
      const json = bank.toJSON()

      // Pick a specific voice (BASS 1 at index 14)
      const bass1Json = json.voices[14]

      // Verify it matches the individual voice JSON
      const bass1Voice = bank.getVoice(14)
      const bass1IndividualJson = bass1Voice.toJSON()

      expect(bass1Json.name).toBe(bass1IndividualJson.name)
      expect(bass1Json.operators).toEqual(bass1IndividualJson.operators)
      expect(bass1Json.global).toEqual(bass1IndividualJson.global)
      expect(bass1Json.lfo).toEqual(bass1IndividualJson.lfo)
      expect(bass1Json.pitchEG).toEqual(bass1IndividualJson.pitchEG)
    })

    it("should match structure of fixture JSON files", () => {
      const json = bank.toJSON()

      // Verify structure matches what we export in fixtures
      expect(json).toHaveProperty("name")
      expect(json).toHaveProperty("voices")
      expect(Array.isArray(json.voices)).toBe(true)

      // Verify each voice has index field
      json.voices.forEach((voice) => {
        expect(voice).toHaveProperty("index")
        expect(typeof voice.index).toBe("number")
        expect(voice.index).toBeGreaterThanOrEqual(1)
        expect(voice.index).toBeLessThanOrEqual(32)
      })
    })
  })

  describe("export/import round-trip", () => {
    it("should export BASS 1 and be able to re-import it", async () => {
      // Get BASS 1 from ROM
      const bass1 = bank.getVoice(14)
      expect(bass1.name).toBe("BASS    1")

      // Export to SysEx single voice format
      const sysex = bass1.toSysEx()
      expect(sysex.length).toBe(DX7Voice.VCED_SIZE)

      // Load it back using DX7Voice.fromFile (single voice format)
      const blob = new Blob([sysex])
      const file = new File([blob], "BASS_1_EXPORT.syx")
      const loadedVoice = await DX7Voice.fromFile(file)

      // Verify the round-trip preserved the voice
      expect(loadedVoice.name).toBe("BASS    1")

      // Compare all packed bytes - they should be identical
      for (let i = 0; i < DX7Voice.PACKED_SIZE; i++) {
        expect(loadedVoice.data[i]).toBe(bass1.data[i])
      }
    })

    it("should maintain voice integrity through complete round-trip", async () => {
      // Get BASS 1 from ROM
      const originalBass1 = bank.getVoice(14)

      // Export to SysEx
      const sysexData = originalBass1.toSysEx()

      // Create a File object from the SysEx (simulating browser file upload)
      const blob = new Blob([sysexData])
      const file = new File([blob], "BASS_1_EXPORT.syx")

      // Load it back using DX7Voice.fromFile (single voice format)
      const loadedVoice = await DX7Voice.fromFile(file)

      // Verify the round-trip preserved the voice
      expect(loadedVoice.name).toBe("BASS    1")

      // Compare unpacked parameters to verify no data loss
      const originalUnpacked = originalBass1.unpack()
      const loadedUnpacked = loadedVoice.unpack()

      for (let i = 0; i < DX7Voice.UNPACKED_SIZE; i++) {
        expect(loadedUnpacked[i]).toBe(originalUnpacked[i])
      }
    })
  })

  describe("toSysEx", () => {
    it("should create correct single voice dump format", () => {
      // Get voice 14 which is BASS 1 (based on ROM voice list)
      const bassPatch = bank.getVoice(14)
      expect(bassPatch).not.toBeNull()
      expect(bassPatch.name).toBe("BASS    1")

      const sysex = bassPatch.toSysEx()

      // Verify total size (163 bytes)
      expect(sysex.length).toBe(DX7Voice.VCED_SIZE)

      // Verify header bytes
      expect(sysex[0]).toBe(DX7Bank.SYSEX_START) // SysEx start
      expect(sysex[1]).toBe(DX7Bank.SYSEX_YAMAHA_ID) // Yamaha ID
      expect(sysex[2]).toBe(0x00) // Channel/format (nibblized)
      expect(sysex[3]).toBe(0x00) // Substatus: bulk dump
      expect(sysex[4]).toBe(0x01) // Format: single voice dump
      expect(sysex[5]).toBe(0x1b) // Packet type

      // Verify voice data (145 bytes of unpacked parameters)
      const voiceData = sysex.slice(6, 151)
      expect(voiceData.length).toBe(145)

      // Voice name: 10 bytes at offset 151-160
      const nameBytes = sysex.slice(151, 161)
      const extractedName = String.fromCharCode(...nameBytes.map((b) => b & DX7Voice.MASK_7BIT)).trim()
      expect(extractedName).toBe("BASS    1")

      // Verify checksum (byte 161)
      const checksum = sysex[161]
      expect(checksum).toBeGreaterThanOrEqual(0)
      expect(checksum).toBeLessThanOrEqual(127)

      // Verify SysEx end byte
      expect(sysex[DX7Voice.VCED_SIZE - 1]).toBe(DX7Voice.VCED_SYSEX_END)

      // Verify checksum is correct
      // Sum all 155 data bytes (bytes 6-160)
      let sum = 0
      for (let i = 6; i < 161; i++) {
        sum += sysex[i]
      }
      const expectedChecksum = (DX7Bank.CHECKSUM_MODULO - (sum % DX7Bank.CHECKSUM_MODULO)) & DX7Voice.MASK_7BIT
      expect(checksum).toBe(expectedChecksum)
    })

    it("should produce consistent output for same voice", () => {
      const bassPatch = bank.getVoice(14)
      const sysex1 = bassPatch.toSysEx()
      const sysex2 = bassPatch.toSysEx()

      // Both outputs should be identical
      expect(sysex1.length).toBe(sysex2.length)
      for (let i = 0; i < sysex1.length; i++) {
        expect(sysex1[i]).toBe(sysex2[i])
      }
    })

    it("should have correct size for single voice dump format", () => {
      const voice = bank.getVoice(0)
      const sysex = voice.toSysEx()

      // Single voice dump format:
      // - 6 bytes header
      // - 145 bytes voice data (unpacked format)
      // - 10 bytes voice name
      // - 1 byte checksum
      // - 1 byte F7 footer
      // Total: 163 bytes
      expect(sysex.length).toBe(DX7Voice.VCED_SIZE)
    })

    it("should validate checksum calculation", () => {
      const voice = bank.getVoice(0)
      const sysex = voice.toSysEx()

      // Manually calculate checksum
      let calculatedSum = 0
      for (let i = 6; i < 161; i++) {
        calculatedSum += sysex[i]
      }
      const calculatedChecksum =
        (DX7Bank.CHECKSUM_MODULO - (calculatedSum % DX7Bank.CHECKSUM_MODULO)) & DX7Voice.MASK_7BIT

      // Compare with actual checksum in the SysEx (at index 161, before F7 at 162)
      expect(sysex[161]).toBe(calculatedChecksum)
      expect(sysex[DX7Voice.VCED_SIZE - 1]).toBe(DX7Voice.VCED_SYSEX_END) // Verify F7 is at the correct position
    })
  })
})
