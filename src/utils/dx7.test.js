import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { DX7Bank, DX7Voice } from "./dx7.js"

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
})

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

    it("should throw error for invalid header", () => {
      const data = new Uint8Array(DX7Bank.SYSEX_SIZE)
      data[0] = 0xf0
      data[1] = 0x42 // Wrong manufacturer

      expect(() => new DX7Bank(data)).toThrow("Invalid SysEx header")
    })

    it("should throw error for invalid length", () => {
      expect(() => new DX7Bank(new Uint8Array(100))).toThrow("Invalid data length")
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
    const fixturesPath = path.join(__dirname, "../../fixtures/ROM1A.syx")
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

describe("Real DX7 Single Voice File (ROM1A_BASS____1.syx)", () => {
  let bank
  let voice
  let romBank
  let _romBass1

  beforeAll(async () => {
    // Load the single voice file from fixtures directory using DX7Voice.fromFile
    const fs = await import("node:fs")
    const path = await import("node:path")

    const fixturesPath = path.join(__dirname, "../../fixtures/ROM1A_BASS____1.syx")
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
    const romPath = path.join(__dirname, "../../fixtures/ROM1A.syx")
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

      const fixturesPath = path.join(__dirname, "../../fixtures/ROM1A_BASS____1.syx")
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

describe("DX7Voice Helper Methods", () => {
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
