import { describe, expect, it } from "vitest"
import {
  isValidCC,
  isValidChannel,
  isValidMIDIValue,
  isValidNote,
  isValidVelocity,
} from "./validators.js"

describe("Validators - Complete Tests", () => {
  describe("isValidChannel", () => {
    const validChannels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    const invalidChannels = [
      0,
      17,
      -1,
      100,
      1.5,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      null,
      "",
      "1",
      undefined,
    ]

    it("should validate all valid channels 1-16", () => {
      validChannels.forEach((channel) => {
        expect(isValidChannel(channel)).toBe(true)
      })
    })

    it("should reject invalid channels", () => {
      invalidChannels.forEach((channel) => {
        expect(isValidChannel(channel)).toBe(false)
      })
    })

    it("should only accept integers", () => {
      expect(isValidChannel(1)).toBe(true)
      expect(isValidChannel(1.0)).toBe(true)
      expect(isValidChannel(1.5)).toBe(false)
      expect(isValidChannel(Number.EPSILON)).toBe(false)
    })
  })

  describe("isValidCC", () => {
    it("should validate all valid CC numbers 0-127", () => {
      for (let cc = 0; cc <= 127; cc++) {
        expect(isValidCC(cc)).toBe(true)
      }
    })

    it("should reject invalid CC numbers", () => {
      const invalid = [-1, 128, 200, 1.5, 63.7, NaN, Infinity, -Infinity, null, "", "1", undefined]
      invalid.forEach((cc) => {
        expect(isValidCC(cc)).toBe(false)
      })
    })

    it("should only accept integers", () => {
      expect(isValidCC(64)).toBe(true)
      expect(isValidCC(64.0)).toBe(true)
      expect(isValidCC(64.1)).toBe(false)
    })
  })

  describe("isValidMIDIValue", () => {
    it("should validate all valid MIDI values 0-127", () => {
      for (let value = 0; value <= 127; value++) {
        expect(isValidMIDIValue(value)).toBe(true)
      }
    })

    it("should reject invalid values", () => {
      const invalid = [-1, 128, 200, 1.5, NaN, Infinity, -Infinity, null, "", "1", undefined]
      invalid.forEach((value) => {
        expect(isValidMIDIValue(value)).toBe(false)
      })
    })

    it("should only accept integers", () => {
      expect(isValidMIDIValue(100)).toBe(true)
      expect(isValidMIDIValue(100.0)).toBe(true)
      expect(isValidMIDIValue(100.5)).toBe(false)
    })
  })

  describe("isValidNote", () => {
    it("should validate all valid note numbers 0-127", () => {
      for (let note = 0; note <= 127; note++) {
        expect(isValidNote(note)).toBe(true)
      }
    })

    it("should reject invalid note numbers", () => {
      const invalid = [-1, 128, 200, 1.5, 60.5, NaN, Infinity, -Infinity, null, "", "60", undefined]
      invalid.forEach((note) => {
        expect(isValidNote(note)).toBe(false)
      })
    })

    it("should only accept integers", () => {
      expect(isValidNote(60)).toBe(true)
      expect(isValidNote(60.0)).toBe(true)
      expect(isValidNote(60.5)).toBe(false)
    })
  })

  describe("isValidVelocity", () => {
    it("should validate all valid velocities 0-127", () => {
      for (let velocity = 0; velocity <= 127; velocity++) {
        expect(isValidVelocity(velocity)).toBe(true)
      }
    })

    it("should reject invalid velocities", () => {
      const invalid = [-1, 128, 200, 1.5, 64.7, NaN, Infinity, -Infinity, null, "", "64", undefined]
      invalid.forEach((velocity) => {
        expect(isValidVelocity(velocity)).toBe(false)
      })
    })

    it("should only accept integers", () => {
      expect(isValidVelocity(100)).toBe(true)
      expect(isValidVelocity(100.0)).toBe(true)
      expect(isValidVelocity(100.5)).toBe(false)
    })

    it("should validate common velocity values", () => {
      expect(isValidVelocity(0)).toBe(true) // Note off
      expect(isValidVelocity(64)).toBe(true) // Medium
      expect(isValidVelocity(100)).toBe(true) // Strong
      expect(isValidVelocity(127)).toBe(true) // Maximum
    })
  })

  describe("validator edge cases", () => {
    it("should handle boundary values correctly", () => {
      // Valid boundaries
      expect(isValidChannel(1)).toBe(true)
      expect(isValidChannel(16)).toBe(true)
      expect(isValidCC(0)).toBe(true)
      expect(isValidCC(127)).toBe(true)
      expect(isValidMIDIValue(0)).toBe(true)
      expect(isValidMIDIValue(127)).toBe(true)
      expect(isValidNote(0)).toBe(true)
      expect(isValidNote(127)).toBe(true)
      expect(isValidVelocity(0)).toBe(true)
      expect(isValidVelocity(127)).toBe(true)

      // Invalid boundaries
      expect(isValidChannel(0)).toBe(false)
      expect(isValidChannel(17)).toBe(false)
      expect(isValidCC(-1)).toBe(false)
      expect(isValidCC(128)).toBe(false)
      expect(isValidMIDIValue(-1)).toBe(false)
      expect(isValidMIDIValue(128)).toBe(false)
      expect(isValidNote(-1)).toBe(false)
      expect(isValidNote(128)).toBe(false)
      expect(isValidVelocity(-1)).toBe(false)
      expect(isValidVelocity(128)).toBe(false)
    })

    it("should handle all zero edge cases", () => {
      expect(isValidChannel(0)).toBe(false) // Channel 0 is not valid
      expect(isValidCC(0)).toBe(true) // CC 0 is valid
      expect(isValidMIDIValue(0)).toBe(true) // Value 0 is valid
      expect(isValidNote(0)).toBe(true) // Note 0 is valid
      expect(isValidVelocity(0)).toBe(true) // Velocity 0 is valid
    })

    it("should handle non-numeric inputs", () => {
      const nonNumeric = ["1", "", null, undefined, {}, []]
      nonNumeric.forEach((value) => {
        expect(isValidChannel(value)).toBe(false)
        expect(isValidCC(value)).toBe(false)
        expect(isValidMIDIValue(value)).toBe(false)
        expect(isValidNote(value)).toBe(false)
        expect(isValidVelocity(value)).toBe(false)
      })
    })
  })
})
