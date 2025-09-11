/**
 * @fileoverview Bytecode disassembler for Project Hikari VM.
 *
 * Converts compiled bytecode chunks into human-readable output for
 * debugging the compiler and inspecting VM execution.
 */

import { OpcodeNames, Opcodes } from '../opcodes.js';
import { FunctionObject } from '../compiler/CompilerState.js';

// Prevents infinite recursion for recursive functions.
const disassembledFunctions = new Set();

// Jump target labels for a single function disassembly.
let jumpLabels = new Map();

// Terminal colors for readability.
const color = {
  opcode: (s) => `\x1b[1;36m${s}\x1b[0m`, // cyan bold
  label: (s) => `\x1b[1;35m${s}\x1b[0m`,  // magenta
  comment: (s) => `\x1b[2;37m; ${s}\x1b[0m`, // gray
  warn: (s) => `\x1b[1;33m${s}\x1b[0m`,   // yellow
};

// Generate or retrieve a label for a bytecode offset.
function getLabel(offset) {
  if (!jumpLabels.has(offset)) {
    jumpLabels.set(offset, `label_${String(offset).padStart(4, '0')}`);
  }
  return jumpLabels.get(offset);
}

// Reset disassembler state before a new program.
export function resetDisassemblerState() {
  disassembledFunctions.clear();
}

/** Disassemble a FunctionObject and nested functions in its constants. */
export function disassembleFunction(func) {
  _disassembleChunk(func, func.name || '<script>');

  for (const constant of func.constants) {
    if (constant instanceof FunctionObject) {
      disassembleFunction(constant);
    }
  }
}

