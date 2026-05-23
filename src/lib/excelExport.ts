import * as XLSX from 'xlsx';

export function exportTableToExcel(
  headers: string[],
  rows: (string | number)[][],
  filename: string
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = String(row[i] ?? '');
      if (cell.length > max) max = cell.length;
    }
    return { wch: Math.min(max + 2, 40) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
