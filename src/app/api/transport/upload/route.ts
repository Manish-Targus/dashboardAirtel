import { NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'transport flow uploads');
const INDEX_FILE = path.join(UPLOAD_DIR, '_index.json');

const REQUIRED_HEADERS = [
  'Circle',
  'City Name A',
  'Tier1',
  'City Name B',
  'Tier2',
  'Location A M6',
  'Location B M6',
  'Link wise Peak Traffic(Gbps)',
  'Link wise 95% Traffic(Gbps)',
];

interface UploadMeta {
  filename: string;
  uploadedAt: number;
  linkCount: number;
  circleCount: number;
  label: string;
}

interface ValidationError {
  field: string;
  message: string;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
  return { headers, rows };
}

function validate(headers: string[], rows: string[][]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check all required headers exist
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    errors.push({
      field: 'Headers',
      message: `Missing required column(s): ${missing.map(h => `"${h}"`).join(', ')}.`,
    });
  }

  if (errors.length > 0) return errors; // can't validate rows without headers

  // Check there are data rows
  if (rows.length === 0) {
    errors.push({ field: 'Data', message: 'File has no data rows after the header.' });
    return errors;
  }

  const circleIdx = headers.indexOf('Circle');
  const cityAIdx  = headers.indexOf('City Name A');
  const tier1Idx  = headers.indexOf('Tier1');
  const cityBIdx  = headers.indexOf('City Name B');
  const tier2Idx  = headers.indexOf('Tier2');
  const peakIdx   = headers.indexOf('Link wise Peak Traffic(Gbps)');
  const p95Idx    = headers.indexOf('Link wise 95% Traffic(Gbps)');

  // Validate tiers
  const validTiers = new Set(['T1', 'T2', 'T3']);
  const badTierRows: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const t1 = row[tier1Idx];
    const t2 = row[tier2Idx];
    if ((t1 && !validTiers.has(t1)) || (t2 && !validTiers.has(t2))) {
      badTierRows.push(i + 2); // +2 = 1-based + header row
    }
  }
  if (badTierRows.length > 0) {
    errors.push({
      field: 'Tier values',
      message: `Unexpected tier values (expected T1/T2/T3) on row(s): ${badTierRows.slice(0, 5).join(', ')}${badTierRows.length > 5 ? ` … (${badTierRows.length} total)` : ''}.`,
    });
  }

  // Validate traffic columns are numeric
  const badTrafficRows: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const peak = Number(row[peakIdx]);
    const p95  = Number(row[p95Idx]);
    if (isNaN(peak) || isNaN(p95)) badTrafficRows.push(i + 2);
  }
  if (badTrafficRows.length > 0) {
    errors.push({
      field: 'Traffic values',
      message: `Non-numeric traffic value(s) on row(s): ${badTrafficRows.slice(0, 5).join(', ')}${badTrafficRows.length > 5 ? ` … (${badTrafficRows.length} total)` : ''}.`,
    });
  }

  // Check circles column is not all empty
  const circles = rows.map(r => r[circleIdx]).filter(Boolean);
  if (circles.length === 0) {
    errors.push({ field: 'Circle', message: 'The Circle column appears to be empty in all rows.' });
  }

  // Check city columns are not all empty
  const cities = rows.map(r => r[cityAIdx]).filter(Boolean);
  if (cities.length === 0) {
    errors.push({ field: 'City Name A', message: '"City Name A" column is empty in all rows.' });
  }

  return errors;
}

async function readIndex(): Promise<UploadMeta[]> {
  if (!existsSync(INDEX_FILE)) return [];
  return JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
}

async function writeIndex(entries: UploadMeta[]) {
  await writeFile(INDEX_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file attached.' }, { status: 400 });

    if (!file.name.match(/\.csv$/i)) {
      return NextResponse.json(
        { error: 'Wrong file type.', details: [`Expected a .csv file, got "${file.name}".`] },
        { status: 422 }
      );
    }

    const text = await file.text();
    const { headers, rows } = parseCSV(text);

    const validationErrors = validate(headers, rows);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'File format is incorrect.',
          details: validationErrors.map(e => `[${e.field}] ${e.message}`),
        },
        { status: 422 }
      );
    }

    const circleIdx = headers.indexOf('Circle');
    const cityAIdx  = headers.indexOf('City Name A');
    const tier1Idx  = headers.indexOf('Tier1');
    const cityBIdx  = headers.indexOf('City Name B');
    const tier2Idx  = headers.indexOf('Tier2');
    const peakIdx   = headers.indexOf('Link wise Peak Traffic(Gbps)');
    const p95Idx    = headers.indexOf('Link wise 95% Traffic(Gbps)');

    // Aggregate: sum traffic for duplicate (circle, source, target) pairs
    type LinkKey = string;
    const aggregated = new Map<LinkKey, {
      source: string; target: string;
      sourceTier: string; targetTier: string;
      traffic: number; traffic95: number;
    }>();

    for (const row of rows) {
      const circle = row[circleIdx];
      const source = row[cityAIdx];
      const target = row[cityBIdx];
      if (!circle || !source || !target) continue;

      const key: LinkKey = `${circle}||${source}||${target}`;
      const existing = aggregated.get(key);
      const peak = Number(row[peakIdx]) || 0;
      const p95  = Number(row[p95Idx])  || 0;

      if (existing) {
        existing.traffic   += peak;
        existing.traffic95 += p95;
      } else {
        aggregated.set(key, {
          source,
          target,
          sourceTier: row[tier1Idx],
          targetTier: row[tier2Idx],
          traffic:   peak,
          traffic95: p95,
        });
      }
    }

    // Group by circle
    const grouped: Record<string, typeof aggregated extends Map<string, infer V> ? V[] : never> = {};
    for (const [key, link] of aggregated) {
      const circle = key.split('||')[0];
      if (!grouped[circle]) grouped[circle] = [];
      grouped[circle].push(link);
    }

    if (Object.keys(grouped).length === 0) {
      return NextResponse.json(
        { error: 'No usable data found.', details: ['Parsed 0 links after filtering empty rows.'] },
        { status: 422 }
      );
    }

    const linkCount   = aggregated.size;
    const circleCount = Object.keys(grouped).length;
    const label       = file.name.replace(/\.csv$/i, '');
    const safeLabel   = label.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename    = `${safeLabel}.json`;

    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });

    await writeFile(path.join(UPLOAD_DIR, filename), JSON.stringify(grouped, null, 2), 'utf-8');

    const index = await readIndex();
    const existing = index.findIndex(e => e.label === label);
    const meta: UploadMeta = { filename, label, uploadedAt: Date.now(), linkCount, circleCount };
    if (existing >= 0) index[existing] = meta;
    else index.unshift(meta);
    index.sort((a, b) => b.uploadedAt - a.uploadedAt);
    await writeIndex(index);

    return NextResponse.json({ label, linkCount, circleCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
