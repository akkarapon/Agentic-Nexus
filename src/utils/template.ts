/**
 * src/utils/template.ts
 *
 * Template discovery, loading, and file deployment utilities.
 * Handles template.json parsing, prompt definitions, and .tpl file rendering.
 */

import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface TemplatePrompt {
  /** Environment variable name, also used as the ${KEY} placeholder in .tpl files */
  name: string;
  type: 'text' | 'password';
  description: string;
  /** Dotted path into config.json (e.g. "openclaw.gateway_token").
   *  If the value at this path is non-empty, the user will not be prompted. */
  configKey?: string;
  /** Shell command whose stdout becomes the value (skips prompt if set and non-empty). */
  command?: string;
}

export interface TemplateDefinition {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  license?: string;
  files: string[];
  /** Flat array of prompts. */
  prompts: TemplatePrompt[];
}

export interface DiscoveredTemplate {
  id: string; // folder name inside /templates
  definition: TemplateDefinition;
}

// ──────────────────────────────────────────────────────────────────────────────
// Path helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Absolute path to the templates root directory. */
export function templatesRootPath(): string {
  return path.resolve(__dirname, '../../templates');
}

/** Resolve a path relative to the user's current working directory. */
function cwdPath(file: string): string {
  return path.resolve(process.cwd(), file);
}

// ──────────────────────────────────────────────────────────────────────────────
// Nested value helpers (for config.json dot-path access)
// ──────────────────────────────────────────────────────────────────────────────

/** Get a value at a dotted path from a plain object. Returns undefined if not found or empty. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNestedValue(obj: Record<string, any>, dotPath: string): string | undefined {
  const keys = dotPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  if (typeof current === 'string' && current.trim() !== '') return current;
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// Template discovery
// ──────────────────────────────────────────────────────────────────────────────

/** Scan the templates directory and return all valid discovered templates. */
export function discoverTemplates(): DiscoveredTemplate[] {
  const root = templatesRootPath();
  if (!fs.existsSync(root)) return [];

  const discovered: DiscoveredTemplate[] = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const jsonPath = path.join(root, entry.name, 'template.json');
    if (!fs.existsSync(jsonPath)) continue;

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const definition: TemplateDefinition = JSON.parse(raw);
      discovered.push({ id: entry.name, definition });
    } catch {
      // Skip malformed template.json files
    }
  }

  return discovered;
}

// ──────────────────────────────────────────────────────────────────────────────
// Load base config.json from a template folder
// ──────────────────────────────────────────────────────────────────────────────

/** Load and parse config.json from the given template folder. Throws if missing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadTemplateBaseConfig(templateId: string): Record<string, any> {
  const configPath = path.join(templatesRootPath(), templateId, 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json not found in template "${templateId}".`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Deploy template files — plain copy (supports glob patterns)
// ──────────────────────────────────────────────────────────────────────────────

/** Copy files from a template folder into cwd. Directories are copied recursively.
 *  Existing destination paths are skipped with a warning. */
export async function deployTemplateFiles(
  templateId: string,
  filePatterns: string[],
): Promise<void> {
  const templateRoot = path.join(templatesRootPath(), templateId);

  for (const pattern of filePatterns) {
    const matched = await glob(pattern, {
      cwd: templateRoot,
      dot: true,
      nodir: false,
    });

    if (matched.length === 0) {
      console.log(pc.yellow(`⚠  No files matched pattern: ${pattern}`));
      continue;
    }

    for (const relFile of matched) {
      const src = path.join(templateRoot, relFile);
      const dest = cwdPath(relFile);

      if (!fs.existsSync(src)) continue;

      if (fs.existsSync(dest)) {
        console.log(pc.yellow(`⚠  Already exists, skipping: ${relFile}`));
        continue;
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });

      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
        console.log(pc.green(`✔  Copied directory  ${relFile}`));
      } else {
        fs.copyFileSync(src, dest);
        console.log(pc.green(`✔  Copied file       ${relFile}`));
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Deploy template files — with ${KEY} rendering for .tpl files
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Deploy template files into cwd, rendering .tpl files with ${KEY} substitution.
 *
 * - Files with `.tpl` extension: read content, replace all `${KEY}` placeholders
 *   with values from `vars`, then write to dest with `.tpl` stripped from the name.
 * - All other files: copied as-is.
 * - Directories matched by glob patterns are copied recursively (all inner files processed).
 * - Existing destination files are skipped with a warning.
 */
export async function deployTemplateFilesWithRendering(
  templateId: string,
  filePatterns: string[],
  vars: Record<string, string>,
): Promise<void> {
  const templateRoot = path.join(templatesRootPath(), templateId);

  for (const pattern of filePatterns) {
    const matched = await glob(pattern, {
      cwd: templateRoot,
      dot: true,
      nodir: false,
    });

    if (matched.length === 0) {
      console.log(pc.yellow(`⚠  No files matched pattern: ${pattern}`));
      continue;
    }

    for (const relFile of matched) {
      const src = path.join(templateRoot, relFile);

      if (!fs.existsSync(src)) continue;

      const stat = fs.statSync(src);

      if (stat.isDirectory()) {
        // Recurse: process every file inside the directory
        const inner = await glob('**/*', {
          cwd: src,
          dot: true,
          nodir: true,
        });
        for (const innerRel of inner) {
          const innerSrc = path.join(src, innerRel);
          const innerRelFull = path.join(relFile, innerRel);
          _copyOrRender(innerSrc, innerRelFull, vars);
        }
      } else {
        _copyOrRender(src, relFile, vars);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Copy a single file into cwd, rendering ${KEY} placeholders if the source ends in .tpl. */
function _copyOrRender(
  src: string,
  relFile: string,
  vars: Record<string, string>,
): void {
  const isTpl = src.endsWith('.tpl');
  // Destination path strips .tpl extension when present
  const destRelFile = isTpl ? relFile.slice(0, -4) : relFile;
  const dest = cwdPath(destRelFile);

  if (fs.existsSync(dest)) {
    console.log(pc.yellow(`⚠  Already exists, skipping: ${destRelFile}`));
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (isTpl) {
    let content = fs.readFileSync(src, 'utf-8');
    // Replace all ${KEY} occurrences with collected values; leave unknown keys untouched
    content = content.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : _match;
    });
    fs.writeFileSync(dest, content, 'utf-8');
    console.log(pc.green(`✔  Rendered          ${destRelFile}`));
  } else {
    fs.copyFileSync(src, dest);
    console.log(pc.green(`✔  Copied            ${destRelFile}`));
  }
}
