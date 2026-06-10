import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const INDEX_FILE = path.join(process.cwd(), 'transport flow uploads', '_index.json');

export async function GET() {
  if (!existsSync(INDEX_FILE)) return NextResponse.json([]);
  return NextResponse.json(JSON.parse(await readFile(INDEX_FILE, 'utf-8')));
}
