/**
 * @fileoverview Core VM data structures: call frames, closures, coroutines, generators, and
 * native objects exposed to the VM.
 *
 * This module provides the building blocks for the VM’s execution model,
 * including stack frames, captured variables, async support, and iteration.
 */

import { InterpretResult } from './vm-constants.js';

export class CallFrame {
  constructor(func, stackBase, closure = null) {
    this.func = func;          // Compiled function object
    this.ip = 0;               // Instruction pointer
    this.stackBase = stackBase;
    this.closure = closure;
    this.asyncPromise = null;  // For async function calls
  }

  readByte() { return this.func.bytecode[this.ip++]; }

  readShort() {
    this.ip += 2;
    return (this.func.bytecode[this.ip - 2] << 8) | this.func.bytecode[this.ip - 1];
  }
}

export class Coroutine {
  constructor(closure) {
    this.closure = closure;
    this.stack = [];
    this.callFrames = [];
    this.openUpvalues = null;
    this.state = 'suspended';  // 'suspended', 'running', 'done'
    this.caller = null;        // Scheduler reference
    this.isCallable = true;    // Can be called directly like a function
  }
}

export class Upvalue {
  constructor(location) {
    this.location = location; // Stack index of the captured variable
    this.closed = null;       // Value after closure
    this.next = null;         // Linked list for open upvalues
  }
}

export class Closure {
  constructor(func, upvalues) {
    this.func = func;
    this.upvalues = upvalues;
  }

  get name() { return this.func.name; }
  get arity() { return this.func.arity; }
  get bytecode() { return this.func.bytecode; }
  get constants() { return this.func.constants; }
}

export class NativeObject {
  constructor(name, object) {
    this.name = name;
    this.object = object;
    this.methods = {};
    this.properties = {};
    this.setupMethodsAndProperties();
  }

  setupMethodsAndProperties() {
    if (this.name === 'console') {
      this.methods.log = console.log.bind(console);
      this.methods.error = console.error.bind(console);
      this.methods.warn = console.warn.bind(console);
    }
  }

  getProperty(name) {
    if (this.methods[name]) return this.methods[name];
    if (this.properties[name]) return this.properties[name];
    if (typeof this.object[name] === 'function') return this.object[name].bind(this.object);
    return this.object[name];
  }

  setProperty(name, value) { this.object[name] = value; }
}

/**
 * Generator wrapper providing the standard JS iterator interface.
 * Handles coroutine execution and generator semantics.
 */
export class GeneratorObject {
  constructor(closure, vm) {
    this.closure = closure;
    this.vm = vm;
    this.coroutine = new Coroutine(closure);
    this.done = false;
    this.value = null;
  }

  next(value) {
    if (this.done) return { value: null, done: true };

    const result = this.vm.resume(this.coroutine, value);

    if (result === InterpretResult.YIELD) {
      this.value = this.vm.pop();
      return { value: this.value, done: false };
    } else {
      this.done = true;
      const finalValue = this.vm.pop() ?? null;
      return { value: finalValue, done: true };
    }
  }

  return(value) {
    this.done = true;
    return { value: value ?? null, done: true };
  }

  throw(error) {
    this.done = true;
    throw error;
  }

  [Symbol.iterator]() { return this; }
}
