/**
 * @fileoverview Build script for Hikari.
 * Bundles and minifies the VM, Compiler, and Disassembler into separate,
 * portable files for distribution.
 */

import esbuild from 'esbuild';
import { minify } from 'terser';
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

// --- Configuration ---

const BUILD_CONFIGS = [
  {
    name: 'VM',
    entryPoint: './src/vm/index.js',
    outfile: './dist/hikari-vm.js',
    globalName: 'HikariVM',
  },
  {
    name: 'Compiler',
    entryPoint: './src/compiler/index.js',
    outfile: './dist/hikari-compiler.js',
    globalName: 'HikariCompiler',
  },
  {
    name: 'Disassembler',
    entryPoint: './src/disassembler/index.js',
    outfile: './dist/hikari-disassembler.js',
    globalName: 'HikariDisassembler',
  },
];

const TERSER_OPTIONS = {
  compress: { passes: 2 },
  mangle: { toplevel: true },
  format: {
    comments: false,
    ascii_only: true,
  },
};

const PROCESS_POLYFILL_BANNER = {
  js: `window.process = { env: { NODE_ENV: 'production' } };`,
};

const DIST_DIR = './dist';
const CACHE_FILE = path.join(DIST_DIR, '.build-cache.json');

// --- Utilities ---

const log = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
};

async function hashFiles(filePaths) {
  const hash = crypto.createHash('sha256');
  for (const filePath of filePaths) {
    try {
      const data = await fs.readFile(filePath);
      hash.update(data);
    } catch {
      // ignore missing files
    }
  }
  return hash.digest('hex');
}

async function getAllFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const res = path.resolve(dir, entry.name);
      return entry.isDirectory() ? getAllFiles(res) : res;
    })
  );
  return Array.prototype.concat(...files);
}

async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// --- Build Logic ---

async function needsRebuild(config, cache) {
  const srcDir = path.dirname(config.entryPoint);
  const files = await getAllFiles(srcDir);
  const hash = await hashFiles(files);
  return { changed: cache[config.name] !== hash, hash };
}

async function buildTarget(config, hash, cache) {
  log.info(`Building target: ${config.name}...`);

  const esbuildOptions = {
    entryPoints: [config.entryPoint],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: config.globalName,
    write: false,
  };

  if (config.name === 'Compiler') {
    esbuildOptions.banner = PROCESS_POLYFILL_BANNER;
    log.info('  - Injecting process polyfill for Compiler.');
  }

  const bundleResult = await esbuild.build(esbuildOptions);
  const bundledCode = bundleResult.outputFiles[0].text;
  log.info(`  - esbuild bundling complete.`);

  const targetTerserOptions = {
    ...TERSER_OPTIONS,
    mangle: { ...TERSER_OPTIONS.mangle, reserved: [config.globalName] },
  };

  const minifyResult = await minify(bundledCode, targetTerserOptions);
  if (minifyResult.error) {
    throw new Error(`Terser failed for ${config.name}: ${minifyResult.error}`);
  }
  const minifiedCode = minifyResult.code;
  log.info(`  - Terser minification complete.`);

  const minifiedOutfile = config.outfile.replace('.js', '.min.js');
  await fs.writeFile(minifiedOutfile, minifiedCode);

  const originalSize = (Buffer.byteLength(bundledCode, 'utf8') / 1024).toFixed(2);
  const minifiedSize = (Buffer.byteLength(minifiedCode, 'utf8') / 1024).toFixed(2);

  log.success(
    `  - Wrote ${config.name} to ${minifiedOutfile} (${originalSize} KB -> ${minifiedSize} KB)`
  );

  await fs.writeFile(config.outfile, bundledCode);
  log.info(`  - Wrote non-minified bundle to ${config.outfile}`);

  cache[config.name] = hash;
}

// --- Main Build ---

async function main() {
  try {
    log.info('Starting Hikari build process...');

    const cleanFlag = process.argv.includes('--clean');
    if (cleanFlag) {
      await fs.rm(DIST_DIR, { recursive: true, force: true });
      log.warn(`Cleaned entire output directory '${DIST_DIR}' (via --clean).`);
    }

    await fs.mkdir(DIST_DIR, { recursive: true });
    const cache = await loadCache();

    // --- Check what needs rebuilding ---
    const changes = [];
    for (const config of BUILD_CONFIGS) {
      const { changed, hash } = await needsRebuild(config, cache);
      changes.push({ config, changed, hash });
    }

    const anyChanges = changes.some((c) => c.changed);

    if (!anyChanges && !cleanFlag) {
      // ✅ Nothing changed, keep dist/ as-is
      for (const { config } of changes) {
        log.success(`  - Skipped ${config.name} (no changes detected).`);
      }
      log.success('All targets already up to date!');
      return;
    }

    // Rebuild changed targets only
    for (const { config, changed, hash } of changes) {
      if (changed || cleanFlag) {
        // Delete only this target’s files before rebuilding
        const minifiedOutfile = config.outfile.replace('.js', '.min.js');
        await Promise.all([
          fs.rm(config.outfile, { force: true }),
          fs.rm(minifiedOutfile, { force: true }),
        ]);
        await buildTarget(config, hash, cache);
      } else {
        log.success(`  - Skipped ${config.name} (no changes detected).`);
      }
    }

    await saveCache(cache);

    log.success('Build process completed!');
  } catch (err) {
    log.error('Build failed:');
    console.error(err);
    process.exit(1);
  }
}

// --- Run the build ---
main();
