import { describe, expect, it } from "vitest"
import {
  clamp,
  decode14BitValue,
  denormalize14BitValue,
  denormalizeValue,
  encode14BitValue,
  frequencyToNote,
  getCCName,
  normalize14BitValue,
  normalizeValue,
  noteNameToNumber,
  noteNumberToName,
  noteToFrequency,
} from "./midi.js"

describe("MIDI Utils - Additional Tests", () => {
  describe("denormalizeValue", () => {
    it("should denormalize MIDI values to custom range", () => {
      expect(denormalizeValue(64, 0, 100, false)).toBeCloseTo(50, 0) // 50% of 100
      expect(denormalizeValue(0, 0, 100, false)).toBe(0)
      expect(denormalizeValue(127, 0, 100, false)).toBe(100)
    })

    it("should invert values when requested", () => {
      expect(denormalizeValue(0, 0, 100, true)).toBe(100)
      expect(denormalizeValue(127, 0, 100, true)).toBe(0)
      expect(denormalizeValue(64, 0, 100, true)).toBeCloseTo(50, 0)
    })

    it("should handle negative ranges", () => {
      expect(denormalizeValue(0, -50, 50, false)).toBe(-50)
      expect(denormalizeValue(127, -50, 50, false)).toBe(50)
      expect(denormalizeValue(64, -50, 50, false)).toBeCloseTo(0, 0)
    })
  })

  describe("frequencyToNote", () => {
    it("should convert frequencies to MIDI notes", () => {
      expect(frequencyToNote(440)).toBe(69) // A4
      expect(frequencyToNote(261.63)).toBe(60) // C4
      expect(frequencyToNote(220)).toBe(57) // A3
    })

    it("should clamp to valid MIDI range", () => {
      expect(frequencyToNote(20000)).toBe(127) // Very high frequency
      expect(frequencyToNote(1)).toBe(0) // Very low frequency
    })

    it("should round to nearest note", () => {
      expect(frequencyToNote(441)).toBe(69)
      expect(frequencyToNote(439)).toBe(69)
    })
  })

  describe("noteToFrequency", () => {
    it("should convert MIDI notes to frequencies", () => {
      expect(noteToFrequency(69)).toBeCloseTo(440, 2) // A4
      expect(noteToFrequency(60)).toBeCloseTo(261.63, 2) // C4
      expect(noteToFrequency(57)).toBeCloseTo(220, 2) // A3
    })

    it("should handle all valid notes", () => {
      expect(noteToFrequency(0)).toBeCloseTo(8.18, 2)
      expect(noteToFrequency(127)).toBeCloseTo(12543.85, 2)
    })
  })

  describe("clamp - additional edge cases", () => {
    it("should handle equal min and max", () => {
      expect(clamp(5, 10, 10)).toBe(10)
      expect(clamp(15, 10, 10)).toBe(10)
    })

    it("should handle NaN values", () => {
      expect(clamp(NaN, 0, 100)).toBeNaN()
    })

    it("should handle infinity", () => {
      expect(clamp(Infinity, 0, 100)).toBe(100)
      expect(clamp(-Infinity, 0, 100)).toBe(0)
    })
  })

  describe("normalizeValue - additional edge cases", () => {
    it("should handle equal input range", () => {
      // Division by zero case - should handle gracefully
      const result = normalizeValue(50, 50, 50, false)
      expect(result).toBeNaN()
    })

    it("should handle out of range values", () => {
      expect(normalizeValue(200, 0, 100, false)).toBe(127)
      expect(normalizeValue(-50, 0, 100, false)).toBe(0)
    })
  })

  describe("noteNameToNumber - additional tests", () => {
    it("should handle all valid note names", () => {
      expect(noteNameToNumber("C0")).toBe(12)
      expect(noteNameToNumber("C#0")).toBe(13)
      expect(noteNameToNumber("Db0")).toBe(13)
      expect(noteNameToNumber("G9")).toBe(127)
    })

    it("should handle case variations", () => {
      expect(noteNameToNumber("c4")).toBe(60)
      expect(noteNameToNumber("A#4")).toBe(70)
      expect(noteNameToNumber("bb4")).toBe(70)
    })

    it("should throw on invalid note names", () => {
      expect(() => noteNameToNumber("C#")).toThrow("Invalid note name")
      expect(() => noteNameToNumber("H4")).toThrow("Invalid note")
      // C10 is actually valid (12 * 11 = 132, which gets clamped to 127)
      expect(() => noteNameToNumber("C10")).not.toThrow()
      expect(noteNameToNumber("C10")).toBe(127) // Clamped to max
    })
  })

  describe("noteNumberToName - additional tests", () => {
    it("should handle all octaves", () => {
      expect(noteNumberToName(0)).toBe("C-1")
      expect(noteNumberToName(127)).toBe("G9")
    })

    it("should use flats when requested", () => {
      expect(noteNumberToName(70, true)).toBe("Bb4")
      expect(noteNumberToName(72, true)).toBe("C5") // No flat for C
    })
  })

  describe("getCCName - additional tests", () => {
    it("should return all known CC names", () => {
      expect(getCCName(0)).toBe("Bank Select")
      expect(getCCName(1)).toBe("Modulation")
      expect(getCCName(7)).toBe("Volume")
      expect(getCCName(64)).toBe("Sustain Pedal")
      expect(getCCName(120)).toBe("All Sound Off")
    })

    it("should return generic format for unknown CCs", () => {
      expect(getCCName(200)).toBe("CC 200")
      expect(getCCName(-1)).toBe("CC -1")
    })
  })

  describe("14-bit MIDI", () => {
    describe("encode14BitValue", () => {
      it("should encode 0 to MSB=0, LSB=0", () => {
        expect(encode14BitValue(0)).toEqual({ msb: 0, lsb: 0 })
      })

      it("should encode 16383 to MSB=127, LSB=127", () => {
        expect(encode14BitValue(16383)).toEqual({ msb: 127, lsb: 127 })
      })

      it("should encode middle value correctly", () => {
        const result = encode14BitValue(8192)
        expect(result.msb).toBe(64)
        expect(result.lsb).toBe(0)
      })

      it("should clamp values below 0", () => {
        expect(encode14BitValue(-100)).toEqual({ msb: 0, lsb: 0 })
      })

      it("should clamp values above 16383", () => {
        expect(encode14BitValue(20000)).toEqual({ msb: 127, lsb: 127 })
      })
    })

    describe("decode14BitValue", () => {
      it("should decode MSB=0, LSB=0 to 0", () => {
        expect(decode14BitValue(0, 0)).toBe(0)
      })

      it("should decode MSB=127, LSB=127 to 16383", () => {
        expect(decode14BitValue(127, 127)).toBe(16383)
      })

      it("should decode middle values correctly", () => {
        expect(decode14BitValue(64, 0)).toBe(8192)
        expect(decode14BitValue(32, 0)).toBe(4096)
        expect(decode14BitValue(96, 0)).toBe(12288)
      })
    })

    describe("encode14BitValue / decode14BitValue round-trip", () => {
      it("should round-trip all edge values", () => {
        const testValues = [0, 1, 127, 128, 16383]
        testValues.forEach((value) => {
          const encoded = encode14BitValue(value)
          const decoded = decode14BitValue(encoded.msb, encoded.lsb)
          expect(decoded).toBe(value)
        })
      })

      it("should round-trip random values", () => {
        for (let i = 0; i < 100; i++) {
          const value = Math.floor(Math.random() * 16384)
          const encoded = encode14BitValue(value)
          const decoded = decode14BitValue(encoded.msb, encoded.lsb)
          expect(decoded).toBe(value)
        }
      })
    })

    describe("normalize14BitValue", () => {
      it("should normalize input range to 14-bit MSB/LSB", () => {
        const result = normalize14BitValue(50, 0, 100, false)
        expect(result).toHaveProperty("msb")
        expect(result).toHaveProperty("lsb")
        expect(result.msb).toBeGreaterThanOrEqual(0)
        expect(result.msb).toBeLessThanOrEqual(127)
        expect(result.lsb).toBeGreaterThanOrEqual(0)
        expect(result.lsb).toBeLessThanOrEqual(127)
      })

      it("should handle min=0, max=127", () => {
        const result = normalize14BitValue(64, 0, 127, false)
        const decoded = decode14BitValue(result.msb, result.lsb)
        // 64/127 = 0.5039, so decoded should be ~8256 (0.5039 * 16383)
        expect(decoded).toBeGreaterThan(8200)
        expect(decoded).toBeLessThan(8300)
      })

      it("should invert values when requested", () => {
        const result = normalize14BitValue(0, 0, 100, true)
        expect(result.msb).toBe(127)
        expect(result.lsb).toBe(127)
      })

      it("should handle negative ranges", () => {
        const result = normalize14BitValue(0, -50, 50, false)
        expect(result.msb).toBe(64)
        expect(result.lsb).toBe(0)
      })
    })

    describe("denormalize14BitValue", () => {
      it("should denormalize 14-bit values to custom range", () => {
        const msb = 64
        const lsb = 0
        const result = denormalize14BitValue(msb, lsb, 0, 100, false)
        expect(result).toBeCloseTo(50, 1)
      })

      it("should handle min=0, max=16383", () => {
        expect(denormalize14BitValue(0, 0, 0, 16383, false)).toBe(0)
        expect(denormalize14BitValue(127, 127, 0, 16383, false)).toBe(16383)
      })

      it("should invert values when requested", () => {
        const result = denormalize14BitValue(0, 0, 0, 100, true)
        expect(result).toBeCloseTo(100, 0)
      })
    })
  })
})
