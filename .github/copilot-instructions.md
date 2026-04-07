# Agentic-Nexus — Copilot Instructions

## Commands

```bash
npm run dev        # Run CLI during development (via tsx, no build needed)
npm run build      # Compile TypeScript → dist/
npm run lint       # Type-check only (tsc --noEmit), no test suite exists
npm start          # Run compiled dist/index.js
```

> There are no automated tests. The lint command is type-checking only.

## Architecture

Agentic-Nexus is an **ESM-only TypeScript CLI** that bootstraps AI agent stacks (Paperclip + OpenClaw) running in Docker.

```
bin/nexus.js          ← npm/npx entrypoint; dynamically imports dist/index.js
src/index.ts          ← Commander program; lazy-loads commands via dynamic import
src/commands/init.ts  ← The sole command; full interactive init flow
src/utils/checker.ts  ← Environment prerequisite checks (Node, Homebrew, Docker)
templates/            ← Files copied into the user's cwd at runtime
```

**Data flow for `agentic-nexus init`:**
1. `bin/nexus.js` → `dist/index.js` (compiled) → lazy imports `commands/init.js`
2. `runInit()` runs env checks via `runAllChecks()`, then @clack/prompts interactive steps
3. On completion, writes `.env` and `docker-compose.yml` into the **user's cwd** (`process.cwd()`), not the project root

**`templates/docker-compose.yml`** is distributed with the npm package (via the `"files"` field in `package.json`) and copied to the user's directory during `init`, with `# ACTIVE_AGENTS_PLACEHOLDER` replaced at generation time.

## Key Conventions

**ESM imports require `.js` extensions** — even when importing `.ts` source files:
```ts
import { runAllChecks } from '../utils/checker.js'; // ✅
import { runAllChecks } from '../utils/checker';     // ❌ breaks at runtime
```

**`__dirname` is unavailable in ESM** — use this pattern instead:
```ts
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Commands are lazy-loaded** in `src/index.ts` via dynamic `import()` to avoid loading all command modules at startup.

**CLI UI stack:**
- `@clack/prompts` (`p.*`) — interactive prompts (`p.select`, `p.multiselect`, `p.password`, `p.spinner`, `p.note`, `p.intro`, `p.outro`)
- `picocolors` (`pc`) — terminal colors; always imported as `pc`
- Always check `p.isCancel(value)` after every prompt and call `p.cancel()` + `process.exit(0)` if cancelled

**Input validation uses Zod** — define schemas alongside the prompt that uses them (see `ApiKeySchema` in `init.ts`).

**`execa`** is used for all shell command execution in `checker.ts`. Wrap calls in `try/catch` and return a `CheckResult` with `ok: false` on failure.

**`CheckResult` interface** — all checker functions return this shape:
```ts
interface CheckResult {
  ok: boolean;
  label: string;    // displayed left-aligned, padded to 20 chars
  message: string;  // status detail
  hint?: string;    // shown only on failure
}
```

**File generation helpers** in `init.ts` distinguish two path roots:
- `templatePath(file)` — resolves relative to the installed package's `templates/` dir
- `cwdPath(file)` — resolves relative to the user's current working directory
