export type SheetRow = Record<string, string>;

const MAX_SHEET_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 5000;

function textDecoder() { return new TextDecoder("utf-8", { fatal: false }); }

export function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function makeCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [headers.map(csvEscape).join(","), ...rows.map(row => headers.map((_, i) => csvEscape(row[i])).join(","))].join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ""; let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted value.");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(values => values.some(value => value.trim() !== ""));
}

function normalHeader(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[()₹]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function rowsToObjects(matrix: string[][]): SheetRow[] {
  if (!matrix.length) throw new Error("The spreadsheet is empty.");
  const headers = matrix[0].map(normalHeader);
  if (!headers.some(Boolean)) throw new Error("The spreadsheet needs a header row.");
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error("The spreadsheet has duplicate column names.");
  if (matrix.length - 1 > MAX_ROWS) throw new Error(`Import at most ${MAX_ROWS.toLocaleString("en-IN")} rows at a time.`);
  return matrix.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])));
}

function u16(view: DataView, offset: number) { return view.getUint16(offset, true); }
function u32(view: DataView, offset: number) { return view.getUint32(offset, true); }

export async function unzipEntries(buffer: ArrayBuffer, maxEntries = 2500, maxUncompressed = 650 * 1024 * 1024): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
  if (bytes.byteLength < 22) throw new Error("ZIP file is incomplete.");
  let eocd = -1;
  const floor = Math.max(0, bytes.byteLength - 65557);
  for (let i = bytes.byteLength - 22; i >= floor; i--) if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("ZIP end record was not found.");
  const total = u16(view, eocd + 10); const centralOffset = u32(view, eocd + 16);
  if (total > maxEntries) throw new Error(`ZIP has too many files. Maximum ${maxEntries.toLocaleString("en-IN")}.`);
  let cursor = centralOffset; let totalOut = 0; const result = new Map<string, Uint8Array>();
  for (let index = 0; index < total; index++) {
    if (cursor + 46 > bytes.length || u32(view, cursor) !== 0x02014b50) throw new Error("ZIP directory is damaged.");
    const flags = u16(view, cursor + 8); const method = u16(view, cursor + 10); const compressedSize = u32(view, cursor + 20); const size = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28); const extraLength = u16(view, cursor + 30); const commentLength = u16(view, cursor + 32); const localOffset = u32(view, cursor + 42);
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength); const name = textDecoder().decode(nameBytes).replace(/\\/g, "/");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith("/") || name.includes("../") || name.startsWith("/")) continue;
    if (flags & 0x1) throw new Error("Encrypted ZIP files are not supported.");
    if (localOffset + 30 > bytes.length || u32(view, localOffset) !== 0x04034b50) throw new Error(`ZIP entry ${name} has an invalid local header.`);
    const localNameLength = u16(view, localOffset + 26); const localExtraLength = u16(view, localOffset + 28); const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) throw new Error(`ZIP entry ${name} is incomplete.`);
    const compressed = bytes.slice(dataStart, dataStart + compressedSize); let output: Uint8Array;
    if (method === 0) output = compressed;
    else if (method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot unpack ZIP files. Upload the photos directly instead.");
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      output = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error(`ZIP compression method ${method} is not supported.`);
    if (size !== output.byteLength) throw new Error(`ZIP entry ${name} failed its size check.`);
    totalOut += output.byteLength; if (totalOut > maxUncompressed) throw new Error("ZIP expands beyond the safe import limit.");
    result.set(name, output);
  }
  return result;
}

function xmlDecode(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function cellColumn(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A"; let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}
function allText(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => xmlDecode(match[1])).join("");
}

async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = await unzipEntries(buffer, 1200, 80 * 1024 * 1024);
  const decode = (name: string) => { const data = entries.get(name); return data ? textDecoder().decode(data) : ""; };
  const workbook = decode("xl/workbook.xml"); const rels = decode("xl/_rels/workbook.xml.rels");
  let sheetPath = "xl/worksheets/sheet1.xml";
  const firstSheet = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*\/>/i) ?? workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*>/i);
  if (firstSheet && rels) {
    const id = firstSheet[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const relation = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"`, "i"));
    if (relation) {
      const target = relation[1].replace(/^\/+/, "");
      sheetPath = target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    }
  }
  const sheet = decode(sheetPath); if (!sheet) throw new Error("The first Excel worksheet could not be read.");
  const sharedXml = decode("xl/sharedStrings.xml"); const shared = sharedXml ? [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m => allText(m[1])) : [];
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1]; const body = cell[2]; const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? "A1"; const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      let value = "";
      if (type === "inlineStr") value = allText(body);
      else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        value = type === "s" ? (shared[Number(raw)] ?? "") : type === "b" ? (raw === "1" ? "TRUE" : "FALSE") : xmlDecode(raw);
      }
      cells[cellColumn(ref)] = value;
    }
    rows.push(cells.map(value => value ?? ""));
  }
  return rows.filter(values => values.some(value => String(value).trim() !== ""));
}

export async function readSpreadsheet(file: File): Promise<SheetRow[]> {
  if (file.size > MAX_SHEET_BYTES) throw new Error("Spreadsheet is too large. Keep it under 8 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return rowsToObjects(parseCsv(await file.text()));
  if (name.endsWith(".xlsx")) return rowsToObjects(await parseXlsx(await file.arrayBuffer()));
  throw new Error("Use a .csv or .xlsx file.");
}
