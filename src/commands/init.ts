/**
 * src/commands/init.ts
 *
 * The interactive "agentic-nexus init" command.
 * Guides the user through:
 *   1. Environment dependency checks (Homebrew, Node.js, Docker)
 *   2. Template selection
 *   3. Prompt collection (from template.json → prompts[])
 *   4. File copy & template rendering (${VAR} substitution for .tpl files)
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import {
  checkHomebrew,
  installHomebrew,
  checkNodeInstalled,
  installNode,
  checkDocker,
  installOrbStack,
  type CheckResult,
} from '../utils/checker.js';
import {
  discoverTemplates,
  loadTemplateBaseConfig,
  getNestedValue,
  deployTemplateFilesWithRendering,
  type DiscoveredTemplate,
  type TemplatePrompt,
} from '../utils/template.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function formatCheckResult(result: CheckResult): string {
  const icon = result.ok ? pc.green('✔') : pc.yellow('⚠');
  const label = pc.bold(result.label.padEnd(20));
  const message = result.ok
    ? pc.dim(result.message)
    : pc.yellow(result.message);
  return `  ${icon}  ${label} ${message}`;
}

function assertNotCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  return value as T;
}

// ---------------------------------------------------------------------------
// Step 3 helper — resolve a single prompt value
// ---------------------------------------------------------------------------

async function resolvePromptValue(
  prompt: TemplatePrompt,
  templateId: string,
): Promise<string> {
  // 1. Try configKey → read from template's config.json
  if (prompt.configKey) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = loadTemplateBaseConfig(templateId) as Record<string, any>;
      const fromConfig = getNestedValue(cfg, prompt.configKey);
      if (fromConfig !== undefined) {
        p.log.info(
          `${pc.bold(prompt.name)} — loaded from config.json ${pc.dim(`(${prompt.configKey})`)}`,
        );
        return fromConfig;
      }
    } catch {
      // config.json not found or unreadable — fall through to prompt
    }
  }

  // 2. Try shell command
  if (prompt.command && prompt.command.trim() !== '') {
    try {
      const { stdout } = await execa('sh', ['-c', prompt.command]);
      const result = stdout.trim();
      if (result) {
        p.log.info(
          `${pc.bold(prompt.name)} — resolved via command ${pc.dim(`(${prompt.command})`)}`,
        );
        return result;
      }
    } catch {
      // Command failed — fall through to prompt
    }
  }

  // 3. Ask the user
  if (prompt.type === 'password') {
    const value = assertNotCancel(
      await p.password({
        message: `${pc.bold(prompt.name)} — ${prompt.description}`,
        validate(v) {
          if (!v.trim()) return `${prompt.name} is required.`;
        },
      }),
    ) as string;
    return value;
  }

  const value = assertNotCancel(
    await p.text({
      message: `${pc.bold(prompt.name)} — ${prompt.description}`,
      validate(v) {
        if (!v.trim()) return `${prompt.name} is required.`;
      },
    }),
  ) as string;
  return value;
}

// ---------------------------------------------------------------------------
// Main init flow
// ---------------------------------------------------------------------------

export async function runInit(): Promise<void> {
  console.log('');
  p.intro(
    pc.bgCyan(pc.black(' Agentic-Nexus ')) +
    pc.dim('  —  AI Agent Orchestrator Setup'),
  );

  // ── Step 1: System Checks (sequential, interactive) ───────────────────────

  p.log.step(pc.bold('Checking system dependencies…'));
  console.log('');

  // ── 1a. Homebrew ──────────────────────────────────────────────────────────
  {
    const spinner = p.spinner();
    spinner.start('Checking Homebrew…');
    const result = await checkHomebrew();
    spinner.stop(formatCheckResult(result));

    if (!result.ok) {
      const answer = await p.confirm({
        message: 'Homebrew is not installed. Would you like to install it now?',
        initialValue: true,
      });

      if (p.isCancel(answer) || !answer) {
        p.note(
          'Homebrew is required to install other dependencies.\n' +
          pc.dim('Run the following command to install it manually:') +
          '\n\n' +
          pc.cyan(
            '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
          ) +
          '\n\n' +
          pc.dim('Or visit: https://brew.sh'),
          pc.yellow('⚠  Homebrew required'),
        );
        p.cancel('Setup cancelled — please install Homebrew and try again.');
        process.exit(1);
      }

      console.log('');
      const installSpinner = p.spinner();
      installSpinner.start('Installing Homebrew…');
      try {
        await installHomebrew();
        installSpinner.stop(pc.green('Homebrew installed successfully!'));
      } catch (err) {
        installSpinner.stop(pc.red('Homebrew installation failed.'));
        p.log.error(String(err));
        process.exit(1);
      }
    }
  }

  console.log('');

  // ── 1b. Node.js ───────────────────────────────────────────────────────────
  {
    const spinner = p.spinner();
    spinner.start('Checking Node.js…');
    const result = await checkNodeInstalled();
    spinner.stop(formatCheckResult(result));

    if (!result.ok) {
      const answer = await p.confirm({
        message:
          'Node.js is not installed (or is too old). Would you like to install it via Homebrew?',
        initialValue: true,
      });

      if (p.isCancel(answer) || !answer) {
        p.note(
          'Node.js v20 or later is required.\n' +
          pc.dim('Run the following command to install it:') +
          '\n\n' +
          pc.cyan('  brew install node') +
          '\n\n' +
          pc.dim('Or download from: https://nodejs.org/en/download'),
          pc.yellow('⚠  Node.js required'),
        );
        p.cancel('Setup cancelled — please install Node.js and try again.');
        process.exit(1);
      }

      console.log('');
      const installSpinner = p.spinner();
      installSpinner.start('Installing Node.js via Homebrew…');
      try {
        await installNode();
        installSpinner.stop(pc.green('Node.js installed successfully!'));
      } catch (err) {
        installSpinner.stop(pc.red('Node.js installation failed.'));
        p.log.error(String(err));
        process.exit(1);
      }
    }
  }

  console.log('');

  // ── 1c. Docker / OrbStack ─────────────────────────────────────────────────
  {
    const spinner = p.spinner();
    spinner.start('Checking Docker…');
    const result = await checkDocker();
    spinner.stop(formatCheckResult(result));

    if (!result.ok) {
      const answer = await p.confirm({
        message:
          'Docker is not available. Would you like to install OrbStack (recommended for macOS)?',
        initialValue: true,
      });

      if (p.isCancel(answer) || !answer) {
        p.note(
          'Docker is required to run agents as containers.\n' +
          pc.dim('You can install it using one of the following options:') +
          '\n\n' +
          pc.cyan('  brew install orbstack') +
          pc.dim('    ← OrbStack (recommended for macOS)') +
          '\n' +
          pc.dim(
            '  Or download Docker Desktop: https://www.docker.com/products/docker-desktop',
          ),
          pc.yellow('⚠  Docker required'),
        );
        p.cancel(
          'Setup cancelled — please install Docker or OrbStack and try again.',
        );
        process.exit(1);
      }

      console.log('');
      const installSpinner = p.spinner();
      installSpinner.start('Installing OrbStack via Homebrew…');
      try {
        await installOrbStack();
        installSpinner.stop(pc.green('OrbStack installed successfully!'));
      } catch (err) {
        installSpinner.stop(pc.red('OrbStack installation failed.'));
        p.log.error(String(err));
        process.exit(1);
      }
    }
  }

  console.log('');

  // ── Step 2: Template Selection ────────────────────────────────────────────

  p.log.step(pc.bold('Select a template…'));
  console.log('');

  const templates = discoverTemplates();

  if (templates.length === 0) {
    p.log.error('No templates found in the templates/ directory.');
    process.exit(1);
  }

  const selectedId = assertNotCancel(
    await p.select<DiscoveredTemplate['id']>({
      message: 'Which template would you like to use?',
      options: templates.map((t) => ({
        value: t.id,
        label: t.definition.name,
        hint: t.definition.description ?? t.id,
      })),
    }),
  );

  const chosen = templates.find((t) => t.id === selectedId)!;
  p.log.info(`Template: ${pc.bold(chosen.definition.name)}`);

  console.log('');

  // ── Step 3: Prompt Collection ─────────────────────────────────────────────

  const prompts: TemplatePrompt[] = chosen.definition.prompts ?? [];
  const vars: Record<string, string> = {};

  if (prompts.length > 0) {
    p.log.step(pc.bold('Configure template variables…'));
    console.log('');

    for (const prompt of prompts) {
      vars[prompt.name] = await resolvePromptValue(prompt, selectedId as string);
    }

    console.log('');
  }

  // ── Step 4: Copy Files & Render Templates ────────────────────────────────

  p.log.step(pc.bold('Copying template files…'));
  console.log('');

  const filePatterns: string[] = chosen.definition.files ?? [];

  if (filePatterns.length === 0) {
    p.log.warn('No files defined in template.json → skipping file copy.');
  } else {
    const spinner = p.spinner();
    spinner.start('Deploying files…');

    try {
      await deployTemplateFilesWithRendering(
        selectedId as string,
        filePatterns,
        vars,
      );
      spinner.stop(pc.green('Files deployed successfully!'));
    } catch (err) {
      spinner.stop(pc.red('File deployment failed.'));
      p.log.error(String(err));
      process.exit(1);
    }
  }

  console.log('');

  // ── Outro ─────────────────────────────────────────────────────────────────

  p.note(
    [
      pc.dim('Next steps:'),
      `  ${pc.cyan('nexus up')}    — Start the orchestration stack`,
      `  ${pc.cyan('nexus logs')}  — Stream service logs`,
      `  ${pc.cyan('nexus down')}  — Stop the stack`,
    ].join('\n'),
    'Setup Complete 🎉',
  );

  p.outro(
    `Powered by ${pc.cyan('Agentic-Nexus')} — ${pc.dim('https://github.com/akkappsoft/agentic-nexus')}`,
  );
}
