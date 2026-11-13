import { expect, test, Page, Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const cells = Array.from({ length: 12 }, (_, i) => `列${i + 1}`);
const NOTE = `| ${cells.join(' | ')} |\n| ${cells.map(() => '---').join(' | ')} |\n| ${cells.join(' | ')} |`;

async function open(page: Page, count = 1): Promise<void> {
  await page.setContent('<html><head></head><body></body></html>');
  for (const file of ['tests/fixture.css', 'styles.css']) {
    await page.addStyleTag({ content: await readFile(path.resolve(file), 'utf8') });
  }
  await page.addScriptTag({ path: path.resolve('tests/.generated/harness.js') });
  await page.evaluate(({ note, count }) => (window as any).harness.boot({
    note, saved: { enabled: true, widths: {}, frozenColumns: {}, defaultFrozenColumns: count },
  }), { note: NOTE, count });
}

async function checkHandle(handle: Locator): Promise<void> {
  // 必须通过鼠标命中与 hover 检查裁剪，dispatchEvent 会绕过真实可见区域。
  const visible = await handle.evaluate(handle => {
    const box = handle.getBoundingClientRect();
    const clip = handle.closest('.tws-scroll')!.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.width > 0 && box.left >= clip.left && box.right <= clip.right && !!hit && handle.contains(hit);
  });
  expect(visible).toBe(true);
  await handle.hover();
  expect(await handle.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
}

for (const count of [0, 1, 2]) {
  test(`冻结 ${count} 列：原生行六点可悬浮、选择和打开菜单`, async ({ page }) => {
    await open(page, count);
    const source = await page.evaluate(() => (window as any).harness.source());
    const saved = await page.evaluate(() => (window as any).harness.saved());
    const handle = page.locator('#live tbody .table-row-drag-handle').first();
    await checkHandle(handle);
    if (count > 0) {
      await page.locator('#live .tws-scroll').evaluate((el: HTMLElement) => { el.scrollLeft = el.scrollWidth; });
      expect(await page.locator('#live .tws-scroll').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await checkHandle(handle);
    }
    await handle.click();
    expect(await page.evaluate(() => (window as any).nativeRowSelections)).toBe(1);
    await expect(page.locator('#live tbody .is-selected')).toHaveCount(12);
    await expect(page.locator('.tws-dragging,.tws-resize-handle.is-active')).toHaveCount(0);
    await handle.click({ button: 'right' });
    await expect(page.locator('.menu')).toContainText('删除行');
    await expect(page.locator('.menu')).toContainText('冻结列设置…');
    await page.locator('.menu-item').filter({ hasText: /^删除行$/ }).click();
    expect(await page.evaluate(() => (window as any).nativeMenuAction)).toBe('row');
    await expect(page.locator('#live .is-selected')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).harness.saved())).toEqual(saved);
    expect(await page.evaluate(() => (window as any).harness.source())).toBe(source);
  });
}

test('主题放大手柄后仍可命中，冻结列位置不累积额外留白', async ({ page }) => {
  await open(page, 2);
  await page.addStyleTag({ content: '.markdown-source-view.mod-cm6 .cm-table-widget { --table-drag-handle-size: 24px; }' });
  const first = page.locator('#live th').first();
  const left = (await first.boundingBox())!.x;
  await page.locator('#live .tws-scroll').evaluate((el: HTMLElement) => { el.scrollLeft = el.scrollWidth; });
  await checkHandle(page.locator('#live tbody .table-row-drag-handle').first());
  expect(Math.abs((await first.boundingBox())!.x - left)).toBeLessThan(1);
  await page.evaluate(() => (window as any).harness.rerender());
  await expect(page.locator('#live table')).toHaveAttribute('data-tws-frozen-count', '2');
  await checkHandle(page.locator('#live tbody .table-row-drag-handle').first());
  await expect(page.locator('#live .table-row-drag-handle')).toHaveCount(2);
  expect(await page.locator('#live .tws-scroll').evaluate(el => el.getBoundingClientRect().width)).toBe(560);
});

test('窄正文从冻结预算中扣除行手柄空间，仍保留至少 48px 滚动区', async ({ page }) => {
  await open(page, 2);
  await page.addStyleTag({ content: ':root { --file-line-width: 160px; }' });
  await expect(page.locator('#live table')).toHaveAttribute('data-tws-frozen-count', '1');
  await page.locator('#live .tws-scroll').evaluate((el: HTMLElement) => { el.scrollLeft = el.scrollWidth; });
  const remaining = await page.locator('#live .tws-scroll').evaluate(wrapper => {
    const frozen = wrapper.querySelector('thead .tws-last-frozen')!;
    return wrapper.getBoundingClientRect().right - frozen.getBoundingClientRect().right;
  });
  expect(remaining).toBeGreaterThanOrEqual(48);
  await checkHandle(page.locator('#live tbody .table-row-drag-handle').first());
  expect(await page.evaluate(() => (window as any).harness.freezeValue('live'))).toBe('default');
});

test('关闭和重新启用恢复原生留白，行列手柄仍可正常使用', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).harness.toggle(false));
  await expect(page.locator('#live .tws-scroll')).toHaveCount(0);
  expect(await page.locator('#live .cm-table-widget').evaluate(el => getComputedStyle(el).paddingLeft)).toBe('16px');
  await page.locator('#live tbody .table-row-drag-handle').first().hover();
  await page.evaluate(() => (window as any).harness.toggle(true));
  await expect(page.locator('#live .tws-scroll')).toHaveCount(1);
  await checkHandle(page.locator('#live tbody .table-row-drag-handle').first());
  await page.locator('#live .table-col-drag-handle').first().click();
  expect(await page.evaluate(() => (window as any).nativeColumnSelections)).toBe(1);
});
