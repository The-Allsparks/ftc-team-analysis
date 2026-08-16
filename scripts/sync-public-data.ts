/**
 * Copy canonical Nevada seed + observation side store into public/data/
 * so Vite serves them as static assets (not compiled into the JS bundle).
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const assets = [
  {
    source: resolve(root, 'src/data/nv-ftc-teams.generated.json'),
    target: resolve(root, 'public/data/nv-ftc-teams.generated.json'),
  },
  {
    source: resolve(root, 'src/data/nv-ftc-team-observations.generated.json'),
    target: resolve(root, 'public/data/nv-ftc-team-observations.generated.json'),
  },
] as const;

await mkdir(resolve(root, 'public/data'), { recursive: true });

for (const asset of assets) {
  try {
    await copyFile(asset.source, asset.target);
    console.log(`Synced ${asset.source} → ${asset.target}`);
  } catch (error) {
    if (asset.source.includes('observations')) {
      console.warn(`Skipped observations sync (missing source): ${asset.source}`);
      continue;
    }
    throw error;
  }
}
