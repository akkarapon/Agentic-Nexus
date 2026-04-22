/**
 * src/utils/checker.ts
 *
 * Environment dependency checker utilities.
 * Each check function returns a CheckResult with status and a human-readable message.
 */

import { execa } from 'execa';

export interface CheckResult {
  ok: boolean;
  label: string;
  message: string;
  /** Optional hint shown when the check fails */
  hint?: string;
}

// ---------------------------------------------------------------------------
// Homebrew Check
// ---------------------------------------------------------------------------

export async function checkHomebrew(): Promise<CheckResult> {
  try {
    const { stdout } = await execa('brew', ['--version']);
    const version = stdout.split('\n')[0]; // "Homebrew 4.x.x"
    return {
      ok: true,
      label: 'Homebrew',
      message: `${version}`,
    };
  } catch {
    return {
      ok: false,
      label: 'Homebrew',
      message: 'Not found.',
      hint: 'Install Homebrew: https://brew.sh',
    };
  }
}

/** Install Homebrew via the official install script */
export async function installHomebrew(): Promise<void> {
  await execa(
    '/bin/bash',
    ['-c', '$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)'],
    { stdio: 'inherit' }
  );
}

// ---------------------------------------------------------------------------
// Node.js Version Check
// ---------------------------------------------------------------------------

/** Minimum required Node.js major version */
const NODE_MIN_MAJOR = 20;

export function checkNodeVersion(): CheckResult {
  const raw = process.version; // e.g. "v22.1.0"
  const major = parseInt(raw.replace('v', '').split('.')[0], 10);
  const ok = major >= NODE_MIN_MAJOR;

  return {
    ok,
    label: 'Node.js',
    message: ok
      ? `${raw} — meets the minimum requirement (v${NODE_MIN_MAJOR}+)`
      : `${raw} — too old. Please upgrade to Node.js v${NODE_MIN_MAJOR} or later.`,
    hint: ok ? undefined : 'https://nodejs.org/en/download',
  };
}

/** Check whether Node.js is installed at all (used when running via a wrapper) */
export async function checkNodeInstalled(): Promise<CheckResult> {
  try {
    const { stdout } = await execa('node', ['--version']);
    const raw = stdout.trim();
    const major = parseInt(raw.replace('v', '').split('.')[0], 10);
    const ok = major >= NODE_MIN_MAJOR;
    return {
      ok,
      label: 'Node.js',
      message: ok
        ? `${raw} — meets the minimum requirement (v${NODE_MIN_MAJOR}+)`
        : `${raw} — too old. Please upgrade to Node.js v${NODE_MIN_MAJOR} or later.`,
      hint: ok ? undefined : 'Run: brew install node',
    };
  } catch {
    return {
      ok: false,
      label: 'Node.js',
      message: 'Not found.',
      hint: 'Run: brew install node',
    };
  }
}

/** Install Node.js via Homebrew */
export async function installNode(): Promise<void> {
  await execa('brew', ['install', 'node'], { stdio: 'inherit' });
}

// ---------------------------------------------------------------------------
// Docker / OrbStack Check
// ---------------------------------------------------------------------------

export async function checkDocker(): Promise<CheckResult> {
  try {
    const { stdout } = await execa('docker', ['--version']);
    const version = stdout.trim(); // "Docker version 27.x.x, ..."
    return {
      ok: true,
      label: 'Docker / OrbStack',
      message: version,
    };
  } catch {
    return {
      ok: false,
      label: 'Docker / OrbStack',
      message: 'Docker daemon not found or not running.',
      hint: 'Install OrbStack (recommended for macOS): brew install orbstack\nOr Docker Desktop: https://www.docker.com/products/docker-desktop',
    };
  }
}

/** Install OrbStack via Homebrew */
export async function installOrbStack(): Promise<void> {
  await execa('brew', ['install', 'orbstack'], { stdio: 'inherit' });
}

// ---------------------------------------------------------------------------
// Run All Checks (legacy – non-interactive summary)
// ---------------------------------------------------------------------------

export async function runAllChecks(): Promise<CheckResult[]> {
  const [brewResult, nodeResult, dockerResult] = await Promise.all([
    checkHomebrew(),
    Promise.resolve(checkNodeVersion()),
    checkDocker(),
  ]);

  return [nodeResult, brewResult, dockerResult];
}
