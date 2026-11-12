import { App, Menu, SuggestModal } from 'obsidian';
import { FreezeStore } from './freezeStore';
import { KEY, TABLE, activeTable, headers } from './tableDom';
import { parseKey } from './tableIdentity';

interface FreezeMenuHost {
  app: App;
  freezes: FreezeStore;
  enabled(): boolean;
  activeRoot(): HTMLElement | null;
  setCount(table: HTMLTableElement, count: number | undefined): void;
}
interface Choice { count: number | undefined; label: string; }

class ChoicePicker<T> extends SuggestModal<T> {
  constructor(app: App, private readonly choices: T[], private readonly label: (item: T) => string,
    private readonly choose: (item: T) => void, private readonly closed: () => void) { super(app); }
  getSuggestions(query: string): T[] {
    return this.choices.filter(item => this.label(item).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  }
  renderSuggestion(item: T, el: HTMLElement): void { el.textContent = this.label(item); }
  onChooseSuggestion(item: T): void { this.choose(item); }
  onClose(): void { super.onClose(); this.closed(); }
}

/** 复用原生事件的 Menu，在 showAtMouseEvent 前追加；不修改全局 Menu 原型。 */
export class FreezeMenus {
  private readonly disposers: (() => void)[] = [];
  private readonly documents = new Set<Document>();
  private readonly menuRestores = new Map<Menu, () => void>();
  private readonly pickers = new Set<SuggestModal<unknown>>();
  private lastTable: HTMLTableElement | undefined;
  private pending: { table: HTMLTableElement; event: MouseEvent; column: number | undefined } | undefined;
  private pendingTimer: { win: Window; id: number } | undefined;

  constructor(private readonly host: FreezeMenuHost) {}

  bindDocument(doc: Document): void {
    if (this.documents.has(doc)) return;
    this.documents.add(doc);
    const context = (evt: Event) => this.onContextMenu(evt as MouseEvent);
    const pointer = (evt: Event) => {
      const table = this.tableAt(evt.target);
      if (table) this.lastTable = table;
    };
    doc.addEventListener('contextmenu', context, true);
    doc.addEventListener('pointerdown', pointer, true);
    this.disposers.push(() => {
      doc.removeEventListener('contextmenu', context, true);
      doc.removeEventListener('pointerdown', pointer, true);
    });
  }

  private tableAt(target: EventTarget | null): HTMLTableElement | undefined {
    const element = target as Element | null;
    const table = element?.nodeType === 1 ? element.closest('table') : null;
    return table && activeTable(table) && this.host.enabled() ? table : undefined;
  }

  private valid(table: HTMLTableElement): boolean {
    return this.host.enabled() && table.isConnected && activeTable(table) && table.hasAttribute(KEY);
  }

  private clearPending(): void {
    if (this.pendingTimer) this.pendingTimer.win.clearTimeout(this.pendingTimer.id);
    this.pendingTimer = undefined;
    this.pending = undefined;
  }

  private onContextMenu(evt: MouseEvent): void {
    this.clearPending();
    const table = this.tableAt(evt.target);
    if (!table) return;
    const target = evt.target as Element;
    this.lastTable = table;
    if (table.closest('.markdown-preview-view')) {
      // 链接、输入框的原生菜单不被替换；普通表格区域提供阅读模式入口。
      if (target.closest('a,input,textarea,button,select')) return;
      evt.preventDefault();
      evt.stopPropagation();
      const menu = new Menu();
      this.extendBeforeShow(menu, table);
      menu.showAtMouseEvent(evt);
      return;
    }
    const columnHandle = target.closest('.table-col-drag-handle');
    const rowHandle = target.closest('.table-row-drag-handle');
    const column = columnHandle ? (columnHandle.closest('th,td') as HTMLTableCellElement | null)?.cellIndex : undefined;
    this.pending = { table, event: evt, column };
    const win = table.ownerDocument.defaultView;
    if (win) this.pendingTimer = { win, id: win.setTimeout(() => this.clearPending(), 1000) };
    // 六个点菜单不触发 editor-menu，但原生处理器复用同一个 forEvent 实例。
    if (columnHandle || rowHandle) this.extendBeforeShow(Menu.forEvent(evt), table, column);
  }

  onEditorMenu(menu: Menu, path: string | undefined): void {
    const context = this.pending;
    if (!context || !path || parseKey(context.table.getAttribute(KEY) ?? '')?.[0] !== path) return;
    this.extendBeforeShow(menu, context.table, context.column);
  }

