import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────────────────────────────────────
// Types — Template
// ──────────────────────────────────────────────────────────────────────────────

export interface TemplateEnvPrompt {
  name: string;
  type: 'text' | 'password';
  description: string;
  /** Dotted path into config.json (e.g. "openclaw.gateway_token"). If set,
   *  the collected value will also be written into the generated config.json. */
  configKey?: string;
  required?: boolean;
}

export interface TemplateDefinition {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  license?: string;
  files: string[];
  prompts: {
    environments: TemplateEnvPrompt[];
  };
}

export interface DiscoveredTemplate {
  id: string; // folder name inside /templates
  definition: TemplateDefinition;
}

// ──────────────────────────────────────────────────────────────────────────────
// Types — config.json (merged)
// ──────────────────────────────────────────────────────────────────────────────

export interface AgentDefinition {
  role: 'gm' | 'worker' | string;
  description: string;
  persona: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BaseConfig = Record<string, any> & { agents: AgentDefinition[] };

// ──────────────────────────────────────────────────────────────────────────────
// Types — Selected agent (with user-supplied id/name/tokens)
// ──────────────────────────────────────────────────────────────────────────────

export interface SelectedAgent extends AgentDefinition {
  id: string;
  name: string;
  discord_token: string;
  github_token: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Path helpers
// ──────────────────────────────────────────────────────────────────────────────

export function templatesRootPath(): string {
  return path.resolve(__dirname, '../../templates');
}

function cwdPath(file: string): string {
  return path.resolve(process.cwd(), file);
}

function expandHome(p_: string): string {
  if (p_.startsWith('~/')) return path.join(os.homedir(), p_.slice(2));
  return p_;
}

/** Set a value at a dotted path inside a plain object (mutates in-place). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setNestedValue(obj: Record<string, any>, dotPath: string, value: string): void {
  const keys = dotPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: Record<string, any> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof current[keys[i]] !== 'object' || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

// ──────────────────────────────────────────────────────────────────────────────
// Template discovery
// ──────────────────────────────────────────────────────────────────────────────

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

export function loadTemplateBaseConfig(templateId: string): BaseConfig {
  const configPath = path.join(templatesRootPath(), templateId, 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json not found in template "${templateId}".`);
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as BaseConfig;
}

// ──────────────────────────────────────────────────────────────────────────────
// Deploy template files  (supports wildcard patterns via glob)
// ──────────────────────────────────────────────────────────────────────────────

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
// Write .env file  (for env vars that have no configKey)
// ──────────────────────────────────────────────────────────────────────────────

export function writeEnvFile(envVars: Record<string, string>): void {
  const destPath = cwdPath('.env');
  const lines = Object.entries(envVars).map(([key, value]) => `${key}=${value}`);
  const content = lines.join('\n') + '\n';

  fs.writeFileSync(destPath, content, 'utf-8');
  console.log(pc.green(`✔  Created .env`));
}

// ──────────────────────────────────────────────────────────────────────────────
// generateRuntimeFiles — replaces scripts/generate.sh
//
// Given the merged base config and the user-selected agents, this generates:
//   config.json                  — fully populated runtime config (in cwd)
//   .env.generated               — env vars for docker compose (chmod 600)
//   docker-compose.override.yml  — per-agent services
// ──────────────────────────────────────────────────────────────────────────────

export function generateRuntimeFiles(
  cfg: BaseConfig,
  agents: SelectedAgent[],
): void {
  // ── 1. Write config.json to cwd ────────────────────────────────────────────
  const finalConfig = {
    ...cfg,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      description: a.description,
      discord_token: a.discord_token,
      github_token: a.github_token,
      persona: a.persona,
    })),
  };

  fs.writeFileSync(
    cwdPath('config.json'),
    JSON.stringify(finalConfig, null, 4) + '\n',
    'utf-8',
  );
  console.log(pc.green(`✔  Generated config.json`));

  // ── 2. .env.generated ──────────────────────────────────────────────────────
  const tailscaleHostname: string = cfg.tailscale_hostname ?? '';
  const openclawPort: string | number = cfg.nginx?.openclaw_port ?? '';

  const envLines: string[] = [
    '# AUTO-GENERATED by Agentic-Nexus — DO NOT EDIT',
    '# Regenerate: nexus setup',
    '',
    `TEAM_NAME=${cfg.team ?? ''}`,
    '',
    `HOST_OPENCLAW_DIR=${expandHome(cfg.disks?.openclaw ?? '')}`,
    `HOST_KM_DIR=${expandHome(cfg.disks?.km ?? '')}`,
    `HOST_OLLAMA_DIR=${expandHome(cfg.disks?.ollama ?? '')}`,
    `HOST_CRAWL4AI_DIR=${expandHome(cfg.disks?.crawl4ai ?? '')}`,
    `HOST_SSL_DIR=${expandHome(cfg.disks?.ssl ?? '')}`,
    `HOST_MCPORTER_DIR=${expandHome(cfg.disks?.mcporter ?? '~/Projects/sempre/disks/mcporter')}`,
    '',
    `TAILSCALE_HOSTNAME=${tailscaleHostname}`,
    `NGINX_OPENCLAW_PORT=${openclawPort}`,
    `NGINX_OLLAMA_PORT=${cfg.nginx?.ollama_port ?? ''}`,
    `NGINX_N8N_PORT=${cfg.nginx?.n8n_port ?? ''}`,
    `NGINX_HTTP_PORT=${cfg.nginx?.http_port ?? ''}`,
    '',
    `OPENCLAW_GATEWAY_TOKEN=${cfg.openclaw?.gateway_token ?? ''}`,
    `OPENCLAW_ROOT_PASSWORD=${cfg.openclaw?.root_password ?? ''}`,
    `GATEWAY_ORIGIN=${cfg.openclaw?.gateway_origin ?? ''}`,
    `GATEWAY_ORIGIN_EXTRA=https://${tailscaleHostname}:${openclawPort}`,
    '',
    `USER_TIMEZONE=${cfg.timezone ?? 'UTC'}`,
    `KM_MAX_HOPS=${cfg.km_max_hops ?? 2}`,
    '',
    `OLLAMA_MODEL=${cfg.llm?.model ?? ''}`,
    `OLLAMA_MODELS=${cfg.llm?.models ?? ''}`,
    `BROWSER_USE_MODEL=${cfg.llm?.browser_model ?? ''}`,
    '',
    `BRAVE_API_KEY=${cfg.brave_api_key ?? ''}`,
    '',
    `N8N_ENCRYPTION_KEY=${cfg.n8n?.encryption_key ?? ''}`,
    `N8N_PASSWORD=${cfg.n8n?.password ?? ''}`,
    `N8N_WEBHOOK_SECRET=${cfg.n8n?.webhook_secret ?? ''}`,
    `N8N_API_KEY=${cfg.n8n?.api_key ?? ''}`,
    '',
    `GOOGLE_SERVICE_ACCOUNT_B64=${cfg.google_service_account_b64 ?? ''}`,
    '',
  ];

  for (const agent of agents) {
    envLines.push(`DISCORD_BOT_TOKEN_${agent.id}=${agent.discord_token}`);
    envLines.push(`GITHUB_TOKEN_${agent.id}=${agent.github_token}`);
  }

  const envGenPath = cwdPath('.env.generated');
  fs.writeFileSync(envGenPath, envLines.join('\n') + '\n', { mode: 0o600, encoding: 'utf-8' });
  console.log(pc.green(`✔  Generated .env.generated (600)`));

  // ── 3. docker-compose.override.yml ─────────────────────────────────────────
  const composeLines: string[] = [
    '# AUTO-GENERATED by Agentic-Nexus — DO NOT EDIT MANUALLY',
    '# Regenerate: nexus setup',
    '',
    'services:',
    '',
    '  openclaw:',
    '    env_file:',
    '      - .env.generated',
    '    volumes:',
    '      - ./config.json:/opt/sempre/config.json:ro',
    '    depends_on:',
  ];

  for (const agent of agents) {
    composeLines.push(`      gh-proxy-${agent.id}:`);
    composeLines.push(`        condition: service_started`);
    composeLines.push(`      crawl4ai-${agent.id}:`);
    composeLines.push(`        condition: service_started`);
    composeLines.push(`      browser-use-${agent.id}:`);
    composeLines.push(`        condition: service_started`);
  }

  composeLines.push('');

  for (const agent of agents) {
    composeLines.push(
      `  gh-proxy-${agent.id}:`,
      `    build:`,
      `      context: ./docker/gh-proxy`,
      `      dockerfile: Dockerfile`,
      `    container_name: gh-proxy-${agent.id}`,
      `    environment:`,
      `      - GITHUB_TOKEN=\${GITHUB_TOKEN_${agent.id}:-}`,
      `    restart: unless-stopped`,
      `    networks:`,
      `      default:`,
      `        aliases:`,
      `          - gh-proxy-${agent.id}`,
      ``,
      `  crawl4ai-${agent.id}:`,
      `    image: unclecode/crawl4ai:latest`,
      `    container_name: crawl4ai-${agent.id}`,
      `    shm_size: "2gb"`,
      `    volumes:`,
      `      - \${HOST_CRAWL4AI_DIR:-~/.sempre/crawl4ai}/${agent.id}:/app/data`,
      `    restart: unless-stopped`,
      `    networks:`,
      `      default:`,
      `        aliases:`,
      `          - crawl4ai-${agent.id}`,
      ``,
      `  browser-use-${agent.id}:`,
      `    build:`,
      `      context: ./docker/browser-use`,
      `      dockerfile: Dockerfile`,
      `    container_name: browser-use-${agent.id}`,
      `    environment:`,
      `      - OLLAMA_BASE_URL=http://ollama:11434/v1`,
      `      - OLLAMA_MODEL=\${BROWSER_USE_MODEL:-minimax-m2.5:cloud}`,
      `    shm_size: "2gb"`,
      `    restart: unless-stopped`,
      `    networks:`,
      `      default:`,
      `        aliases:`,
      `          - browser-use-${agent.id}`,
      ``,
    );
  }

  fs.writeFileSync(cwdPath('docker-compose.override.yml'), composeLines.join('\n') + '\n', 'utf-8');
  console.log(pc.green(`✔  Generated docker-compose.override.yml`));

  // ── 4. Ensure host disk directories exist ──────────────────────────────────
  const diskPaths = Object.values(cfg.disks ?? {}) as string[];
  for (const diskPath of diskPaths) {
    if (!diskPath) continue;
    fs.mkdirSync(expandHome(diskPath), { recursive: true });
  }
}

export { setNestedValue };
