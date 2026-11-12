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
