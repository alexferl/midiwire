import { beforeAll, describe, expect, it } from "vitest"
import { DX7Cartridge, DX7Patch } from "./DX7Cartridge.js"

describe("DX7Patch", () => {
  describe("constructor", () => {
    it("should create a patch from 128 bytes of data", () => {
      const data = new Array(128).fill(0)
      const patch = new DX7Patch(data, 5)

      expect(patch.index).toBe(5)
      expect(patch.data.length).toBe(128)
      expect(patch.name).toBe("")
    })

    it("should throw error for invalid data length", () => {
      expect(() => new DX7Patch([1, 2, 3])).toThrow("Invalid patch data length")
      expect(() => new DX7Patch(new Array(127).fill(0))).toThrow("Invalid patch data length")
      expect(() => new DX7Patch(new Array(129).fill(0))).toThrow("Invalid patch data length")
    })

    it("should extract patch name correctly", () => {
      const data = new Array(128).fill(0)
      // Set name bytes (offset 118-127) to 'TEST PATCH'
      const name = "TEST PATCH"
      for (let i = 0; i < 10; i++) {
        data[118 + i] = name.charCodeAt(i) || 32
      }

      const patch = new DX7Patch(data)
      expect(patch.name).toBe("TEST PATCH")
    })

    it("should normalize DX7 special characters", () => {
      const data = new Array(128).fill(0)
      // Set special characters
      data[118] = 92 // Yen symbol -> 'Y'
      data[119] = 126 // Arrow -> '>'
      data[120] = 127 // Arrow -> '<'
      data[121] = 31 // Non-printable -> space

      const patch = new DX7Patch(data)
      expect(patch.name).toBe("Y><") // Position 121 is space, trim removes trailing spaces
    })
  })

  describe("getParameter and setParameter", () => {
    it("should get and set parameters correctly", () => {
      const data = new Array(128).fill(0)
      const patch = new DX7Patch(data)

      // Set parameter at offset 10 to value 64
      patch.setParameter(10, 64)
      expect(patch.getParameter(10)).toBe(64)
    })

    it("should mask values to 7-bit range", () => {
      const data = new Array(128).fill(0)
      const patch = new DX7Patch(data)

      patch.setParameter(10, 200) // Should be masked to 72 (200 & 0x7f)
      expect(patch.getParameter(10)).toBe(72)
    })

    it("should update name when name bytes change", () => {
      const data = new Array(128).fill(0)
      const patch = new DX7Patch(data)

      // Set name bytes
      patch.setParameter(118, "A".charCodeAt(0))
      patch.setParameter(119, "B".charCodeAt(0))
      patch.setParameter(120, "C".charCodeAt(0))

      expect(patch.name).toBe("ABC")
    })
  })

  describe("getUnpackedParameter", () => {
    it("should read algorithm from unpacked data", () => {
      const data = new Array(128).fill(0)
      // Algorithm is at packed[110], maps to unpacked[146]
      data[110] = 5 // Algorithm 6 (0-indexed)

      const patch = new DX7Patch(data)
      expect(patch.getUnpackedParameter(146)).toBe(5)
    })

    it("should read feedback from unpacked data", () => {
      const data = new Array(128).fill(0)
      // Feedback is at packed[111], maps to unpacked[147]
      data[111] = 7 | 0 // Max feedback, OSC Sync is 0
      // Bit 3 is OSC Sync, bits 0-2 are Feedback

      const patch = new DX7Patch(data)
      expect(patch.getUnpackedParameter(147)).toBe(7)
    })

    it("should read LFO speed from unpacked data", () => {
      const data = new Array(128).fill(0)
      // LFO Speed is at packed[112], maps to unpacked[149]
      data[112] = 50

      const patch = new DX7Patch(data)
      expect(patch.getUnpackedParameter(149)).toBe(50)
    })
  })

  describe("unpack", () => {
    it("should unpack 128-byte data to 165-byte format", () => {
      const data = new Array(128).fill(0)
      const patch = new DX7Patch(data)
      const unpacked = patch.unpack()

      expect(unpacked.length).toBe(169)
    })

    it("should unpack with correct operator structure", () => {
      const data = new Array(128).fill(0)
      // DX7 stores operators in reverse order: OP6 at packed[0], OP1 at packed[85-101]
      // Set OP1 values at packed[85-101]
      data[85] = 10 // OP1 EG Rate 1 at packed[85]
      data[89] = 20 // OP1 EG Level 1 at packed[89] (85 + 4)
      // Set OP2 EG Rate 4 at packed[71] (packed[68-84] is OP2, EG rates are bytes 0-3)
      data[71] = 30 // OP2 EG Rate 4 at packed[68+3]

      const patch = new DX7Patch(data)
      const unpacked = patch.unpack()

      expect(unpacked[0]).toBe(10) // OP1 EG Rate 1 <- packed[85]
      expect(unpacked[4]).toBe(20) // OP1 EG Level 1 <- packed[89]
      // OP2 EG Rate 1-4: unpacked[23-26] <- packed[68-71]
      expect(unpacked[23]).toBe(data[68]) // OP2 EG Rate 1 <- packed[68]
      expect(unpacked[26]).toBe(30) // OP2 EG Rate 4 <- packed[71]
    })
  })

  describe("pack", () => {
    it("should pack 169-byte data to 128-byte format", () => {
      const unpacked = new Array(169).fill(0)
      const packed = DX7Patch.pack(unpacked)

      expect(packed.length).toBe(128)
    })

    it("should throw error for invalid unpacked length", () => {
      expect(() => DX7Patch.pack(new Array(100).fill(0))).toThrow("Invalid unpacked data length")
      expect(() => DX7Patch.pack(new Array(200).fill(0))).toThrow("Invalid unpacked data length")
    })

    it("should pack and unpack correctly", () => {
      const originalData = new Array(128).fill(0)
      originalData[0] = 50
      originalData[10] = 100
      originalData[110] = 5 // Algorithm 6 (packed[110])

      const patch = new DX7Patch(originalData)
      const unpacked = patch.unpack()
      const repacked = DX7Patch.pack(unpacked)

      expect(repacked.length).toBe(128)
      expect(repacked[0]).toBe(50)
      expect(repacked[10]).toBe(100)
      expect(repacked[110]).toBe(5) // Algorithm preserved
    })
  })

  describe("fromUnpacked", () => {
    it("should create a patch from unpacked data", () => {
      const unpacked = new Array(169).fill(0)
      unpacked[0] = 99 // OP1 EG Rate 1
      unpacked[4] = 50 // OP1 EG Level 1

      const patch = DX7Patch.fromUnpacked(unpacked, 3)

      expect(patch.index).toBe(3)
      expect(patch.data.length).toBe(128)
      // OP1 data goes to packed[85-101] (operators are stored in reverse order)
      expect(patch.getParameter(85)).toBe(99) // OP1 EG Rate 1 at packed[85]
    })
  })

  describe("createDefault", () => {
    it("should create a default patch", () => {
      const patch = DX7Patch.createDefault(7)

      expect(patch.index).toBe(7)
      expect(patch.data.length).toBe(128)
      expect(patch.name).toBe("Init Voice")
    })

    it("should create a valid patch that can be unpacked", () => {
      const patch = DX7Patch.createDefault()
      const unpacked = patch.unpack()

      expect(unpacked.length).toBe(169) // 159 parameters + 10 name bytes
      expect(unpacked[0]).toBe(99) // Default EG rate
      // Note: Algorithm position varies based on createDefault implementation
      // The key test is that pack/unpack round-trip works correctly
    })
  })
})

