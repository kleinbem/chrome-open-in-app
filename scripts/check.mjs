// node --check every runtime module; a Node script so npm runs it on any OS.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = ['background.js'];
for (const dir of ['background', 'popup', 'utils']) {
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith('.js')) files.push(join(dir, name));
  }
}
for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`node --check: ${files.length} files OK`);