// Internal helper for a single bytecode chunk.
function _disassembleChunk(func, name) {
  if (disassembledFunctions.has(func)) return;
  disassembledFunctions.add(func);

  jumpLabels = new Map(); // Reset labels for this function.

  const flags = [];
  if (func.isGenerator || func.generator) flags.push('generator');
  if (func.isAsync || func.async) flags.push('async');
  const flagStr = flags.length ? ` (${flags.join(', ')})` : '';

  console.log(`\n--- Disassembly: ${name} (arity: ${func.arity})${flagStr} ---`);

  const b = func.bytecode;
  let offset = 0;

  while (offset < b.length) {
    if (jumpLabels.has(offset)) {
      console.log(`${color.label(jumpLabels.get(offset))}:`);
    }

    const lineStart = `${String(offset).padStart(4, '0')}  `;
    const opcode = b[offset++];
    let line = `${lineStart}${color.opcode(OpcodeNames[opcode] || `UNKNOWN_OPCODE_${opcode.toString(16)}`)}`;

    switch (opcode) {
      // 1-byte operands
      case Opcodes.OP_CONSTANT:
      case Opcodes.OP_DEFINE_GLOBAL:
      case Opcodes.OP_GET_GLOBAL:
      case Opcodes.OP_SET_GLOBAL:
      case Opcodes.OP_GET_LOCAL:
      case Opcodes.OP_SET_LOCAL:
      case Opcodes.OP_GET_UPVALUE:
      case Opcodes.OP_SET_UPVALUE:
      case Opcodes.OP_CALL:
      case Opcodes.OP_GET_NATIVE:
      case Opcodes.OP_INCREMENT_LOCAL:
      case Opcodes.OP_DECREMENT_LOCAL:
      case Opcodes.OP_INCREMENT_GLOBAL:
      case Opcodes.OP_DECREMENT_GLOBAL:
      case Opcodes.OP_INCREMENT_UPVALUE:
      case Opcodes.OP_DECREMENT_UPVALUE:
      case Opcodes.OP_NEW_ARRAY:
      case Opcodes.OP_NEW_OBJECT:
      case Opcodes.OP_GET_PROPERTY_PROTO:
      case Opcodes.OP_SET_PROPERTY_PROTO:
      case Opcodes.OP_NEW: {
        const operand = b[offset++];
        line += ` ${operand}`;
        const constant = func.constants?.[operand];
        if (constant !== undefined) {
          let constantValue;
          if (typeof constant === 'string') constantValue = `'${constant}'`;
          else if (constant instanceof FunctionObject) {
            const fFlags = [];
            if (constant.isGenerator || constant.generator) fFlags.push('generator');
            if (constant.isAsync || constant.async) fFlags.push('async');
            constantValue = `<function ${constant.name || '<anonymous>'}${fFlags.length ? ' ' + fFlags.join('/') : ''}>`;
          } else if (typeof constant === 'object' && constant?.name) {
            constantValue = `'${constant.name}'`;
          } else constantValue = JSON.stringify(constant);

          line += ` ${color.comment(opcode === Opcodes.OP_NEW ? `(${operand} args)` : `(${constantValue})`)}`;
        }
        break;
      }

      // 2 1-byte operands
      case Opcodes.OP_CALL_METHOD:
      case Opcodes.OP_INCREMENT_PROPERTY:
      case Opcodes.OP_DECREMENT_PROPERTY: {
        const operand1 = b[offset++];
        const operand2 = b[offset++];
        line += ` ${operand1} ${operand2}`;

        if (opcode === Opcodes.OP_CALL_METHOD) {
          const methodName = func.constants[operand1];
          line += ` ${color.comment(`'${methodName}', ${operand2} args`)}`;
        } else {
          const POSTFIX = 0, PREFIX = 1;
          const propName = func.constants[operand1];
          const mode = operand2 === POSTFIX ? 'postfix' : operand2 === PREFIX ? 'prefix' : 'discard';
          line += ` ${color.comment(`'${propName}', mode: ${mode}`)}`;
        }
        break;
      }

      // Closure with variable-length operands
      case Opcodes.OP_CLOSURE: {
        const funcIndex = b[offset++];
        const closureFunc = func.constants[funcIndex];
        const fFlags = [];
        if (closureFunc.isGenerator || closureFunc.generator) fFlags.push('generator');
        if (closureFunc.isAsync || closureFunc.async) fFlags.push('async');
        line += ` ${funcIndex} ${color.comment(`<function ${closureFunc.name || '<anonymous>'}${fFlags.length ? ' ' + fFlags.join('/') : ''}>`)}`;

        for (let i = 0; i < (closureFunc.upvalueCount || 0); i++) {
          const isLocal = b[offset++];
          const index = b[offset++];
          line += `\n${''.padStart(6)}| ${isLocal ? 'local' : 'upvalue'} ${index}`;
        }
        break;
      }

      // 2-byte operand (jump offsets)
      case Opcodes.OP_JUMP:
      case Opcodes.OP_JUMP_IF_FALSE:
      case Opcodes.OP_LOOP: {
        const jump = (b[offset] << 8) | b[offset + 1];
        offset += 2;
        const targetOffset = opcode === Opcodes.OP_LOOP ? offset - jump : offset + jump;
        line += ` ${jump} → ${color.label(getLabel(targetOffset))}`;
        break;
      }

      // Inline comment for single-byte opcodes
      case Opcodes.OP_POP: line += ` ${color.comment('(pop top of stack)')}`; break;
      case Opcodes.OP_PUSH_NULL: line += ` ${color.comment('(push null / VM undefined)')}`; break;
      case Opcodes.OP_RETURN: line += ` ${color.comment('(return)')}`; break;
      case Opcodes.OP_YIELD: line += ` ${color.comment('(yield/generator suspend)')}`; break;
      case Opcodes.OP_AWAIT: line += ` ${color.comment('(await/promise suspension)')}`; break;
      case Opcodes.OP_HALT: line += ` ${color.comment('(halt execution)')}`; break;
      default: break;
    }

    console.log(line);
  }

  console.log(`--------------------------------${'-'.repeat(Math.max(0, name.length - 1))}`);
}
