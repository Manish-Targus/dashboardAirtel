import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'transport flow uploads');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');
  if (!filename) return NextResponse.json({ error: 'Missing file param' }, { status: 400 });

  // Prevent path traversal
  const safe = path.basename(filename);
  const filePath = path.join(UPLOAD_DIR, safe);

  if (!existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(JSON.parse(await readFile(filePath, 'utf-8')));
}
