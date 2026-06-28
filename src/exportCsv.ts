// Minimal client-side CSV export. Builds a CSV from already-loaded, on-screen
// data and triggers a download — no data leaves the browser.
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface Sheet {
  name: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

// ── Real .xlsx (OOXML) export — no dependency ───────────────────────────────
// An .xlsx is a ZIP of XML parts. We build the parts and pack them with a tiny
// stored-mode (uncompressed) ZIP writer + CRC32. Every table = its own sheet.

const xmlEsc = (v: string | number | null | undefined) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Excel column letters: 0 -> A, 25 -> Z, 26 -> AA …
const colLetter = (i: number) => {
  let s = '', n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes: Uint8Array) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

// Build a ZIP archive (stored / no compression) from named byte entries.
function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
    ]);
    parts.push(local, nameBytes, f.data);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), nameBytes);
    offset += local.length + nameBytes.length + size;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]);
  const all = [...parts, ...central, eocd];
  const total = all.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of all) { out.set(p, pos); pos += p.length; }
  return out;
}

export function downloadExcel(filename: string, sheets: Sheet[]) {
  const enc = new TextEncoder();
  const usedNames = new Set<string>();
  const sheetName = (raw: string) => {
    let name = (raw || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';
    let n = name, i = 2;
    while (usedNames.has(n.toLowerCase())) { n = `${name.slice(0, 28)} ${i++}`; }
    usedNames.add(n.toLowerCase());
    return n;
  };
  const named = sheets.map(s => ({ ...s, displayName: sheetName(s.name) }));

  const cellXml = (v: string | number | null | undefined, ref: string) => {
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const sheetXml = (s: Sheet) => {
    const rowXml = (cells: (string | number | null | undefined)[], r: number) =>
      `<row r="${r}">${cells.map((v, c) => cellXml(v, `${colLetter(c)}${r}`)).join('')}</row>`;
    const rows = [rowXml(s.headers, 1), ...s.rows.map((r, i) => rowXml(r, i + 2))].join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  };

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    `</Types>`;
  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    named.map((s, i) => `<sheet name="${xmlEsc(s.displayName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets></workbook>`;
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `</Relationships>`;

  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) })),
  ];

  const zipped = zipStore(files);
  const blob = new Blob([zipped], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\.(xls|xlsx)$/i, '') + '.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
