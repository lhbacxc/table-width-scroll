/** Markdown 表格定位。解析方式改编自 Gridlock Tables，MIT，Michael Sciscenti。 */
export interface TableIdentity {
  line: number;
  header: string;
  occurrence: number;
}

export function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let start = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\') i++;
    else if (row[i] === '|') { cells.push(row.slice(start, i).trim()); start = i + 1; }
  }
  cells.push(row.slice(start).trim());
  return cells;
}

export function tablesIn(lines: readonly string[]): TableIdentity[] {
  const result: TableIdentity[] = [];
  const occurrences = new Map<string, number>();
  let i = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((s, n) => n > 0 && ['---', '...'].includes(s.trim()));
    if (end > 0) i = end + 1;
  }
  let fence: string | undefined;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (opening && opening[0] === fence[0] && opening.length >= fence.length) fence = undefined;
      continue;
    }
    if (opening) { fence = opening; continue; }
    const next = lines[i + 1];
    if (!line.includes('|') || /^\s*>/.test(line) || next === undefined) continue;
    const columns = splitRow(line);
    const delimiters = splitRow(next);
    if (columns.length !== delimiters.length || !delimiters.every(s => /^:?-+:?$/.test(s))) continue;
    const header = JSON.stringify(columns);
    const occurrence = occurrences.get(header) ?? 0;
    result.push({ line: i, header, occurrence });
    occurrences.set(header, occurrence + 1);
    i++;
  }
  return result;
}

export function identityAt(tables: readonly TableIdentity[], from: number, to = from): TableIdentity | undefined {
  return tables.find(t => t.line >= from && t.line <= to);
}

export function tableKey(path: string, table: TableIdentity): string {
  return JSON.stringify([path, table.header, table.occurrence]);
}

export function parseKey(key: string): [string, string, number] | undefined {
  try {
    const value: unknown = JSON.parse(key);
    if (Array.isArray(value) && value.length === 3 && typeof value[0] === 'string' &&
      typeof value[1] === 'string' && Number.isInteger(value[2]) && value[2] >= 0) {
      return value as [string, string, number];
    }
  } catch { /* 忽略旧数据或损坏的记录。 */ }
  return undefined;
}
