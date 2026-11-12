import { expect, test, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const NOTE = '| 项目 | 类型 | 数据 | 备注 | 日期 | 状态 | 作者 | 来源 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 中文 A | 分类 | 123 | 说明 | 今天 | 完成 | 作者 | 最后一列 |\n| 中文 B | 分类 | 456 | 更多 | 昨天 | 完成 | 作者 | 最后一列 |';

async function openTableMenu(page: Page, mode: string, index = 0) {
  const table = page.locator(`#${mode} table`).nth(index);
  await (mode === 'live' ? table.locator('.table-col-drag-handle').first() : table.locator('th').first())
    .dispatchEvent('contextmenu', { button: 2, clientX: 400, clientY: 100 });
  await page.waitForTimeout(25);
}

async function setFreeze(page: Page, mode: string, value: string, index = 0) {
  await openTableMenu(page, mode, index);
  await page.locator('.menu-item').filter({ hasText: /^冻结列设置…$/ }).click();
  const label = value === 'default' ? '跟随全局默认' : value === '0' ? '不冻结' :
    value === '1' ? '冻结第一列' : `冻结前 ${value} 列`;
  await page.locator('.suggestion-item').filter({ hasText: label }).click();
}

async function freezeValue(page: Page, mode: string, index = 0): Promise<string> {
  return page.evaluate(({ mode, index }) => (window as any).harness.freezeValue(mode, index), { mode, index });
}

async function open(page: Page, options: any = {}) {
  await page.setContent('<html><head></head><body></body></html>');
  await page.addStyleTag({ content: await readFile(path.resolve('tests/fixture.css'), 'utf8') });
  await page.addStyleTag({ content: await readFile(path.resolve('styles.css'), 'utf8') });
  await page.addScriptTag({ path: path.resolve('tests/.generated/harness.js') });
  await page.evaluate(options => (window as any).harness.boot(options), { note: NOTE, ...options });
}

async function geometry(page: Page, mode: string) {
  return page.locator(`#${mode} table`).evaluate((table: HTMLTableElement) => {
    const wrapper = table.closest('.tws-scroll') as HTMLElement;
    return {
      left: wrapper.getBoundingClientRect().left, right: wrapper.getBoundingClientRect().right,
      scrollLeft: wrapper.scrollLeft, count: Number(table.dataset.twsFrozenCount),
      cells: [...table.tHead!.rows[0]!.cells].map(cell => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, position: getComputedStyle(cell).position };
      }),
    };
  });
}

async function scroll(page: Page, mode: string, value = 10000) {
  await page.locator(`#${mode} .tws-scroll`).evaluate((el: HTMLElement, value) => { el.scrollLeft = value; }, value);
  await page.waitForTimeout(60);
}

