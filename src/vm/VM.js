/**
 * @fileoverview Core Virtual Machine for the Project Hikari language runtime.
 * Executes compiled bytecode, manages stack, call frames, globals, and async tasks.
 */

import { Opcodes } from '../opcodes.js';
import { InterpretResult } from './vm-constants.js';
import { CallFrame, Upvalue, Closure, NativeObject } from './vm-datatypes.js';
import { PromiseV1, AsyncCallTask } from './PromiseV1.js';
import { InstructionHandlers } from './instruction-handlers.js';

/* Represents a try/catch block's state on the exception handler stack. */
class ExceptionHandler {
    constructor(targetIp, stackSize, frameIndex) {
        this.targetIp = targetIp;
        this.stackSize = stackSize;
        this.frameIndex = frameIndex;
    }
}

/* The core Virtual Machine that interprets and executes bytecode. */
export class VM {
  constructor() {
    this.stack = [];
    this.globals = new Map();
    this.callFrames = [];
    this.currentFrame = null;
    this.openUpvalues = null;
    this.exceptionHandlers = [];
    this.activeCoroutine = null;
    this.microtaskQueue = [];
    this.MAX_CALL_FRAMES = 256;
    this.pendingHostOps = 0;
    this.hasError = false;

    this.initializeNativeGlobals();
  }

  /**
   * The current number of active call frames.
   */
  get callFrameCount() {
      return this.callFrames.length;
  }

  /**
   * Populates the global namespace with native JavaScript functions and objects.
   */
  initializeNativeGlobals() {
      this.globals.set('console', new NativeObject('console', globalThis.console));
      this.globals.set('Object', new NativeObject('Object', globalThis.Object));
      this.globals.set('Promise', new NativeObject('Promise', PromiseV1));

      const fetchWrapper = (...args) => {
          const promiseV1 = new PromiseV1(null, this);
          this.pendingHostOps++;

          globalThis.fetch(...args)
              .then(response => promiseV1.resolve(response))
              .catch(error => promiseV1.reject(error.message))
              .finally(() => { this.pendingHostOps--; });

          return promiseV1;
      };
      this.globals.set('fetch', new NativeObject('fetch', fetchWrapper));

      const setIntervalWrapper = (callback, delay) => {
          this.pendingHostOps++;
          let intervalId;

          if (callback instanceof Closure) {
              const task = new AsyncCallTask(callback, null, []);
              intervalId = globalThis.setInterval(() => {
                  this.scheduleMicrotask(task);
              }, delay);
          } else if (typeof callback === 'function') {
              intervalId = globalThis.setInterval(callback, delay);
          } else if (callback instanceof NativeObject && typeof callback.object === 'function') {
              intervalId = globalThis.setInterval(callback.object, delay);
          } else {
              this.pendingHostOps--; // Decrement since we're erroring out
              this.runtimeError("setInterval expects a function as the first argument.");
              return;
          }

          return {
              _id: intervalId,
              _vm: this,
              clear() {
                  globalThis.clearInterval(this._id);
                  this._vm.pendingHostOps--;
              }
          };
      };
      this.globals.set('setInterval', new NativeObject('setInterval', setIntervalWrapper));

      const clearIntervalWrapper = (handle) => {
          if (handle && typeof handle.clear === 'function') {
              handle.clear();
          }
      };
      this.globals.set('clearInterval', new NativeObject('clearInterval', clearIntervalWrapper));

      const setTimeoutWrapper = (callback, delay) => {
          this.pendingHostOps++;
          let timeoutId;

          const fireCallback = () => {
              if (callback instanceof Closure) {
                  const task = new AsyncCallTask(callback, null, []);
                  this.scheduleMicrotask(task);
              } else if (typeof callback === 'function') {
                  callback(); // It's a native function, just call it.
              } else if (callback instanceof NativeObject && typeof callback.object === 'function') {
                 callback.object(); // It's a wrapped native function
              } else {
                  // This path should ideally not be hit if the initial check passes
                  this.runtimeError("setTimeout callback is not a callable function.");
              }
              this.pendingHostOps--;
          };

          if (!(callback instanceof Closure) && typeof callback !== 'function' && !(callback instanceof NativeObject && typeof callback.object === 'function')) {
              this.pendingHostOps--; // Decrement since we're erroring out.
              this.runtimeError("setTimeout expects a function as the first argument.");
              return;
          }

          timeoutId = globalThis.setTimeout(fireCallback, delay);

          return {
              _id: timeoutId,
              _vm: this,
              clear() {
                  globalThis.clearTimeout(this._id);
                  this._vm.pendingHostOps--; // Decrement if cleared before firing
              }
          };
      };
      this.globals.set('setTimeout', new NativeObject('setTimeout', setTimeoutWrapper));
  }

  /* Schedules a task to be run on the next tick of the VM's event loop. */
  scheduleMicrotask(task) {
    this.microtaskQueue.push(task);
  }

  /* Pushes a value onto the VM's value stack. */
  push(value) {
    this.stack.push(value);
  }

