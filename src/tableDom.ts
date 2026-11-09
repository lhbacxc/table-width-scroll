import { DEFAULT_MIN_CH, clampCh } from './widthStore';

export const ENABLED = 'tws-enabled';
export const KEY = 'data-tws-key';
export const TABLE = 'tws-table';
export const SCROLL = 'tws-scroll';
export const HANDLE = 'tws-resize-handle';
const GROUP = 'tws-colgroup';
const WIDTH = '--tws-width';
const MIN_WIDTH = '--tws-min-width';

interface Decoration {
  wrapper: HTMLElement;
  inner: HTMLElement | null;
  tabindex: string | null;
  role: string | null;
  label: string | null;
}
const decorations = new WeakMap<HTMLTableElement, Decoration>();

export function headers(table: HTMLTableElement): HTMLTableCellElement[] {
  return Array.from((table.tHead?.rows[0] ?? table.rows[0])?.cells ?? []);
}

export function scrollContainer(table: HTMLTableElement): HTMLElement | null {
  return decorations.get(table)?.wrapper ?? table.closest<HTMLElement>(`.${SCROLL}`);
}

export function activeTable(table: HTMLTableElement): boolean {
  const view = table.closest('.markdown-source-view, .markdown-preview-view');
  return table.ownerDocument.body.classList.contains(ENABLED) && table.classList.contains(TABLE) &&
    !!view && !view.classList.contains('tws-off');
}

export function decorate(table: HTMLTableElement, key: string, widths?: number[]): void {
  const cells = headers(table);
  if (!cells.length || cells.some(cell => cell.colSpan !== 1)) return;
  let meta = decorations.get(table);
  if (!meta) {
    const widget = table.closest<HTMLElement>('.cm-table-widget');
    const wrapper = widget ?? table.parentElement;
    if (!wrapper) return;
    const inner = widget ? table.parentElement : null;
    meta = {
      wrapper, inner,
      tabindex: wrapper.getAttribute('tabindex'),
      role: wrapper.getAttribute('role'),
      label: wrapper.getAttribute('aria-label'),
    };
    decorations.set(table, meta);
    wrapper.classList.add(SCROLL);
    inner?.classList.add('tws-inner');
    if (meta.tabindex === null) wrapper.tabIndex = 0;
    if (meta.role === null) wrapper.setAttribute('role', 'region');
    if (meta.label === null) wrapper.setAttribute('aria-label', '表格，可横向滚动');
  }
  table.classList.add(TABLE);
  if (table.getAttribute(KEY) !== key) table.setAttribute(KEY, key);
  cells.forEach((cell, index) => {
    let handle = cell.querySelector<HTMLElement>(`:scope > .${HANDLE}`);
    if (!handle) {
      handle = table.ownerDocument.createElement('span');
      handle.className = HANDLE;
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('contenteditable', 'false');
      handle.setAttribute('data-ignore-swipe', 'true');
      handle.setAttribute('aria-label', `调整第 ${index + 1} 列宽度`);
      handle.title = '拖动调整列宽；方向键微调；双击恢复整张表格默认宽度';
      cell.append(handle);
    }
  });
  applyWidths(table, widths);
}

function variable(el: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    if (el.style.getPropertyValue(name)) el.style.removeProperty(name);
  } else if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

export function applyWidths(table: HTMLTableElement, widths?: number[]): void {
  const count = headers(table).length;
  const valid = widths?.length === count ? widths : undefined;
  const targets = [table, decorations.get(table)?.inner].filter((el): el is HTMLElement => !!el);
  const total = valid ? valid.reduce((sum, ch) => sum + ch, 0) : undefined;
  targets.forEach(el => {
    variable(el, WIDTH, total === undefined ? undefined : `${total}ch`);
    variable(el, MIN_WIDTH, valid ? '0ch' : `${count * DEFAULT_MIN_CH}ch`);
  });
  const pinned = !!valid;
  if (table.classList.contains('tws-pinned') !== pinned) table.classList.toggle('tws-pinned', pinned);
  let group = table.querySelector<HTMLTableColElement>(`:scope > colgroup.${GROUP}`);
  if (!valid) { group?.remove(); return; }
  if (!group || group.children.length !== count) {
    group?.remove();
    group = table.ownerDocument.createElement('colgroup');
    group.className = GROUP;
    for (let i = 0; i < count; i++) group.append(table.ownerDocument.createElement('col'));
    table.prepend(group);
  }
  Array.from(group.children).forEach((col, i) => {
    variable(col as HTMLElement, '--tws-col-width', `${valid[i]}ch`);
    headers(table)[i]?.querySelector(`:scope > .${HANDLE}`)?.setAttribute('aria-valuenow', String(valid[i]));
  });
}

/** ch 的真实像素宽度随主题字体变化；测量的是表格使用的字体。 */
export function chPixels(table: HTMLTableElement): number {
  const win = table.ownerDocument.defaultView;
  if (!win) return 8;
  const style = win.getComputedStyle(table);
  const canvas = table.ownerDocument.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return Number.parseFloat(style.fontSize) / 2 || 8;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText('0').width || 8;
}

export function measuredWidths(table: HTMLTableElement): number[] {
  const unit = chPixels(table);
  return headers(table).map(cell => clampCh(cell.getBoundingClientRect().width / unit));
}

export function stripTable(table: HTMLTableElement): void {
  const meta = decorations.get(table);
  table.querySelectorAll(`.${HANDLE}, colgroup.${GROUP}`).forEach(el => el.remove());
  table.classList.remove(TABLE, 'tws-pinned');
  table.removeAttribute(KEY);
  [table, meta?.inner].forEach(el => {
    if (!el) return;
    el.style.removeProperty(WIDTH);
    el.style.removeProperty(MIN_WIDTH);
  });
  if (meta) {
    meta.wrapper.classList.remove(SCROLL, 'tws-dragging');
    meta.inner?.classList.remove('tws-inner');
    for (const [name, value] of [['tabindex', meta.tabindex], ['role', meta.role], ['aria-label', meta.label]]) {
      if (value === null) meta.wrapper.removeAttribute(name!);
      else meta.wrapper.setAttribute(name!, value!);
    }
  }
  decorations.delete(table);
}

export function stripAll(root: ParentNode): void {
  root.querySelectorAll<HTMLTableElement>(`table.${TABLE}`).forEach(stripTable);
}