async function drag(page: Page, mode: string, column: number, delta: number) {
  const box = (await page.locator(`#${mode} .tws-resize-handle`).nth(column).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

for (const mode of ['reading', 'live']) {
  test(`${mode}: 默认首列固定，前两列可冻结且最后一列仍可到达`, async ({ page }) => {
    await open(page);
    await drag(page, mode, 7, 250);
    const before = await geometry(page, mode);
    await scroll(page, mode);
    const first = await geometry(page, mode);
    expect(first.count).toBe(1);
    expect(first.scrollLeft).toBeGreaterThan(150);
    expect(Math.abs(first.cells[0]!.left - before.cells[0]!.left)).toBeLessThan(2);
    expect(Math.abs(first.cells[7]!.right - first.right)).toBeLessThan(2);
    await setFreeze(page, mode, '2');
    const two = await geometry(page, mode);
    expect(two.count).toBe(2);
    expect(Math.abs(two.cells[1]!.left - two.cells[0]!.right)).toBeLessThan(1);
    expect(two.cells[0]!.position).toBe('sticky');
    expect(two.cells[1]!.position).toBe('sticky');
    expect(two.cells[2]!.position).toBe('relative');
    await expect(page.locator(`#${mode} tbody .tws-frozen-cell`)).toHaveCount(4);
    expect(Math.abs(two.cells[7]!.right - two.right)).toBeLessThan(2);
    await expect(page.locator('.tws-freeze-toolbar,.tws-freeze-select')).toHaveCount(0);
  });

  test(`${mode}: 滚动后拖宽冻结列，后续冻结位置即时更新，取消恢复`, async ({ page }) => {
    await open(page);
    await drag(page, mode, 7, 250);
    await setFreeze(page, mode, '2');
    await scroll(page, mode, 150);
    const before = await geometry(page, mode);
    await drag(page, mode, 0, 40);
    const after = await geometry(page, mode);
    expect(after.cells[0]!.width - before.cells[0]!.width).toBeCloseTo(40, 0);
    expect(Math.abs(after.cells[1]!.left - after.cells[0]!.right)).toBeLessThan(1);
    expect(Math.abs(after.cells[1]!.width - before.cells[1]!.width)).toBeLessThan(1);
    const handle = page.locator(`#${mode} .tws-resize-handle`).first();
    await handle.dispatchEvent('pointerdown', { pointerId: 51, isPrimary: true, button: 0, pointerType: 'touch', clientX: 200 });
    await scroll(page, mode, 200);
    await handle.dispatchEvent('pointermove', { pointerId: 51, clientX: 220 });
    const moving = await geometry(page, mode);
    expect(moving.cells[0]!.width - after.cells[0]!.width).toBeCloseTo(20, 0);
    await handle.dispatchEvent('pointercancel', { pointerId: 51 });
    const cancelled = await geometry(page, mode);
    expect(Math.abs(cancelled.cells[0]!.width - after.cells[0]!.width)).toBeLessThan(1);
    expect(Math.abs(cancelled.cells[1]!.left - cancelled.cells[0]!.right)).toBeLessThan(1);
  });

  test(`${mode}: 窄窗口减少生效列数，恢复窗口保留原选择`, async ({ page }) => {
    await open(page);
    await drag(page, mode, 0, 100);
    await setFreeze(page, mode, '3');
    expect((await geometry(page, mode)).count).toBe(3);
    await page.addStyleTag({ content: ':root { --file-line-width: 160px; }' });
    await expect(page.locator(`#${mode} table`)).toHaveAttribute('data-tws-frozen-count', '0');
    expect(await freezeValue(page, mode)).toBe('3');
    await openTableMenu(page, mode);
    await expect(page.locator('.menu')).toContainText('当前冻结 0 列（空间或列数受限）');
    await page.locator('.menu').dispatchEvent('keydown', { key: 'Escape' });
    await page.addStyleTag({ content: ':root { --file-line-width: 560px; }' });
    await expect(page.locator(`#${mode} table`)).toHaveAttribute('data-tws-frozen-count', '3');
    await scroll(page, mode);
    const restored = await geometry(page, mode);
    expect(Math.abs(restored.cells[2]!.left - restored.cells[1]!.right)).toBeLessThan(1);
  });

  test(`${mode}: 单元格节点、链接和普通输入保持原生所有权`, async ({ page }) => {
    await open(page);
    await page.locator(`#${mode} table`).evaluate(table => {
      (window as any).originalCells = [...table.querySelectorAll('th,td')];
      const content = table.querySelector('tbody td .table-cell-wrapper') ?? table.querySelector('tbody td')!;
      const link = document.createElement('a'); link.textContent = '原生链接'; link.href = '#native';
      link.addEventListener('click', () => { (window as any).nativeLinkClicks = 1; });
      content.append(link);
    });
    await setFreeze(page, mode, '2');
    expect(await page.locator(`#${mode} table`).evaluate(table => [...table.querySelectorAll('th,td')].every(
      (cell, index) => cell === (window as any).originalCells[index],
    ))).toBe(true);
    await page.locator(`#${mode} tbody a`).dispatchEvent('click');
    expect(await page.evaluate(() => (window as any).nativeLinkClicks)).toBe(1);
    if (mode === 'live') {
      await page.locator('#live tbody td').first().click({ position: { x: 20, y: 10 } });
      expect(await page.evaluate(() => (window as any).nativePointerDowns)).toBeGreaterThan(0);
    }
  });
}

test('每表选择跨视图同步并持久化；不冻结与跟随默认区别明确', async ({ page }) => {
  await open(page);
  await setFreeze(page, 'reading', '2');
  await expect.poll(() => freezeValue(page, 'live')).toBe('2');
  await page.evaluate(() => (window as any).harness.rerender());
  await expect.poll(() => freezeValue(page, 'live')).toBe('2');
  const saved = await page.evaluate(() => (window as any).harness.saved());
  await page.evaluate(({ saved, note }) => (window as any).harness.boot({ saved, note }), { saved, note: NOTE });
  await expect.poll(() => freezeValue(page, 'reading')).toBe('2');
  await setFreeze(page, 'live', '0');
  await page.evaluate(() => (window as any).harness.defaultFreeze(3));
  await expect(page.locator('#reading table')).toHaveAttribute('data-tws-frozen-count', '0');
  await setFreeze(page, 'live', 'default');
  await expect(page.locator('#reading table')).toHaveAttribute('data-tws-frozen-count', '3');
  expect(await page.evaluate(() => (window as any).harness.saved().frozenColumns)).toEqual({});
});

test('相同表头的不同表格分别保存，同一表格的两个视图同步', async ({ page }) => {
  await open(page, { note: NOTE + '\n\n另一张表\n\n' + NOTE });
  await setFreeze(page, 'reading', '2', 1);
  await expect(page.locator('#reading table').nth(0)).toHaveAttribute('data-tws-frozen-count', '1');
  await expect(page.locator('#live table').nth(0)).toHaveAttribute('data-tws-frozen-count', '1');
  await expect.poll(() => freezeValue(page, 'live', 1)).toBe('2');
});

test('冻结、取消、重置及重建不改写 Markdown 的 UTF-8 字节', async ({ page }) => {
  await open(page);
  const bytes = await page.evaluate(() => [...new TextEncoder().encode((window as any).harness.source())]);
  await setFreeze(page, 'live', '2');
  await drag(page, 'live', 0, 70);
  await scroll(page, 'live');
  await setFreeze(page, 'reading', '0');
  await page.evaluate(() => (window as any).harness.reset());
  await page.evaluate(() => (window as any).harness.rerender());
  await page.waitForTimeout(60);
  expect(await page.evaluate(() => [...new TextEncoder().encode((window as any).harness.source())])).toEqual(bytes);
  const saved = await page.evaluate(() => (window as any).harness.saved());
  expect(Object.values(saved.frozenColumns)).toEqual([0]);
  expect(saved.widths).toEqual({});
  await page.evaluate(({ saved, note }) => (window as any).harness.boot({ saved, note }), { saved, note: NOTE });
  expect(await page.evaluate(() => [...new TextEncoder().encode((window as any).harness.source())])).toEqual(bytes);
});

test('全局冻结重置独立于列宽；全局默认保存并在重启后恢复', async ({ page }) => {
  await open(page);
  await drag(page, 'reading', 7, 100);
  await setFreeze(page, 'reading', '0');
  const widths = await page.evaluate(() => (window as any).harness.saved().widths);
  await page.evaluate(() => { (window as any).harness.defaultFreeze(2); (window as any).harness.resetFreezes(); });
  await expect.poll(() => freezeValue(page, 'live')).toBe('default');
  const saved = await page.evaluate(() => (window as any).harness.saved());
  expect(saved.widths).toEqual(widths);
  expect(saved.frozenColumns).toEqual({});
  expect(saved.defaultFrozenColumns).toBe(2);
  await page.evaluate(({ saved, note }) => (window as any).harness.boot({ saved, note }), { saved, note: NOTE });
  await expect(page.locator('#live table')).toHaveAttribute('data-tws-frozen-count', '2');
});

test('重建、关闭及卸载完整清理冻结控件、样式与尺寸观察', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 3; i++) await page.evaluate(() => (window as any).harness.rerender());
  await expect(page.locator('table[data-tws-frozen-count]')).toHaveCount(2);
  await page.evaluate(() => (window as any).harness.toggle(false));
  await expect(page.locator('.tws-freeze-toolbar,.tws-frozen-cell,[data-tws-frozen-count]')).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.toggle(true));
  await expect(page.locator('table[data-tws-frozen-count]')).toHaveCount(2);
  await page.evaluate(() => (window as any).harness.unload());
  await page.waitForTimeout(60);
  await expect(page.locator('.tws-freeze-toolbar,.tws-frozen-cell,[data-tws-frozen-count]')).toHaveCount(0);
  expect(await page.locator('#reading table').evaluate(table => table.outerHTML)).not.toContain('--tws-freeze-left');
});

