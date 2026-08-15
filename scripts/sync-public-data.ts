/**
 * Copy the canonical Nevada seed from src/data/ into public/data/ so Vite
 * serves it as a static asset (not compiled into the JS bundle).
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'src/data/nv-ftc-teams.generated.json');
const target = resolve(root, 'public/data/nv-ftc-teams.generated.json');

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Synced ${source} → ${target}`);
