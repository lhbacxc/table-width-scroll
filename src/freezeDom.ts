/**
 * 原生单元格 sticky 参考 Bases Freeze Panes（MIT，Michael Lip）。
 * 临时取消 sticky 后测量偏移改编自 Dream Table（MIT，desdrianton）。
 * 不复制单元格，不移动原生表格，不写入 Markdown。
 */
export interface FreezeOptions {
  count: number;
  defaultCount: number;
  override: number | undefined;
  onChange(count: number | undefined): void;
}

interface FrozenTable {
  wrapper: HTMLElement;
  toolbar: HTMLElement;
  select: HTMLSelectElement;
  status: HTMLElement;
  options: FreezeOptions;
  observer: ResizeObserver | undefined;
  frame: number | undefined;
  signature: string;
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
    const doc = table.ownerDocument;
    const toolbar = doc.createElement('div');
    toolbar.className = 'tws-freeze-toolbar';
    toolbar.setAttribute('contenteditable', 'false');
    toolbar.setAttribute('data-ignore-swipe', 'true');
    const label = doc.createElement('label');
    label.append('冻结列 ');
    const select = doc.createElement('select');
    select.className = 'tws-freeze-select';
    select.setAttribute('aria-label', '当前表格冻结列');
    label.append(select);
    const status = doc.createElement('span');
    status.className = 'tws-freeze-status';
    status.setAttribute('role', 'status');
    toolbar.append(label, status);
    meta = { wrapper, toolbar, select, status, options, observer: undefined, frame: undefined, signature: '', headers: [] };
    frozenTables.set(table, meta);
    select.addEventListener('change', () => {
      const own = frozenTables.get(table);
      if (own && table.isConnected) own.options.onChange(select.value === 'default' ? undefined : Number(select.value));
    });
    // 只隔离自己的控件，普通单元格事件仍交给 Obsidian。
    for (const name of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'keydown']) {
      toolbar.addEventListener(name, evt => evt.stopPropagation());
    }
    wrapper.prepend(toolbar);
    const win = doc.defaultView;
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
  const signature = `${cells.length}/${options.defaultCount}/${options.override}`;
  if (signature !== meta.signature) {
    meta.signature = signature;
    const choices: [string, string][] = [['default', `跟随默认（${options.defaultCount} 列）`], ['0', '不冻结']];
    for (let i = 1; i < cells.length; i++) choices.push([String(i), i === 1 ? '冻结第一列' : `冻结前 ${i} 列`]);
    if (options.override !== undefined && options.override >= cells.length && options.override > 0) {
      choices.push([String(options.override), `冻结前 ${options.override} 列（已保存）`]);
    }
    meta.select.replaceChildren(...choices.map(([value, text]) => {
      const option = table.ownerDocument.createElement('option');
      option.value = value;
      option.textContent = text;
      return option;
    }));
  }
  meta.select.value = options.override === undefined ? 'default' : String(options.override);
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
  const visible = meta.wrapper.clientWidth;
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
  const selected = meta.options.override ?? meta.options.defaultCount;
  const status = count < selected ? `当前冻结 ${count} 列（空间或列数受限）` : '';
  if (meta.status.textContent !== status) meta.status.textContent = status;
}

export function stripFrozen(table: HTMLTableElement): void {
  const meta = frozenTables.get(table);
  meta?.observer?.disconnect();
  if (meta?.frame !== undefined) table.ownerDocument.defaultView?.cancelAnimationFrame(meta.frame);
  meta?.toolbar.remove();
  Array.from(table.rows).forEach(row => Array.from(row.cells).forEach(cell => {
    cell.classList.remove(FROZEN, LAST);
    cell.style.removeProperty(OFFSET);
  }));
  table.classList.remove('tws-measuring-freeze');
  table.removeAttribute('data-tws-frozen-count');
  frozenTables.delete(table);
}
