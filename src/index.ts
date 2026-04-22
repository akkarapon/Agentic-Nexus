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


program
  .command('up')
  .description('Start the orchestration stack (docker compose up -d)')
  .action(async () => {
    const { runNexusUp } = await import('./commands/up.js');
    await runNexusUp();
  });

program
  .command('down')
  .description('Stop the orchestration stack (docker compose down)')
  .action(async () => {
    const { runNexusDown } = await import('./commands/down.js');
    await runNexusDown();
  });

program
  .command('logs')
  .description('Show logs from the orchestration stack (docker compose logs -f)')
  .action(async () => {
    const { runNexusLogs } = await import('./commands/logs.js');
    await runNexusLogs();
  });

// ── Default: show help if no command is provided ────────────────────────────

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
