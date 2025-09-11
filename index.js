/**
 * @fileoverview Main entry point for Hikari.
 */

import fs from 'fs';
import path from 'path';
import { Compiler } from './src/compiler/index.js';
import { VM } from './src/vm/index.js';
import { disassembleFunction, resetDisassemblerState } from './src/disassembler/index.js';

/** Load source code from a file path. */
function loadSource(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`File not found: ${absolutePath}`);
  return fs.readFileSync(absolutePath, 'utf-8');
}

/** Compile, disassemble, and execute a source file on the VM. */
async function runFile(filePath) {
  let source;
  try {
    source = loadSource(filePath);
  } catch (err) {
    console.error(err.message);
    return;
  }

  console.log('--- Source Code ---\n', source, '\n-------------------');

  const compiler = new Compiler();
  const vm = new VM();

  console.log('Compiling...');
  const program = compiler.compile(source);
  if (!program) return console.error('Compilation failed.');

  // Disassemble main function
  resetDisassemblerState();
  disassembleFunction(program.mainFunction);

  console.log('\nExecuting...');
  const { result, value } = await vm.interpret(program);

  console.log(`Execution finished with result: ${result}, final value:`, value);
  console.log('\n--- Final VM State ---');
  console.log('Final Stack (should be empty):', vm.stack);
  console.log('Globals:', vm.globals);
}

/** Main entry point with optional debounced live-reload. */
async function main(filePath, live = false) {
  await runFile(filePath);

  if (!live) return;

  console.log(`\n🔁 Live mode activated. Watching file: ${filePath}`);

  let timeout;
  const debounceInterval = 300; // milliseconds

  fs.watchFile(path.resolve(filePath), { interval: 500 }, (curr, prev) => {
    if (curr.mtime.getTime() === prev.mtime.getTime()) return; // skip if not modified

    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      console.log('\n--- File changed, re-running ---\n');
      await runFile(filePath);
    }, debounceInterval);
  });
}

// --- CLI Arguments ---
const fileToRun = process.argv[2] || './example.js';
const liveMode = process.argv.includes('--live');

main(fileToRun, liveMode);
