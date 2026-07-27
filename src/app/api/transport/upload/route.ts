import { NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'transport flow uploads');
const INDEX_FILE = path.join(UPLOAD_DIR, '_index.json');

// Expected columns in exact order (0-indexed)
const EXPECTED_COLUMNS: Record<number, string> = {
  0: 'Circle',
  1: 'City Name A',
  2: 'Tier1',
  3: 'City Name B',
  4: 'Tier2',
  5: 'Location A M6',
  6: 'Location B M6',
  7: 'Link wise Peak Traffic(Gbps)',
  8: 'Link wise 95% Traffic(Gbps)',
};

const VALID_TIERS = new Set(['T1', 'T2', 'T3']);
// Required non-empty fields: col index → display name
const REQUIRED_COLS: Record<number, string> = { 0: 'Circle', 1: 'City Name A', 2: 'Tier1', 3: 'City Name B', 4: 'Tier2' };

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

// Handles quoted CSV fields (RFC 4180)
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/);
  const parsed: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    parsed.push(fields);
  }

  return { headers: parsed[0] ?? [], rows: parsed.slice(1) };
}

function validate(headers: string[], rows: string[][]): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── 1. Column count ──
  const expectedCount = Object.keys(EXPECTED_COLUMNS).length;
  if (headers.length !== expectedCount) {
    errors.push({
      field: 'Column count',
      message: `Expected exactly ${expectedCount} columns, found ${headers.length}. Check the file hasn't been modified.`,
    });
    // Still proceed to check individual names
  }

  // ── 2. Column names at exact positions ──
  const colErrors: string[] = [];
  for (const [idxStr, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const idx = Number(idxStr);
    if (idx >= headers.length) {
      colErrors.push(`Column ${idx + 1}: expected "${expected}", column is missing.`);
      continue;
    }
    const actual = headers[idx];
    if (actual !== expected) {
      colErrors.push(`Column ${idx + 1}: expected "${expected}", got "${actual || '(empty)'}".`);
    }
  }
  if (colErrors.length > 0) {
    errors.push({
      field: 'Column names',
      message: colErrors.join(' | '),
    });
    // Wrong columns → row validation would be misleading
    return errors;
  }

  // ── 3. At least one data row ──
  if (rows.length === 0) {
    errors.push({ field: 'Data', message: 'File has no data rows after the header.' });
    return errors;
  }

  // ── 4. Row column count ──
  const shortRows = rows
    .map((r, i) => ({ row: i + 2, count: r.length }))
    .filter(({ count }) => count !== expectedCount);
  if (shortRows.length > 0) {
    const sample = shortRows.slice(0, 5).map(r => `row ${r.row} (${r.count} cols)`).join(', ');
    errors.push({
      field: 'Row width',
      message: `${shortRows.length} row(s) have the wrong number of columns (expected ${expectedCount}): ${sample}${shortRows.length > 5 ? ' …' : ''}.`,
    });
  }

  // ── 5. Required fields not empty ──
  const emptyByCol: Record<number, number[]> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const [idxStr, colName] of Object.entries(REQUIRED_COLS)) {
      const idx = Number(idxStr);
      if (!row[idx]?.trim()) {
        if (!emptyByCol[idx]) emptyByCol[idx] = [];
        emptyByCol[idx].push(i + 2);
      }
    }
  }
  for (const [idxStr, rowNums] of Object.entries(emptyByCol)) {
    const colName = REQUIRED_COLS[Number(idxStr)];
    const sample = rowNums.slice(0, 5).join(', ');
    errors.push({
      field: colName,
      message: `"${colName}" is empty on ${rowNums.length} row(s): ${sample}${rowNums.length > 5 ? ` … (${rowNums.length} total)` : ''}.`,
    });
  }

  // ── 6. Tier values ──
  const badTierRows: { row: number; col: string; value: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const t1 = row[2]?.trim();
    const t2 = row[4]?.trim();
    if (t1 && !VALID_TIERS.has(t1)) badTierRows.push({ row: i + 2, col: 'Tier1', value: t1 });
    if (t2 && !VALID_TIERS.has(t2)) badTierRows.push({ row: i + 2, col: 'Tier2', value: t2 });
  }
  if (badTierRows.length > 0) {
    const sample = badTierRows.slice(0, 5)
      .map(e => `row ${e.row} ${e.col}="${e.value}"`)
      .join(', ');
    errors.push({
      field: 'Tier values',
      message: `Invalid tier value(s) — expected T1, T2, or T3. Found on: ${sample}${badTierRows.length > 5 ? ` … (${badTierRows.length} total)` : ''}.`,
    });
  }

  // ── 7. Traffic columns numeric and non-negative ──
  const badPeakRows: number[] = [];
  const badP95Rows:  number[] = [];
  const negPeakRows: number[] = [];
  const negP95Rows:  number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const peakRaw = row[7]?.trim();
    const p95Raw  = row[8]?.trim();
    const peak    = Number(peakRaw);
    const p95     = Number(p95Raw);

    if (peakRaw && isNaN(peak))   badPeakRows.push(i + 2);
    else if (!isNaN(peak) && peak < 0) negPeakRows.push(i + 2);

    if (p95Raw && isNaN(p95))     badP95Rows.push(i + 2);
    else if (!isNaN(p95) && p95 < 0)   negP95Rows.push(i + 2);
  }

  if (badPeakRows.length > 0) {
    errors.push({
      field: 'Peak Traffic',
      message: `Non-numeric value in "Link wise Peak Traffic(Gbps)" on row(s): ${badPeakRows.slice(0, 5).join(', ')}${badPeakRows.length > 5 ? ` … (${badPeakRows.length} total)` : ''}.`,
    });
  }
  if (badP95Rows.length > 0) {
    errors.push({
      field: '95% Traffic',
      message: `Non-numeric value in "Link wise 95% Traffic(Gbps)" on row(s): ${badP95Rows.slice(0, 5).join(', ')}${badP95Rows.length > 5 ? ` … (${badP95Rows.length} total)` : ''}.`,
    });
  }
  if (negPeakRows.length > 0) {
    errors.push({
      field: 'Peak Traffic',
      message: `Negative peak traffic on row(s): ${negPeakRows.slice(0, 5).join(', ')}${negPeakRows.length > 5 ? ` … (${negPeakRows.length} total)` : ''}. Traffic must be ≥ 0.`,
    });
  }
  if (negP95Rows.length > 0) {
    errors.push({
      field: '95% Traffic',
      message: `Negative 95% traffic on row(s): ${negP95Rows.slice(0, 5).join(', ')}${negP95Rows.length > 5 ? ` … (${negP95Rows.length} total)` : ''}. Traffic must be ≥ 0.`,
    });
  }

  // ── 8. 95th percentile ≤ peak ──
  const invertedRows: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i];
    const peak = Number(row[7]);
    const p95  = Number(row[8]);
    if (!isNaN(peak) && !isNaN(p95) && p95 > peak) invertedRows.push(i + 2);
  }
  if (invertedRows.length > 0) {
    errors.push({
      field: '95% > Peak',
      message: `95% traffic exceeds peak traffic on ${invertedRows.length} row(s): ${invertedRows.slice(0, 5).join(', ')}${invertedRows.length > 5 ? ' …' : ''}. The 95th percentile cannot be higher than the peak.`,
    });
  }

  // ── 9. Self-loop check ──
  const selfLoops: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[1]?.trim() && row[1].trim() === row[3]?.trim()) selfLoops.push(i + 2);
  }
  if (selfLoops.length > 0) {
    errors.push({
      field: 'Self-loops',
      message: `"City Name A" equals "City Name B" on ${selfLoops.length} row(s): ${selfLoops.slice(0, 5).join(', ')}${selfLoops.length > 5 ? ' …' : ''}. Source and target city must be different.`,
    });
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
    if (!text.trim()) {
      return NextResponse.json({ error: 'File is empty.', details: [] }, { status: 422 });
    }

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

    // ── Parse ──
    type LinkKey = string;
    type LinkEntry = {
      source: string; target: string;
      sourceTier: string; targetTier: string;
      traffic: number; traffic95: number;
    };
    const aggregated = new Map<LinkKey, LinkEntry>();

    for (const row of rows) {
      const circle = row[0].trim();
      const source = row[1].trim();
      const target = row[3].trim();
      if (!circle || !source || !target) continue;

      const key: LinkKey = `${circle}||${source}||${target}`;
      const existing = aggregated.get(key);
      const peak = Number(row[7]) || 0;
      const p95  = Number(row[8]) || 0;

      if (existing) {
        existing.traffic   += peak;
        existing.traffic95 += p95;
      } else {
        aggregated.set(key, {
          source, target,
          sourceTier: row[2].trim(),
          targetTier: row[4].trim(),
          traffic: peak, traffic95: p95,
        });
      }
    }

    const grouped: Record<string, LinkEntry[]> = {};
    aggregated.forEach((link, key) => {
      const circle = key.split('||')[0];
      if (!grouped[circle]) grouped[circle] = [];
      grouped[circle].push(link);
    });

    if (Object.keys(grouped).length === 0) {
      return NextResponse.json(
        { error: 'No usable data found.', details: ['All rows were skipped due to empty Circle / City fields.'] },
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
    const existingIdx = index.findIndex(e => e.label === label);
    const meta: UploadMeta = { filename, label, uploadedAt: Date.now(), linkCount, circleCount };
    if (existingIdx >= 0) index[existingIdx] = meta;
    else index.unshift(meta);
    index.sort((a, b) => b.uploadedAt - a.uploadedAt);
    await writeIndex(index);

    return NextResponse.json({ label, linkCount, circleCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
