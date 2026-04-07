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

// ---------------------------------------------------------------------------
// Run All Checks
// ---------------------------------------------------------------------------

export async function runAllChecks(): Promise<CheckResult[]> {
  const [nodeResult, brewResult, dockerResult] = await Promise.all([
    Promise.resolve(checkNodeVersion()),
    checkHomebrew(),
    checkDocker(),
  ]);

  return [nodeResult, brewResult, dockerResult];
}
