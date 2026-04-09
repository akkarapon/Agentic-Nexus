import { execa } from 'execa';
import pc from 'picocolors';

export async function runNexusDown(): Promise<void> {
  console.log(pc.cyan('Stopping Agentic-Nexus orchestration stack...'));
  
  try {
    const subprocess = execa('docker', ['compose', 'down'], { stdio: 'inherit' });
    await subprocess;
    console.log(pc.green('✔ Containers stopped successfully.'));
  } catch (error) {
    console.error(pc.red('Failed to stop containers:'), error);
    process.exit(1);
  }
}
