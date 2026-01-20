/**
 * DX7 Type Definitions
 * Shared type definitions for DX7 voice and bank structures
 */

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
