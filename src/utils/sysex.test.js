import { describe, expect, it } from "vitest"
import { createSysEx, decode7Bit, encode7Bit, isSysEx, parseSysEx } from "./sysex.js"

describe("SysEx Utils", () => {
  describe("parseSysEx", () => {
    it("should parse valid SysEx messages", () => {
      const data = [0xf0, 0x41, 0x10, 0x20, 0x30, 0xf7]
      const result = parseSysEx(data)
      expect(result).toEqual({
        manufacturerId: 0x41,
        payload: [0x10, 0x20, 0x30],
        raw: data,
      })
    })

    it("should return null for non-SysEx messages", () => {
      expect(parseSysEx([0x90, 0x40, 0x7f])).toBeNull() // Note on
      expect(parseSysEx([0xb0, 0x01, 0x40])).toBeNull() // CC
      expect(parseSysEx([0xf0, 0x41, 0x10])).toBeNull() // Missing F7
      expect(parseSysEx([0x41, 0x10, 0xf7])).toBeNull() // Missing F0
    })

    it("should handle empty payload", () => {
      const data = [0xf0, 0xf7]
      expect(parseSysEx(data)).toEqual({
        manufacturerId: 0xf7,
        payload: [],
        raw: data,
      })
    })

    it("should handle long SysEx messages", () => {
      const payload = new Array(100).fill(0x40)
      const data = [0xf0, 0x41, ...payload, 0xf7]
      const result = parseSysEx(data)
      expect(result.payload.length).toBe(100)
      expect(result.payload.every((byte) => byte === 0x40)).toBe(true)
    })
  })

  describe("createSysEx", () => {
    it("should create valid SysEx messages", () => {
      const result = createSysEx(0x41, [0x10, 0x20, 0x30])
      expect(result).toEqual([0xf0, 0x41, 0x10, 0x20, 0x30, 0xf7])
    })

    it("should handle empty payload", () => {
      expect(createSysEx(0x41, [])).toEqual([0xf0, 0x41, 0xf7])
    })

    it("should handle single byte payload", () => {
      expect(createSysEx(0x41, [0x7f])).toEqual([0xf0, 0x41, 0x7f, 0xf7])
    })
  })

  describe("isSysEx", () => {
    it("should identify SysEx messages", () => {
      expect(isSysEx([0xf0, 0x41, 0x10, 0xf7])).toBe(true)
      expect(isSysEx([0xf0, 0xf7])).toBe(true)
    })

    it("should reject non-SysEx messages", () => {
      expect(isSysEx([0x90, 0x40, 0x7f])).toBe(false) // Note on
      expect(isSysEx([0xb0, 0x01, 0x40])).toBe(false) // CC
      expect(isSysEx([0xf0, 0x41, 0x10])).toBe(false) // Missing F7
      expect(isSysEx([0x41, 0x10, 0xf7])).toBe(false) // Missing F0
      expect(isSysEx([])).toBe(false) // Empty
      expect(isSysEx([0xf0])).toBe(false) // Too short
    })
  })

  describe("encode7Bit", () => {
    it("should encode 8-bit data to 7-bit MIDI format", () => {
      // 7 bytes of 8-bit data should encode to 8 bytes of 7-bit data
      const data = [0x80, 0x40, 0x20, 0x7f, 0xff, 0x00, 0x01]
      const result = encode7Bit(data)

      // Should be exactly 8 bytes (1 header + 7 data)
      expect(result.length).toBe(8)

      // All bytes should be 7-bit values (<= 0x7f)
      expect(result.every((byte) => byte <= 0x7f)).toBe(true)

      // First byte is header with packed MSBs: bytes 0 and 4 have MSB=1
      // Bits: 0b0010001 = 0x11 (bits 0 and 4 set)
      expect(result[0]).toBe(0x11)

      // Remaining bytes are lower 7 bits of each input byte
      expect(result.slice(1)).toEqual([0x00, 0x40, 0x20, 0x7f, 0x7f, 0x00, 0x01])
    })

    it("should handle single byte encoding", () => {
      // Single byte should still work but creates a group
      expect(encode7Bit([0x80])).toEqual([0x01, 0x00])
      expect(encode7Bit([0x40])).toEqual([0x00, 0x40])
      expect(encode7Bit([0x7f])).toEqual([0x00, 0x7f])
    })

    it("should handle empty data", () => {
      expect(encode7Bit([])).toEqual([])
    })

    it("should handle multiple groups", () => {
      // 14 bytes should encode to 16 bytes (2 groups of 8)
      const data = [
        0x80, 0x40, 0x20, 0x7f, 0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      ]
      const result = encode7Bit(data)

      expect(result.length).toBe(16)
      expect(result.every((byte) => byte <= 0x7f)).toBe(true)

      // First group header (bytes 0 and 4 have MSB set)
      expect(result[0]).toBe(0x11)
      // First group data bytes
      expect(result.slice(1, 8)).toEqual([0x00, 0x40, 0x20, 0x7f, 0x7f, 0x00, 0x01])

      // Second group header (no bytes have MSB set)
      expect(result[8]).toBe(0x00)
      // Second group data bytes
      expect(result.slice(9, 16)).toEqual([0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
    })

    it("should handle partial last group", () => {
      // 5 bytes should encode to 6 bytes (header + 5 data)
      const data = [0x80, 0x40, 0x20, 0x7f, 0xff]
      const result = encode7Bit(data)

      expect(result.length).toBe(6)
      expect(result.every((byte) => byte <= 0x7f)).toBe(true)
      expect(result[0]).toBe(0x11) // Header: bytes 0 and 3 have MSB set
    })

    it("should handle all values from 0x00 to 0xff", () => {
      // Test with values that have various bit patterns
      const data = [0x00, 0x01, 0x7f, 0x80, 0xff]
      const result = encode7Bit(data)

      expect(result.length).toBe(6)
      expect(result.every((byte) => byte <= 0x7f)).toBe(true)

      // Check specific values
      expect(result[0]).toBe(0x18) // Header: 0x80 and 0xff have MSB set
      expect(result[1]).toBe(0x00) // 0x00 & 0x7f
      expect(result[2]).toBe(0x01) // 0x01 & 0x7f
      expect(result[3]).toBe(0x7f) // 0x7f & 0x7f
      expect(result[4]).toBe(0x00) // 0x80 & 0x7f
      expect(result[5]).toBe(0x7f) // 0xff & 0x7f
    })
  })

  describe("decode7Bit", () => {
    it("should decode 7-bit format to 8-bit data", () => {
      // Decode the 8-byte encoded data back to original 7 bytes
      const encoded = [0x11, 0x00, 0x40, 0x20, 0x7f, 0x7f, 0x00, 0x01]
      const decoded = decode7Bit(encoded)

      // Should reconstruct the original 7 bytes
      expect(decoded).toEqual([0x80, 0x40, 0x20, 0x7f, 0xff, 0x00, 0x01])
    })

    it("should handle single byte decoding", () => {
      // Single byte encoded
      const result = decode7Bit([0x01, 0x00])
      expect(result).toEqual([0x80])
    })

    it("should handle empty data", () => {
      expect(decode7Bit([])).toEqual([])
    })

    it("should round-trip correctly", () => {
      const testData = [
        [0x00],
        [0x00, 0x01, 0x7f],
        [0x80, 0x40, 0x20, 0x7f, 0xff, 0x00, 0x01],
        [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
        new Array(14).fill(0x42),
        [0x00, 0x01, 0x02, 0x03, 0x04, 0x05],
      ]

      testData.forEach((original) => {
        const encoded = encode7Bit(original)
        const decoded = decode7Bit(encoded)
        expect(decoded).toEqual(original)
      })
    })

    it("should handle multiple groups", () => {
      // Two groups of 8 bytes each
      const encoded = [
        0x11,
        0x00,
        0x40,
        0x20,
        0x7f,
        0x7f,
        0x00,
        0x01, // First group
        0x00,
        0x02,
        0x03,
        0x04,
        0x05,
        0x06,
        0x07,
        0x08, // Second group
      ]
      const decoded = decode7Bit(encoded)
      expect(decoded.length).toBe(14)
      expect(decoded.slice(0, 7)).toEqual([0x80, 0x40, 0x20, 0x7f, 0xff, 0x00, 0x01])
      expect(decoded.slice(7)).toEqual([0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
    })

    it("should handle partial last group", () => {
      // Partial group with 5 data bytes
      const encoded = [0x11, 0x00, 0x40, 0x20, 0x7f, 0x7f]
      const decoded = decode7Bit(encoded)
      expect(decoded).toEqual([0x80, 0x40, 0x20, 0x7f, 0xff])
    })
  })
})
