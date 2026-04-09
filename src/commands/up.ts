import { execa } from 'execa';
import pc from 'picocolors';

export async function runNexusUp(): Promise<void> {
  console.log(pc.cyan('Starting Agentic-Nexus orchestration stack...'));
  
  try {
    const subprocess = execa('docker', ['compose', 'up', '-d'], { stdio: 'inherit' });
    await subprocess;
    console.log(pc.green('✔ Containers started successfully.'));
  } catch (error) {
    console.error(pc.red('Failed to start containers:'), error);
    process.exit(1);
  }
}