test('字体变化后重新测量偏移，滚动状态下不累积偏移', async ({ page }) => {
  await open(page);
  await drag(page, 'live', 7, 200);
  await setFreeze(page, 'live', '2');
  await scroll(page, 'live', 100);
  await page.addStyleTag({ content: 'table { font: 20px monospace !important; }' });
  await page.waitForTimeout(100);
  const changed = await geometry(page, 'live');
  expect(Math.abs(changed.cells[1]!.left - changed.cells[0]!.right)).toBeLessThan(1);
  await scroll(page, 'live', 200);
  await setFreeze(page, 'live', '3');
  const repeated = await geometry(page, 'live');
  expect(Math.abs(repeated.cells[0]!.left - changed.cells[0]!.left)).toBeLessThan(1);
  expect(Math.abs(repeated.cells[1]!.left - repeated.cells[0]!.right)).toBeLessThan(1);
});

test('冻结设置命令弹窗可用键盘操作，不向原生编辑器发送输入', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => (window as any).harness.source());
  await page.evaluate(() => (window as any).harness.commandFreeze());
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(() => freezeValue(page, 'reading')).toBe('0');
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(before);
  expect(await page.evaluate(() => (window as any).nativePointerDowns)).toBe(0);
});

test('原生 widget 重建后旧 ResizeObserver 释放，卸载后没有遗留观察器', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const active = new Set<ResizeObserver>();
    (window as any).activeFrozenObservers = active;
    const Native = window.ResizeObserver;
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) { super(callback); active.add(this); }
      disconnect(): void { super.disconnect(); active.delete(this); }
    };
  });
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => (window as any).harness.rerender());
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => (window as any).activeFrozenObservers.size)).toBe(2);
  }
  await page.evaluate(() => (window as any).harness.unload());
  expect(await page.evaluate(() => (window as any).activeFrozenObservers.size)).toBe(0);
});

