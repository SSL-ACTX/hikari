/**
 * @fileoverview AST visitors for compiling expression nodes.
 */

import { Opcodes } from '../../opcodes.js';
import { emitGetVariable, emitSetVariable } from '../utils.js';

export const ExpressionVisitors = {
    AwaitExpression: {
        exit() {
            // The awaited expression's value is already on the stack.
            this.current.emitByte(Opcodes.OP_AWAIT);
        }
    },
    YieldExpression: {
        exit(path) {
            const { node } = path;

            if (node.argument) {
                // Evaluate the value to yield (already pushes it on the stack).
                path.get("argument").visit();
            } else {
                // Plain `yield;` yields `undefined` (we’ll push null here for now).
                this.current.emitByte(Opcodes.OP_PUSH_NULL);
            }
            // Emit the actual yield instruction.
            this.current.emitByte(Opcodes.OP_YIELD);
        }
    },
    NewExpression: {
        exit(path) {
            const argCount = path.node.arguments.length;
            this.current.emitBytes(Opcodes.OP_NEW, argCount);
        }
    },
    ArrayExpression: {
        exit(path) {
            const elementCount = path.node.elements.length;
            this.current.emitBytes(Opcodes.OP_NEW_ARRAY, elementCount);
        }
    },
    CallExpression: {
        exit(path) {
            const { callee, arguments: args } = path.node;
            // Optimized path for direct method calls like `obj.method()`.
            if (callee.type === 'MemberExpression' && !callee.computed) {
                const methodName = callee.property.name;
                const argCount = args.length;
                const nameIndex = this.current.addConstant(methodName);
                this.current.emitBytes(Opcodes.OP_CALL_METHOD, nameIndex, argCount);
            } else {
                const argCount = args.length;
                this.current.emitBytes(Opcodes.OP_CALL, argCount);
            }
        }
    },
    BinaryExpression: {
        exit(path) {
            const opMap = {
                '+': Opcodes.OP_ADD, '-': Opcodes.OP_SUBTRACT, '*': Opcodes.OP_MULTIPLY,
                '/': Opcodes.OP_DIVIDE, '%': Opcodes.OP_MODULO, '**': Opcodes.OP_POWER,
                '==': Opcodes.OP_EQUAL, '===': Opcodes.OP_EQUAL, '!=': Opcodes.OP_NOT_EQUAL,
                '!==': Opcodes.OP_NOT_EQUAL, '>': Opcodes.OP_GREATER, '<': Opcodes.OP_LESS,
                '>=': Opcodes.OP_GREATER_EQUAL, '<=': Opcodes.OP_LESS_EQUAL
            };
            const opcode = opMap[path.node.operator];
            if (opcode) {
                this.current.emitByte(opcode);
            } else {
                throw new Error(`Unsupported binary operator: ${path.node.operator}`);
            }
        }
    },
    Identifier: {
        exit(path) {
            // An identifier's value is only needed if it's being read.
            // In many contexts (declarations, assignments), it's handled by the parent visitor.
            const parent = path.parentPath;
            if ((parent.isVariableDeclarator() && path.key === 'id') ||
                (parent.isFunctionDeclaration() && path.key === 'id') ||
                (parent.isClassDeclaration() && path.key === 'id') ||
                (parent.isMemberExpression() && path.key === 'property' && !parent.node.computed) ||
                (parent.isAssignmentExpression() && path.key === 'left') ||
                (parent.isUpdateExpression() && path.key === 'argument')) {
                return;
            }
            emitGetVariable(this, path.node.name);
        }
    },
    ObjectExpression: {
      exit(path) {
        const propertyCount = path.node.properties.length;
        this.current.emitBytes(Opcodes.OP_NEW_OBJECT, propertyCount);
      }
    },
    AssignmentExpression: {
        enter(path) {
            const { left, operator } = path.node;
            const opMap = {
                '+=': Opcodes.OP_ADD, '-=': Opcodes.OP_SUBTRACT, '*=': Opcodes.OP_MULTIPLY,
                '/=': Opcodes.OP_DIVIDE, '**=': Opcodes.OP_POWER,
            };

            if (left.type === 'Identifier') {
                // For compound assignment, get the original value first.
                if (opMap[operator]) emitGetVariable(this, left.name);
                path.get('right').visit();
                if (opMap[operator]) this.current.emitByte(opMap[operator]);
                emitSetVariable(this, left.name);

            } else if (left.type === 'MemberExpression') {
                path.get('left.object').visit(); // Push object.

                if (opMap[operator]) {
                    // For `a.b += c`, duplicate object ref for both GET and SET.
                    this.current.emitByte(Opcodes.OP_DUPLICATE); // Stack: [obj, obj]
                    const nameIndex = this.current.addConstant(left.property.name);
                    this.current.emitBytes(Opcodes.OP_GET_PROPERTY_PROTO, nameIndex); // Stack: [obj, old_value]
                }
                path.get('right').visit(); // Stack: [obj, old_value, new_value_part]
                if (opMap[operator]) this.current.emitByte(opMap[operator]); // Stack: [obj, result]

                const nameIndex = this.current.addConstant(left.property.name);
                this.current.emitBytes(Opcodes.OP_SET_PROPERTY_PROTO, nameIndex);
            }
            // We've handled traversal manually.
            path.skip();
        }
    },
    MemberExpression: {
        exit(path) {
            // If this expression is the target of a call or assignment, the parent visitor handles it.
            const isAssignmentTarget = path.parentPath.isAssignmentExpression() && path.key === 'left';
            const isUpdateTarget = path.parentPath.isUpdateExpression() && path.key === 'argument';
            const isCallCallee = path.parentPath.isCallExpression() && path.key === 'callee';

            if (isAssignmentTarget || isUpdateTarget || (isCallCallee && !path.node.computed)) {
                return;

            }
            if (path.node.computed) {
                this.current.emitByte(Opcodes.OP_GET_INDEX);
            } else {
                const nameIndex = this.current.addConstant(path.node.property.name);
                this.current.emitBytes(Opcodes.OP_GET_PROPERTY_PROTO, nameIndex);
            }
        }
    },
    ObjectProperty: {
        enter(path) {
            // Manual traversal: compile key, then value.
            if (!path.node.computed) {
                this.current.emitConstant(path.node.key.name);
            } else {
                path.get('key').visit();
            }
            path.get('value').visit();
            path.skip();
        }
    },
    UpdateExpression: {
        exit(path) {
            const { operator, argument, prefix } = path.node;
            const opIsInc = operator === '++';
            // If the expression is a standalone statement, its resulting value is unused.
            const isStatement = path.parentPath.isExpressionStatement();

            if (argument.type === 'Identifier') {
                const name = argument.name;
                const constIndex = this.current.addConstant(name);
                const localSlot = this.current.resolveLocal(name);
                const upvalueSlot = this.resolveUpvalue(name, this.current);

                // For postfix `x++`, push the original value before incrementing.
                if (!prefix && !isStatement) {
                    if (localSlot !== -1) this.current.emitBytes(Opcodes.OP_GET_LOCAL, localSlot);
                    else if (upvalueSlot !== -1) this.current.emitBytes(Opcodes.OP_GET_UPVALUE, upvalueSlot);
                    else this.current.emitBytes(Opcodes.OP_GET_GLOBAL, constIndex);
                }

                if (localSlot !== -1) {
                    this.current.emitBytes(opIsInc ? Opcodes.OP_INCREMENT_LOCAL : Opcodes.OP_DECREMENT_LOCAL, localSlot);
                } else if (upvalueSlot !== -1) {
                    this.current.emitBytes(opIsInc ? Opcodes.OP_INCREMENT_UPVALUE : Opcodes.OP_DECREMENT_UPVALUE, upvalueSlot);
                } else {
                    this.current.emitBytes(opIsInc ? Opcodes.OP_INCREMENT_GLOBAL : Opcodes.OP_DECREMENT_GLOBAL, constIndex);
                }

                // For postfix `x++`, pop the new value, leaving the original on the stack.
                if (!prefix && !isStatement) this.current.emitByte(Opcodes.OP_POP);

            } else if (argument.type === 'MemberExpression') {
                if (argument.computed) throw new Error("Computed property increment/decrement not supported.");
                const propName = argument.property.name;
                const constIndex = this.current.addConstant(propName);
                const opcode = opIsInc ? Opcodes.OP_INCREMENT_PROPERTY : Opcodes.OP_DECREMENT_PROPERTY;
                // Mode: 0=postfix, 1=prefix, 2=discard result.
                const mode = isStatement ? 2 : (prefix ? 1 : 0);
                this.current.emitBytes(opcode, constIndex, mode);
            } else {
                throw new Error(`Unsupported update expression argument type: ${argument.type}`);
            }
        }
    },
    TemplateLiteral: {
        enter(path) {
            // Compile as a series of string concatenations.
            const { quasis, expressions } = path.node;
            path.get('quasis.0').visit(); // Start with the first string part.
            for (let i = 0; i < expressions.length; i++) {
                path.get(`expressions.${i}`).visit();
                this.current.emitByte(Opcodes.OP_ADD);
                path.get(`quasis.${i + 1}`).visit();
                this.current.emitByte(Opcodes.OP_ADD);
            }
            path.skip();
        }
    },
    TemplateElement: {
        exit(path) { this.current.emitConstant(path.node.value.cooked); }
    },
    /** Generic handler for simple literals and unary expressions. */
    _GeneralExit: {
        exit(path) {
            const { node } = path;
            switch (node.type) {
                case 'NumericLiteral': this.current.emitConstant(node.value); break;
                case 'StringLiteral': this.current.emitConstant(node.value); break;
                case 'BooleanLiteral': this.current.emitByte(node.value ? Opcodes.OP_PUSH_TRUE : Opcodes.OP_PUSH_FALSE); break;
                case 'NullLiteral': this.current.emitByte(Opcodes.OP_PUSH_NULL); break;
                case 'ThisExpression': this.current.emitBytes(Opcodes.OP_GET_LOCAL, 0); break;
                case 'UnaryExpression': {
                    if (node.operator === '-') this.current.emitByte(Opcodes.OP_NEGATE);
                    else if (node.operator === '!') this.current.emitByte(Opcodes.OP_NOT);
                    else throw new Error(`Unsupported unary operator: ${node.operator}`);
                    break;
                }
            }
        }
    }
};
