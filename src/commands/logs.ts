import { execa } from 'execa';
import pc from 'picocolors';

export async function runNexusLogs(): Promise<void> {
  console.log(pc.cyan('Tailing Agentic-Nexus logs...'));
  
  try {
    const subprocess = execa('docker', ['compose', 'logs', '-f'], { stdio: 'inherit' });
    await subprocess;
  } catch (error: any) {
    // If the user presses Ctrl-C, execa might throw, but it's fine.
    if (error.signal !== 'SIGINT') {
      console.error(pc.red('Failed to stream logs:'), error);
      process.exit(1);
    }
  }
}
