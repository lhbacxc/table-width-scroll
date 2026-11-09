import { parseKey } from './tableIdentity';

export const MIN_CH = 4;
export const MAX_CH = 300;
export const DEFAULT_MIN_CH = 6;
export const roundCh = (ch: number): number => Math.round(ch * 100) / 100;
export const clampCh = (ch: number): number => roundCh(Math.min(MAX_CH, Math.max(MIN_CH, ch)));

export function sanitizeWidths(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || !raw.length || !raw.every(w =>
    typeof w === 'number' && Number.isFinite(w) && w >= MIN_CH && w <= MAX_CH)) return undefined;
  return raw.map(w => roundCh(w as number));
}

/** 列宽以 ch 存储。路径和表格标识由两种视图共用。 */
export class WidthStore {
  private readonly record = new Map<string, number[]>();

  constructor(raw?: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    for (const [key, value] of Object.entries(raw)) {
      const widths = sanitizeWidths(value);
      if (parseKey(key) && widths) this.record.set(key, widths);
    }
  }

  get(key: string, count: number): number[] | undefined {
    const widths = this.record.get(key);
    return widths?.length === count ? [...widths] : undefined;
  }

  set(key: string, widths: number[]): void {
    const valid = sanitizeWidths(widths);
    if (!parseKey(key)) return;
    if (valid) this.record.set(key, valid);
    else this.record.delete(key);
  }

  clear(): void { this.record.clear(); }

  /** 同时支持文件与文件夹改名，删除时移除该路径下记录。 */
  rename(oldPath: string, newPath: string | null): void {
    for (const [key, widths] of [...this.record]) {
      const parts = parseKey(key);
      if (!parts || (parts[0] !== oldPath && !parts[0].startsWith(oldPath + '/'))) continue;
      this.record.delete(key);
      if (newPath !== null) {
        parts[0] = newPath + parts[0].slice(oldPath.length);
        this.record.set(JSON.stringify(parts), widths);
      }
    }
  }

  toJSON(): Record<string, number[]> {
    return Object.fromEntries([...this.record].map(([key, widths]) => [key, [...widths]]));
  }
}
