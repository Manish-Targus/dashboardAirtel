import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'bng subscriber uploads');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

  const safeDate = date.replace(/\//g, '-');
  const filePath = path.join(UPLOAD_DIR, `${safeDate}.json`);

  if (!existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const raw = await readFile(filePath, 'utf-8');
  return NextResponse.json(JSON.parse(raw));
}
