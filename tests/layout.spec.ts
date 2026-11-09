import { expect, test, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function open(page: Page, options: any = {}) {
  await page.setContent('<html><head></head><body></body></html>');
  await page.addStyleTag({ content: await readFile(path.resolve('tests/fixture.css'), 'utf8') });
  await page.addStyleTag({ content: await readFile(path.resolve('styles.css'), 'utf8') });
  await page.addScriptTag({ path: path.resolve('tests/.generated/harness.js') });
  await page.evaluate(options => (window as any).harness.boot(options), options);
  await expect(page.locator('table.tws-table')).toHaveCount(options.optOut || options.saved?.enabled === false ? 0 : 2);
}

async function sizes(page: Page, mode: string) {
  return page.locator(`#${mode} table`).evaluate((table: HTMLTableElement) => {
    const wrapper = table.closest('.tws-scroll') as HTMLElement;
    return {
      columns: [...table.tHead!.rows[0]!.cells].map(cell => cell.getBoundingClientRect().width),
      table: table.getBoundingClientRect().width,
      wrapper: wrapper.getBoundingClientRect().width,
      left: wrapper.getBoundingClientRect().left,
      client: wrapper.clientWidth, scroll: wrapper.scrollWidth, scrollLeft: wrapper.scrollLeft,
      outerOverflow: wrapper.closest('.pane')!.scrollWidth > wrapper.closest('.pane')!.clientWidth,
    };
  });
}

async function drag(page: Page, mode: string, delta: number, column = 0) {
  const handle = page.locator(`#${mode} .tws-resize-handle`).nth(column);
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

for (const mode of ['reading', 'live']) {
  test(`${mode}: 默认与正文等宽，拖宽一列后其他列保持原宽并产生滚动`, async ({ page }) => {
    await open(page);
    const before = await sizes(page, mode);
    expect(before.wrapper).toBeCloseTo(560, 0);
    expect(before.table).toBeCloseTo(before.wrapper, 0);
    await drag(page, mode, 180);
    const after = await sizes(page, mode);
    expect(after.columns[0]! - before.columns[0]!).toBeCloseTo(180, 0);
    expect(Math.abs(after.columns[1]! - before.columns[1]!)).toBeLessThan(1);
    expect(Math.abs(after.columns[2]! - before.columns[2]!)).toBeLessThan(1);
    expect(after.wrapper).toBeCloseTo(560, 0);
    expect(after.scroll).toBeGreaterThan(after.client + 150);
    expect(after.outerOverflow).toBe(false);
    const otherMode = mode === 'reading' ? 'live' : 'reading';
    const other = await sizes(page, otherMode);
    expect(Math.abs(other.columns[0]! - after.columns[0]!)).toBeLessThan(2);
  });

  test(`${mode}: 可以滚动到最后一列，底部滚动条存在`, async ({ page }) => {
    await open(page);
    await drag(page, mode, 280);
    const result = await page.locator(`#${mode} .tws-scroll`).evaluate((el: HTMLElement) => {
      el.scrollLeft = el.scrollWidth;
      const cell = el.querySelector('thead tr')!.lastElementChild!;
      return { left: el.scrollLeft, end: cell.getBoundingClientRect().right,
        right: el.getBoundingClientRect().right, overflow: getComputedStyle(el).overflowX };
    });
    expect(result.left).toBeGreaterThan(200);
    expect(Math.abs(result.end - result.right)).toBeLessThan(2);
    expect(result.overflow).toBe('scroll');
  });

  test(`${mode}: 窄窗口与正文宽度改变后容器仍受正文约束`, async ({ page }) => {
    await open(page);
    await drag(page, mode, 220);
    await page.addStyleTag({ content: '.pane { width: 420px; } :root { --file-line-width: 280px; }' });
    await page.waitForTimeout(100);
    const result = await sizes(page, mode);
    expect(result.wrapper).toBeCloseTo(280, 0);
    expect(result.scroll).toBeGreaterThan(result.client);
    expect(result.outerOverflow).toBe(false);
  });

  test(`${mode}: Escape 和 pointercancel 撤销拖动，不保存临时宽度`, async ({ page }) => {
    await open(page);
    const before = await sizes(page, mode);
    const handle = page.locator(`#${mode} .tws-resize-handle`).first();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + 8); await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 8);
    await page.keyboard.press('Escape'); await page.mouse.up();
    expect((await sizes(page, mode)).table).toBeCloseTo(before.table, 0);
    expect(await page.evaluate(() => (window as any).harness.saved())).toBeNull();
    await handle.dispatchEvent('pointerdown', { pointerId: 42, isPrimary: true, button: 0, pointerType: 'touch', clientX: 200 });
    await handle.dispatchEvent('pointermove', { pointerId: 42, clientX: 300 });
    await handle.dispatchEvent('pointercancel', { pointerId: 42 });
    expect((await sizes(page, mode)).table).toBeCloseTo(before.table, 0);
  });
}

test('保存的列宽在组件重建和插件重新加载后恢复', async ({ page }) => {
  await open(page); await drag(page, 'live', 200);
  const before = await sizes(page, 'live');
  await page.evaluate(() => (window as any).harness.rerender());
  await page.waitForTimeout(100);
  expect((await sizes(page, 'live')).table).toBeCloseTo(before.table, 0);
  const saved = await page.evaluate(() => (window as any).harness.saved());
  await page.evaluate(saved => (window as any).harness.boot({ saved }), saved);
  expect((await sizes(page, 'reading')).table).toBeCloseTo(before.table, 0);
  expect((await sizes(page, 'live')).table).toBeCloseTo(before.table, 0);
});