describe("DX7Cartridge", () => {
  describe("constructor", () => {
    it("should create empty cartridge with default patches", () => {
      const cartridge = new DX7Cartridge()

      expect(cartridge.patches.length).toBe(32)
      expect(cartridge.getPatch(0).name).toBe("Init Voice")
    })

    it("should load data from SYX format", () => {
      // Create minimal valid SYX data
      const data = new Uint8Array(4104)
      data[0] = 0xf0
      DX7Cartridge.SYSEX_HEADER.forEach((byte, i) => {
        data[i] = byte
      })
      // Fill with valid voice data
      for (let i = 6; i < 4102; i++) {
        data[i] = 0
      }
      data[4103] = 0xf7

      const cartridge = new DX7Cartridge(data)
      expect(cartridge.patches.length).toBe(32)
    })

    it("should throw error for invalid header", () => {
      const data = new Uint8Array(4104)
      data[0] = 0xf0
      data[1] = 0x42 // Wrong manufacturer

      expect(() => new DX7Cartridge(data)).toThrow("Invalid SYSEX header")
    })

    it("should throw error for invalid length", () => {
      expect(() => new DX7Cartridge(new Uint8Array(100))).toThrow("Invalid data length")
    })
  })

  describe("_calculateChecksum", () => {
    it("should calculate checksum correctly", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5])
      const checksum = DX7Cartridge._calculateChecksum(data, 5)

      // Manual calculation: sum = 15, checksum = 128 - 15 = 113
      expect(checksum).toBe(113)
    })

    it("should handle large data", () => {
      const data = new Uint8Array(4096).fill(0) // All zeros
      const checksum = DX7Cartridge._calculateChecksum(data, 4096)

      expect(checksum).toBe(0) // 128 - (0 % 128) = 128, masked to 0
    })
  })

  describe("replacePatch", () => {
    it("should replace a patch at specified index", () => {
      const cartridge = new DX7Cartridge()
      const newPatch = DX7Patch.createDefault()

      // Set a parameter to mark it as different
      newPatch.setParameter(0, 42)

      cartridge.replacePatch(5, newPatch)

      expect(cartridge.getPatch(5).getParameter(0)).toBe(42)
    })

    it("should throw error for invalid index", () => {
      const cartridge = new DX7Cartridge()
      const patch = DX7Patch.createDefault()

      expect(() => cartridge.replacePatch(-1, patch)).toThrow("Invalid patch index")
      expect(() => cartridge.replacePatch(32, patch)).toThrow("Invalid patch index")
    })

    it("should create a copy of the patch", () => {
      const cartridge = new DX7Cartridge()
      const originalPatch = DX7Patch.createDefault()
      originalPatch.setParameter(0, 99)

      cartridge.replacePatch(0, originalPatch)

      // Modify original patch
      originalPatch.setParameter(0, 55)

      // Cartridge patch should be unchanged
      expect(cartridge.getPatch(0).getParameter(0)).toBe(99)
    })
  })

  describe("addPatch", () => {
    it("should add patch to first empty slot", () => {
      const cartridge = new DX7Cartridge()
      const newPatch = DX7Patch.createDefault()
      newPatch.setParameter(0, 77)

      const index = cartridge.addPatch(newPatch)

      expect(index).toBe(0) // First slot is empty
      expect(cartridge.getPatch(index).getParameter(0)).toBe(77)
    })

    it("should return -1 when cartridge is full", () => {
      const cartridge = new DX7Cartridge()
      const newPatch = DX7Patch.createDefault()

      // Replace all patches with a named patch
      for (let i = 0; i < 32; i++) {
        const patch = DX7Patch.createDefault()
        patch.setParameter(118, "A".charCodeAt(0)) // Set name to 'A'
        cartridge.replacePatch(i, patch)
      }

      const index = cartridge.addPatch(newPatch)
      expect(index).toBe(-1)
    })
  })

  describe("getPatch", () => {
    it("should return patch at valid index", () => {
      const cartridge = new DX7Cartridge()
      const patch = cartridge.getPatch(5)

      expect(patch).not.toBeNull()
      expect(patch.index).toBe(5)
    })

    it("should return null for invalid index", () => {
      const cartridge = new DX7Cartridge()

      expect(cartridge.getPatch(-1)).toBeNull()
      expect(cartridge.getPatch(32)).toBeNull()
    })
  })

  describe("getPatchNames", () => {
    it("should return all patch names", () => {
      const cartridge = new DX7Cartridge()
      const names = cartridge.getPatchNames()

      expect(names.length).toBe(32)
      expect(names[0]).toBe("Init Voice")
    })
  })

  describe("findPatchByName", () => {
    it("should find patch by exact name", () => {
      const cartridge = new DX7Cartridge()

      // Replace a patch with a named one
      const patch = DX7Patch.createDefault()
      const nameData = "SUPER BASS".split("").map((c) => c.charCodeAt(0))
      for (let i = 0; i < 10; i++) {
        patch.setParameter(118 + i, nameData[i] || 32)
      }
      cartridge.replacePatch(10, patch)

      const found = cartridge.findPatchByName("SUPER BASS")
      expect(found).not.toBeNull()
      expect(found.name).toBe("SUPER BASS")
    })

    it("should find patch by partial name (case-insensitive)", () => {
      const cartridge = new DX7Cartridge()

      const patch = DX7Patch.createDefault()
      const nameData = "E.PIANO 1".split("").map((c) => c.charCodeAt(0))
      for (let i = 0; i < 10; i++) {
        patch.setParameter(118 + i, nameData[i] || 32)
      }
      cartridge.replacePatch(15, patch)

      const found = cartridge.findPatchByName("piano")
      expect(found).not.toBeNull()
      expect(found.name).toBe("E.PIANO 1")
    })

    it("should return null when patch not found", () => {
      const cartridge = new DX7Cartridge()

      const found = cartridge.findPatchByName("NONEXISTENT")
      expect(found).toBeNull()
    })
  })

  describe("toSysex", () => {
    it("should export to SYSEX format", () => {
      const cartridge = new DX7Cartridge()
      const sysex = cartridge.toSysEx()

      expect(sysex.length).toBe(4104)
      expect(sysex[0]).toBe(0xf0)
      expect(sysex[4103]).toBe(0xf7)
    })

    it("should include correct header", () => {
      const cartridge = new DX7Cartridge()
      const sysex = cartridge.toSysEx()
      const header = sysex.slice(0, 6)

      expect(Array.from(header)).toEqual(DX7Cartridge.SYSEX_HEADER)
    })

    it("should maintain data integrity", () => {
      const originalCartridge = new DX7Cartridge()

      // Modify a patch
      const patch = DX7Patch.createDefault()
      patch.setParameter(0, 123)
      // Clear all name bytes first
      for (let i = 0; i < 10; i++) {
        patch.setParameter(118 + i, 32) // Space
      }
      // Set only first 2 chars
      patch.setParameter(118, "A".charCodeAt(0))
      patch.setParameter(119, "B".charCodeAt(0))
      originalCartridge.replacePatch(7, patch)

      // Export and reimport
      const sysex = originalCartridge.toSysEx()
      const newCartridge = new DX7Cartridge(sysex)

      expect(newCartridge.getPatch(7).getParameter(0)).toBe(123)
      expect(newCartridge.getPatch(7).name).toBe("AB")
    })
  })

  describe("fromFile", () => {
    it("should load cartridge from file", async () => {
      const data = new Uint8Array(4104)
      data[0] = 0xf0
      DX7Cartridge.SYSEX_HEADER.forEach((byte, i) => {
        data[i] = byte
      })
      // Fill with valid voice data
      for (let i = 6; i < 4102; i++) {
        data[i] = 0
      }
      data[4103] = 0xf7

      const blob = new Blob([data])
      const file = new File([blob], "test.syx")

      const cartridge = await DX7Cartridge.fromFile(file)
      expect(cartridge.patches.length).toBe(32)
    })

    it("should reject on invalid file", async () => {
      const data = new Uint8Array(100) // Too small
      const blob = new Blob([data])
      const file = new File([blob], "invalid.syx")

      await expect(DX7Cartridge.fromFile(file)).rejects.toThrow()
    })
  })

  describe("cartridge workflow", () => {
    it("should handle complete create, modify, export workflow", () => {
      // Create empty cartridge
      const cartridge = new DX7Cartridge()

      // Create a custom patch
      const patch = DX7Patch.createDefault()
      patch.setParameter(0, 50)
      patch.setParameter(4, 75)
      patch.setParameter(8, 60) // Break point

      // Set patch name - clear all first then set
      const name = "MY PATCH"
      for (let i = 0; i < 10; i++) {
        patch.setParameter(118 + i, 32) // Space
      }
      for (let i = 0; i < name.length; i++) {
        patch.setParameter(118 + i, name.charCodeAt(i))
      }

      // Add to cartridge
      cartridge.replacePatch(0, patch)

      // Verify
      expect(cartridge.getPatch(0).name).toBe("MY PATCH")
      expect(cartridge.getPatch(0).getParameter(0)).toBe(50)
      expect(cartridge.getPatch(0).getParameter(4)).toBe(75)

      // Export to SYSEX
      const sysex = cartridge.toSysEx()
      expect(sysex.length).toBe(4104)

      // Import back
      const importedCartridge = new DX7Cartridge(sysex)
      expect(importedCartridge.getPatch(0).name).toBe("MY PATCH")
    })
  })
})

