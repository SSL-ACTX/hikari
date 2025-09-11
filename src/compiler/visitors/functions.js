/**
 * @fileoverview AST visitors for compiling functions and methods into VM bytecode.
 *
 * Supports:
 *  - Function declarations, expressions, and arrow functions
 *  - Object methods
 *  - Async and generator functions
 *  - Closure/upvalue handling
 */


import { Opcodes } from '../../opcodes.js';
import { CompilerState, FunctionObject } from '../CompilerState.js';
import { declareVariable, defineVariable } from '../utils.js';

/**
 * Compiles the body of a function, creating a new CompilerState and FunctionObject.
 * This is a shared utility for all function-like structures.
 */
function compileFunctionBody(compiler, path, funcName, params) {
    const functionCompiler = new CompilerState(compiler.current, funcName);
    compiler.current = functionCompiler;
    compiler.current.scopeDepth++; // Enter function body scope.

    // Declare all parameters as local variables in the new scope.
    for (const param of params) {
        const paramName = (param.type === 'Identifier') ? param.name : param.left.name;
        declareVariable(compiler.current, paramName);
    }

    const bodyPath = path.get('body');
    if (bodyPath.isExpression()) {
        bodyPath.visit();
        compiler.current.emitByte(Opcodes.OP_RETURN);
    } else {
        bodyPath.traverse(compiler.bindVisitor(compiler.baseVisitor));
        // Ensure function implicitly returns null if execution reaches the end.
        const lastOp = compiler.current.bytecode[compiler.current.bytecode.length - 1];
        if (lastOp !== Opcodes.OP_RETURN && lastOp !== Opcodes.OP_THROW) {
            if (path.node.generator) {
                // Generators must return `undefined` when they run out of code
                compiler.current.emitByte(Opcodes.OP_PUSH_NULL);
                compiler.current.emitByte(Opcodes.OP_RETURN);
            } else {
                compiler.current.emitReturn();
            }
        }
    }


    const compiledFunction = new FunctionObject(
        funcName, params.length, functionCompiler.bytecode, functionCompiler.constants,
        functionCompiler.upvalues.length, functionCompiler.upvalues, path.node.generator, path.node.async
    );

    // Restore the enclosing compiler and emit the closure.
    compiler.current = functionCompiler.enclosing;
    const constIndex = compiler.current.addConstant(compiledFunction);
    compiler.current.emitBytes(Opcodes.OP_CLOSURE, constIndex);

    // Emit upvalue capture information.
    for (const upvalue of compiledFunction.upvalues) {
        compiler.current.emitBytes(upvalue.isLocal ? 1 : 0, upvalue.index);
    }
}

export const FunctionVisitors = {
    FunctionDeclaration: {
        enter(path) {
            const funcName = path.node.id.name;
            compileFunctionBody(this, path, funcName, path.node.params);
            declareVariable(this.current, funcName);
            defineVariable(this.current, funcName);
            path.skip();
        }
    },
    FunctionExpression: {
        enter(path) {
            const funcName = path.node.id ? path.node.id.name : '<anonymous>';
            compileFunctionBody(this, path, funcName, path.node.params);
            path.skip();
        }
    },
    ArrowFunctionExpression: {
        enter(path) {
            compileFunctionBody(this, path, '<anonymous>', path.node.params);
            path.skip();
        }
    },
    ObjectMethod: {
        enter(path) {
            // Compile method key (name).
            if (!path.node.computed) {
                this.current.emitConstant(path.node.key.name);
            } else {
                path.get('key').visit();
            }
            // Compile method value (function body).
            const funcName = path.node.key.name || '<anonymous>';
            compileFunctionBody(this, path, funcName, path.node.params);
            path.skip();
        }
    },
};