  private extendBeforeShow(menu: Menu, table: HTMLTableElement, column?: number): void {
    if (this.menuRestores.has(menu)) return;
    const original = menu.showAtMouseEvent;
    const originalUnload = menu.unload;
    const key = table.getAttribute(KEY);
    let appended = false;
    let showing = 0;
    const restore = () => {
      if (menu.showAtMouseEvent === show) menu.showAtMouseEvent = original;
      if (menu.unload === unload) menu.unload = originalUnload;
      this.menuRestores.delete(menu);
    };
    const show = (evt: MouseEvent): Menu => {
      showing++;
      try {
        if (!appended && this.valid(table) && table.getAttribute(KEY) === key) {
          appended = true;
          try { this.append(menu, table, column); }
          catch (error) { console.error('Table Width Scroll: 冻结菜单添加失败', error); }
        }
        return original.call(menu, evt);
      } finally { showing--; }
    };
    const unload = (): void => {
      try { originalUnload.call(menu); }
      finally { if (showing === 0) restore(); }
    };
    menu.showAtMouseEvent = show;
    menu.unload = unload;
    // onHide 是单回调槽；不能覆盖原生取消选择逻辑。菜单重绘中的 unload 不算关闭。
    this.menuRestores.set(menu, restore);
  }

  private append(menu: Menu, table: HTMLTableElement, column?: number): void {
    const key = table.getAttribute(KEY)!;
    const override = this.host.freezes.override(key);
    const item = (title: string, action: () => void, checked?: boolean, disabled = false) => {
      menu.addItem(entry => {
        entry.setSection('tws-freeze').setTitle(title).setIcon('snowflake').setDisabled(disabled)
          .onClick(() => { if (this.valid(table) && table.getAttribute(KEY) === key) action(); });
        if (checked !== undefined) entry.setChecked(checked);
      });
    };
    menu.addSeparator();
    if (column !== undefined) {
      item(`冻结到此列（前 ${column + 1} 列）`, () => this.host.setCount(table, column + 1),
        override === column + 1, column >= headers(table).length - 1);
    }
    item('冻结列设置…', () => this.openPicker(table));
    item('不冻结', () => this.host.setCount(table, 0), override === 0);
    item(`跟随全局默认（${this.host.freezes.defaultCount} 列）`, () => this.host.setCount(table, undefined), override === undefined);
    const selected = override ?? this.host.freezes.defaultCount;
    const effective = Number(table.getAttribute('data-tws-frozen-count') ?? 0);
    if (effective < selected) item(`当前冻结 ${effective} 列（空间或列数受限）`, () => {}, undefined, true);
  }

  openPicker(table: HTMLTableElement): void {
    if (!this.valid(table)) return;
    const key = table.getAttribute(KEY)!;
    const selected = this.host.freezes.override(key);
    const choices: Choice[] = [
      { count: undefined, label: `跟随全局默认（${this.host.freezes.defaultCount} 列）` },
      { count: 0, label: '不冻结' },
    ];
    for (let count = 1; count < headers(table).length; count++) {
      choices.push({ count, label: count === 1 ? '冻结第一列' : `冻结前 ${count} 列` });
    }
    if (selected !== undefined && selected >= headers(table).length && selected > 0) {
      choices.push({ count: selected, label: `冻结前 ${selected} 列（已保存）` });
    }
    const effective = table.getAttribute('data-tws-frozen-count') ?? '0';
    this.showChoices(`冻结列设置（当前生效 ${effective} 列）`, choices,
      choice => `${choice.count === selected ? '✓ ' : ''}${choice.label}`,
      choice => { if (table.getAttribute(KEY) === key) this.host.setCount(table, choice.count); });
  }

  hasTables(): boolean {
    return !!this.host.enabled() && !!this.host.activeRoot()?.querySelector(`table.${TABLE}`);
  }

  openForActiveView(): void {
    const root = this.host.activeRoot();
    if (!root || !this.host.enabled()) return;
    const tables = Array.from(root.querySelectorAll<HTMLTableElement>(`table.${TABLE}`)).filter(table => this.valid(table));
    const focusedTable = this.tableAt(root.ownerDocument.activeElement);
    const focused = focusedTable && root.contains(focusedTable) ? focusedTable : undefined;
    const recent = this.lastTable && root.contains(this.lastTable) && this.valid(this.lastTable) ? this.lastTable : undefined;
    const target = focused ?? recent ?? (tables.length === 1 ? tables[0] : undefined);
    if (target) this.openPicker(target);
    else if (tables.length) this.showChoices('选择要设置冻结列的表格', tables,
      table => `${tables.indexOf(table) + 1}. ${headers(table).map(cell => cell.textContent?.trim()).join(' / ')}`,
      table => this.openPicker(table));
  }

  private showChoices<T>(title: string, choices: T[], label: (item: T) => string, choose: (item: T) => void): void {
    const picker = new ChoicePicker(this.host.app, choices, label, choose, () => this.pickers.delete(picker as SuggestModal<unknown>));
    picker.setPlaceholder(title);
    this.pickers.add(picker as SuggestModal<unknown>);
    picker.open();
  }

  dispose(): void {
    this.clearPending();
    this.disposers.splice(0).forEach(dispose => dispose());
    this.documents.clear();
    for (const [menu, restore] of this.menuRestores) { menu.hide(); restore(); }
    this.menuRestores.clear();
    [...this.pickers].forEach(picker => picker.close());
    this.pickers.clear();
    this.lastTable = undefined;
  }
}
