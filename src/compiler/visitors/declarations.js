/**
 * @fileoverview AST visitors for compiling variable declarations into bytecode.
 *
 * Supports:
 *   - Single variable declarations: `let a = 1;`
 *   - Array destructuring: `let [a, b] = arr;`
 *   - Object destructuring: `let {a, b} = obj;`
 *
 * Uses the CompilerState (`this.current`) to emit bytecode for the VM.
 */

import { declareVariable, defineVariable } from '../utils.js';
import { Opcodes } from '../../opcodes.js';

export const DeclarationVisitors = {
    VariableDeclaration: {
        enter(path) {
            // This visitor only supports single declarations, e.g., `let a = 1;`
            // Babel plugins would typically split `let a=1, b=2;` into separate declarations.
            const declaration = path.node.declarations[0];
            const { id, init } = declaration;

            // 1. Compile the initializer expression. Its value will be on the stack.
            if (init) {
                path.get('declarations.0.init').visit();
            } else {
                this.current.emitByte(Opcodes.OP_PUSH_NULL); // e.g., `let a;`
            }

            // 2. Declare and define the variable(s), consuming the value from the stack.
            if (id.type === 'Identifier') {
                declareVariable(this.current, id.name);
                defineVariable(this.current, id.name);

            } else if (id.type === 'ArrayPattern') {
                // For `let [a, b] = arr`, the array is on the stack.
                const lastIndex = id.elements.length - 1;
                id.elements.forEach((element, index) => {
                    if (element.type === 'Identifier') {
                        declareVariable(this.current, element.name);
                        // For every element except the last, duplicate the array reference
                        // so it's available for the next element.
                        if (index < lastIndex) {
                           this.current.emitByte(Opcodes.OP_DUPLICATE);
                        }
                        this.current.emitConstant(index);
                        this.current.emitByte(Opcodes.OP_GET_INDEX); // Get element.
                        defineVariable(this.current, element.name); // Store element in variable.

                        // After defining, pop the value (which is also the result of defineVariable)
                        // leaving the duplicated array for the next iteration.
                        if (index < lastIndex) {
                            this.current.emitByte(Opcodes.OP_POP);
                        }
                    }
                });
                this.current.emitByte(Opcodes.OP_POP); // Pop original array reference.

            } else if (id.type === 'ObjectPattern') {
                // For `let {a, b} = obj`, the object is on the stack.
                id.properties.forEach(property => {
                    if (property.type === 'ObjectProperty' && property.key.type === 'Identifier') {
                        const varName = property.key.name;
                        declareVariable(this.current, varName);
                        this.current.emitByte(Opcodes.OP_DUPLICATE); // Keep object ref.
                        const nameIndex = this.current.addConstant(varName);
                        this.current.emitBytes(Opcodes.OP_GET_PROPERTY_PROTO, nameIndex); // Get property.
                        defineVariable(this.current, varName); // Store property in variable.
                        this.current.emitByte(Opcodes.OP_POP); // Pop result of assignment.
                    }
                });
                this.current.emitByte(Opcodes.OP_POP); // Pop original object reference.
            }
            path.skip();
        }
    },
};
