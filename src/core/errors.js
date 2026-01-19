/**
 * Base error class for all MIDI-related errors
 */
export class MIDIError extends Error {
  constructor(message, code) {
    super(message)
    this.name = "MIDIError"
    this.code = code

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * Error thrown when MIDI access fails due to browser support or permissions
 */
export class MIDIAccessError extends MIDIError {
  constructor(message, reason) {
    super(message, "MIDI_ACCESS_ERROR")
    this.name = "MIDIAccessError"
    this.reason = reason
  }
}

/**
 * Error thrown when MIDI connection fails or is not initialized
 */
export class MIDIConnectionError extends MIDIError {
  constructor(message) {
    super(message, "MIDI_CONNECTION_ERROR")
    this.name = "MIDIConnectionError"
  }
}

/**
 * Error thrown when a MIDI device cannot be found or accessed
 */
export class MIDIDeviceError extends MIDIError {
  constructor(message, deviceType, deviceId) {
    super(message, "MIDI_DEVICE_ERROR")
    this.name = "MIDIDeviceError"
    this.deviceType = deviceType // 'input' or 'output'
    this.deviceId = deviceId
  }
}

/**
 * Error thrown when MIDI validation fails (invalid parameters, formats, etc.)
 */
export class MIDIValidationError extends MIDIError {
  constructor(message, validationType) {
    super(message, "MIDI_VALIDATION_ERROR")
    this.name = "MIDIValidationError"
    this.validationType = validationType // 'note', 'patch', 'callback', etc.
  }
}

/**
 * Base error class for all DX7-related errors
 */
export class DX7Error extends Error {
  constructor(message, code) {
    super(message)
    this.name = "DX7Error"
    this.code = code

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * Error thrown when DX7 SysEx data parsing fails
 */
export class DX7ParseError extends DX7Error {
  constructor(message, parseType, offset) {
    super(message, "DX7_PARSE_ERROR")
    this.name = "DX7ParseError"
    this.parseType = parseType // 'header', 'voice', 'bank', etc.
    this.offset = offset // Byte offset where error occurred
  }
}

/**
 * Error thrown when DX7 parameter validation fails
 */
export class DX7ValidationError extends DX7Error {
  constructor(message, validationType, value) {
    super(message, "DX7_VALIDATION_ERROR")
    this.name = "DX7ValidationError"
    this.validationType = validationType // 'offset', 'length', 'parameter', etc.
    this.value = value // Invalid value that caused the error
  }
}
