import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import TableWidthScrollPlugin from '../src/main';
import { splitRow, tablesIn } from '../src/tableIdentity';
import { MarkdownView, Menu, editorInfoField, filePath, runtime } from './mockObsidian';

const DEFAULT_NOTE = '# 表格测试\n\n| 项目 | 内容 | 说明 |\n| --- | --- | --- |\n| Alpha | 中文内容与普通文本 | 说明文字 |\n| Beta | 长文本可换行 | https://example.com/very-long-link |\n';
const events = new Map<string, Set<(...args: any[]) => void>>();
let plugin: TableWidthScrollPlugin;
let editor: EditorView | undefined;
let cellEditor: EditorView | undefined;
let reading: MarkdownView;
let sourceView: MarkdownView;
let path = '测试.md';
let optOut = false;
let activeMode = 'live';
const rewidget = StateEffect.define<null>();

function tableDOM(doc: Document, source: string, line: number, live: boolean): HTMLTableElement {
  const lines = source.split('\n');
  const table = doc.createElement('table');
  const head = table.createTHead().insertRow();
  const append = (row: HTMLTableRowElement, values: string[], header: boolean) => values.forEach(value => {
    const cell = doc.createElement(header ? 'th' : 'td');
    if (live) {
      const content = doc.createElement('div'); content.className = 'table-cell-wrapper'; content.textContent = value; cell.append(content);
    } else cell.textContent = value;
    row.append(cell);
  });
  append(head, splitRow(lines[line]!), true);
  const body = table.createTBody();
  for (let i = line + 2; i < lines.length && lines[i]?.includes('|') && lines[i]?.trim(); i++) {
    append(body.insertRow(), splitRow(lines[i]!), false);
  }
  if (live) {
    const addHandle = (cell: HTMLTableCellElement, axis: 'col' | 'row') => {
      const handle = doc.createElement('div'); handle.className = `table-${axis}-drag-handle`;
      handle.setAttribute('aria-label', axis === 'col' ? '选择整列' : '选择整行');
      handle.addEventListener('pointerdown', evt => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        if (axis === 'col') {
          (window as any).nativeColumnSelections = ((window as any).nativeColumnSelections ?? 0) + 1;
          Array.from(table.rows).forEach(row => row.cells[cell.cellIndex]?.classList.add('is-selected'));
        }
      });
      handle.addEventListener('contextmenu', evt => {
        const menu = Menu.forEvent(evt);
        (window as any).nativeMenu = menu;
        (window as any).nativeShowOriginal = Menu.prototype.showAtMouseEvent;
        if (axis === 'col') menu.addItem(item => item.setTitle('按列升序 (A-Z)'));
        menu.addItem(item => item.setTitle(axis === 'col' ? '在左侧新增列' : '在上方新增行'));
        menu.addItem(item => item.setTitle(axis === 'col' ? '向右移动列' : '向下移动行'));
        menu.addItem(item => item.setTitle(axis === 'col' ? '删除列' : '删除行').onClick(() => { (window as any).nativeMenuAction = axis; }));
        menu.showAtMouseEvent(evt);
        menu.onHide(() => table.querySelectorAll('.is-selected').forEach(cell => cell.classList.remove('is-selected')));
      });
      cell.append(handle);
    };
    Array.from(head.cells).forEach(cell => addHandle(cell, 'col'));
    Array.from(table.rows).forEach(row => addHandle(row.cells[0]!, 'row'));
    table.addEventListener('contextmenu', evt => {
      if (evt.defaultPrevented) return;
      const menu = new Menu(); menu.addItem(item => item.setTitle('原生单元格操作'));
      events.get('editor-menu')?.forEach(fn => fn(menu, {}, { file: { path } }));
      menu.showAtMouseEvent(evt); evt.preventDefault();
    });
  }
  return table;
}

/** 测试中的此组件模拟 Obsidian 自己拥有的表格组件。生产代码不替换它。 */
class NativeTable extends WidgetType {
  constructor(private readonly source: string, private readonly line: number) { super(); }
  toDOM(): HTMLElement {
    const widget = document.createElement('div'); widget.className = 'cm-table-widget';
    const wrapper = document.createElement('div'); wrapper.className = 'table-wrapper';
    wrapper.append(tableDOM(document, this.source, this.line, true)); widget.append(wrapper); return widget;
  }
  ignoreEvent(): boolean { return false; }
}

function widgets(state: EditorState): DecorationSet {
  const source = state.doc.toString();
  return Decoration.set(tablesIn(source.split('\n')).map(table => {
    const start = state.doc.line(table.line + 1).from;
    let endLine = table.line + 2;
    while (endLine < state.doc.lines && state.doc.line(endLine + 1).text.includes('|')) endLine++;
    const end = state.doc.line(endLine).to;
    return Decoration.replace({ widget: new NativeTable(source, table.line), block: true }).range(start, end);
  }));
}
const nativeTables = StateField.define<DecorationSet>({
  create: widgets,
  update: (value, tr) => tr.docChanged || tr.effects.some(effect => effect.is(rewidget)) ? widgets(tr.state) : value,
  provide: field => EditorView.decorations.from(field),
});

