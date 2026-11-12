import { Facet, StateField } from '@codemirror/state';

export const filePath = Facet.define<string, string>({ combine: paths => paths[0] ?? '测试.md' });
export const editorInfoField = StateField.define({ create: state => ({ file: { path: state.facet(filePath) } }), update: value => value });
export const runtime = {
  saved: null as any,
  processors: [] as any[],
  extensions: [] as any[],
  commands: [] as any[],
  notices: [] as string[],
  renderChildren: [] as MarkdownRenderChild[],
};
export class Notice { constructor(message: string) { runtime.notices.push(message); } }
export class MarkdownRenderChild {
  constructor(public containerEl: HTMLElement) {}
  onunload(): void {}
}
export class MarkdownView {
  previewMode: any;
  constructor(public containerEl: HTMLElement, public mode: string, public source: string) {}
  getMode(): string { return this.mode; }
  getViewData(): string { return this.source; }
}
export class Plugin {
  private readonly cleanup: (() => void)[] = [];
  constructor(public app: any) {}
  async loadData(): Promise<unknown> { return structuredClone(runtime.saved); }
  async saveData(data: unknown): Promise<void> { runtime.saved = structuredClone(data); }
  register(fn: () => void): void { this.cleanup.push(fn); }
  registerEvent(event: any): void { this.register(() => event.off()); }
  registerMarkdownPostProcessor(fn: any): void { runtime.processors.push(fn); }
  registerEditorExtension(extension: any): void { runtime.extensions.push(extension); }
  addSettingTab(_tab: unknown): void {}
  addCommand(command: unknown): void { runtime.commands.push(command); }
  unload(): void {
    this.cleanup.reverse().forEach(fn => fn());
    runtime.renderChildren.splice(0).forEach(child => child.onunload());
    runtime.processors = []; runtime.extensions = []; runtime.commands = [];
  }
}
export class PluginSettingTab {
  containerEl = document.createElement('div');
  constructor(_app: unknown, _plugin: unknown) {}
}
export class Setting {
  constructor(_el: HTMLElement) {}
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addToggle(fn: any): this {
    const toggle = { setValue: () => toggle, onChange: () => toggle };
    fn(toggle); return this;
  }
  addText(fn: any): this {
    const text = { setValue: () => text, onChange: () => text };
    fn(text); return this;
  }
}
export class App {}

export class MenuItem {
  title = '';
  section = '';
  checked: boolean | undefined;
  disabled = false;
  callback: (() => void) | undefined;
  setTitle(value: string): this { this.title = value; return this; }
  setSection(value: string): this { this.section = value; return this; }
  setIcon(_value: string): this { return this; }
  setChecked(value: boolean): this { this.checked = value; return this; }
  setDisabled(value: boolean): this { this.disabled = value; return this; }
  onClick(callback: () => void): this { this.callback = callback; return this; }
}

/** 模拟原生 forEvent 共享实例和已显示菜单不允许 addItem 的约束。 */
export class Menu {
  private static readonly events = new WeakMap<Event, Menu>();
  readonly items: (MenuItem | null)[] = [];
  private loaded = false;
  private dom: HTMLElement | undefined;
  private hidden: (() => void) | undefined;
  static forEvent(evt: MouseEvent): Menu {
    evt.preventDefault();
    let menu = Menu.events.get(evt);
    if (!menu) {
      menu = new Menu(); Menu.events.set(evt, menu);
      const own = menu;
      setTimeout(() => own.showAtMouseEvent(evt));
    }
    return menu;
  }
  addItem(callback: (item: MenuItem) => void): this {
    if (!this.loaded) { const item = new MenuItem(); this.items.push(item); callback(item); }
    return this;
  }
  addSeparator(): this { if (!this.loaded) this.items.push(null); return this; }
  onHide(callback: () => void): void { this.hidden = callback; }
  showAtMouseEvent(evt: MouseEvent): this {
    this.unload();
    const doc = (evt.target as Node | null)?.ownerDocument ?? document;
    const dom = doc.createElement('div'); dom.className = 'menu'; dom.setAttribute('role', 'menu');
    dom.style.cssText = `position:fixed;left:${Math.min(evt.clientX || 50, 900)}px;top:50px;z-index:1000;background:white;padding:8px;`;
    for (const item of this.items) {
      if (!item) { const separator = doc.createElement('hr'); dom.append(separator); continue; }
      const button = doc.createElement('button'); button.className = 'menu-item';
      button.textContent = item.title; button.dataset.section = item.section;
      button.disabled = item.disabled; button.style.display = 'block';
      button.setAttribute('role', 'menuitem');
      if (item.checked !== undefined) button.setAttribute('aria-checked', String(item.checked));
      button.addEventListener('click', () => { this.hide(); item.callback?.(); });
      dom.append(button);
    }
    dom.addEventListener('keydown', evt => { if (evt.key === 'Escape') this.hide(); });
    doc.body.append(dom); this.dom = dom; this.loaded = true;
    return this;
  }
  hide(): void {
    if (!this.loaded) return;
    this.unload(); this.hidden?.();
  }
  unload(): void {
    this.dom?.remove(); this.dom = undefined; this.loaded = false;
  }
}

export abstract class SuggestModal<T> {
  private placeholder = '';
  private dom: HTMLElement | undefined;
  constructor(_app: unknown) {}
  abstract getSuggestions(query: string): T[];
  abstract renderSuggestion(item: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T): void;
  setPlaceholder(value: string): void { this.placeholder = value; }
  onClose(): void {}
  open(): void {
    const dom = document.createElement('div'); dom.className = 'modal-container';
    dom.style.cssText = 'position:fixed;inset:0;z-index:1100;background:#ffffffee;padding:40px;overflow:auto;';
    const input = document.createElement('input'); input.className = 'prompt-input'; input.placeholder = this.placeholder;
    const list = document.createElement('div'); dom.append(input, list);
    let selected = 0;
    let choices: T[] = [];
    const choose = (item: T) => { this.close(); this.onChooseSuggestion(item); };
    const render = () => {
      choices = this.getSuggestions(input.value); list.replaceChildren();
      choices.forEach((item, index) => {
        const button = document.createElement('button'); button.className = 'suggestion-item'; button.style.display = 'block';
        if (index === selected) button.classList.add('is-selected');
        this.renderSuggestion(item, button); button.addEventListener('click', () => choose(item)); list.append(button);
      });
    };
    input.addEventListener('input', () => { selected = 0; render(); });
    input.addEventListener('keydown', evt => {
      evt.stopPropagation();
      if (evt.key === 'Escape') this.close();
      else if (evt.key === 'Enter' && choices[selected] !== undefined) { evt.preventDefault(); choose(choices[selected]!); }
      else if (evt.key === 'ArrowDown') { evt.preventDefault(); selected = Math.min(selected + 1, choices.length - 1); render(); }
    });
    render(); document.body.append(dom); this.dom = dom; input.focus();
  }
  close(): void { if (this.dom) { this.dom.remove(); this.dom = undefined; this.onClose(); } }
}
