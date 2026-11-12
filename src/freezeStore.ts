import { parseKey } from './tableIdentity';

export const DEFAULT_FROZEN_COLUMNS = 1;

export function sanitizeFrozenCount(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
}

/** 显式 0 表示不冻结；没有记录时跟随全局默认。格式独立于旧列宽数组。 */
export class FreezeStore {
  defaultCount: number;
  private readonly record = new Map<string, number>();

  constructor(defaultCount?: unknown, raw?: unknown) {
    this.defaultCount = sanitizeFrozenCount(defaultCount) ?? DEFAULT_FROZEN_COLUMNS;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    for (const [key, value] of Object.entries(raw)) {
      const count = sanitizeFrozenCount(value);
      if (parseKey(key) && count !== undefined) this.record.set(key, count);
    }
  }

  override(key: string): number | undefined { return this.record.get(key); }

  get(key: string, columns: number): number {
    return Math.min(this.override(key) ?? this.defaultCount, Math.max(0, columns - 1));
  }

  setDefault(count: number): void {
    const valid = sanitizeFrozenCount(count);
    if (valid !== undefined) this.defaultCount = valid;
  }

  set(key: string, count: number | undefined): void {
    if (!parseKey(key)) return;
    if (count === undefined) this.record.delete(key);
    else {
      const valid = sanitizeFrozenCount(count);
      if (valid !== undefined) this.record.set(key, valid);
    }
  }

  clear(): void { this.record.clear(); }

  /** 文件和目录改名/删除与列宽使用同一套路径边界。 */
  rename(oldPath: string, newPath: string | null): void {
    for (const [key, count] of [...this.record]) {
      const parts = parseKey(key);
      if (!parts || (parts[0] !== oldPath && !parts[0].startsWith(oldPath + '/'))) continue;
      this.record.delete(key);
      if (newPath !== null) {
        parts[0] = newPath + parts[0].slice(oldPath.length);
        this.record.set(JSON.stringify(parts), count);
      }
    }
  }

  toJSON(): Record<string, number> { return Object.fromEntries(this.record); }
}
