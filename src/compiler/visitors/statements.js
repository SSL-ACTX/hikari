/**
 * @fileoverview AST visitors for compiling statement nodes.
 */

import { Opcodes } from '../../opcodes.js';
import { emitJump, patchJump, emitLoop, declareVariable, defineVariable } from '../utils.js';
import { LoopContext } from '../CompilerState.js';

/** Pops local variables from the stack until the target scope depth is reached. */
function popLocalsToDepth(current, targetDepth) {
    while (current.locals.length > 0 && current.locals[current.locals.length - 1].depth > targetDepth) {
        const local = current.locals.pop();
        // If a local was captured by a closure, it needs special handling when it goes out of scope.
        current.emitByte(local.isCaptured ? Opcodes.OP_CLOSE_UPVALUE : Opcodes.OP_POP);
    }
}

export const StatementVisitors = {
    BlockStatement: {
        enter() { this.current.scopeDepth++; },
        exit() {
            this.current.scopeDepth--;
            popLocalsToDepth(this.current, this.current.scopeDepth);
        }
    },
    IfStatement: {
        enter(path) {
            path.get('test').visit();
            const thenJump = emitJump(this.current, Opcodes.OP_JUMP_IF_FALSE);
            this.current.emitByte(Opcodes.OP_POP); // Pop condition value
            path.get('consequent').visit();

            if (path.node.alternate) {
                const elseJump = emitJump(this.current, Opcodes.OP_JUMP);
                patchJump(this.current, thenJump);
                this.current.emitByte(Opcodes.OP_POP); // Pop condition value for the 'else' path
                path.get('alternate').visit();
                patchJump(this.current, elseJump);
            } else {
                patchJump(this.current, thenJump);
                this.current.emitByte(Opcodes.OP_POP); // Pop condition value
            }
            path.skip();
        }
    },
    WhileStatement: {
      enter(path) {
        const loop = new LoopContext();
        loop.scopeDepth = this.current.scopeDepth + 1;
        this.current.loops.push(loop);

        const loopStart = this.current.bytecode.length;
        path.get('test').visit();
        const exitJump = emitJump(this.current, Opcodes.OP_JUMP_IF_FALSE);
        this.current.emitByte(Opcodes.OP_POP); // Pop condition
        path.get('body').visit();

        loop.continueJumps.forEach(offset => patchJump(this.current, offset));
        emitLoop(this.current, loopStart);
        patchJump(this.current, exitJump);
        this.current.emitByte(Opcodes.OP_POP); // Pop condition

        loop.breakJumps.forEach(offset => patchJump(this.current, offset));
        this.current.loops.pop();
        path.skip();
      }
    },
    ForStatement: {
        enter(path) {
            this.current.scopeDepth++;
            if (path.node.init) path.get('init').visit();

            const loopStart = this.current.bytecode.length;
            let exitJump = -1;

            if (path.node.test) {
                path.get('test').visit();
                exitJump = emitJump(this.current, Opcodes.OP_JUMP_IF_FALSE);
                this.current.emitByte(Opcodes.OP_POP); // Pop condition
            }

            path.get('body').visit();

            if (path.node.update) {
                path.get('update').visit();
                this.current.emitByte(Opcodes.OP_POP); // Pop update expression result
            }
            emitLoop(this.current, loopStart);

            if (exitJump !== -1) {
                patchJump(this.current, exitJump);
                this.current.emitByte(Opcodes.OP_POP); // Pop condition
            }

            this.current.scopeDepth--;
            popLocalsToDepth(this.current, this.current.scopeDepth);
            path.skip();
        }
    },
    BreakStatement: {
        enter() {
            if (this.current.loops.length === 0) throw new Error("Illegal break statement.");
            const currentLoop = this.current.loops[this.current.loops.length - 1];
            // Pop locals from scopes inside the loop before jumping out.
            popLocalsToDepth(this.current, currentLoop.scopeDepth - 1);
            const jump = emitJump(this.current, Opcodes.OP_JUMP);
            currentLoop.breakJumps.push(jump);
        }
    },
    ContinueStatement: {
        enter() {
            if (this.current.loops.length === 0) throw new Error("Illegal continue statement.");
            const currentLoop = this.current.loops[this.current.loops.length - 1];
            // Pop locals from scopes inside the loop before jumping back.
            popLocalsToDepth(this.current, currentLoop.scopeDepth - 1);
            const jump = emitJump(this.current, Opcodes.OP_JUMP);
            currentLoop.continueJumps.push(jump);
        }
    },
    ReturnStatement: {
        exit(path) {
            if (path.node.argument) {
                // The argument expression has already been visited and its value is on the stack.
            } else {
                this.current.emitByte(Opcodes.OP_PUSH_NULL); // Implicit `return;`
            }
            this.current.emitByte(Opcodes.OP_RETURN);
        }
    },
    TryStatement: {
        enter(path) {
            const tryJump = emitJump(this.current, Opcodes.OP_SETUP_TRY);
            path.get('block').visit();
            this.current.emitByte(Opcodes.OP_POP_CATCH); // Pop the handler if try block completes.
            const exitJump = emitJump(this.current, Opcodes.OP_JUMP);

            patchJump(this.current, tryJump);
            if (path.node.handler) {
                this.current.scopeDepth++;
                const catchClause = path.get('handler');
                const errorParam = catchClause.node.param;
                if (errorParam) { // `catch (e)`
                    declareVariable(this.current, errorParam.name);
                    defineVariable(this.current, errorParam.name);
                } else { // `catch { ... }`
                    this.current.emitByte(Opcodes.OP_POP); // Pop the error object if unused.
                }
                catchClause.get('body').visit();
                this.current.scopeDepth--;
            }
            patchJump(this.current, exitJump);
            path.skip();
        }
    },
    ThrowStatement: {
        exit() { this.current.emitByte(Opcodes.OP_THROW); }
    },
    ExpressionStatement: {
        exit() {
            // The result of a standalone expression is not used, so pop it.
            this.current.emitByte(Opcodes.OP_POP);
        }
    }
};
