const season = 2025;

async function probeRegion(code) {
  const response = await fetch(`https://ftc-events.firstinspires.org/${season}/region/${code}`);
  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const title = html
    .match(/<h1[^>]*>\s*([^<]+?)\s*</i)?.[1]
    ?.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    ?.replace(/&amp;/g, '&')
    ?.trim();

  if (!title || /not found|error/i.test(title)) {
    return null;
  }

  const teams = Number(html.match(/\|\s*Teams\s*\|\s*(\d+)/)?.[1] ?? 0);
  return { code, title, teams };
}

const prefixes = ['US'];
const states = 'ALAKAZARCACOCTDEFLGAHIIDILINIAKSKYLAMEMDMAMIMNMSMOMTNENVNHNJNMNYNCNDOHOKORPARISCSDTNTXUTVTVAWAWVWIWY'.match(/.{2}/g) ?? [];
const suffixes = [
  '',
  'HO',
  'FIM',
  'LA',
  'SD',
  'NC',
  'SC',
  'NE',
  'NW',
  'SE',
  'SW',
  'N',
  'S',
  'E',
  'W',
  'DAL',
  'AUS',
  'SA',
  'DFW',
  'NOR',
  'SAC',
  'BAY',
  'LA',
  'OC',
  'IE',
  'LV',
  'PHX',
  'TUC',
];

const candidates = new Set();

for (const prefix of prefixes) {
  for (const state of states) {
    for (const suffix of suffixes) {
      candidates.add(`${prefix}${state}${suffix}`);
    }
  }
}

const intl = [
  'AE', 'AU', 'BR', 'CN', 'DE', 'ES', 'FR', 'GB', 'GR', 'HU', 'IL', 'IN', 'IT', 'KR', 'MX', 'NL', 'NZ', 'PL', 'PT', 'RO', 'SA', 'TR', 'TW', 'ZA', 'PR', 'VI', 'GU', 'JP', 'SG', 'HK', 'CH', 'AT', 'BE', 'CZ', 'NO', 'SE', 'DK', 'FI', 'IE', 'SK', 'UA', 'EG', 'QA', 'KW', 'BH', 'OM', 'JO', 'LB', 'CAON', 'CABC', 'CAB', 'CAQC', 'CAMB', 'CASK', 'CANB', 'CANS', 'CAPE', 'CAYT', 'CANU', 'CANL',
];

for (const code of intl) {
  candidates.add(code);
}

const found = [];

for (const code of [...candidates].sort()) {
  const result = await probeRegion(code);
  if (result) {
    found.push(result);
    process.stdout.write(`${result.code}\t${result.teams}\t${result.title}\n`);
  }
}

console.error('total', found.length);

const regions = found.map((entry) => {
  const label = entry.title.replace(/ Region$/, '');
  const stateProv = entry.code.startsWith('US') && entry.code.length === 4 ? entry.code.slice(2) : undefined;
  let group = 'international';
  if (entry.code.startsWith('CA') && entry.code.length > 2) {
    group = 'canada';
  } else if (entry.code.startsWith('US') && entry.code.length > 4) {
    group = 'us-sub';
  } else if (entry.code.startsWith('US')) {
    group = 'us';
  }

  return {
    code: entry.code,
    label,
    ...(stateProv ? { stateProv } : {}),
    group,
  };
});

regions.sort((left, right) => left.label.localeCompare(right.label));

const catalog = {
  generatedAt: new Date().toISOString().slice(0, 10),
  season,
  regions,
};

await import('node:fs/promises').then((fs) =>
  fs.writeFile(
    new URL('../src/data/regions.generated.json', import.meta.url),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  ),
);
