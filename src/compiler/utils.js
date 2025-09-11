/**
 * @fileoverview Utility functions used throughout the compiler.
 * These handle tasks like variable management, scope resolution, and bytecode emission patterns.
 */

import { Opcodes } from '../opcodes.js';
import { NATIVE_GLOBALS } from './Compiler.js';

/** Adds a new local variable to the current scope. */
export function addLocal(compilerState, name) {
    if (compilerState.locals.length > 255) throw new Error("Too many local variables.");
    compilerState.locals.push({ name, depth: compilerState.scopeDepth, isCaptured: false });
}

/** Declares a variable in the current scope, checking for redeclarations. */
export function declareVariable(compilerState, name) {
    if (compilerState.scopeDepth === 0) return;

    for (let i = compilerState.locals.length - 1; i >= 0; i--) {
        const local = compilerState.locals[i];
        if (local.depth !== -1 && local.depth < compilerState.scopeDepth) break;
        if (local.name === name) throw new Error(`Identifier '${name}' has already been declared.`);
    }
    addLocal(compilerState, name);
}

/** Emits bytecode to define a variable (global) or initialize a local. */
export function defineVariable(compilerState, name) {
    const localSlot = compilerState.resolveLocal(name);
    if (localSlot !== -1) {
        compilerState.emitBytes(Opcodes.OP_SET_LOCAL, localSlot);
        return;
    }
    const constIndex = compilerState.addConstant(name);
    compilerState.emitBytes(Opcodes.OP_DEFINE_GLOBAL, constIndex);
}

/** Recursively searches for a variable in enclosing scopes to create an upvalue. */
export function resolveUpvalue(name, currentCompilerState) {
    if (currentCompilerState.enclosing === null) {
        return -1;
    }

    const local = currentCompilerState.enclosing.resolveLocal(name);
    if (local !== -1) {
        currentCompilerState.enclosing.locals[local].isCaptured = true;
        return currentCompilerState.addUpvalue(local, true);
    }

    const upvalue = resolveUpvalue(name, currentCompilerState.enclosing);
    if (upvalue !== -1) {
        return currentCompilerState.addUpvalue(upvalue, false);
    }

    return -1;
}

/** Emits bytecode to get a variable's value, resolving its scope (local, upvalue, global, or native). */
export function emitGetVariable(compilerInstance, name) {
  const { current } = compilerInstance;
  const localSlot = current.resolveLocal(name);
  if (localSlot !== -1) {
      current.emitBytes(Opcodes.OP_GET_LOCAL, localSlot);
      return;
  }
  const upvalueSlot = resolveUpvalue(name, current);
  if (upvalueSlot !== -1) {
      current.emitBytes(Opcodes.OP_GET_UPVALUE, upvalueSlot);
      return;
  }

  const constIndex = current.addConstant(name);
  if (NATIVE_GLOBALS.has(name)) {
      current.emitBytes(Opcodes.OP_GET_NATIVE, constIndex);
  } else {
      current.emitBytes(Opcodes.OP_GET_GLOBAL, constIndex);
  }
}

/** Emits bytecode to set a variable's value, resolving its scope. */
export function emitSetVariable(compilerInstance, name) {
  const { current } = compilerInstance;
  const localSlot = current.resolveLocal(name);
  if (localSlot !== -1) {
      current.emitBytes(Opcodes.OP_SET_LOCAL, localSlot);
      return;
  }
  const upvalueSlot = resolveUpvalue(name, current);
  if (upvalueSlot !== -1) {
      current.emitBytes(Opcodes.OP_SET_UPVALUE, upvalueSlot);
      return;
  }

  const constIndex = current.addConstant(name);
  current.emitBytes(Opcodes.OP_SET_GLOBAL, constIndex);
}

/** Emits a jump instruction with a placeholder offset and returns the offset's position for later patching. */
export function emitJump(compilerState, instruction) {
  compilerState.emitByte(instruction);
  compilerState.emitBytes(0xff, 0xff); // Placeholder bytes
  return compilerState.bytecode.length - 2;
}

/** Replaces a jump placeholder with the correct relative offset. */
export function patchJump(compilerState, offset) {
  if (offset === undefined) return;
  const jump = compilerState.bytecode.length - offset - 2;
  if (jump > 0xFFFF) throw new Error("Jump too large.");
  compilerState.bytecode[offset] = (jump >> 8) & 0xFF;
  compilerState.bytecode[offset + 1] = jump & 0xFF;
}

/** Emits a backward jump instruction for loops. */
export function emitLoop(compilerState, loopStart) {
  const offset = compilerState.bytecode.length - loopStart + 3;
  if (offset > 0xFFFF) throw new Error("Loop body too large.");
  compilerState.emitBytes(Opcodes.OP_LOOP, (offset >> 8) & 0xff, offset & 0xff);
}
