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

// Multi-table Excel export via the Excel 2003 SpreadsheetML XML format — every
// table becomes its own worksheet/tab. Opens natively in Excel, no dependency.
export function downloadExcel(filename: string, sheets: Sheet[]) {
  const esc = (v: string | number | null | undefined) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cell = (v: string | number | null | undefined) => {
    const isNum = typeof v === 'number' && isFinite(v);
    return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
  };
  const usedNames = new Set<string>();
  const worksheet = (s: Sheet) => {
    // Excel sheet names: max 31 chars, no \ / ? * [ ] :, and must be unique
    let name = (s.name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
    let n = name, i = 2;
    while (usedNames.has(n)) { n = `${name.slice(0, 28)} ${i++}`; }
    usedNames.add(n);
    const head = `<Row>${s.headers.map(cell).join('')}</Row>`;
    const body = s.rows.map(r => `<Row>${r.map(cell).join('')}</Row>`).join('');
    return `<Worksheet ss:Name="${esc(n)}"><Table>${head}${body}</Table></Worksheet>`;
  };
  const xml =
    '<?xml version="1.0"?>\r\n<?mso-application progid="Excel.Sheet"?>\r\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    sheets.map(worksheet).join('') +
    '</Workbook>';
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