function on(name: string, fn: (...args: any[]) => void) {
  const listeners = events.get(name) ?? new Set(); listeners.add(fn); events.set(name, listeners);
  return { off: () => listeners.delete(fn) };
}

function renderReading(): void {
  runtime.renderChildren.splice(0).forEach(child => child.onunload());
  const sizer = reading.containerEl.querySelector('.markdown-preview-sizer')!;
  sizer.replaceChildren();
  const paragraph = document.createElement('p'); paragraph.className = 'text-reference'; paragraph.textContent = '正文宽度参考'; sizer.append(paragraph);
  const source = reading.source;
  for (const table of tablesIn(source.split('\n'))) {
    const block = document.createElement('div'); block.className = 'el-table';
    block.append(tableDOM(document, source, table.line, false));
    for (const process of runtime.processors) process(block, {
      sourcePath: path, frontmatter: optOut ? { cssclasses: ['tws-off'] } : {},
      getSectionInfo: () => ({ text: source, lineStart: table.line, lineEnd: table.line + 3 }),
      addChild: (child: any) => runtime.renderChildren.push(child),
    });
    sizer.append(block);
  }
}

async function boot(options: { note?: string; saved?: any; filename?: string; optOut?: boolean } = {}): Promise<void> {
  cellEditor?.destroy(); cellEditor = undefined;
  if (plugin) { plugin.unload(); editor?.destroy(); }
  runtime.saved = options.saved ?? null;
  events.clear();
  path = options.filename ?? '测试.md';
  optOut = options.optOut ?? false;
  const note = options.note ?? DEFAULT_NOTE;
  document.body.innerHTML = '<div id="reading" class="pane"><div class="markdown-preview-view is-readable-line-width"><div class="markdown-preview-sizer"></div></div></div><div id="live" class="pane"><div class="markdown-source-view mod-cm6 is-live-preview is-readable-line-width"></div></div>';
  reading = new MarkdownView(document.querySelector('#reading .markdown-preview-view')!, 'preview', note);
  sourceView = new MarkdownView(document.querySelector('#live .markdown-source-view')!, 'source', note);
  if (optOut) sourceView.containerEl.classList.add('tws-off');
  reading.previewMode = { getScroll: () => 0, applyScroll: () => {}, set: () => renderReading() };
  const app = {
    workspace: {
      iterateAllLeaves: (fn: any) => [reading, sourceView].forEach(view => fn({ view })),
      getActiveViewOfType: () => activeMode === 'reading' ? reading : sourceView,
      onLayoutReady: (fn: any) => fn(), on,
    },
    vault: { on },
  };
  plugin = new TableWidthScrollPlugin(app as any);
  await plugin.onload();
  editor = new EditorView({
    state: EditorState.create({ doc: note, extensions: [filePath.of(path), editorInfoField, nativeTables, ...runtime.extensions] }),
    parent: sourceView.containerEl,
  });
  (window as any).nativePointerDowns = 0;
  (window as any).nativeColumnSelections = 0;
  sourceView.containerEl.addEventListener('pointerdown', () => { (window as any).nativePointerDowns++; });
  await new Promise(resolve => setTimeout(resolve, 100));
}

(window as any).harness = {
  boot,
  rerender: () => { renderReading(); editor?.dispatch({ effects: rewidget.of(null) }); },
  update: (source: string) => {
    reading.source = source; sourceView.source = source;
    editor?.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
    renderReading();
  },
  saved: () => structuredClone(runtime.saved),
  unload: () => { plugin.unload(); editor?.destroy(); editor = undefined; },
  toggle: (enabled: boolean) => plugin.setEnabled(enabled),
  reset: () => runtime.commands[0].callback(),
  resetFreezes: () => runtime.commands.find(command => command.id === 'reset-frozen-columns').callback(),
  defaultFreeze: (count: number) => plugin.setDefaultFrozenColumns(count),
  freezeValue: (mode: string, index = 0) => {
    const table = document.querySelectorAll(`#${mode} table`)[index]!;
    const count = plugin.freezes.override(table.getAttribute('data-tws-key')!);
    return count === undefined ? 'default' : String(count);
  },
  commandFreeze: (mode = 'live') => {
    activeMode = mode;
    return runtime.commands.find(command => command.id === 'set-frozen-columns').checkCallback(false);
  },
  startCellEditor: () => {
    const parent = sourceView.containerEl.querySelector<HTMLElement>('tbody td .table-cell-wrapper')!;
    const doc = parent.textContent ?? '';
    parent.replaceChildren();
    cellEditor = new EditorView({ state: EditorState.create({ doc, extensions: [EditorView.lineWrapping] }), parent });
    cellEditor.focus();
  },
  source: () => editor?.state.doc.toString(),
  defaultNote: DEFAULT_NOTE,
  emit: (name: string, ...args: any[]) => events.get(name)?.forEach(fn => fn(...args)),
};
