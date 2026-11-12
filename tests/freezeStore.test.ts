import { describe, expect, it } from 'vitest';
import { FreezeStore } from '../src/freezeStore';
import { WidthStore } from '../src/widthStore';
import { tableKey, tablesIn } from '../src/tableIdentity';

const identity = tablesIn(['| 名称 | 数据 | 说明 |', '| --- | --- | --- |'])[0]!;
const key = (path = '目录/笔记.md') => tableKey(path, identity);

describe('冻结设置的保存语义与迁移', () => {
  it('旧数据默认冻结首列，单列表格保留可滚动列', () => {
    const store = new FreezeStore();
    expect(store.get(key(), 3)).toBe(1);
    expect(store.get(key(), 1)).toBe(0);
    expect(store.get(key(), 0)).toBe(0);
  });

  it('显式不冻结与跟随默认不同，往返保存后仍保留', () => {
    const store = new FreezeStore(2);
    store.set(key(), 0);
    const restored = new FreezeStore(store.defaultCount, store.toJSON());
    expect(restored.get(key(), 4)).toBe(0);
    expect(restored.override(key())).toBe(0);
    restored.set(key(), undefined);
    expect(restored.get(key(), 4)).toBe(2);
    expect(restored.toJSON()).toEqual({});
  });

  it('列数变少时限制生效数量，列数恢复后保留原选择', () => {
    const store = new FreezeStore();
    store.set(key(), 4);
    expect(store.get(key(), 3)).toBe(2);
    expect(store.get(key(), 6)).toBe(4);
    expect(store.override(key())).toBe(4);
  });

  it('损坏数据、非整数和非法标识不会覆盖有效记录', () => {
    for (const invalid of [-1, 1.5, NaN, Infinity, '2', null, {}, Number.MAX_SAFE_INTEGER + 1]) {
      const store = new FreezeStore(invalid, { [key()]: invalid, bad: 2 });
      expect(store.defaultCount).toBe(1);
      expect(store.toJSON()).toEqual({});
      store.set(key(), 2);
      store.set(key(), invalid as number);
      expect(store.override(key())).toBe(2);
      store.setDefault(invalid as number);
      expect(store.defaultCount).toBe(1);
    }
    expect(new FreezeStore(0, []).defaultCount).toBe(0);
  });

  it('全局默认变化只影响跟随默认的表格，重置不影响旧列宽', () => {
    const store = new FreezeStore();
    const widths = new WidthStore();
    widths.set(key(), [10, 20, 30]);
    store.set(key(), 0);
    store.setDefault(2);
    expect(store.get(key(), 3)).toBe(0);
    expect(store.get(key('另一张.md'), 3)).toBe(2);
    store.clear();
    expect(store.get(key(), 3)).toBe(2);
    expect(widths.get(key(), 3)).toEqual([10, 20, 30]);
  });

  it('文件改名保留覆盖和显式 0，删除移除记录', () => {
    const store = new FreezeStore();
    store.set(key(), 0);
    store.rename('目录/笔记.md', '目录/新名称.md');
    expect(store.override(key())).toBeUndefined();
    expect(store.override(key('目录/新名称.md'))).toBe(0);
    store.rename('目录/新名称.md', null);
    expect(store.toJSON()).toEqual({});
  });

  it('目录迁移只处理路径内记录，保留相似前缀目录', () => {
    const store = new FreezeStore();
    store.set(key(), 2);
    store.set(key('目录/子目录/笔记.md'), 0);
    store.set(key('目录其他/笔记.md'), 1);
    store.rename('目录', '归档');
    expect(store.override(key('归档/笔记.md'))).toBe(2);
    expect(store.override(key('归档/子目录/笔记.md'))).toBe(0);
    store.rename('归档', null);
    expect(store.toJSON()).toEqual({ [key('目录其他/笔记.md')]: 1 });
  });
});
