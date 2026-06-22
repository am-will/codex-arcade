// Build every game the arcade ships, installing deps first if needed.
// Run from the repo root via `npm run build`.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../arcade.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`)),
    );
  });
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

for (const game of GAMES) {
  const dir = path.join(ROOT, game.dir);
  console.log(`\n[35m━━ Building ${game.title} (${game.dir}) ━━[0m`);

  if (!(await exists(dir))) {
    console.error(`  ✖ ${game.dir} not found — skipping.`);
    continue;
  }
  if (!(await exists(path.join(dir, 'node_modules')))) {
    console.log('  • Installing dependencies…');
    await run('npm', ['install'], dir);
  }
  await run('npm', ['run', 'build'], dir);
}

console.log('\n[32m✓ All games built. Run `npm start` to open the arcade.[0m\n');
