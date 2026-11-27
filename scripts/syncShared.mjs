import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'functions', 'shared');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
// shared/theme/ is browser-only (appearance setting); functions never import it.
const browserOnly = (p) => relative(join(root, 'shared'), p).split(sep)[0] === 'theme';
cpSync(join(root, 'shared'), dest, { recursive: true, filter: (p) => !p.endsWith('.test.js') && !browserOnly(p) });
console.log('synced shared/ → functions/shared/');