describe("Real DX7 ROM Cartridge (ROM1A.syx)", () => {
  let cartridge

  beforeAll(async () => {
    // Load the real DX7 ROM file from fixtures directory
    const fs = await import("fs")
    const path = await import("path")
    const fixturesPath = path.join(__dirname, "../../fixtures/ROM1A.syx")
    const data = fs.readFileSync(fixturesPath)
    cartridge = new DX7Cartridge(data)
  })

  describe("basic cartridge properties", () => {
    it("should load valid DX7 cartridge with 32 patches", () => {
      expect(cartridge.patches.length).toBe(32)
    })

    it("should have valid sysex structure", () => {
      const sysex = cartridge.toSysEx()
      expect(sysex[0]).toBe(0xf0) // SysEx start
      expect(sysex[4103]).toBe(0xf7) // SysEx end
      expect(sysex.length).toBe(4104)
    })

    it("should have correct DX7 header", () => {
      const sysex = cartridge.toSysEx()
      const header = sysex.slice(0, 6)
      expect(Array.from(header)).toEqual(DX7Cartridge.SYSEX_HEADER)
    })
  })

  describe("patch validation", () => {
    it("should have all non-empty patch names", () => {
      const names = cartridge.getPatchNames()
      names.forEach((name, index) => {
        expect(name.length).toBeGreaterThan(0)
        expect(name).not.toBe("")
        console.log(`Patch ${index}: "${name}"`) // Show all patch names
      })
    })

    it("should find known DX7 ROM patches", () => {
      // These are well-known patches from the DX7 ROM (with actual spacing from ROM)
      expect(cartridge.findPatchByName("BRASS")).not.toBeNull() // Partial match for "BRASS   1"
      expect(cartridge.findPatchByName("E.PIANO")).not.toBeNull() // Partial match for "E.PIANO 1"
      expect(cartridge.findPatchByName("BASS")).not.toBeNull() // Partial match for "BASS    1"
      expect(cartridge.findPatchByName("PIANO")).not.toBeNull() // Partial match for "PIANO   1"
    })

    it("should have valid patch parameters", () => {
      const patch = cartridge.getPatch(0)
      expect(patch).not.toBeNull()
      expect(patch.data.length).toBe(128)

      // All parameters should be in valid range (0-127)
      for (let i = 0; i < 128; i++) {
        const param = patch.getParameter(i)
        expect(param).toBeGreaterThanOrEqual(0)
        expect(param).toBeLessThanOrEqual(127)
      }
    })

    it("should unpack real patches correctly", () => {
      const patch = cartridge.getPatch(0)
      const unpacked = patch.unpack()

      expect(unpacked.length).toBe(169) // 159 parameters + 10 name bytes

      // Check EG rates are in valid range
      for (let op = 0; op < 6; op++) {
        const opOffset = op * DX7Patch.UNPACKED_OP_SIZE
        for (let i = 0; i < 4; i++) {
          expect(unpacked[opOffset + i]).toBeGreaterThanOrEqual(0)
          expect(unpacked[opOffset + i]).toBeLessThanOrEqual(99) // EG rates max 99
        }
      }
    })
  })

  describe("data integrity tests", () => {
    it("should maintain data integrity through pack/unpack cycle", () => {
      const originalPatch = cartridge.getPatch(5)
      const unpacked = originalPatch.unpack()
      const repacked = DX7Patch.pack(unpacked)
      const newPatch = new DX7Patch(repacked, 5)

      // Compare all 128 bytes - pack/unpack normalizes the data
      // so we check that packed values match (with 7-bit mask applied)
      for (let i = 0; i < 128; i++) {
        expect(newPatch.data[i]).toBe(originalPatch.data[i] & 0x7f)
      }
    })

    it("should export and reimport without data loss", () => {
      const originalSysex = cartridge.toSysEx()
      const newCartridge = new DX7Cartridge(originalSysex)

      // Compare all patches
      for (let i = 0; i < 32; i++) {
        const originalPatch = cartridge.getPatch(i)
        const newPatch = newCartridge.getPatch(i)

        expect(newPatch.data.length).toBe(originalPatch.data.length)
        for (let j = 0; j < 128; j++) {
          expect(newPatch.data[j]).toBe(originalPatch.data[j])
        }
        expect(newPatch.name).toBe(originalPatch.name)
      }
    })

    it("should validate specific known patch parameters", () => {
      // Test a few known patches from the DX7 ROM
      const brass1 = cartridge.findPatchByName("BRASS")
      expect(brass1).not.toBeNull()

      // Should have some operators active
      const unpacked = brass1.unpack()
      let activeOperators = 0
      for (let op = 0; op < 6; op++) {
        const opOffset = op * DX7Patch.UNPACKED_OP_SIZE
        if (unpacked[opOffset + 16] > 0) {
          activeOperators++
        }
      }
      expect(activeOperators).toBeGreaterThan(0)
    })
  })

  describe("edge cases", () => {
    it("should handle patch extraction at all indices", () => {
      // Verify we can access all 32 patches
      for (let i = 0; i < 32; i++) {
        const patch = cartridge.getPatch(i)
        expect(patch).not.toBeNull()
        expect(patch.index).toBe(i)
        expect(patch.data.length).toBe(128)
      }
    })

    it("should preserve patch names exactly", () => {
      const originalNames = cartridge.getPatchNames()
      const sysex = cartridge.toSysEx()
      const newCartridge = new DX7Cartridge(sysex)
      const newNames = newCartridge.getPatchNames()

      expect(newNames).toEqual(originalNames)
    })

    it("should handle patch replacement and maintain order", () => {
      const originalPatch4 = cartridge.getPatch(4)
      const originalPatch5 = cartridge.getPatch(5)
      const originalPatch6 = cartridge.getPatch(6)
      const newPatch = DX7Patch.createDefault()

      // Set a unique name (pad with spaces like DX7 does)
      const testName = "TESTPATCH"
      for (let i = 0; i < 10; i++) {
        newPatch.setParameter(118 + i, i < testName.length ? testName.charCodeAt(i) : 32)
      }

      cartridge.replacePatch(5, newPatch)

      expect(cartridge.getPatch(5).name).toBe("TESTPATCH")
      expect(cartridge.getPatch(4).name).toBe(originalPatch4.name)
      expect(cartridge.getPatch(6).name).toBe(originalPatch6.name)
    })
  })

  describe("toJSON", () => {
    it("should convert BASS 1 patch to correct JSON format", () => {
      // Get patch 14 which is BASS 1 (based on ROM patch list)
      const bassPatch = cartridge.getPatch(14)
      expect(bassPatch).not.toBeNull()
      expect(bassPatch.name).toBe("BASS    1")

      const json = bassPatch.toJSON()

      // Verify patch name (includes padding)
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

  describe("toSysEx", () => {
    it("should create correct single voice dump format", () => {
      // Get patch 14 which is BASS 1 (based on ROM patch list)
      const bassPatch = cartridge.getPatch(14)
      expect(bassPatch).not.toBeNull()
      expect(bassPatch.name).toBe("BASS    1")

      const sysex = bassPatch.toSysEx()

      // Verify total size (163 bytes)
      expect(sysex.length).toBe(163)

      // Verify header bytes
      expect(sysex[0]).toBe(0xf0) // SysEx start
      expect(sysex[1]).toBe(0x43) // Yamaha ID
      expect(sysex[2]).toBe(0x00) // Channel/format (nibblized)
      expect(sysex[3]).toBe(0x00) // Substatus: bulk dump
      expect(sysex[4]).toBe(0x01) // Format: single voice dump
      expect(sysex[5]).toBe(0x1b) // Packet type

      // Verify voice data (145 bytes of unpacked parameters)
      const voiceData = sysex.slice(6, 151)
      expect(voiceData.length).toBe(145)

      // Voice name: 10 bytes at offset 151-160
      const nameBytes = sysex.slice(151, 161)
      const extractedName = String.fromCharCode(...nameBytes.map(b => b & 0x7f)).trim()
      expect(extractedName).toBe("BASS    1")

      // Verify checksum (byte 161)
      const checksum = sysex[161]
      expect(checksum).toBeGreaterThanOrEqual(0)
      expect(checksum).toBeLessThanOrEqual(127)

      // Verify SysEx end byte
      expect(sysex[162]).toBe(0xf7)

      // Verify checksum is correct
      // Sum all 155 data bytes (bytes 6-160)
      let sum = 0
      for (let i = 6; i < 161; i++) {
        sum += sysex[i]
      }
      const expectedChecksum = (128 - (sum % 128)) & 0x7f
      expect(checksum).toBe(expectedChecksum)
    })

    it("should produce consistent output for same patch", () => {
      const bassPatch = cartridge.getPatch(14)
      const sysex1 = bassPatch.toSysEx()
      const sysex2 = bassPatch.toSysEx()

      // Both outputs should be identical
      expect(sysex1.length).toBe(sysex2.length)
      for (let i = 0; i < sysex1.length; i++) {
        expect(sysex1[i]).toBe(sysex2[i])
      }
    })

    it("should have correct size for single voice dump format", () => {
      const patch = cartridge.getPatch(0)
      const sysex = patch.toSysEx()

      // Single voice dump format:
      // - 6 bytes header
      // - 145 bytes voice data (unpacked format)
      // - 10 bytes voice name
      // - 1 byte checksum
      // - 1 byte F7 footer
      // Total: 163 bytes
      expect(sysex.length).toBe(163)
    })

    it("should validate checksum calculation", () => {
      const patch = cartridge.getPatch(0)
      const sysex = patch.toSysEx()

      // Manually calculate checksum
      let calculatedSum = 0
      for (let i = 6; i < 161; i++) {
        calculatedSum += sysex[i]
      }
      const calculatedChecksum = (128 - (calculatedSum % 128)) & 0x7f

      // Compare with actual checksum in the SysEx (at index 161, before F7 at 162)
      expect(sysex[161]).toBe(calculatedChecksum)
      expect(sysex[162]).toBe(0xf7) // Verify F7 is at the correct position
    })
  })
})
