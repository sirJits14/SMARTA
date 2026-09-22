import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'functions', 'shared');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(root, 'shared'), dest, { recursive: true, filter: (p) => !p.endsWith('.test.js') });
console.log('synced shared/ → functions/shared/');
