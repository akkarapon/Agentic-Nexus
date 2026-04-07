#!/usr/bin/env node

/**
 * Agentic-Nexus CLI Entry Point
 *
 * This file is the executable that npm/npx will call.
 * In production (after `npm run build`), it imports the compiled dist.
 * During development, use `npm run dev` which invokes tsx directly.
 */

import('../dist/index.js').catch((err) => {
  console.error('Failed to load Agentic-Nexus:', err.message);
  console.error('If you are developing, run: npm run dev');
  process.exit(1);
});
