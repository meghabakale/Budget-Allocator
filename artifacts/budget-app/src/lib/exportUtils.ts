/** Reusable client-side export helpers */

function timestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsvString(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
  return "\uFEFF" + lines.join("\n"); // BOM for Excel ₹ compatibility
}

export function exportToCSV(rows: Record<string, unknown>[], basename: string) {
  if (!rows.length) return false;
  const csv = toCsvString(rows);
  const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
  triggerDownload(blob, `${basename}-${timestamp()}.csv`);
  return true;
}

export function exportToJSON(data: unknown, basename: string) {
  const arr = Array.isArray(data) ? data : [data];
  if (!arr.length) return false;
  const json = JSON.stringify(arr, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  triggerDownload(blob, `${basename}-${timestamp()}.json`);
  return true;
}
