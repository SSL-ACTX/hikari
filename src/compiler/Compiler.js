/**
 * @fileoverview Main Compiler class: parses JS source into AST and emits bytecode for the VM.
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default;
import { Opcodes } from '../opcodes.js';
import { CompilerState, FunctionObject } from './CompilerState.js';
import * as Utils from './utils.js';
import { StatementVisitors } from './visitors/statements.js';
import { ExpressionVisitors } from './visitors/expressions.js';
import { DeclarationVisitors } from './visitors/declarations.js';
import { FunctionVisitors } from './visitors/functions.js';
import { ClassVisitors } from './visitors/classes.js';

/** Globals that are handled specially in the VM via OP_GET_NATIVE. */
export const NATIVE_GLOBALS = new Set(['console', 'Math', 'performance', 'Date', 'Object', 'Promise']);

/** The main compiler orchestrating AST traversal and bytecode generation. */
export class Compiler {
  constructor() {
    this.current = null;        // Current function compilation state
    this.baseVisitor = {};      // Combined Babel visitor
    this._initializeBaseVisitor();
  }

  /** Combines all visitor modules into a single visitor object. */
  _initializeBaseVisitor() {
    Object.assign(
      this.baseVisitor,
      StatementVisitors,
      ExpressionVisitors,
      DeclarationVisitors,
      FunctionVisitors,
      ClassVisitors
    );

    // Ensure general exit logic for expressions is always applied
    if (!this.baseVisitor.exit) {
      this.baseVisitor.exit = ExpressionVisitors._GeneralExit.exit;
    } else {
      const originalExit = this.baseVisitor.exit;
      this.baseVisitor.exit = function(path) {
        originalExit.call(this, path);
        ExpressionVisitors._GeneralExit.exit.call(this, path);
      };
    }
  }

  /** Compiles JS source into a program object containing bytecode. */
  compile(source) {
    this.current = new CompilerState(null, '<script>');
    const ast = parse(source, {
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["generators", "asyncGenerators"]
    });

    const boundVisitor = this.bindVisitor(this.baseVisitor);
    traverse(ast, boundVisitor);

    // Ensure the last opcode is a return
    const lastOp = this.current.bytecode[this.current.bytecode.length - 1];
    if (this.current.bytecode.length === 0 || lastOp !== Opcodes.OP_RETURN) {
      this.current.emitReturn();
    }

    const mainFunction = new FunctionObject(
      this.current.functionName,
      0, // arity
      this.current.bytecode,
      this.current.constants,
      this.current.upvalues.length,
      this.current.upvalues
    );

    return { mainFunction };
  }

  /** Binds all visitor functions to the Compiler instance. */
  bindVisitor(visitor) {
    const bound = {};
    for (const key in visitor) {
      if (typeof visitor[key] === 'function') {
        bound[key] = visitor[key].bind(this);
      } else {
        bound[key] = {};
        for (const action in visitor[key]) {
          bound[key][action] = visitor[key][action].bind(this);
        }
      }
    }
    return bound;
  }

  /** Resolves an upvalue via utility function. */
  resolveUpvalue(name, currentCompilerState) {
    return Utils.resolveUpvalue(name, currentCompilerState);
  }
}
