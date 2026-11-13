/**
 * 原生单元格 sticky 参考 Bases Freeze Panes（MIT，Michael Lip）。
 * 临时取消 sticky 后测量偏移改编自 Dream Table（MIT，desdrianton）。
 * 不复制单元格，不移动原生表格，不写入 Markdown。
 */
export interface FreezeOptions {
  count: number;
}

interface FrozenTable {
  wrapper: HTMLElement;
  options: FreezeOptions;
  observer: ResizeObserver | undefined;
  frame: number | undefined;
  headers: HTMLTableCellElement[];
}

const frozenTables = new WeakMap<HTMLTableElement, FrozenTable>();
export const FROZEN = 'tws-frozen-cell';
const LAST = 'tws-last-frozen';
const OFFSET = '--tws-freeze-left';

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  return Array.from((table.tHead?.rows[0] ?? table.rows[0])?.cells ?? []);
}

export function decorateFrozen(table: HTMLTableElement, wrapper: HTMLElement, options: FreezeOptions): void {
  let meta = frozenTables.get(table);
  if (!meta) {
    meta = { wrapper, options, observer: undefined, frame: undefined, headers: [] };
    frozenTables.set(table, meta);
    const win = table.ownerDocument.defaultView;
    if (win?.ResizeObserver) {
      meta.observer = new win.ResizeObserver(() => queueFrozen(table));
      meta.observer.observe(table);
      meta.observer.observe(wrapper);
    }
  }
  meta.options = options;
  const cells = headerCells(table);
  if (cells.length !== meta.headers.length || cells.some((cell, i) => cell !== meta!.headers[i])) {
    meta.headers.forEach(cell => meta!.observer?.unobserve(cell));
    cells.forEach(cell => meta!.observer?.observe(cell));
    meta.headers = cells;
  }
  updateFrozen(table);
}

function queueFrozen(table: HTMLTableElement): void {
  const meta = frozenTables.get(table);
  const win = table.ownerDocument.defaultView;
  if (!meta || !win || meta.frame !== undefined) return;
  meta.frame = win.requestAnimationFrame(() => {
    meta.frame = undefined;
    updateFrozen(table);
  });
}

/** 列宽应用后同步执行；观察器覆盖窗口、字体及内容引起的尺寸变化。 */
export function updateFrozen(table: HTMLTableElement): void {
  const meta = frozenTables.get(table);
  if (!meta || !table.isConnected) return;
  const headers = headerCells(table);
  const rows = Array.from(table.rows);
  const supported = rows.every(row => row.cells.length === headers.length &&
    Array.from(row.cells).every(cell => cell.colSpan === 1 && cell.rowSpan === 1));
  // 必须测量未冻结的自然布局；滚动时 sticky 的视觉位置不能作为下一次偏移。
  table.classList.add('tws-measuring-freeze');
  let offsets: number[];
  let rights: number[];
  try {
    const origin = table.getBoundingClientRect().left;
    const rects = headers.map(cell => cell.getBoundingClientRect());
    offsets = rects.map(rect => rect.left - origin);
    rights = rects.map(rect => rect.right - origin);
  } finally {
    table.classList.remove('tws-measuring-freeze');
  }
  // clientWidth 包含 padding；行手柄空间不能算作可供冻结列使用的宽度。
  const style = table.ownerDocument.defaultView?.getComputedStyle(meta.wrapper);
  const padding = (Number.parseFloat(style?.paddingLeft ?? '') || 0) +
    (Number.parseFloat(style?.paddingRight ?? '') || 0);
  const visible = Math.max(0, meta.wrapper.clientWidth - padding);
  const budget = visible - Math.max(48, visible * 0.2);
  const requested = Math.min(meta.options.count, Math.max(0, headers.length - 1));
  let count = 0;
  if (supported) while (count < requested && (rights[count] ?? Infinity) <= budget) count++;
  for (const row of rows) {
    Array.from(row.cells).forEach((cell, index) => {
      const frozen = index < count;
      cell.classList.toggle(FROZEN, frozen);
      cell.classList.toggle(LAST, frozen && index === count - 1);
      if (frozen) {
        const offset = `${offsets[index] ?? 0}px`;
        if (cell.style.getPropertyValue(OFFSET) !== offset) cell.style.setProperty(OFFSET, offset);
      } else if (cell.style.getPropertyValue(OFFSET)) cell.style.removeProperty(OFFSET);
    });
  }
  const effective = String(count);
  if (table.getAttribute('data-tws-frozen-count') !== effective) table.setAttribute('data-tws-frozen-count', effective);
}

export function stripFrozen(table: HTMLTableElement): void {
  const meta = frozenTables.get(table);
  meta?.observer?.disconnect();
  if (meta?.frame !== undefined) table.ownerDocument.defaultView?.cancelAnimationFrame(meta.frame);
  Array.from(table.rows).forEach(row => Array.from(row.cells).forEach(cell => {
    cell.classList.remove(FROZEN, LAST);
    cell.style.removeProperty(OFFSET);
  }));
  table.classList.remove('tws-measuring-freeze');
  table.removeAttribute('data-tws-frozen-count');
  frozenTables.delete(table);
}
