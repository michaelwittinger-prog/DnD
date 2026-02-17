import { spawn } from 'node:child_process';

const commands = process.argv.slice(2);

if (commands.length === 0) {
  console.error('Usage: node scripts/run-sequential.mjs "<command1>" "<command2>" ...');
  process.exit(2);
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`[run-sequential] ${command}`);

    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
    });

    child.on('error', (err) => reject(err));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

for (const command of commands) {
  try {
    const code = await runCommand(command);
    if (code !== 0) {
      process.exit(code);
    }
  } catch {
    process.exit(1);
  }
}

process.exit(0);