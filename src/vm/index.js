/**
 * @fileoverview Public exports for the Project Hikari VM.
 * Provides access to the VM, constants, core data structures, and async tasks.
 */

export { VM } from './VM.js';
export { InterpretResult } from './vm-constants.js';
export { CallFrame, Upvalue, Closure, NativeObject, Coroutine } from './vm-datatypes.js';
export { AsyncCallTask } from './PromiseV1.js';
