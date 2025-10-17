import fs from 'fs';
import path from 'path';
import { Compiler } from './src/compiler/index.js';
import { VM } from './src/vm/index.js';
import chalk from 'chalk';

const testsDir = path.resolve('./tests');

async function runTest(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const compiler = new Compiler();
  const vm = new VM();

  try {
    const program = compiler.compile(source);
    if (!program) {
      console.log(chalk.red(`Compilation failed for ${path.basename(filePath)}`));
      return false;
    }

    // Intercept console.error temporarily (for runtime messages)
    let runtimeError = null;
    const originalError = console.error;
    console.error = (...args) => {
      runtimeError = args.join(' ');
      originalError(...args);
    };

    await vm.interpret(program);

    // Restore console.error
    console.error = originalError;

    // If runtime error occurred, mark as failed
    if (runtimeError) {
      console.log(chalk.red(`FAILED: ${path.basename(filePath)}`));
      console.log(chalk.gray(`  Runtime Error: ${runtimeError}`));
      return false;
    }

    console.log(chalk.green(`PASSED: ${path.basename(filePath)}`));
    return true;
  } catch (error) {
    console.log(chalk.red(`FAILED: ${path.basename(filePath)}`));
    console.error(error);
    return false;
  }
}

async function main() {
  const testFiles = fs.readdirSync(testsDir).filter(file => file.endsWith('.js'));
  let passed = 0;
  let failed = 0;

  console.log(chalk.bold.yellow('Running tests...\n'));

  for (const file of testFiles) {
    const success = await runTest(path.join(testsDir, file));
    if (success) passed++;
    else failed++;
  }

  console.log(chalk.bold.yellow('\n--- Test Summary ---'));
  console.log(chalk.green(`Passed: ${passed}`));
  console.log(chalk.red(`Failed: ${failed}`));
  console.log(chalk.bold.yellow('--------------------'));

  if (failed > 0) process.exit(1);
}

main();
