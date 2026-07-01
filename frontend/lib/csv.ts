// Utilidades de exportación CSV pensadas para abrirse bien en Excel (es-CL):
// separador ";", BOM UTF-8 para tildes/ñ, campos citados y CRLF.

function escapeCell(value: string | number | null | undefined): string {
  let s = String(value ?? "");
  // Mitiga CSV/Excel formula injection
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(";"));
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([buildCSV(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
