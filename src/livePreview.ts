import { EditorView, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Text } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import { ResizeController } from './resizeController';
import { TableIdentity, identityAt, tableKey, tablesIn } from './tableIdentity';
import { stripAll, stripTable } from './tableDom';

/** 改编自 Gridlock 的原生 widget 监听思路，不替换任何文档范围。 */
export function livePreviewExtension(controller: ResizeController, enabled: () => boolean, editors: Set<LiveTables>) {
  return ViewPlugin.define(view => new LiveTables(view, controller, enabled, editors));
}

export class LiveTables implements PluginValue {
  private readonly observer: MutationObserver;
  private frame: number | undefined;
  private cache: { doc: Text; tables: TableIdentity[] } | undefined;

  constructor(
    private readonly view: EditorView,
    private readonly controller: ResizeController,
    private readonly enabled: () => boolean,
    private readonly editors: Set<LiveTables>,
  ) {
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(view.contentDOM, { childList: true, subtree: true });
    editors.add(this);
    this.refresh();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) this.refresh();
  }

  refresh(): void {
    if (this.frame !== undefined) return;
    this.frame = this.view.dom.ownerDocument.defaultView?.requestAnimationFrame(() => {
      this.frame = undefined;
      this.decorate();
    });
  }

  private decorate(): void {
    this.controller.cancelDetached();
    const ownView = this.view.dom.closest('.markdown-source-view');
    const path = this.view.state.field(editorInfoField, false)?.file?.path;
    if (!this.enabled() || ownView?.classList.contains('tws-off') || !path) {
      this.controller.cancelIn(this.view.contentDOM);
      stripAll(this.view.contentDOM);
      return;
    }
    const doc = this.view.state.doc;
    if (this.cache?.doc !== doc) this.cache = { doc, tables: tablesIn(doc.toString().split('\n')) };
    const tables = this.view.contentDOM.querySelectorAll<HTMLTableElement>(
      ':scope > .cm-table-widget > .table-wrapper > table',
    );
    for (const table of Array.from(tables)) {
      const widget = table.closest('.cm-table-widget');
      if (!widget) continue;
      try {
        const line = doc.lineAt(this.view.posAtDOM(widget)).number - 1;
        const identity = identityAt(this.cache.tables, line);
        if (identity) this.controller.decorate(table, tableKey(path, identity));
        else stripTable(table);
      } catch { /* 原生组件在编辑时可能暂时不属于文档，下次渲染再处理。 */ }
    }
  }

  destroy(): void {
    this.observer.disconnect();
    if (this.frame !== undefined) this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    this.editors.delete(this);
    this.controller.cancelIn(this.view.contentDOM);
    stripAll(this.view.contentDOM);
    this.controller.cancelDetached();
  }
}
