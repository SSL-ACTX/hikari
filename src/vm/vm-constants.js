/**
 * @fileoverview Constant values used by the Virtual Machine.
 * Includes possible outcomes of the VM's `run` cycle.
 */

export const InterpretResult = {
  OK: 'OK',
  COMPILE_ERROR: 'COMPILE_ERROR',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  YIELD: 'YIELD',
};
