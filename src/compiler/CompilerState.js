/**
 * @fileoverview Compiler state management: functions, loops, and the overall compilation context.
 */

import { Opcodes } from '../opcodes.js';

/** Represents a compiled function with bytecode and metadata. */
class FunctionObject {
  constructor(name, arity, bytecode, constants, upvalueCount = 0, upvalues = [], isGenerator = false, isAsync = false) {
    this.name = name;
    this.arity = arity;
    this.bytecode = bytecode;
    this.constants = constants;
    this.upvalueCount = upvalueCount;
    this.upvalues = upvalues;
    this.isGenerator = isGenerator;
    this.isAsync = isAsync;
  }
}

/** Tracks loop-specific state during compilation (break/continue jumps). */
class LoopContext {
  constructor() {
    this.breakJumps = [];
    this.continueJumps = [];
    this.scopeDepth = 0;
  }
}

/** Holds the compilation state for a single function or script. */
export class CompilerState {
  constructor(enclosing, functionName) {
    this.enclosing = enclosing;
    this.functionName = functionName || '<script>';
    this.bytecode = [];
    this.constants = [];
    this.locals = [];
    this.upvalues = [];
    this.scopeDepth = 0;
    this.loops = [];
    // Reserve the first local slot for the function itself.
    this.locals.push({ name: this.functionName, depth: 0, isCaptured: false });
  }

  emitByte(byte) { this.bytecode.push(byte); }
  emitBytes(...bytes) { this.bytecode.push(...bytes); }

  emitReturn() {
    this.emitByte(Opcodes.OP_PUSH_NULL);
    this.emitByte(Opcodes.OP_RETURN);
  }

  addConstant(value) {
    this.constants.push(value);
    return this.constants.length - 1;
  }

  emitConstant(value) {
    const constIndex = this.addConstant(value);
    if (constIndex > 255) throw new Error("Constant pool limit exceeded.");
    this.emitBytes(Opcodes.OP_CONSTANT, constIndex);
  }

  /** Adds an upvalue, avoiding duplicates. */
  addUpvalue(index, isLocal) {
    for (let i = 0; i < this.upvalues.length; i++) {
      const upvalue = this.upvalues[i];
      if (upvalue.index === index && upvalue.isLocal === isLocal) return i;
    }
    if (this.upvalues.length > 255) throw new Error("Too many upvalues in function.");
    this.upvalues.push({ index, isLocal });
    return this.upvalues.length - 1;
  }

  /** Resolves a local variable by name, innermost scope first. */
  resolveLocal(name) {
    for (let i = this.locals.length - 1; i >= 0; i--) {
      if (this.locals[i].name === name) return i;
    }
    return -1;
  }
}

export { FunctionObject, LoopContext };
