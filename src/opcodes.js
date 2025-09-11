/**
 * @fileoverview VM opcodes for Project Hikari, grouped by category.
 * Each instruction is a single byte. Comments indicate operands.
 */

/**
 * An enumeration of all bytecode instructions for the virtual machine.
 * @readonly
 * @enum {number}
 */
export const Opcodes = {
  // --- Constants & Literals ---
  OP_CONSTANT: 0x00, // Operand: 1-byte constant index.
  OP_PUSH_NULL: 0x01,
  OP_PUSH_TRUE: 0x02,
  OP_PUSH_FALSE: 0x03,
  OP_POP: 0x04,
  OP_DUPLICATE: 0x05,

  // --- Binary Operations ---
  OP_ADD: 0x10,
  OP_SUBTRACT: 0x11,
  OP_MULTIPLY: 0x12,
  OP_DIVIDE: 0x13,
  OP_EQUAL: 0x14,
  OP_NOT_EQUAL: 0x15,
  OP_GREATER: 0x16,
  OP_LESS: 0x17,
  OP_GREATER_EQUAL: 0x18,
  OP_LESS_EQUAL: 0x19,
  OP_MODULO: 0x1A,
  OP_POWER: 0x1B,

  // --- Unary Operations ---
  OP_NEGATE: 0x20,
  OP_NOT: 0x21,

  // --- Variables ---
  OP_GET_GLOBAL: 0x30,       // Operand: 1-byte constant index (name).
  OP_SET_GLOBAL: 0x31,       // Operand: 1-byte constant index (name).
  OP_DEFINE_GLOBAL: 0x3C,    // Operand: 1-byte constant index (name).
  OP_GET_LOCAL: 0x32,        // Operand: 1-byte stack slot index.
  OP_SET_LOCAL: 0x33,        // Operand: 1-byte stack slot index.
  OP_GET_UPVALUE: 0x34,      // Operand: 1-byte upvalue index.
  OP_SET_UPVALUE: 0x35,      // Operand: 1-byte upvalue index.
  OP_INCREMENT_LOCAL: 0x36,  // Operand: 1-byte stack slot index.
  OP_DECREMENT_LOCAL: 0x37,  // Operand: 1-byte stack slot index.
  OP_INCREMENT_GLOBAL: 0x38, // Operand: 1-byte constant index (name).
  OP_DECREMENT_GLOBAL: 0x39, // Operand: 1-byte constant index (name).
  OP_INCREMENT_UPVALUE: 0x3A,// Operand: 1-byte upvalue index.
  OP_DECREMENT_UPVALUE: 0x3B,// Operand: 1-byte upvalue index.

  // --- Jumps ---
  OP_JUMP: 0x40,          // Operand: 2-byte jump offset.
  OP_JUMP_IF_FALSE: 0x41, // Operand: 2-byte jump offset.
  OP_LOOP: 0x42,          // Operand: 2-byte backward jump offset.

  // --- Exceptions ---
  OP_SETUP_TRY: 0x50, // Operand: 2-byte jump offset to catch block.
  OP_POP_CATCH: 0x51,
  OP_THROW: 0x52,

  // --- Functions ---
  OP_CALL: 0x60,         // Operand: 1-byte argument count.
  OP_RETURN: 0x61,
  OP_CLOSURE: 0x62,      // Operand: 1-byte constant index (FunctionObject).
  OP_CLOSE_UPVALUE: 0x63,

  // --- Coroutines / Async ---
  OP_YIELD: 0x69,
  OP_AWAIT: 0x6A,

  // --- Interoperability ---
  OP_GET_NATIVE: 0x70,    // Operand: 1-byte constant index (name).
  OP_CALL_METHOD: 0x71,   // Operands: 1-byte const index (name), 1-byte arg count.
  OP_SET_PROTOTYPE: 0x72,

  // --- Data Structures ---
  OP_NEW_ARRAY: 0x80,        // Operand: 1-byte element count.
  OP_GET_INDEX: 0x81,
  OP_SET_INDEX: 0x82,
  OP_NEW_OBJECT: 0x83,       // Operand: 1-byte property count (key-value pairs).
  OP_GET_PROPERTY: 0x84,
  OP_SET_PROPERTY: 0x85,
  OP_GET_PROPERTY_PROTO: 0x86,// Operand: 1-byte constant index (name).
  OP_SET_PROPERTY_PROTO: 0x87,// Operand: 1-byte constant index (name).
  OP_OBJECT_CREATE: 0x88,

  // --- Classes and Instances ---
  OP_GET_PROTOTYPE: 0x90,
  OP_NEW: 0x91,              // Operand: 1-byte argument count for constructor.
  OP_INCREMENT_PROPERTY: 0x92,// Operands: 1-byte const index (name), 1-byte mode.
  OP_DECREMENT_PROPERTY: 0x93,// Operands: 1-byte const index (name), 1-byte mode.

  // --- Control ---
  OP_HALT: 0xFF,
};

/**
 * A reverse mapping from opcode number to its string name.
 * Useful for debugging and disassembling bytecode.
 * @type {Object.<number, string>}
 */
export const OpcodeNames = Object.fromEntries(
  Object.entries(Opcodes).map(([name, code]) => [code, name])
);
