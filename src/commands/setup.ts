import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  discoverTemplates,
  deployTemplateFiles,
  writeEnvFile,
  loadTemplateBaseConfig,
  generateRuntimeFiles,
  setNestedValue,
  type DiscoveredTemplate,
  type AgentDefinition,
  type BaseConfig,
  type SelectedAgent,
} from '../utils/docker-ops.js';
import { runNexusUp } from './up.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helper – cancel guard
// ──────────────────────────────────────────────────────────────────────────────

function assertNotCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  return value as T;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main setup command
// ──────────────────────────────────────────────────────────────────────────────

export async function runNexusSetup(): Promise<void> {
  console.log('');
  p.intro(pc.bgCyan(pc.black(' Agentic-Nexus ')) + pc.dim('  —  Setup & Deploy Templates'));

  // ── 1. Discover available templates ─────────────────────────────────────────
  const templates = discoverTemplates();

  if (templates.length === 0) {
    p.log.error('No templates found in the templates/ directory.');
    process.exit(1);
  }

  // ── 2. Ask user to pick a template ──────────────────────────────────────────
  const selectedId = assertNotCancel(
    await p.select<DiscoveredTemplate['id']>({
      message: 'Select a template:',
      options: templates.map((t) => ({
        value: t.id,
        label: t.definition.name,
        hint: t.definition.description ?? t.id,
      })),
    }),
  );

  const chosen = templates.find((t) => t.id === selectedId)!;
  p.log.info(`Template: ${pc.bold(chosen.definition.name)}`);

  // ── 3. Load base config from template's config.json ─────────────────────────
  let baseConfig: BaseConfig;
  try {
    baseConfig = loadTemplateBaseConfig(chosen.id);
  } catch (err) {
    p.log.error(String(err));
    process.exit(1);
  }

  // ── 4. Prompt for environment variables ─────────────────────────────────────
  const envPrompts = chosen.definition.prompts?.environments ?? [];
  // env vars that have no configKey (written to .env only)
  const standaloneEnvVars: Record<string, string> = {};

  if (envPrompts.length > 0) {
    p.log.step('Configure environment variables:');

    for (const envDef of envPrompts) {
      let value: string;

      if (envDef.type === 'password') {
        value = assertNotCancel(
          await p.password({
            message: `${pc.bold(envDef.name)} — ${envDef.description}`,
            validate(v) {
              if (envDef.required && !v.trim()) return `${envDef.name} is required.`;
            },
          }),
        ) as string;
      } else {
        value = assertNotCancel(
          await p.text({
            message: `${pc.bold(envDef.name)} — ${envDef.description}`,
            validate(v) {
              if (envDef.required && !v.trim()) return `${envDef.name} is required.`;
            },
          }),
        ) as string;
      }

      // If the prompt maps to a config.json path, write it there
      if (envDef.configKey) {
        setNestedValue(baseConfig, envDef.configKey, value);
      } else {
        // Otherwise it only goes into .env
        standaloneEnvVars[envDef.name] = value;
      }
    }
  }

  // ── 5. Deploy non-generated template files (e.g. docker/*) ──────────────────
  const deploySpinner = p.spinner();
  deploySpinner.start('Deploying template files…');

  try {
    if (Object.keys(standaloneEnvVars).length > 0) {
      writeEnvFile(standaloneEnvVars);
    }

    await deployTemplateFiles(chosen.id, chosen.definition.files ?? []);
    deploySpinner.stop(pc.green('Template files deployed!'));
  } catch (err) {
    deploySpinner.stop(pc.red('Deployment failed.'));
    p.log.error(String(err));
    process.exit(1);
  }

  // ── 6. Select agents from template's config.json ────────────────────────────
  const agentList: AgentDefinition[] = baseConfig.agents ?? [];

  if (agentList.length === 0) {
    p.log.warn('No agents defined in config.json — skipping agent selection.');
  } else {
    const gmAgents = agentList.filter((a) => a.role === 'gm');
    const workerAgents = agentList.filter((a) => a.role !== 'gm');

    if (gmAgents.length > 0) {
      p.log.info(
        `${pc.bold('GM agent(s)')} are always included: ${gmAgents
          .map((a) => pc.cyan(a.description))
          .join(', ')}`,
      );
    }

    // ── 6a. Multi-select worker agents ──────────────────────────────────────
    let selectedWorkers: AgentDefinition[] = [];

    if (workerAgents.length > 0) {
      const selectedIndices = assertNotCancel(
        await p.multiselect<number>({
          message: 'Select worker agents to include:',
          options: workerAgents.map((a, i) => ({
            value: i,
            label: a.description,
            hint: a.role,
          })),
          required: false,
        }),
      );

      selectedWorkers = (selectedIndices as number[]).map((i) => workerAgents[i]);
    }

    const allSelectedDefs: AgentDefinition[] = [...gmAgents, ...selectedWorkers];

    // ── 6b. Prompt id/name/tokens per agent ───────────────────────────────
    p.log.step('Configure selected agents:');
    const fullySelectedAgents: SelectedAgent[] = [];

    for (const agentDef of allSelectedDefs) {
      const roleLabel = agentDef.role === 'gm' ? pc.magenta('[GM]') : pc.blue('[Worker]');
      p.log.message(`\n${roleLabel} ${pc.bold(agentDef.description)}`);

      const id = assertNotCancel(
        await p.text({
          message: `  Agent ID (slug, e.g. ${agentDef.role === 'gm' ? 'mone' : 'sam'}):`,
          validate(v) {
            if (!v.trim()) return 'Agent ID is required.';
            if (!/^[a-z0-9_-]+$/.test(v.trim()))
              return 'Only lowercase letters, numbers, hyphens and underscores allowed.';
          },
        }),
      ) as string;

      const name = assertNotCancel(
        await p.text({
          message: `  Display name (e.g. ${agentDef.role === 'gm' ? 'Mone' : 'Sam'}):`,
          validate(v) {
            if (!v.trim()) return 'Display name is required.';
          },
        }),
      ) as string;

      const discord_token = assertNotCancel(
        await p.text({ message: `  Discord bot token (leave blank to skip):` }),
      ) as string;

      const github_token = assertNotCancel(
        await p.text({ message: `  GitHub token (leave blank to skip):` }),
      ) as string;

      fullySelectedAgents.push({
        ...agentDef,
        id: id.trim(),
        name: name.trim(),
        discord_token: discord_token ?? '',
        github_token: github_token ?? '',
      });
    }

    // ── 6c. Generate all runtime files ────────────────────────────────────
    const genSpinner = p.spinner();
    genSpinner.start('Generating runtime configuration…');

    try {
      generateRuntimeFiles(baseConfig, fullySelectedAgents);
      genSpinner.stop(pc.green('Runtime configuration generated!'));
      p.log.info('Created: config.json · .env.generated (600) · docker-compose.override.yml');
    } catch (err) {
      genSpinner.stop(pc.red('Generation failed.'));
      p.log.error(String(err));
      process.exit(1);
    }
  }

  // ── 7. Ask if user wants to run `nexus up` now ───────────────────────────────
  const shouldUp = assertNotCancel(
    await p.confirm({
      message: `Run ${pc.cyan('nexus up')} now to start the services?`,
      initialValue: true,
    }),
  );

  if (shouldUp) {
    console.log('');
    await runNexusUp();
  } else {
    p.note(
      `Run ${pc.cyan('nexus up')} whenever you're ready to start the services.`,
      'Setup Complete 🎉',
    );
    p.outro(`Powered by ${pc.cyan('Agentic-Nexus')}`);
  }
}
