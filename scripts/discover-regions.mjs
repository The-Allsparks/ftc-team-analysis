const season = 2025;

async function probeRegion(code) {
  const response = await fetch(`https://ftc-events.firstinspires.org/${season}/region/${code}`);
  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const title = html.match(/<h1[^>]*>\s*([^<]+?)\s*</i)?.[1]?.trim();
  const teamMatch = html.match(/Teams\s*<\/th>\s*<td[^>]*>\s*(\d+)/i) ?? html.match(/\|\s*Teams\s*\|\s*(\d+)/);
  const teams = teamMatch ? Number(teamMatch[1]) : null;

  if (!title || /not found|error/i.test(title)) {
    return null;
  }

  return { code, title, teams };
}

const candidates = new Set();

for (const suffix of ['', 'HO', 'FIM', 'NC', 'CMP', 'FIT', 'LA', 'BA', 'SD', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']) {
  for (const st of ['TX', 'CA', 'MI', 'NY', 'PA', 'FL', 'OH', 'IL', 'GA', 'NC', 'WA', 'CO', 'AZ', 'MN', 'WI', 'IN', 'MO', 'TN', 'VA', 'MD', 'NJ', 'MA', 'CT', 'OR', 'UT', 'NV', 'LA', 'AL', 'SC', 'KY', 'OK', 'IA', 'KS', 'NE', 'AR', 'MS', 'NM', 'ID', 'MT', 'WY', 'ND', 'SD', 'AK', 'HI', 'VT', 'NH', 'ME', 'RI', 'DE', 'WV', 'DC']) {
    candidates.add(`US${st}${suffix}`);
  }
}

const countries = [
  'CA', 'ON', 'BC', 'AB', 'QC', 'MX', 'AU', 'NZ', 'IL', 'TR', 'CN', 'TW', 'JP', 'KR', 'IN', 'RO', 'NL', 'DE', 'FR', 'GB', 'UK', 'ES', 'IT', 'BR', 'PR', 'VI', 'GU', 'PH', 'SG', 'HK', 'SA', 'AE', 'ZA', 'CH', 'AT', 'BE', 'PL', 'CZ', 'HU', 'GR', 'PT', 'NO', 'SE', 'DK', 'FI', 'IE', 'ISRAEL', 'ISR',
];

for (const code of countries) {
  candidates.add(code);
  candidates.add(`US${code}`);
}

const found = [];

for (const code of [...candidates].sort()) {
  const result = await probeRegion(code);
  if (result) {
    found.push(result);
    console.log(result.code, result.teams, result.title);
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}

console.log('total', found.length);