  /* Pops and returns the top value from the stack. */
  pop() {
    if (this.stack.length === 0) {
      this.runtimeError("Stack underflow!");
      return null;
    }
    return this.stack.pop();
  }

  /* Returns a value from the stack without removing it. */
  peek(distance) {
    if (this.stack.length <= distance) {
      this.runtimeError("Stack underflow for peek!");
      return null;
    }
    return this.stack[this.stack.length - 1 - distance];
  }

  /**
   * Handles a runtime error by unwinding the stack to find an exception handler
   * or rejecting an async function's promise.
   */
  runtimeError(message, rejectPromise = true) {
      // Attempt to find and reject an async function's promise.
      for (let i = this.callFrames.length - 1; i >= 0; i--) {
          const frame = this.callFrames[i];
          if (frame.closure.func.isAsync && frame.asyncPromise && rejectPromise) {
              frame.asyncPromise.reject(message);
              this.hasError = true;
              return;
          }
      }

      // If no promise was rejected, try to find a `try/catch` handler.
      if (this.exceptionHandlers.length > 0) {
          const handler = this.exceptionHandlers.pop();

          while (this.callFrames.length - 1 > handler.frameIndex) {
              this.callFrames.pop();
          }

          this.currentFrame = this.callFrames[this.callFrames.length - 1];
          this.stack.length = handler.stackSize;
          this.push(message);
          this.currentFrame.ip = handler.targetIp;
          return;
      }

      // If no handler is found, report a fatal error.
      const activeFrame = this.currentFrame;
      const funcName = activeFrame ? activeFrame.closure.func.name : '<script>';
      console.error(`Runtime Error: ${message}\n  [line ??] in ${funcName}`);
      this.hasError = true;
  }

  /* Interprets and executes a program's main function, managing the async event loop. */
  async interpret(program) {
      const mainFn = new Closure(program.mainFunction, []);
      const scriptExecutionPromise = new PromiseV1(null, this);
      const initialCallTask = new AsyncCallTask(mainFn, scriptExecutionPromise, []);

      this.scheduleMicrotask(initialCallTask);
      this.hasError = false;

      // The main event loop for the VM.
      while (this.callFrames.length > 0 || this.microtaskQueue.length > 0 || this.pendingHostOps > 0) {
          if (this.hasError) break;

          this.runMicrotasks();

          if (this.callFrames.length > 0) {
              const result = this.run();
              if (result === InterpretResult.YIELD) {
                  // OP_AWAIT yielded control. A promise continuation will resume execution later.
              } else if (this.hasError) {
                  break;
              }
          }

          // If idle, yield to the host event loop to allow pending I/O to complete.
          if (this.callFrames.length === 0 && this.microtaskQueue.length === 0 && this.pendingHostOps > 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
          }
      }

      if (this.hasError) {
          if (scriptExecutionPromise.state === 'pending') {
              const errorMessage = this.stack.length > 0 ? this.pop() : "Unknown runtime error.";
              scriptExecutionPromise.reject(errorMessage);
          }
          return { result: InterpretResult.RUNTIME_ERROR, value: scriptExecutionPromise.reason };
      }

      let finalValue;
      if (scriptExecutionPromise.state === 'fulfilled') {
          finalValue = scriptExecutionPromise.value;
      } else if (scriptExecutionPromise.state === 'rejected') {
          return { result: InterpretResult.RUNTIME_ERROR, value: scriptExecutionPromise.reason };
      } else {
          finalValue = this.stack.length > 0 ? this.pop() : null;
      }

      this.stack.length = 0;
      return { result: InterpretResult.OK, value: finalValue };
  }

  /* Executes all pending tasks in the microtask queue. */
  runMicrotasks() {
     while(this.microtaskQueue.length > 0) {
        if (this.hasError) return;

        const task = this.microtaskQueue.shift();
        if (task instanceof AsyncCallTask) {
            this.push(task.callee);
            task.args.forEach(arg => this.push(arg));

            const frame = new CallFrame(task.callee.func, this.stack.length - 1 - task.args.length, task.callee);
            frame.asyncPromise = task.asyncPromise; // Link the promise to this frame
            this.callFrames.push(frame);
        } else if (typeof task === 'function') {
            try {
                task();
            } catch (e) {
                this.runtimeError(`Error in native microtask: ${e.message}`, false);
            }
        }
     }
  }

  /**
   * The main bytecode execution loop.
   * Runs until the call stack is empty or an async operation yields.
   */
  run() {
    while (true) {
      if (this.hasError) return InterpretResult.RUNTIME_ERROR;

      if (this.callFrames.length === 0) {
        return InterpretResult.OK; // No active call frames, return control.
      }

      this.currentFrame = this.callFrames[this.callFrames.length - 1];
      const instruction = this.currentFrame.readByte();

      const handler = InstructionHandlers[instruction];
      if (handler) {
        const result = handler(this);
        if (result === InterpretResult.YIELD) return result; // VM yielded (e.g., await)
        if (this.hasError) return InterpretResult.RUNTIME_ERROR;
      } else {
        this.runtimeError(`Unknown opcode: ${instruction}`);
        if (this.hasError) return InterpretResult.RUNTIME_ERROR;
      }
    }
  }