test('冻结单元格内的真实 CodeMirror 接收键盘输入并保留换行', async ({ page }) => {
  await open(page);
  await setFreeze(page, 'live', '2');
  await page.evaluate(() => (window as any).harness.startCellEditor());
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' native edit');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');
  const content = page.locator('#live tbody td').first().locator('.cm-content');
  await expect(content).toContainText('native edit');
  await expect(content).toContainText('second line');
  expect(await content.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('pre-wrap');
  await expect(page.locator('#live tbody td').first()).toHaveClass(/tws-frozen-cell/);
});

test('旧数据和损坏冻结数据兼容，表头变化后回到全局默认', async ({ page }) => {
  await open(page, { saved: { enabled: true, widths: {}, defaultFrozenColumns: '坏数据', frozenColumns: { bad: 2 } } });
  await expect(page.locator('#live table')).toHaveAttribute('data-tws-frozen-count', '1');
  await setFreeze(page, 'live', '2');
  await page.evaluate(note => (window as any).harness.update(note.replace('项目', '新表头')), NOTE);
  await expect.poll(() => freezeValue(page, 'reading')).toBe('default');
  await expect(page.locator('#live table')).toHaveAttribute('data-tws-frozen-count', '1');
});

test('文件目录改名和删除同时迁移冻结设置和旧列宽', async ({ page }) => {
  await open(page, { filename: '目录/笔记.md' });
  await drag(page, 'live', 7, 100);
  await setFreeze(page, 'live', '0');
  await page.evaluate(() => (window as any).harness.emit('rename', { path: '归档' }, '目录'));
  const renamed = await page.evaluate(() => (window as any).harness.saved());
  expect(Object.keys(renamed.widths).every(key => JSON.parse(key)[0] === '归档/笔记.md')).toBe(true);
  expect(Object.keys(renamed.frozenColumns).every(key => JSON.parse(key)[0] === '归档/笔记.md')).toBe(true);
  expect(Object.values(renamed.frozenColumns)).toEqual([0]);
  await page.evaluate(() => (window as any).harness.emit('delete', { path: '归档' }));
  const deleted = await page.evaluate(() => (window as any).harness.saved());
  expect(deleted.frozenColumns).toEqual({});
  expect(deleted.widths).toEqual({});
});

test('实时预览的内层容器不截断 sticky 的滚动祖先', async ({ page }) => {
  await open(page);
  await page.addStyleTag({ content: '.cm-table-widget .table-wrapper { overflow-x: auto; }' });
  await drag(page, 'live', 7, 200);
  await setFreeze(page, 'live', '2');
  const before = await geometry(page, 'live');
  await scroll(page, 'live', 100);
  const after = await geometry(page, 'live');
  expect(Math.abs(after.cells[0]!.left - before.cells[0]!.left)).toBeLessThan(1);
  expect(Math.abs(after.cells[1]!.left - before.cells[1]!.left)).toBeLessThan(1);
});
