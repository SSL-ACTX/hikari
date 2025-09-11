/**
 * @fileoverview AST visitors for compiling ES6 classes into VM bytecode.
 *
 * - Compiles class declarations into constructor + prototype methods.
 * - Leaves constructor closures on the stack, attaches methods to prototype.
 * - Supports default empty constructors when none are provided.
 */

import { Opcodes } from '../../opcodes.js';
import { CompilerState, FunctionObject } from '../CompilerState.js';
import { declareVariable, defineVariable } from '../utils.js';

/** Compiles a class method into a FunctionObject and emits a closure. */
function compileMethod(compiler, path, defaultName) {
    const methodName = path.node.key.name || defaultName;
    const functionCompiler = new CompilerState(compiler.current, methodName);
    compiler.current = functionCompiler;

    // In methods, local slot 0 is reserved for `this`.
    compiler.current.locals[0].name = 'this';
    compiler.current.scopeDepth++;

    for (const param of path.node.params) {
        declareVariable(compiler.current, param.name);
    }

    path.get('body').traverse(compiler.bindVisitor(compiler.baseVisitor));

    // Implicitly return `this` from constructors, or `null` from other methods.
    const lastOp = compiler.current.bytecode[compiler.current.bytecode.length - 1];
    if (lastOp !== Opcodes.OP_RETURN) {
        if (path.node.kind === 'constructor') {
            compiler.current.emitBytes(Opcodes.OP_GET_LOCAL, 0); // push `this`
            compiler.current.emitByte(Opcodes.OP_RETURN);
        } else {
            compiler.current.emitReturn();
        }
    }

    const compiledMethod = new FunctionObject(
        methodName, path.node.params.length, functionCompiler.bytecode,
        functionCompiler.constants, functionCompiler.upvalues.length, functionCompiler.upvalues
    );

    compiler.current = functionCompiler.enclosing;
    const constIndex = compiler.current.addConstant(compiledMethod);
    compiler.current.emitBytes(Opcodes.OP_CLOSURE, constIndex);

    for (const upvalue of compiledMethod.upvalues) {
        compiler.current.emitBytes(upvalue.isLocal ? 1 : 0, upvalue.index);
    }
}

export const ClassVisitors = {
    ClassDeclaration: {
        enter(path) {
            const className = path.node.id.name;
            declareVariable(this.current, className);

            // 1. Compile the constructor. Leaves a closure on the stack.
            let constructorPath = path.get('body').get('body').find(p => p.node.kind === 'constructor');
            if (constructorPath) {
                compileMethod(this, constructorPath, className);
            } else {
                // Create a default empty constructor if none is provided.
                const bytecode = [Opcodes.OP_GET_LOCAL, 0, Opcodes.OP_RETURN]; // constructor() { return this; }
                const emptyConstructor = new FunctionObject(className, 0, bytecode, []);
                this.current.emitConstant(emptyConstructor);
            }

            // 2. Define the class variable, which stores the constructor function.
            defineVariable(this.current, className);

            // 3. Compile and attach all other methods to the constructor's prototype.
            const methodPaths = path.get('body').get('body').filter(p => p.node.kind !== 'constructor');
            for (const methodPath of methodPaths) {
                // [Get class], [Get its prototype] -> Leaves prototype on stack.
                this.current.emitBytes(Opcodes.OP_GET_GLOBAL, this.current.addConstant(className));
                this.current.emitByte(Opcodes.OP_GET_PROTOTYPE);

                // Compile the method. -> Leaves method closure on stack.
                compileMethod(this, methodPath, '<anonymous>');

                // [Set method on prototype]. -> Consumes prototype and closure.
                const nameIndex = this.current.addConstant(methodPath.node.key.name);
                this.current.emitBytes(Opcodes.OP_SET_PROPERTY_PROTO, nameIndex);
                this.current.emitByte(Opcodes.OP_POP); // Pop the result of the set operation.
            }
            path.skip();
        }
    },
};
