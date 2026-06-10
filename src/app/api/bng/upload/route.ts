import { NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const UPLOAD_DIR = path.join(process.cwd(), 'bng utilisation uploads');
const INDEX_FILE = path.join(UPLOAD_DIR, '_index.json');

const SHEET_NAME = 'Traffic Hourly Trend Report';

// Expected column positions and their header names (0-indexed)
const REQUIRED_COLS: Record<number, string> = {
  0:  'VendorName',
  1:  'Circle',
  2:  'City',
  3:  'Link Type',
  4:  'Node Name',
  5:  'Interface Name',
  6:  'BRAS Type',
  7:  'Bandwidth (Gb)',
  33: 'Max Util(%)',
};

interface ValidationError {
  field: string;
  message: string;
}

function validate(rows: unknown[][]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Date row
  const dateRow = rows.find(r => (r as unknown[])[0] === 'Date:') as unknown[] | undefined;
  if (!dateRow) {
    errors.push({ field: 'Date', message: 'No "Date:" row found. Expected a row where column A = "Date:".' });
  } else if (!dateRow[1]) {
    errors.push({ field: 'Date', message: '"Date:" row found but the date value (column B) is empty.' });
  }

  // Header row
  const headerIdx = rows.findIndex(r => (r as unknown[])[0] === 'VendorName');
  if (headerIdx === -1) {
    errors.push({ field: 'Header', message: 'No header row found. Expected a row where column A = "VendorName".' });
    // Can't check column names without a header row
    return errors;
  }

  const header = rows[headerIdx] as unknown[];

  // Total column count must cover index 33
  if (header.length < 34) {
    errors.push({
      field: 'Columns',
      message: `Header has only ${header.length} column(s). Need at least 34 (up to "Max Util(%)" in column AH).`,
    });
    // Still check what we can
  }

  // Check each required column is at the right position with the right name
  for (const [idxStr, expected] of Object.entries(REQUIRED_COLS)) {
    const idx = Number(idxStr);
    if (idx >= header.length) continue; // already reported above
    const actual = header[idx] == null ? '(empty)' : String(header[idx]).trim();
    if (actual !== expected) {
      errors.push({
        field: `Column ${idx + 1}`,
        message: `Column ${idx + 1} (${columnLetter(idx)}): expected "${expected}", got "${actual}".`,
      });
    }
  }

  // At least one data row after header
  const dataRows = rows.slice(headerIdx + 1).filter(r => (r as unknown[])[4]);
  if (dataRows.length === 0) {
    errors.push({ field: 'Data', message: 'No data rows found after the header row (column E "Node Name" is empty in all rows).' });
  }

  return errors;
}

function columnLetter(idx: number): string {
  let result = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

interface UploadMeta {
  date: string;
  filename: string;
  uploadedAt: number;
  nodeCount: number;
}

async function readIndex(): Promise<UploadMeta[]> {
  if (!existsSync(INDEX_FILE)) return [];
  const raw = await readFile(INDEX_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function writeIndex(entries: UploadMeta[]) {
  await writeFile(INDEX_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file attached.' }, { status: 400 });

    // Basic file type check
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json(
        { error: 'Wrong file type.', details: [`Expected an .xlsx or .xls file, got "${file.name}".`] },
        { status: 422 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse workbook
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      return NextResponse.json(
        { error: 'Could not read file.', details: ['The file appears to be corrupt or is not a valid Excel workbook.'] },
        { status: 422 }
      );
    }

    // Sheet check
    if (!wb.SheetNames.includes(SHEET_NAME)) {
      return NextResponse.json(
        {
          error: 'Wrong sheet name.',
          details: [
            `Expected a sheet named "${SHEET_NAME}".`,
            `Sheets found: ${wb.SheetNames.map(s => `"${s}"`).join(', ') || '(none)'}.`,
          ],
        },
        { status: 422 }
      );
    }

    const ws = wb.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

    // Run structural validation
    const validationErrors = validate(rows);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'File format is incorrect.',
          details: validationErrors.map(e => `[${e.field}] ${e.message}`),
        },
        { status: 422 }
      );
    }

    // Extract date and header index (both guaranteed to exist after validation)
    const dateRow    = rows.find(r => r[0] === 'Date:')!;
    const reportDate = String(dateRow[1]);
    const headerIdx  = rows.findIndex(r => r[0] === 'VendorName');

    // Parse data rows
    const nodeMap = new Map<string, {
      node: string; circle: string; city: string; bras_type: string;
      ae_interfaces: { name: string; link_type: string; bw_gb: number | null; max_util: number }[];
    }>();

    for (const r of rows.slice(headerIdx + 1)) {
      if (!r[4]) continue;
      const ifaceName = String(r[5] ?? '');
      if (!ifaceName.startsWith('ae') && !ifaceName.startsWith('ams')) continue;
      const nodeName = String(r[4]);
      if (!nodeMap.has(nodeName)) {
        nodeMap.set(nodeName, {
          node: nodeName,
          circle: String(r[1] ?? ''),
          city: String(r[2] ?? ''),
          bras_type: String(r[6] ?? ''),
          ae_interfaces: [],
        });
      }
      const rawUtil = Number(r[33]);
      nodeMap.get(nodeName)!.ae_interfaces.push({
        name: ifaceName,
        link_type: String(r[3] ?? ''),
        bw_gb: r[7] != null ? Number(r[7]) : null,
        max_util: isNaN(rawUtil) ? 0 : rawUtil,
      });
    }

    const nodes = Array.from(nodeMap.values());
    if (nodes.length === 0) {
      return NextResponse.json(
        {
          error: 'No usable data found.',
          details: ['Parsed 0 nodes with ae/ams interfaces. Check that column F (Interface Name) contains ae* or ams* entries.'],
        },
        { status: 422 }
      );
    }

    const safeDate = reportDate.replace(/\//g, '-');
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });

    await writeFile(path.join(UPLOAD_DIR, file.name), buffer);
    await writeFile(
      path.join(UPLOAD_DIR, `${safeDate}.json`),
      JSON.stringify(nodes, null, 2),
      'utf-8'
    );

    const index = await readIndex();
    const existing = index.findIndex(e => e.date === reportDate);
    const meta: UploadMeta = { date: reportDate, filename: file.name, uploadedAt: Date.now(), nodeCount: nodes.length };
    if (existing >= 0) index[existing] = meta;
    else index.unshift(meta);
    index.sort((a, b) => b.uploadedAt - a.uploadedAt);
    await writeIndex(index);

    return NextResponse.json({ date: reportDate, nodeCount: nodes.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
