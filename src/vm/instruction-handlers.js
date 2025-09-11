/**
 * @fileoverview Opcode handlers for the Project Hikari Virtual Machine.
 * Each function corresponds to a VM instruction and manipulates stack, frames, or state.
 */

import { Opcodes } from '../opcodes.js';
import { InterpretResult } from './vm-constants.js';
import { Closure, Coroutine, CallFrame, NativeObject, GeneratorObject } from './vm-datatypes.js';
import { PromiseV1, AsyncCallTask } from './PromiseV1.js';

/** Returns true if the value is falsy according to the language semantics. */
function isFalsy(value) {
    return value === null || value === undefined || value === false || value === 0 || value === "" || (Array.isArray(value) && value.length === 0);
}

/**
 * Handles property increment/decrement instructions.
 * @param {VM} vm - The VM instance.
 * @param {number} delta - +1 for increment, -1 for decrement.
 */
function propertyIncDec(vm, delta) {
    const propNameIndex = vm.currentFrame.readByte();
    const mode = vm.currentFrame.readByte(); // 0: postfix, 1: prefix, 2: discard
    const propName = vm.currentFrame.func.constants[propNameIndex];
    const object = vm.peek(0);

    if (object === null || typeof object !== 'object' || !object.properties) {
        vm.runtimeError(`Cannot increment/decrement property on non-object.`);
        return InterpretResult.RUNTIME_ERROR;
    }

    const oldValue = object.properties[propName];
    if (typeof oldValue !== 'number') {
        vm.runtimeError('Can only increment/decrement numeric properties.');
        return InterpretResult.RUNTIME_ERROR;
    }

    const newValue = oldValue + delta;
    object.properties[propName] = newValue;

    if (mode === 2) return InterpretResult.OK; // Discard result
    vm.pop();
    vm.push(mode === 1 ? newValue : oldValue);

    return InterpretResult.OK;
}

