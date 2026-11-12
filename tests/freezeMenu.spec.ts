import { expect, test, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function open(page: Page, options: any = {}) {
  await page.setContent('<html><head></head><body></body></html>');
  await page.addStyleTag({ content: await readFile(path.resolve('tests/fixture.css'), 'utf8') });
  await page.addStyleTag({ content: await readFile(path.resolve('styles.css'), 'utf8') });
  await page.addScriptTag({ path: path.resolve('tests/.generated/harness.js') });
  await page.evaluate(options => (window as any).harness.boot(options), options);
}

async function nativeMenu(page: Page, column = 0) {
  await page.locator('#live .table-col-drag-handle').nth(column)
    .dispatchEvent('contextmenu', { clientX: 400, clientY: 100, button: 2 });
  await page.waitForTimeout(30);
}

test('移除顶部控件，第一列原生六点选择区可以直接点击', async ({ page }) => {
  await open(page);
  await expect(page.locator('.tws-freeze-toolbar,.tws-freeze-select')).toHaveCount(0);
  const source = await page.evaluate(() => (window as any).harness.source());
  const handle = page.locator('#live .table-col-drag-handle').first();
  await handle.click();
  expect(await page.evaluate(() => (window as any).nativeColumnSelections)).toBe(1);
  await expect(page.locator('#live .is-selected')).toHaveCount(3);
  expect(await page.evaluate(() => (window as any).harness.saved())).toBeNull();
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(source);
});

test('原生列菜单项目和回调保留，冻结组在末尾且不重复', async ({ page }) => {
  await open(page);
  await page.locator('#live .table-col-drag-handle').first().click();
  await nativeMenu(page, 1);
  const titles = await page.locator('.menu-item').allTextContents();
  expect(titles.slice(0, 4)).toEqual(['按列升序 (A-Z)', '在左侧新增列', '向右移动列', '删除列']);
  expect(titles.slice(4)).toEqual(['冻结到此列（前 2 列）', '冻结列设置…', '不冻结', '跟随全局默认（1 列）']);
  await expect(page.locator('.menu-item').filter({ hasText: /^冻结列设置…$/ })).toHaveCount(1);
  await page.locator('.menu-item').filter({ hasText: /^删除列$/ }).click();
  expect(await page.evaluate(() => (window as any).nativeMenuAction)).toBe('col');
  await expect(page.locator('#live .is-selected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).nativeMenu.showAtMouseEvent === (window as any).nativeShowOriginal)).toBe(true);
});

test('冻结到第二列只更新插件数据，另一视图同步且 Markdown 不变', async ({ page }) => {
  await open(page);
  const source = await page.evaluate(() => (window as any).harness.source());
  await nativeMenu(page, 1);
  await page.locator('.menu-item').filter({ hasText: /^冻结到此列/ }).click();
  await expect(page.locator('#live table')).toHaveAttribute('data-tws-frozen-count', '2');
  await expect(page.locator('#reading table')).toHaveAttribute('data-tws-frozen-count', '2');
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(source);
  expect(await page.evaluate(() => Object.values((window as any).harness.saved().frozenColumns))).toEqual([2]);
});

test('最后一列不允许冻结所有列，行菜单提供通用冻结设置', async ({ page }) => {
  await open(page);
  await nativeMenu(page, 2);
  await expect(page.locator('.menu-item').filter({ hasText: /^冻结到此列/ })).toBeDisabled();
  await page.locator('.menu').dispatchEvent('keydown', { key: 'Escape' });
  await page.locator('#live .table-row-drag-handle').first().dispatchEvent('contextmenu', { button: 2, clientX: 400 });
  await page.waitForTimeout(30);
  await expect(page.locator('.menu')).toContainText('删除行');
  await expect(page.locator('.menu')).toContainText('冻结列设置…');
  await expect(page.locator('.menu-item').filter({ hasText: /^冻结到此列/ })).toHaveCount(0);
});

test('普通单元格 editor-menu 入口复用原生菜单', async ({ page }) => {
  await open(page);
  await page.locator('#live tbody .table-cell-wrapper').first().dispatchEvent('contextmenu', { clientX: 400, button: 2 });
  await expect(page.locator('.menu-item').first()).toHaveText('原生单元格操作');
  await expect(page.locator('.menu')).toContainText('冻结列设置…');
});

test('菜单显示期间卸载清理入口和单实例方法适配，再启用只有一组', async ({ page }) => {
  await open(page);
  await nativeMenu(page);
  expect(await page.evaluate(() => (window as any).nativeMenu.showAtMouseEvent === (window as any).nativeShowOriginal)).toBe(false);
  await page.evaluate(() => (window as any).harness.toggle(false));
  await expect(page.locator('.menu,.modal-container')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).nativeMenu.showAtMouseEvent === (window as any).nativeShowOriginal)).toBe(true);
  await page.evaluate(() => (window as any).harness.toggle(true));
  await expect(page.locator('#live table')).toHaveClass(/tws-table/);
  await nativeMenu(page);
  await expect(page.locator('.menu-item').filter({ hasText: /^冻结列设置…$/ })).toHaveCount(1);
  await page.evaluate(() => (window as any).harness.unload());
  await expect(page.locator('.menu,.modal-container')).toHaveCount(0);
});

test('冻结设置弹窗在关闭插件时清理，旧表格的菜单不能修改新表格', async ({ page }) => {
  await open(page);
  await nativeMenu(page);
  await page.locator('.menu-item').filter({ hasText: /^冻结列设置…$/ }).click();
  await expect(page.locator('.modal-container')).toHaveCount(1);
  await page.evaluate(() => (window as any).harness.toggle(false));
  await expect(page.locator('.modal-container')).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.toggle(true));
  await expect(page.locator('#live table')).toHaveClass(/tws-table/);
  await nativeMenu(page, 1);
  await page.evaluate(() => {
    const h = (window as any).harness; h.update(h.defaultNote.replace('项目', '新表格'));
  });
  await page.locator('.menu-item').filter({ hasText: /^冻结到此列/ }).click();
  expect(await page.evaluate(() => (window as any).harness.saved().frozenColumns)).toEqual({});
});

