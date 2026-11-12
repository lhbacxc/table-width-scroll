import { App, MarkdownRenderChild, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { LiveTables, livePreviewExtension } from './livePreview';
import { ResizeController } from './resizeController';
import { ENABLED, stripAll, stripTable } from './tableDom';
import { identityAt, tableKey, tablesIn } from './tableIdentity';
import { WidthStore } from './widthStore';
import { FreezeStore } from './freezeStore';

class TableCleanup extends MarkdownRenderChild {
  constructor(el: HTMLElement, private readonly table: HTMLTableElement) { super(el); }
  onunload(): void { stripTable(this.table); }
}

export default class TableWidthScrollPlugin extends Plugin {
  enabled = true;
  store = new WidthStore();
  freezes = new FreezeStore();
  private controller!: ResizeController;
  private readonly editors = new Set<LiveTables>();
  private readonly documents = new Set<Document>();
  private saves: Promise<void> = Promise.resolve();
  private unloading = false;

  async onload(): Promise<void> {
    const raw = await this.loadData() as {
      enabled?: unknown; widths?: unknown; defaultFrozenColumns?: unknown; frozenColumns?: unknown;
    } | null;
    this.enabled = raw?.enabled !== false;
    this.store = new WidthStore(raw?.widths);
    this.freezes = new FreezeStore(raw?.defaultFrozenColumns, raw?.frozenColumns);
    this.controller = new ResizeController({
      store: this.store,
      freezes: this.freezes,
      persist: () => this.persist(),
      forEachRoot: callback => this.forEachRoot(callback),
    });
    this.listenDocument(document);
    this.registerEvent(this.app.workspace.on('window-open', win => this.listenDocument(win.doc)));
    this.registerMarkdownPostProcessor((el, ctx) => {
      const classes = (ctx.frontmatter as { cssclasses?: unknown } | undefined)?.cssclasses;
      if (!this.enabled || (Array.isArray(classes) ? classes.includes('tws-off') :
        typeof classes === 'string' && classes.split(/[\s,]+/).includes('tws-off'))) return;
      const table = el.querySelector<HTMLTableElement>(':scope > table');
      if (!table) return;
      const info = ctx.getSectionInfo(el);
      if (!info) return;
      const identity = identityAt(tablesIn(info.text.split(/\r?\n/)), info.lineStart, info.lineEnd);
      if (!identity) return;
      this.controller.decorate(table, tableKey(ctx.sourcePath, identity));
      ctx.addChild(new TableCleanup(el, table));
    });
    this.registerEditorExtension(livePreviewExtension(this.controller, () => this.enabled && !this.unloading, this.editors));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.controller.cancel();
      this.store.rename(oldPath, file.path);
      this.freezes.rename(oldPath, file.path);
      this.persist();
      this.refreshViews();
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      this.controller.cancel();
      this.store.rename(file.path, null);
      this.freezes.rename(file.path, null);
      this.persist();
    }));
    this.addSettingTab(new TableWidthScrollSettings(this.app, this));
    this.addCommand({
      id: 'reset-column-widths', name: '重置所有表格列宽',
      callback: () => { this.controller.cancel(); this.store.clear(); this.persist(); this.controller.refresh(); new Notice('已恢复所有表格默认列宽'); },
    });
    this.addCommand({
      id: 'reset-frozen-columns', name: '所有表格冻结列恢复全局默认',
      callback: () => {
        this.controller.cancel(); this.freezes.clear(); this.persist(); this.controller.refresh();
        new Notice('所有表格冻结列已恢复全局默认');
      },
    });
    this.app.workspace.onLayoutReady(() => { if (!this.unloading) this.refreshViews(); });
    this.register(() => {
      this.unloading = true;
      this.controller.dispose();
      this.forEachRoot(root => stripAll(root));
      this.documents.forEach(doc => doc.body.classList.remove(ENABLED));
      this.documents.clear();
    });
  }

  private listenDocument(doc: Document): void {
    if (this.documents.has(doc)) return;
    this.documents.add(doc);
    doc.body.classList.toggle(ENABLED, this.enabled);
    this.controller.bindDocument(doc);
  }

  private forEachRoot(callback: (root: HTMLElement) => void): void {
    this.app.workspace.iterateAllLeaves(leaf => callback(leaf.view.containerEl));
  }

  /** 保存串行执行，并在调用时快照，避免较慢的旧写入覆盖新列宽。 */
  persist(): void {
    const snapshot = {
      enabled: this.enabled, widths: this.store.toJSON(),
      defaultFrozenColumns: this.freezes.defaultCount, frozenColumns: this.freezes.toJSON(),
    };
    this.saves = this.saves.then(() => this.saveData(snapshot)).catch((error: unknown) => {
      console.error('Table Width Scroll: 保存表格设置失败', error);
      if (!this.unloading) new Notice('表格设置保存失败，请检查仓库是否可写');
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.persist();
    this.documents.forEach(doc => doc.body.classList.toggle(ENABLED, enabled));
    if (!enabled) {
      this.controller.dispose();
      this.forEachRoot(root => stripAll(root));
      this.documents.forEach(doc => this.controller.bindDocument(doc));
    }
    this.refreshViews();
  }

  setDefaultFrozenColumns(count: number): void {
    this.controller.cancel();
    this.freezes.setDefault(count);
    this.persist();
    this.controller.refresh();
  }

  private refreshViews(): void {
    this.editors.forEach(editor => editor.refresh());
    this.app.workspace.iterateAllLeaves(leaf => {
      this.listenDocument(leaf.view.containerEl.ownerDocument);
      if (!(leaf.view instanceof MarkdownView) || leaf.view.getMode() !== 'preview') return;
      const preview = leaf.view.previewMode;
      const scroll = preview.getScroll();
      preview.set(leaf.view.getViewData(), true);
      preview.applyScroll(scroll);
    });
  }
}

class TableWidthScrollSettings extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TableWidthScrollPlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName('启用列宽调整与横向滚动')
      .setDesc('表格可见区域跟随正文宽度，在阅读视图和实时预览中使用相同的列宽。')
      .addToggle(toggle => toggle.setValue(this.plugin.enabled).onChange(value => this.plugin.setEnabled(value)));
    new Setting(this.containerEl).setName('恢复默认列宽')
      .setDesc('双击任意表头的调整手柄，或聚焦手柄后按 Home，可重置当前表格。命令面板支持重置所有表格。');
    new Setting(this.containerEl).setName('默认冻结前几列')
      .setDesc('默认 1 列，0 表示不冻结。每张表顶部可单独选择；空间不足时暂时减少生效数量，不改变保存值。')
      .addText(text => text.setValue(String(this.plugin.freezes.defaultCount)).onChange(value => {
        if (/^\d+$/.test(value)) this.plugin.setDefaultFrozenColumns(Number(value));
      }));
    new Setting(this.containerEl).setName('仅在特定笔记停用')
      .setDesc('在笔记属性 cssclasses 中加入 tws-off。');
  }
}
