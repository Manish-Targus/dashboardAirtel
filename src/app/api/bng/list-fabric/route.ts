import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const INDEX_FILE = path.join(process.cwd(), 'bng fabric type uploads', '_index.json');

export async function GET() {
  if (!existsSync(INDEX_FILE)) return NextResponse.json([]);
  const raw = await readFile(INDEX_FILE, 'utf-8');
  return NextResponse.json(JSON.parse(raw));
}