test('阅读视图链接保留原生右键行为，普通表格提供冻结入口', async ({ page }) => {
  await open(page);
  const result = await page.locator('#reading td').first().evaluate(cell => {
    const link = document.createElement('a'); link.href = 'https://example.com'; cell.append(link);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    link.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(result).toBe(false);
  await expect(page.locator('.menu')).toHaveCount(0);
  await page.locator('#reading th').first().dispatchEvent('contextmenu', { button: 2, clientX: 400 });
  await expect(page.locator('.menu')).toContainText('冻结列设置…');
});

test('多表格命令先让用户选表，避免修改错误表格', async ({ page }) => {
  const note = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n\n| D | E | F |\n| --- | --- | --- |\n| 4 | 5 | 6 |';
  await open(page, { note });
  await page.evaluate(() => (window as any).harness.startCellEditor());
  await page.evaluate(() => (window as any).harness.commandFreeze('reading'));
  await expect(page.locator('.prompt-input')).toHaveAttribute('placeholder', '选择要设置冻结列的表格');
  await page.locator('.suggestion-item').nth(1).click();
  await page.locator('.suggestion-item').filter({ hasText: '冻结前 2 列' }).click();
  await expect(page.locator('#reading table').first()).toHaveAttribute('data-tws-frozen-count', '1');
  await expect(page.locator('#reading table').nth(1)).toHaveAttribute('data-tws-frozen-count', '2');
});

test('单篇笔记停用时原生菜单保持完整，不增加冻结项', async ({ page }) => {
  await open(page, { optOut: true });
  await nativeMenu(page);
  await expect(page.locator('.menu-item')).toHaveCount(4);
  await expect(page.locator('.menu')).not.toContainText('冻结列');
});