  /* Synchronously executes a VM closure, typically for native callbacks like `Array.map`. */
  executeSyncClosure(closure, args) {
    if (closure.func.isAsync) {
        const message = "Async VM function cannot be used as a synchronous callback.";
        this.runtimeError(message, false);
        throw new Error(message);
    }

    // Save current VM state for restoration
    const initialCallFrameCount = this.callFrames.length;
    const initialStackDepth = this.stack.length;
    const originalCurrentFrame = this.currentFrame;

    // Prepare stack for the closure call
    this.push(closure);
    args.forEach(arg => this.push(arg));

    const newFrame = new CallFrame(closure.func, this.stack.length - 1 - args.length, closure);
    this.callFrames.push(newFrame);
    this.currentFrame = newFrame;

    let resultValue = null;

    try {
        // Execute instructions until the new frame returns
        while (this.callFrames.length > initialCallFrameCount) {
            const instruction = this.currentFrame.readByte();
            const handler = InstructionHandlers[instruction];

            if (!handler) {
                this.runtimeError(`Unknown opcode: ${instruction}`, false);
                break;
            }

            const handlerResult = handler(this);

            if (this.hasError) break;

            if (handlerResult === InterpretResult.YIELD) {
                this.runtimeError("Cannot yield/await within a synchronous native callback.", false);
                break;
            }

            this.currentFrame = this.callFrames[this.callFrames.length - 1];
        }
    } finally {
        // This block ensures VM state is restored even if an error is thrown.
        if (!this.hasError) {
            resultValue = this.pop();
        }

        // Clean up stack and frames from this synchronous execution
        this.stack.length = initialStackDepth;
        while (this.callFrames.length > initialCallFrameCount) {
            this.callFrames.pop();
        }

        this.currentFrame = originalCurrentFrame;
    }

    if (this.hasError) {
        // Propagate the VM error as a native exception for the host to catch.
        throw new Error("VM Runtime Error during synchronous native callback execution.");
    }

    return resultValue;
  }

  /* Pushes a new exception handler onto the handler stack for a `try` block. */
  setupTry(catchIp) {
      const handler = new ExceptionHandler(catchIp, this.stack.length, this.callFrames.length - 1);
      this.exceptionHandlers.push(handler);
  }

  /* Creates or reuses an upvalue for a local variable at a specific stack location. */
  captureUpvalue(stackLocation) {
    let prevUpvalue = null;
    let upvalue = this.openUpvalues;
    while (upvalue !== null && upvalue.location > stackLocation) {
        prevUpvalue = upvalue;
        upvalue = upvalue.next;
    }

    if (upvalue !== null && upvalue.location === stackLocation) return upvalue;

    const createdUpvalue = new Upvalue(stackLocation);
    createdUpvalue.next = upvalue;

    if (prevUpvalue === null) {
      this.openUpvalues = createdUpvalue;
    } else {
      prevUpvalue.next = createdUpvalue;
    }
    return createdUpvalue;
  }

  /* Closes all open upvalues that point to stack locations at or above a given index. */
  closeUpvalues(lastStackLocation) {
    while (this.openUpvalues !== null && this.openUpvalues.location >= lastStackLocation) {
      const upvalue = this.openUpvalues;
      upvalue.closed = this.stack[upvalue.location];
      upvalue.location = -1; // Mark as closed by invalidating location
      this.openUpvalues = upvalue.next;
    }
  }

  // Coroutine functionality is not currently used by the async/await model,
  // but is kept for potential future use.
  resume(coroutine, valueForNext) {
      const schedulerState = {
          stack: this.stack,
          callFrames: this.callFrames,
          openUpvalues: this.openUpvalues,
      };

      this.stack = coroutine.stack;
      this.callFrames = coroutine.callFrames;
      this.openUpvalues = coroutine.openUpvalues;
      this.activeCoroutine = coroutine;

      coroutine.caller = schedulerState;
      coroutine.state = 'running';

      if (coroutine.callFrames.length === 0) {
          const mainFn = coroutine.closure;
          this.stack[0] = mainFn;
          const frame = new CallFrame(mainFn.func, 0, mainFn);
          this.callFrames.push(frame);
      } else {
          this.push(valueForNext);
      }

      const result = this.run();
      this.activeCoroutine = null;

      if (result === InterpretResult.YIELD) {
          return InterpretResult.YIELD;
      }

      coroutine.state = 'done';
      const returnValue = this.stack.length > 0 ? this.pop() : null;

      this.stack = schedulerState.stack;
      this.callFrames = schedulerState.callFrames;
      this.openUpvalues = schedulerState.openUpvalues;
      this.currentFrame = this.callFrames.length > 0 ? this.callFrames[this.callFrames.length - 1] : null;

      this.push(returnValue);
      return InterpretResult.OK;
  }
}
