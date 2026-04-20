import { NextResponse } from 'next/server';
import Papa from 'papaparse';

export async function POST(req: Request) {
  try {
    const { sheetUrl } = await req.json();
    if (!sheetUrl) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

    let csvUrl = sheetUrl;
    if (sheetUrl.includes('/pubhtml')) {
      csvUrl = sheetUrl.replace('/pubhtml', '/pub?output=csv');
    } else if (!sheetUrl.includes('/pub?')) {
      let docId = sheetUrl;
      const match = sheetUrl.match(/\/d\/(.*?)(\/|$)/);
      if (match?.[1]) docId = match[1];
      csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(csvUrl, { signal: controller.signal as any });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: "Fetch failed: " + response.statusText }, { status: 400 });
    }

    const csvText = await response.text();
    const results = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    if (!results.data || results.data.length === 0) {
      return NextResponse.json({ error: "La hoja CSV está vacía o inválida." }, { status: 400 });
    }

    return NextResponse.json({ participants: results.data });
  } catch (error: any) {
    return NextResponse.json({ error: "Error de servidor interno extrayendo la hoja: " + error.message }, { status: 500 });
  }
}
