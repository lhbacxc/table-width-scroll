import { WidthStore, clampCh } from './widthStore';
import {
  HANDLE, KEY, TABLE, activeTable, applyWidths, chPixels, decorate,
  headers, measuredWidths, scrollContainer,
} from './tableDom';

export interface ResizeHost {
  store: WidthStore;
  persist(): void;
  forEachRoot(callback: (root: HTMLElement) => void): void;
}
interface Drag {
  table: HTMLTableElement;
  handle: HTMLElement;
  key: string;
  column: number;
  pointer: number;
  x: number;
  scroll: number;
  unit: number;
  base: number[];
  current: number[];
  moved: boolean;
}
const elementOf = (target: EventTarget | null): HTMLElement | null => {
  const node = target as Node | null;
  return node?.nodeType === 1 ? node as HTMLElement : null;
};

/** 原生组件保持编辑权；仅在列边界手势上捕获输入。 */
export class ResizeController {
  private drag: Drag | undefined;
  private suppressedTable: HTMLTableElement | undefined;
  private readonly disposers: (() => void)[] = [];
  private readonly scrollPositions = new Map<string, number>();

  constructor(private readonly host: ResizeHost) {}

  decorate(table: HTMLTableElement, key: string): void {
    this.cancelDetached();
    const fresh = !table.hasAttribute(KEY);
    const widths = this.drag?.table === table ? this.drag.current : this.host.store.get(key, headers(table).length);
    decorate(table, key, widths);
    if (fresh && table.isConnected) {
      const wrapper = scrollContainer(table);
      if (wrapper) wrapper.scrollLeft = this.scrollPositions.get(key) ?? 0;
    }
  }

  bindDocument(doc: Document): void {
    const win = doc.defaultView;
    const listen = (target: EventTarget, name: string, fn: EventListener, options?: AddEventListenerOptions) => {
      target.addEventListener(name, fn, options);
      this.disposers.push(() => target.removeEventListener(name, fn, options));
    };
    listen(doc, 'pointerdown', this.onDown as EventListener, { capture: true });
    listen(doc, 'pointermove', this.onMove as EventListener, { capture: true });
    listen(doc, 'pointerup', this.onUp as EventListener, { capture: true });
    listen(doc, 'pointercancel', this.onCancel as EventListener, { capture: true });
    listen(doc, 'lostpointercapture', this.onCancel as EventListener, { capture: true });
    listen(doc, 'keydown', this.onKey as EventListener, { capture: true });
    listen(doc, 'dblclick', this.onDoubleClick as EventListener, { capture: true });
    for (const name of ['mousedown', 'touchstart', 'click']) {
      listen(doc, name, this.swallow, { capture: true });
    }
    listen(doc, 'scroll', this.onScroll, { capture: true, passive: true });
    if (win) listen(win, 'blur', () => this.finish(false));
  }

  private handleAt(evt: PointerEvent): HTMLElement | null {
    const target = elementOf(evt.target);
    const direct = target?.closest<HTMLElement>(`.${HANDLE}`);
    if (direct) return direct;
    if (evt.pointerType !== 'mouse') return null;
    const cell = target?.closest('th,td');
    const table = cell?.closest('table');
    if (!table || !activeTable(table)) return null;
    const index = headers(table).findIndex(header => Math.abs(header.getBoundingClientRect().right - evt.clientX) <= 5);
    return index < 0 ? null : headers(table)[index]?.querySelector(`:scope > .${HANDLE}`) ?? null;
  }

  private onDown = (evt: PointerEvent): void => {
    this.suppressedTable = undefined;
    if (this.drag || !evt.isPrimary || evt.button !== 0) return;
    const handle = this.handleAt(evt);
    const table = handle?.closest('table');
    const key = table?.getAttribute(KEY);
    if (!handle || !table || !key || !activeTable(table)) return;
    const column = headers(table).indexOf(handle.parentElement as HTMLTableCellElement);
    if (column < 0) return;
    evt.preventDefault();
    evt.stopImmediatePropagation();
    const base = measuredWidths(table);
    this.drag = {
      table, handle, key, column, pointer: evt.pointerId, x: evt.clientX,
      scroll: scrollContainer(table)?.scrollLeft ?? 0,
      unit: chPixels(table), base, current: [...base], moved: false,
    };
    this.suppressedTable = table;
    handle.classList.add('is-active');
    scrollContainer(table)?.classList.add('tws-dragging');
    try { handle.setPointerCapture(evt.pointerId); } catch { /* 文档级监听仍能结束手势。 */ }
  };

