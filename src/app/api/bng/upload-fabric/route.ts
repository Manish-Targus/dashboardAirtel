import { NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const UPLOAD_DIR = path.join(process.cwd(), 'bng fabric type uploads');
const INDEX_FILE = path.join(UPLOAD_DIR, '_index.json');
const SHEET_NAME = 'Input sheet'; // compared against trimmed sheet names — real file has a trailing space

// Col indices in the Input sheet (0-indexed)
// 0:HostName 1:Fabric\Non Fabric 2:Circle 3:Site 4:BNG Type 5:Type 6:Current Status 7:Services
const REQUIRED_COLS: Record<number, string> = {
  0: 'HostName',
  1: 'Fabric\\Non Fabric',
  2: 'Circle',
  3: 'Site',
  4: 'BNG Type',
  5: 'Type',
  6: 'Current Status',
  7: 'Services',
};

const JUNK_NODE_NAMES = new Set(['#N/A', 'N/A', '#REF!']);

interface ValidationError { field: string; message: string; }

function validate(rows: unknown[][]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (rows.length === 0) {
    errors.push({ field: 'Header', message: 'Sheet is empty.' });
    return errors;
  }

  const header = rows[0] as unknown[];

  if (header.length < 8) {
    errors.push({
      field: 'Columns',
      message: `Header has only ${header.length} column(s). Need at least 8 (up to "Services").`,
    });
  }

  for (const [idxStr, expected] of Object.entries(REQUIRED_COLS)) {
    const idx = Number(idxStr);
    if (idx >= header.length) continue;
    const actual = header[idx] == null ? '(empty)' : String(header[idx]).trim();
    if (actual !== expected) {
      errors.push({
        field: `Column ${idx + 1}`,
        message: `Column ${idx + 1}: expected "${expected}", got "${actual}".`,
      });
    }
  }

  const dataRows = rows.slice(1).filter(r => r[0] && !JUNK_NODE_NAMES.has(String(r[0]).trim()));
  if (dataRows.length === 0) {
    errors.push({ field: 'Data', message: 'No data rows found after the header row (column A "HostName" is empty in all rows).' });
  }

  return errors;
}

interface FabricRecord {
  node: string;
  fabricType: 'Fabric' | 'Non Fabric' | 'Unknown';
  bngType?: string;
  status?: string;
  services?: string;
  site?: string;
  shuttingDown?: boolean;
}

/** Best-effort: parses "MSC DC status" for BNG sites flagged "to be shut". Real
 *  site rows have an empty column A; a few stray "new DC under deployment"
 *  reference rows have column A populated and are skipped. Returns an empty
 *  set (no error) if the sheet isn't present — this is supplementary data,
 *  not core to the upload's primary purpose. */
function loadShutSites(wb: XLSX.WorkBook): Set<string> {
  const sheetKey = wb.SheetNames.find(n => n.trim() === 'MSC DC status');
  if (!sheetKey) return new Set();
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetKey], { header: 1 });
  const shutSites = new Set<string>();
  for (const r of rows.slice(1)) {
    const [siteOwner, site, shutFlag] = r;
    if (siteOwner != null || !site) continue;
    if (shutFlag) shutSites.add(String(site).trim());
  }
  return shutSites;
}

interface UploadMeta {
  date: string;
  filename: string;
  uploadedAt: number;
  nodeCount: number;
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

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json(
        { error: 'Wrong file type.', details: [`Expected an .xlsx or .xls file, got "${file.name}".`] },
        { status: 422 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      return NextResponse.json(
        { error: 'Could not read file.', details: ['The file appears to be corrupt or is not a valid Excel workbook.'] },
        { status: 422 }
      );
    }

    const sheetKey = wb.SheetNames.find(n => n.trim() === SHEET_NAME);
    if (!sheetKey) {
      return NextResponse.json(
        {
          error: 'Wrong sheet name.',
          details: [
            `Expected a sheet named "Input sheet" (trailing space tolerated).`,
            `Sheets found: ${wb.SheetNames.map(s => `"${s}"`).join(', ') || '(none)'}.`,
          ],
        },
        { status: 422 }
      );
    }

    const ws = wb.Sheets[sheetKey];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

    const validationErrors = validate(rows);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'File format is incorrect.', details: validationErrors.map(e => `[${e.field}] ${e.message}`) },
        { status: 422 }
      );
    }

    const shutSites = loadShutSites(wb);

    const records: FabricRecord[] = [];
    for (const r of rows.slice(1)) {
      const rawNode = r[0];
      if (!rawNode) continue;
      const node = String(rawNode).trim();
      if (!node || JUNK_NODE_NAMES.has(node)) continue;

      const fabricRaw = String(r[1] ?? '').trim();
      const services = String(r[7] ?? '').trim().replace(/\s+/g, ' ');
      const site = String(r[3] ?? '').trim() || undefined;

      records.push({
        node,
        fabricType: fabricRaw === 'Fabric' || fabricRaw === 'Non Fabric' ? fabricRaw : 'Unknown',
        bngType: String(r[4] ?? '').trim() || undefined,
        status: String(r[6] ?? '').trim() || undefined,
        services: services || undefined,
        site,
        shuttingDown: site ? shutSites.has(site) : false,
      });
    }

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'No usable data found.', details: ['Parsed 0 records. Check column A (HostName).'] },
        { status: 422 }
      );
    }

    // No embedded report date in this sheet (unlike the traffic/subscriber uploads)
    // — use the upload timestamp itself as the version key.
    const safeDate = new Date().toISOString().slice(0, 10);
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });

    await writeFile(path.join(UPLOAD_DIR, file.name), buffer);
    await writeFile(
      path.join(UPLOAD_DIR, `${safeDate}.json`),
      JSON.stringify(records, null, 2),
      'utf-8'
    );

    const index = await readIndex();
    const meta: UploadMeta = { date: safeDate, filename: file.name, uploadedAt: Date.now(), nodeCount: records.length };
    const existing = index.findIndex(e => e.date === safeDate);
    if (existing >= 0) index[existing] = meta;
    else index.unshift(meta);
    index.sort((a, b) => b.uploadedAt - a.uploadedAt);
    await writeIndex(index);

    return NextResponse.json({ date: safeDate, nodeCount: records.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