test('方向键微调，Home 和双击恢复默认宽度', async ({ page }) => {
  await open(page); await drag(page, 'reading', 160);
  const before = await sizes(page, 'reading');
  await page.locator('#reading .tws-resize-handle').first().focus();
  await page.keyboard.press('ArrowRight');
  expect((await sizes(page, 'reading')).columns[0]!).toBeGreaterThan(before.columns[0]!);
  await page.keyboard.press('Home');
  expect((await sizes(page, 'live')).table).toBeCloseTo(560, 0);
  await drag(page, 'live', 120);
  await page.locator('#live .tws-resize-handle').first().dblclick();
  expect((await sizes(page, 'reading')).table).toBeCloseTo(560, 0);
});

test('编辑单元格的普通输入不会被插件拦截', async ({ page }) => {
  await open(page);
  await page.locator('#live tbody td').first().click({ position: { x: 20, y: 10 } });
  expect(await page.evaluate(() => (window as any).nativePointerDowns)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).harness.saved())).toBeNull();
});

test('多次渲染不会重复手柄，开关和卸载清理所有装饰', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 3; i++) await page.evaluate(() => (window as any).harness.rerender());
  await page.waitForTimeout(100);
  await expect(page.locator('.tws-resize-handle')).toHaveCount(6);
  await page.evaluate(() => (window as any).harness.toggle(false));
  await expect(page.locator('.tws-resize-handle')).toHaveCount(0);
  await expect(page.locator('.tws-scroll')).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.toggle(true));
  await page.waitForTimeout(100);
  await expect(page.locator('.tws-resize-handle')).toHaveCount(6);
  await page.evaluate(() => (window as any).harness.unload());
  await expect(page.locator('.tws-scroll,.tws-resize-handle,.tws-colgroup')).toHaveCount(0);
  expect(await page.locator('body').getAttribute('class')).not.toContain('tws-enabled');
});

test('大量列的默认表格保留最小宽度，可以滚动到最后', async ({ page }) => {
  const row = '| ' + Array.from({ length: 20 }, (_, i) => `列${i}`).join(' | ') + ' |';
  const delimiter = '| ' + Array(20).fill('---').join(' | ') + ' |';
  await open(page, { note: `${row}\n${delimiter}\n${row}` });
  for (const mode of ['reading', 'live']) {
    const result = await sizes(page, mode);
    expect(result.scroll).toBeGreaterThan(result.client);
    expect(result.outerOverflow).toBe(false);
  }
});

test('组件在拖动时被替换会撤销，不遗留拖动状态', async ({ page }) => {
  await open(page);
  const box = (await page.locator('#live .tws-resize-handle').first().boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 8); await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 8);
  await page.evaluate(() => (window as any).harness.rerender());
  await page.waitForTimeout(100); await page.mouse.up();
  await expect(page.locator('.tws-dragging')).toHaveCount(0);
  expect((await sizes(page, 'live')).table).toBeCloseTo(560, 0);
  expect(await page.evaluate(() => (window as any).harness.saved())).toBeNull();
});

test('正文编辑保留列宽，表头改变后使用默认宽度', async ({ page }) => {
  await open(page); await drag(page, 'live', 180);
  const width = (await sizes(page, 'live')).table;
  await page.evaluate(() => {
    const h = (window as any).harness;
    h.update(h.defaultNote.replace('中文内容与普通文本', '重新编辑的正文'));
  });
  await page.waitForTimeout(100);
  expect((await sizes(page, 'live')).table).toBeCloseTo(width, 0);
  await page.evaluate(() => {
    const h = (window as any).harness;
    h.update(h.defaultNote.replace('项目', '新表头'));
  });
  await page.waitForTimeout(100);
  expect((await sizes(page, 'live')).table).toBeCloseTo(560, 0);
});

test('每笔记停用和保存的停用状态在两种视图都有效', async ({ page }) => {
  await open(page, { optOut: true });
  await expect(page.locator('.tws-scroll')).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.boot({ saved: { enabled: false, widths: {} } }));
  await expect(page.locator('.tws-resize-handle')).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.toggle(true));
  await page.waitForTimeout(100);
  await expect(page.locator('.tws-resize-handle')).toHaveCount(6);
});

test('往左拖可缩窄列宽，表格调整不改写 Markdown 文本', async ({ page }) => {
  await open(page); await drag(page, 'live', 150);
  const before = await sizes(page, 'live');
  const source = await page.evaluate(() => (window as any).harness.source());
  await drag(page, 'live', -100);
  const after = await sizes(page, 'live');
  expect(before.columns[0]! - after.columns[0]!).toBeCloseTo(100, 0);
  expect(Math.abs(before.columns[1]! - after.columns[1]!)).toBeLessThan(1);
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(source);
});

test('重置命令在拖动期间撤销旧手势，不重新保存旧列宽', async ({ page }) => {
  await open(page); await drag(page, 'live', 160);
  const box = (await page.locator('#live .tws-resize-handle').first().boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 8); await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 8);
  await page.evaluate(() => (window as any).harness.reset());
  await page.mouse.up();
  expect((await sizes(page, 'live')).table).toBeCloseTo(560, 0);
  expect(await page.evaluate(() => (window as any).harness.saved().widths)).toEqual({});
});
