/**
 * src/index.ts
 *
 * Main CLI entry point. Wires commander commands to their handlers.
 */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Resolve package.json for version
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let version = '0.1.0';
try {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
  version = pkg.version;
} catch {
  // Fallback to default version
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('agentic-nexus')
  .description(
    'A modular AI Agent orchestrator — spin up Paperclip + OpenClaw with a single command.'
  )
  .version(version, '-v, --version', 'Display current version');

// ── init command ────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Interactively configure and initialise your Agentic-Nexus workspace')
  .action(async () => {
    const { runInit } = await import('./commands/init.js');
    await runInit();
  });

// ── Default: show help if no command is provided ────────────────────────────

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