export const InstructionHandlers = {
    // Pushes a constant from the function's constant pool onto the stack.
    [Opcodes.OP_CONSTANT]: (vm) => {
        const constantIndex = vm.currentFrame.readByte();
        vm.push(vm.currentFrame.func.constants[constantIndex]);
        return InterpretResult.OK;
    },
    [Opcodes.OP_PUSH_NULL]: (vm) => {
        vm.push(null);
        return InterpretResult.OK;
    },
    [Opcodes.OP_PUSH_TRUE]: (vm) => {
        vm.push(true);
        return InterpretResult.OK;
    },
    [Opcodes.OP_PUSH_FALSE]: (vm) => {
        vm.push(false);
        return InterpretResult.OK;
    },
    [Opcodes.OP_POP]: (vm) => {
        vm.pop();
        return InterpretResult.OK;
    },
    [Opcodes.OP_DUPLICATE]: (vm) => {
        vm.push(vm.peek(0));
        return InterpretResult.OK;
    },

    [Opcodes.OP_ADD]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a === 'string' || typeof b === 'string') vm.push(String(a) + String(b));
        else if (typeof a === 'number' && typeof b === 'number') vm.push(a + b);
        else {
            vm.runtimeError("Operands for '+' must be two numbers or at least one string.");
            return InterpretResult.RUNTIME_ERROR;
        }
        return InterpretResult.OK;
    },
    [Opcodes.OP_SUBTRACT]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '-' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a - b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_MULTIPLY]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '*' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a * b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_DIVIDE]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '/' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        if (b === 0) {
            vm.runtimeError("Division by zero.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a / b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_MODULO]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '%' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        if (b === 0) {
            vm.runtimeError("Modulo by zero.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a % b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_POWER]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '**' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(Math.pow(a, b));
        return InterpretResult.OK;
    },

    [Opcodes.OP_EQUAL]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        vm.push(a === b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_NOT_EQUAL]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        vm.push(a !== b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_GREATER]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '>' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a > b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_LESS]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '<' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a < b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_GREATER_EQUAL]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '>=' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a >= b);
        return InterpretResult.OK;
    },
    [Opcodes.OP_LESS_EQUAL]: (vm) => {
        const b = vm.pop();
        const a = vm.pop();
        if (typeof a !== 'number' || typeof b !== 'number') {
            vm.runtimeError("Operands for '<=' must be two numbers.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(a <= b);
        return InterpretResult.OK;
    },

    [Opcodes.OP_NEGATE]: (vm) => {
        const a = vm.pop();
        if (typeof a !== 'number') {
            vm.runtimeError("Operand for negation must be a number.");
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(-a);
        return InterpretResult.OK;
    },
    [Opcodes.OP_NOT]: (vm) => {
        const a = vm.pop();
        vm.push(isFalsy(a));
        return InterpretResult.OK;
    },

    // Accesses a global variable by name (constant index).
    [Opcodes.OP_GET_GLOBAL]: (vm) => {
        const nameIndex = vm.currentFrame.readByte();
        const name = vm.currentFrame.func.constants[nameIndex];
        if (!vm.globals.has(name)) {
            vm.runtimeError(`Undefined variable '${name}'.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(vm.globals.get(name));
        return InterpretResult.OK;
    },
    // Assigns a value to a global variable.
    [Opcodes.OP_SET_GLOBAL]: (vm) => {
        const nameIndex = vm.currentFrame.readByte();
        const name = vm.currentFrame.func.constants[nameIndex];
        if (!vm.globals.has(name)) {
            vm.runtimeError(`Undefined variable '${name}'.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.globals.set(name, vm.peek(0));
        return InterpretResult.OK;
    },
    // Defines a new global variable.
    [Opcodes.OP_DEFINE_GLOBAL]: (vm) => {
        const nameIndex = vm.currentFrame.readByte();
        const name = vm.currentFrame.func.constants[nameIndex];
        vm.globals.set(name, vm.peek(0));
        return InterpretResult.OK;
    },
    // Gets a local variable by its stack slot index.
    [Opcodes.OP_GET_LOCAL]: (vm) => {
        const slot = vm.currentFrame.readByte();
        vm.push(vm.stack[vm.currentFrame.stackBase + slot]);
        return InterpretResult.OK;
    },
    // Sets a local variable by its stack slot index.
    [Opcodes.OP_SET_LOCAL]: (vm) => {
        const slot = vm.currentFrame.readByte();
        vm.stack[vm.currentFrame.stackBase + slot] = vm.peek(0);
        return InterpretResult.OK;
    },
    // Gets an upvalue (closed-over variable).
    [Opcodes.OP_GET_UPVALUE]: (vm) => {
        const slot = vm.currentFrame.readByte();
        const upvalue = vm.currentFrame.closure.upvalues[slot];
        vm.push(upvalue.closed !== null ? upvalue.closed : vm.stack[upvalue.location]);
        return InterpretResult.OK;
    },
    // Sets an upvalue (closed-over variable).
    [Opcodes.OP_SET_UPVALUE]: (vm) => {
        const slot = vm.currentFrame.readByte();
        const upvalue = vm.currentFrame.closure.upvalues[slot];
        if (upvalue.closed !== null) {
            upvalue.closed = vm.peek(0);
        } else {
            vm.stack[upvalue.location] = vm.peek(0);
        }
        return InterpretResult.OK;
    },
    // Increments a local variable.
    [Opcodes.OP_INCREMENT_LOCAL]: (vm) => {
        const slot = vm.currentFrame.readByte();
        let value = vm.stack[vm.currentFrame.stackBase + slot];
        if (typeof value !== 'number') {
            vm.runtimeError("Operand for increment must be a number.");
            return InterpretResult.RUNTIME_ERROR;
        }
        value++;
        vm.stack[vm.currentFrame.stackBase + slot] = value;
        vm.push(value);
        return InterpretResult.OK;
    },
    // Decrements a local variable.
    [Opcodes.OP_DECREMENT_LOCAL]: (vm) => {
        const slot = vm.currentFrame.readByte();
        let value = vm.stack[vm.currentFrame.stackBase + slot];
        if (typeof value !== 'number') {
            vm.runtimeError("Operand for decrement must be a number.");
            return InterpretResult.RUNTIME_ERROR;
        }
        value--;
        vm.stack[vm.currentFrame.stackBase + slot] = value;
        vm.push(value);
        return InterpretResult.OK;
    },
    // Increments a global variable.
    [Opcodes.OP_INCREMENT_GLOBAL]: (vm) => {
        const constIndex = vm.currentFrame.readByte();
        const name = vm.currentFrame.func.constants[constIndex];
        let value = vm.globals.get(name);
        if (typeof value !== 'number') {
            vm.runtimeError("Operand for increment must be a number.");
            return InterpretResult.RUNTIME_ERROR;
        }
        value++;
        vm.globals.set(name, value);
        vm.push(value);
        return InterpretResult.OK;
    },
    // Decrements a global variable.
    [Opcodes.OP_DECREMENT_GLOBAL]: (vm) => {
        const constIndex = vm.currentFrame.readByte();
        const name = vm.currentFrame.func.constants[constIndex];
        let value = vm.globals.get(name);
        if (typeof value !== 'number') {
            vm.runtimeError("Operand for decrement must be a number.");
            return InterpretResult.RUNTIME_ERROR;
        }
        value--;
        vm.globals.set(name, value);
        vm.push(value);
        return InterpretResult.OK;
    },
    // Increments an upvalue.
    [Opcodes.OP_INCREMENT_UPVALUE]: (vm) => {
        const slot = vm.currentFrame.readByte();
        const upvalue = vm.currentFrame.closure.upvalues[slot];
        let value = (upvalue.closed !== null) ? upvalue.closed : vm.stack[upvalue.location];
        if (typeof value !== 'number') {
            vm.runtimeError("Operand for increment must be a number.");
            return InterpretResult.RUNTIME_ERROR;
        }
        value++;
        if (upvalue.closed !== null) {
            upvalue.closed = value;
        } else {
            vm.stack[upvalue.location] = value;
        }
        vm.push(value);
        return InterpretResult.OK;
    },
    // Decrements an upvalue.
    [Opcodes.OP_DECREMENT_UPVALUE]: (vm) => {
        const slot = vm.currentFrame.readByte();
        const upvalue = vm.currentFrame.closure.upvalues[slot];
        let value = (upvalue.closed !== null) ? upvalue.closed : vm.stack[upvalue.location];
        if (typeof value !== 'number') {
            vm.runtimeError("Operand for decrement must be a number.");
            return InterpretResult.RUNTIME_ERROR;
        }
        value--;
        if (upvalue.closed !== null) {
            upvalue.closed = value;
        } else {
            vm.stack[upvalue.location] = value;
        }
        vm.push(value);
        return InterpretResult.OK;
    },

    // Unconditional forward jump.
    [Opcodes.OP_JUMP]: (vm) => {
        const offset = vm.currentFrame.readShort();
        vm.currentFrame.ip += offset;
        return InterpretResult.OK;
    },
    // Jumps forward if the top of the stack is falsy.
    [Opcodes.OP_JUMP_IF_FALSE]: (vm) => {
        const offset = vm.currentFrame.readShort();
        if (isFalsy(vm.peek(0))) {
            vm.currentFrame.ip += offset;
        }
        return InterpretResult.OK;
    },
    // Unconditional backward jump for loops.
    [Opcodes.OP_LOOP]: (vm) => {
        const offset = vm.currentFrame.readShort();
        vm.currentFrame.ip -= offset;
        return InterpretResult.OK;
    },

    // Calls a function or method.
    [Opcodes.OP_CALL]: (vm) => {
        const argCount = vm.currentFrame.readByte();
        const callee = vm.peek(argCount);

        if (callee instanceof Closure) {
            if (callee.arity !== argCount) {
                vm.runtimeError(`Expected ${callee.arity} arguments but got ${argCount}.`);
                return InterpretResult.RUNTIME_ERROR;
            }
            if (vm.callFrameCount === vm.MAX_CALL_FRAMES) {
                vm.runtimeError("Stack overflow.");
                return InterpretResult.RUNTIME_ERROR;
            }

            if (callee.func.isGenerator) {
                vm.pop();
                vm.stack.length -= argCount;
                const genObj = new GeneratorObject(callee, vm);
                vm.push(genObj);
                return InterpretResult.OK;
            }
            if (callee.func.isAsync) {
                const promise = new PromiseV1(null, vm);
                const args = vm.stack.slice(vm.stack.length - argCount, vm.stack.length);
                vm.pop();
                vm.stack.length -= argCount;
                const task = new AsyncCallTask(callee, promise, args);
                vm.scheduleMicrotask(task);
                vm.push(promise);
                return InterpretResult.OK;
            }

            const newFrame = new CallFrame(callee.func, vm.stack.length - argCount - 1, callee);
            vm.callFrames.push(newFrame);
            vm.currentFrame = newFrame;
            return InterpretResult.OK;

        } else if (callee instanceof NativeObject) {
            const args = vm.stack.splice(vm.stack.length - argCount, argCount);
            vm.pop();
            const result = typeof callee.object === 'function' && callee.object.prototype && callee.object.prototype.constructor === callee.object ?
                new callee.object(...args, vm) // Class constructor call
                :
                callee.object(...args); // Function call
            vm.push(typeof result !== 'undefined' ? result : null);
            return InterpretResult.OK;

        } else if (typeof callee === 'function') { // Direct JS function call
            const args = vm.stack.splice(vm.stack.length - argCount, argCount);
            vm.pop();
            const result = callee(...args);
            vm.push(typeof result !== 'undefined' ? result : null);
            return InterpretResult.OK;
        }

        vm.runtimeError("Can only call functions and classes.");
        return InterpretResult.RUNTIME_ERROR;
    },
    // Returns from the current function call.
    [Opcodes.OP_RETURN]: (vm) => {
        const result = vm.pop();
        const frame = vm.callFrames[vm.callFrames.length - 1];

        if (frame.func.isAsync && frame.asyncPromise) { // Resolve async function's promise
            frame.asyncPromise.resolve(result);
        }

        vm.closeUpvalues(frame.stackBase);
        vm.callFrames.pop();

        if (vm.callFrames.length === 0) { // Program finished
            vm.stack.length = frame.stackBase;
            vm.push(result);
            return InterpretResult.OK;
        }

        vm.stack.length = frame.stackBase; // Discard arguments and callee.
        vm.push(result); // Push return value for caller.

        return InterpretResult.OK;
    },
    // Creates a closure from a FunctionObject and captures upvalues.
    [Opcodes.OP_CLOSURE]: (vm) => {
        const funcIndex = vm.currentFrame.readByte();
        const func = vm.currentFrame.func.constants[funcIndex];
        const upvalues = Array.from({
            length: func.upvalueCount
        }, () => {
            const isLocal = vm.currentFrame.readByte() === 1;
            const index = vm.currentFrame.readByte();
            return isLocal ? vm.captureUpvalue(vm.currentFrame.stackBase + index) : vm.currentFrame.closure.upvalues[index];
        });
        const closure = new Closure(func, upvalues);
        vm.push(closure);
        return InterpretResult.OK;
    },
    // Closes an upvalue when its local variable goes out of scope.
    [Opcodes.OP_CLOSE_UPVALUE]: (vm) => {
        vm.closeUpvalues(vm.stack.length - 1);
        vm.pop();
        return InterpretResult.OK;
    },

    // Retrieves a registered native global object.
    [Opcodes.OP_GET_NATIVE]: (vm) => {
        const nameIndex = vm.currentFrame.readByte();
        const name = vm.currentFrame.func.constants[nameIndex];
        const nativeObject = vm.globals.get(name);
        if (!nativeObject) {
            vm.runtimeError(`Native object '${name}' not found.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(nativeObject);
        return InterpretResult.OK;
    },
    // Calls a method on an object, handling various object types (native, PromiseV1, VM instances).
    [Opcodes.OP_CALL_METHOD]: (vm) => {
        const methodNameIndex = vm.currentFrame.readByte();
        const argCount = vm.currentFrame.readByte();
        const methodName = vm.currentFrame.func.constants[methodNameIndex];
        const receiver = vm.peek(argCount);

        if (receiver === null || receiver === undefined) {
            vm.runtimeError(`Cannot read properties of null or undefined (calling method '${methodName}').`);
            return InterpretResult.RUNTIME_ERROR;
        }
        const args = vm.stack.slice(vm.stack.length - argCount);
        vm.stack.length -= (argCount + 1);

        // --- NativeObject methods ---
        if (receiver instanceof NativeObject) {
            const method = receiver.getProperty(methodName);
            if (typeof method === 'function') {
                try {
                    const result = method.apply(receiver.object, args);
                    vm.push(result === undefined ? null : result);
                    return InterpretResult.OK;
                } catch (e) {
                    vm.runtimeError(`Native method '${methodName}' error: ${e.message}`);
                    return InterpretResult.RUNTIME_ERROR;
                }
            }
        }
        // --- PromiseV1 methods ---
        else if (receiver instanceof PromiseV1) {
            const method = receiver[methodName];
            if (typeof method === 'function') {
                try {
                    const returnedPromise = method.apply(receiver, args); // 'then' method returns a new promise
                    vm.push(returnedPromise === undefined ? null : returnedPromise);
                    return InterpretResult.OK;
                } catch (e) {
                    vm.runtimeError(`Promise method '${methodName}' error: ${e.message}`);
                    return InterpretResult.RUNTIME_ERROR;
                }
            }
        }
        // --- Plain JS objects (from native interop) ---
        else if (typeof receiver === 'object' && typeof receiver[methodName] === 'function') {
            try {
                const nativeArgs = args.map(arg => (arg instanceof Closure) ? (...nativeCallbackArgs) => vm.executeSyncClosure(arg, nativeCallbackArgs) : arg);
                const result = receiver[methodName].apply(receiver, nativeArgs);
                if (result && typeof result.then === 'function') { // Wrap native promises
                    const promiseV1 = new PromiseV1(null, vm);
                    vm.pendingHostOps++;
                    result.then(value => promiseV1.resolve(value)).catch(err => promiseV1.reject(err.message)).finally(() => vm.pendingHostOps--);
                    vm.push(promiseV1);
                } else {
                    vm.push(result === undefined ? null : result);
                }
                return InterpretResult.OK;
            } catch (e) {
                vm.runtimeError(`Native method '${methodName}' on plain object error: ${e.message}`);
                return InterpretResult.RUNTIME_ERROR;
            }
        }
        // --- VM-defined objects (with prototype chain lookup) ---
        else if (typeof receiver === 'object') {
            let current = receiver;
            while (current) {
                if (current.properties && current.properties.hasOwnProperty(methodName)) {
                    const method = current.properties[methodName];
                    if (method instanceof Closure) {
                        if (argCount !== method.arity) {
                            vm.runtimeError(`Expected ${method.arity} args for method '${methodName}' but got ${argCount}.`);
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        if (method.func.isAsync) {
                            const promise = new PromiseV1(null, vm);
                            const task = new AsyncCallTask(method, promise, args, receiver);
                            vm.scheduleMicrotask(task);
                            vm.push(promise);
                            return InterpretResult.OK;
                        }
                        if (method.func.isGenerator) {
                            const generator = new GeneratorObject(method, vm);
                            vm.push(generator);
                            return InterpretResult.OK;
                        }
                        const newFrameBase = vm.stack.length;
                        vm.push(receiver);
                        args.forEach(arg => vm.push(arg));
                        const newFrame = new CallFrame(method.func, newFrameBase, method);
                        vm.callFrames.push(newFrame);
                        vm.currentFrame = newFrame;
                        return InterpretResult.OK;
                    }
                    break;
                }
                current = current.prototype;
            }
        }
        vm.runtimeError(`Method '${methodName}' not found or not callable on instance.`);
        return InterpretResult.RUNTIME_ERROR;
    },

    // Creates a new array from stack elements.
    [Opcodes.OP_NEW_ARRAY]: (vm) => {
        const count = vm.currentFrame.readByte();
        vm.push(vm.stack.splice(vm.stack.length - count, count));
        return InterpretResult.OK;
    },
    // Creates a new object from stack key-value pairs.
    [Opcodes.OP_NEW_OBJECT]: (vm) => {
        const count = vm.currentFrame.readByte();
        const newObject = {
            properties: {},
            prototype: null
        };
        for (let i = 0; i < count; i++) {
            const value = vm.pop();
            const key = vm.pop();
            newObject.properties[key] = value;
        }
        vm.push(newObject);
        return InterpretResult.OK;
    },
    // Gets a property from an object, traversing the prototype chain.
    [Opcodes.OP_GET_PROPERTY_PROTO]: (vm) => {
        const nameIndex = vm.currentFrame.readByte();
        const propName = vm.currentFrame.func.constants[nameIndex];
        const object = vm.pop();
        if (object === null || object === undefined) {
            vm.runtimeError(`Cannot read property '${propName}' of null or undefined.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        if (object instanceof NativeObject) {
            vm.push(object.getProperty(propName));
            return InterpretResult.OK;
        }
        if (typeof object === 'object' && propName in object) {
            vm.push(object[propName]);
            return InterpretResult.OK;
        } // Plain JS objects.
        let currentObject = object; // VM-style objects.
        while (currentObject) {
            if (currentObject.properties && currentObject.properties.hasOwnProperty(propName)) {
                vm.push(currentObject.properties[propName]);
                return InterpretResult.OK;
            }
            currentObject = currentObject.prototype;
        }
        vm.push(undefined);
        return InterpretResult.OK; // Property not found.
    },
    // Sets a property on an object.
    [Opcodes.OP_SET_PROPERTY_PROTO]: (vm) => {
        const nameIndex = vm.currentFrame.readByte();
        const propName = vm.currentFrame.func.constants[nameIndex];
        const value = vm.pop();
        const object = vm.pop();
        if (object instanceof NativeObject) {
            object.setProperty(propName, value);
        } else if (typeof object === 'object' && object !== null) {
            if (!object.properties) object.properties = {};
            object.properties[propName] = value;
        } else {
            vm.runtimeError(`Cannot set property '${propName}' on a non-object.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(value);
        return InterpretResult.OK; // Result of assignment.
    },
    // Gets an element/property by index from an array or object.
    [Opcodes.OP_GET_INDEX]: (vm) => {
        const index = vm.pop();
        const collection = vm.pop();
        if (Array.isArray(collection)) {
            vm.push(collection[index]);
        } else if (typeof collection === 'object' && collection !== null && collection.properties) {
            vm.push(collection.properties[index]);
        } else if (typeof collection === 'object' && collection !== null) {
            vm.push(collection[index]);
        } else {
            vm.runtimeError(`Cannot index a non-array/non-object value.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        return InterpretResult.OK;
    },
    // Sets an element/property by index on an array or object.
    [Opcodes.OP_SET_INDEX]: (vm) => {
        const value = vm.pop();
        const index = vm.pop();
        const collection = vm.pop();
        if (Array.isArray(collection)) {
            collection[index] = value;
        } else if (typeof collection === 'object' && collection !== null) {
            if (!collection.properties) collection.properties = {};
            collection.properties[index] = value;
        } else {
            vm.runtimeError(`Cannot set index on a non-array/non-object value.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push(value);
        return InterpretResult.OK; // Result of assignment.
    },
    // Creates a new object with a specified prototype.
    [Opcodes.OP_OBJECT_CREATE]: (vm) => {
        const prototype = vm.pop();
        if (prototype !== null && (typeof prototype !== 'object')) {
            vm.runtimeError(`Prototype must be an object or null.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        vm.push({
            properties: {},
            prototype: prototype
        });
        return InterpretResult.OK;
    },
    // Gets the prototype object of a class (Closure).
    [Opcodes.OP_GET_PROTOTYPE]: (vm) => {
        const closure = vm.peek(0);
        if (!(closure instanceof Closure)) {
            vm.runtimeError("Can only get the prototype of functions/classes.");
            return InterpretResult.RUNTIME_ERROR;
        }
        if (!closure.prototype) {
            closure.prototype = {
                properties: {},
                prototype: null
            };
        }
        vm.pop();
        vm.push(closure.prototype);
        return InterpretResult.OK;
    },
    // Sets the prototype of an object.
    [Opcodes.OP_SET_PROTOTYPE]: (vm) => {
        const prototype = vm.pop();
        const object = vm.pop();
        if (typeof object !== 'object' || object === null) {
            vm.runtimeError(`Target must be an object.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        if (prototype !== null && (typeof prototype !== 'object')) {
            vm.runtimeError(`Prototype must be an object or null.`);
            return InterpretResult.RUNTIME_ERROR;
        }
        object.prototype = prototype;
        vm.push(object);
        return InterpretResult.OK;
    },
    // Creates a new instance of a class (constructor).
    [Opcodes.OP_NEW]: (vm) => {
        const argCount = vm.currentFrame.readByte();
        const constructor = vm.peek(argCount);

        if (constructor instanceof NativeObject && constructor.object === PromiseV1) { // Special PromiseV1 constructor
            if (argCount === 1) {
                const executor = vm.pop();
                vm.pop();
                if (typeof executor !== 'function' && !(executor instanceof Closure)) {
                    vm.runtimeError("Promise constructor expects a function.");
                    return InterpretResult.RUNTIME_ERROR;
                }
                const promise = new PromiseV1(executor, vm);
                vm.push(promise);
                return InterpretResult.OK;
            } else {
                vm.runtimeError("Promise constructor expects exactly one argument.");
                return InterpretResult.RUNTIME_ERROR;
            }
        }

        if (!(constructor instanceof Closure)) {
            vm.runtimeError("Can only instantiate a class (closure).");
            return InterpretResult.RUNTIME_ERROR;
        }

        if (!constructor.prototype) {
            constructor.prototype = {
                properties: {},
                prototype: null
            };
        }
        const instance = {
            properties: {},
            prototype: constructor.prototype
        };

        vm.stack[vm.stack.length - 1 - argCount] = instance; // Place instance at 'this' slot.
        const frameBase = vm.stack.length - 1 - argCount;
        const constructorFrame = new CallFrame(constructor.func, frameBase, constructor);
        vm.callFrames.push(constructorFrame);
        vm.currentFrame = constructorFrame;
        return InterpretResult.OK;
    },
    // Increments a property on an object.
    [Opcodes.OP_INCREMENT_PROPERTY]: (vm) => propertyIncDec(vm, 1),
    // Decrements a property on an object.
    [Opcodes.OP_DECREMENT_PROPERTY]: (vm) => propertyIncDec(vm, -1),
    // Sets up a try-catch block by pushing an exception handler.
    [Opcodes.OP_SETUP_TRY]: (vm) => {
        const offset = vm.currentFrame.readShort();
        const catchIp = vm.currentFrame.ip + offset;
        vm.setupTry(catchIp);
        return InterpretResult.OK;
    },
    // Pops the current exception handler.
    [Opcodes.OP_POP_CATCH]: (vm) => {
        vm.exceptionHandlers.pop();
        return InterpretResult.OK;
    },
    // Throws an exception.
    [Opcodes.OP_THROW]: (vm) => {
        const message = vm.pop();
        vm.runtimeError(String(message));
        if (vm.hasError) return InterpretResult.RUNTIME_ERROR; // Propagate error.
        return InterpretResult.OK;
    },
    // Halts execution and awaits a promise. Suspends the current call frame.
    [Opcodes.OP_AWAIT]: (vm) => {
        const value = vm.peek(0);
        let promise;

        if (value instanceof PromiseV1) {
            promise = value;
        } else {
            // Awaiting a non-promise immediately resolves to the value.
            return InterpretResult.OK;
        }

        const frameToResume = vm.callFrames.pop();
        if (vm.callFrames.length === 0) vm.currentFrame = null;

        promise.then(
            (resolvedValue) => {
                vm.scheduleMicrotask(() => {
                    vm.callFrames.push(frameToResume);
                    vm.currentFrame = frameToResume;
                    vm.pop(); // Pop the awaited promise.
                    vm.push(resolvedValue);
                });
            },
            (rejectionReason) => {
                vm.scheduleMicrotask(() => {
                    vm.callFrames.push(frameToResume);
                    vm.currentFrame = frameToResume;
                    vm.runtimeError(rejectionReason);
                    vm.callFrames.pop();
                    vm.currentFrame = vm.callFrames.length > 0 ? vm.callFrames[vm.callFrames.length - 1] : null;
                });
            }
        );
        return InterpretResult.YIELD; // Signal VM to suspend.
    },
    // Yields control in a generator function.
    [Opcodes.OP_YIELD]: (vm) => {
        const yieldValue = vm.pop();
        // Save current coroutine state.
        vm.activeCoroutine.stack = vm.stack;
        vm.activeCoroutine.callFrames = vm.callFrames;
        vm.activeCoroutine.openUpvalues = vm.openUpvalues;
        vm.activeCoroutine.state = 'suspended';

        // Restore caller's VM state.
        const scheduler = vm.activeCoroutine.caller;
        vm.stack = scheduler.stack;
        vm.callFrames = scheduler.callFrames;
        vm.openUpvalues = scheduler.openUpvalues;
        vm.currentFrame = vm.callFrames.length > 0 ? vm.callFrames[vm.callFrames.length - 1] : null;

        vm.push(yieldValue);
        return InterpretResult.YIELD;
    },
};
