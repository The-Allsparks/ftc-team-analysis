/**
 * Enforce primary JS bundle budgets after `vite build`.
 * Budgets calibrated post-#12 externalization (see PR for measured sizes).
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Provisional budgets from Gate A; tighten only with measured evidence. */
const MAX_PRIMARY_JS_BYTES = 750 * 1024;
const MAX_PRIMARY_JS_GZIP_BYTES = 200 * 1024;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, 'dist/assets');
const publicSeed = resolve(root, 'dist/data/nv-ftc-teams.generated.json');
const canonicalSeed = resolve(root, 'src/data/nv-ftc-teams.generated.json');

const seedJson = JSON.parse(await readFile(canonicalSeed, 'utf8')) as { generatedAt?: string };
const seedFingerprint = typeof seedJson.generatedAt === 'string' ? seedJson.generatedAt : null;

if (!seedFingerprint) {
  console.error('Bundle budget check failed: canonical seed is missing generatedAt.');
  process.exit(1);
}

const assetFiles = await readdir(assetsDir);
const primaryJsName = assetFiles.find((name) => /^index-.*\.js$/.test(name));

if (!primaryJsName) {
  console.error('Bundle budget check failed: no primary index-*.js in dist/assets.');
  process.exit(1);
}

const primaryJsPath = join(assetsDir, primaryJsName);
const primaryBytes = (await stat(primaryJsPath)).size;
const primarySource = await readFile(primaryJsPath);
const primaryGzipBytes = gzipSync(primarySource, { level: 9 }).length;

const failures: string[] = [];

if (primaryBytes > MAX_PRIMARY_JS_BYTES) {
  failures.push(
    `Primary JS ${primaryJsName} is ${primaryBytes} bytes (limit ${MAX_PRIMARY_JS_BYTES}).`,
  );
}

if (primaryGzipBytes > MAX_PRIMARY_JS_GZIP_BYTES) {
  failures.push(
    `Primary JS ${primaryJsName} gzip is ${primaryGzipBytes} bytes (limit ${MAX_PRIMARY_JS_GZIP_BYTES}).`,
  );
}

if (primarySource.includes(seedFingerprint)) {
  failures.push(
    `Primary JS still embeds the Nevada seed fingerprint (${seedFingerprint}).`,
  );
}

try {
  await stat(publicSeed);
} catch {
  failures.push(`Missing static seed asset at dist/data/nv-ftc-teams.generated.json.`);
}

if (failures.length > 0) {
  console.error('Bundle budget check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `OK: ${primaryJsName} ${primaryBytes} bytes (${primaryGzipBytes} gzip); seed asset present; fingerprint absent.`,
);