  private onMove = (evt: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointer !== evt.pointerId) return;
    if (!drag.table.isConnected) { this.finish(false); return; }
    const delta = evt.clientX - drag.x + (scrollContainer(drag.table)?.scrollLeft ?? 0) - drag.scroll;
    if (!drag.moved && Math.abs(delta) < 3) return;
    evt.preventDefault();
    evt.stopImmediatePropagation();
    drag.moved = true;
    drag.current = [...drag.base];
    drag.current[drag.column] = clampCh((drag.base[drag.column] ?? 6) + delta / drag.unit);
    applyWidths(drag.table, drag.current);
  };

  private onUp = (evt: PointerEvent): void => {
    if (this.drag?.pointer === evt.pointerId) { evt.stopImmediatePropagation(); this.finish(true); }
  };
  private onCancel = (evt: PointerEvent): void => {
    if (this.drag?.pointer === evt.pointerId) this.finish(false);
  };

  private finish(commit: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = undefined;
    drag.handle.classList.remove('is-active');
    scrollContainer(drag.table)?.classList.remove('tws-dragging');
    if (drag.handle.hasPointerCapture(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
    if (commit && drag.moved && drag.table.isConnected) this.save(drag.key, drag.current);
    else applyWidths(drag.table, this.host.store.get(drag.key, headers(drag.table).length));
  }

  private swallow: EventListener = (evt): void => {
    const target = elementOf(evt.target);
    if (target?.closest(`.${HANDLE}`) ||
      ((evt as MouseEvent).detail > 0 && target && this.suppressedTable?.contains(target))) {
      evt.stopImmediatePropagation();
    }
  };

  private onKey = (evt: KeyboardEvent): void => {
    if (evt.key === 'Escape' && this.drag) { evt.preventDefault(); this.finish(false); return; }
    const handle = elementOf(evt.target)?.closest(`.${HANDLE}`);
    const table = handle?.closest('table');
    const key = table?.getAttribute(KEY);
    if (!table || !key || !activeTable(table) || !['ArrowLeft', 'ArrowRight', 'Home'].includes(evt.key)) return;
    evt.preventDefault();
    evt.stopImmediatePropagation();
    if (evt.key === 'Home') { this.save(key, []); return; }
    const index = headers(table).indexOf(handle?.parentElement as HTMLTableCellElement);
    if (index < 0) return;
    const widths = measuredWidths(table);
    widths[index] = clampCh((widths[index] ?? 6) + (evt.key === 'ArrowRight' ? 1 : -1) * (evt.shiftKey ? 5 : 1));
    this.save(key, widths);
  };

  private onDoubleClick = (evt: MouseEvent): void => {
    const table = elementOf(evt.target)?.closest(`.${HANDLE}`)?.closest('table');
    const key = table?.getAttribute(KEY);
    if (!table || !key || !activeTable(table)) return;
    evt.preventDefault(); evt.stopImmediatePropagation();
    this.save(key, []);
  };

  private onScroll: EventListener = (evt): void => {
    const wrapper = elementOf(evt.target);
    if (!wrapper?.classList.contains('tws-scroll')) return;
    const key = wrapper.querySelector(`table.${TABLE}`)?.getAttribute(KEY);
    if (key) this.scrollPositions.set(key, wrapper.scrollLeft);
  };

  private save(key: string, widths: number[]): void {
    this.host.store.set(key, widths);
    this.host.persist();
    this.refresh(key);
  }

  refresh(key?: string): void {
    this.host.forEachRoot(root => root.querySelectorAll<HTMLTableElement>(`table.${TABLE}`).forEach(table => {
      const ownKey = table.getAttribute(KEY);
      if (ownKey && (!key || key === ownKey) && this.drag?.table !== table) {
        applyWidths(table, this.host.store.get(ownKey, headers(table).length));
      }
    }));
  }

  cancelDetached(): void { if (this.drag && !this.drag.table.isConnected) this.finish(false); }
  cancel(): void { this.finish(false); }
  cancelIn(root: HTMLElement): void { if (this.drag && root.contains(this.drag.table)) this.finish(false); }
  dispose(): void { this.finish(false); this.disposers.splice(0).forEach(fn => fn()); this.scrollPositions.clear(); }
}
