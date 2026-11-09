import { describe, expect, it } from 'vitest';
import { identityAt, parseKey, splitRow, tableKey, tablesIn } from '../src/tableIdentity';
import { WidthStore, clampCh, sanitizeWidths } from '../src/widthStore';

const note = '| 名称 | 内容 |\n| --- | --- |\n| 一 | 二 |';
describe('两种视图共用的表格标识', () => {
  it('识别表头行，排除 frontmatter、代码块与引用', () => {
    const source = `---\na: |\nb: ---\n---\n\`\`\`md\n${note}\n\`\`\`\n> | a | b |\n> | --- | --- |\n${note}`;
    const tables = tablesIn(source.split('\n'));
    expect(tables).toHaveLength(1);
    expect(tables[0]?.line).toBe(11);
    expect(identityAt(tables, 11)).toEqual(tables[0]);
    expect(identityAt(tables, 0, 8)).toBeUndefined();
  });
  it('正文修改和插入不同表头的表格不会使已有列宽错位', () => {
    const before = tablesIn(note.split('\n'))[0]!;
    const after = tablesIn(`正文\n| 新表 |\n| --- |\n| x |\n\n${note}`.split('\n'))[1]!;
    expect(tableKey('笔记.md', before)).toBe(tableKey('笔记.md', after));
  });
  it('相同表头按出现次数区分，路径中允许特殊字符', () => {
    const tables = tablesIn(`${note}\n\n${note}`.split('\n'));
    expect(tables.map(t => t.occurrence)).toEqual([0, 1]);
    const key = tableKey('目录/a#".md', tables[1]!);
    expect(parseKey(key)).toEqual(['目录/a#".md', tables[1]!.header, 1]);
  });
  it('支持转义管道符并规范化表头空白', () => {
    expect(splitRow('| a\\|b | c |')).toEqual(['a\\|b', 'c']);
    expect(tablesIn(['a | b', '--- | :---:'])).toHaveLength(1);
  });
  it('损坏的键和伪表格不会建立索引', () => {
    expect(parseKey('bad')).toBeUndefined();
    expect(parseKey('["a","b",-1]')).toBeUndefined();
    expect(tablesIn(['| a | b |', '| --- |'])).toEqual([]);
  });
});

describe('列宽保存与恢复', () => {
  const key = tableKey('目录/a.md', tablesIn(note.split('\n'))[0]!);
  it('序列化后恢复 ch 列宽，列数改变时拒绝套用旧值', () => {
    const store = new WidthStore();
    store.set(key, [12.25, 30]);
    const restored = new WidthStore(JSON.parse(JSON.stringify(store.toJSON())));
    expect(restored.get(key, 2)).toEqual([12.25, 30]);
    expect(restored.get(key, 3)).toBeUndefined();
  });
  it('读写均不暴露内部数组，清除后恢复默认布局', () => {
    const store = new WidthStore();
    const widths = [10, 20];
    store.set(key, widths); widths[0] = 99;
    const read = store.get(key, 2)!; read[0] = 100;
    expect(store.get(key, 2)).toEqual([10, 20]);
    store.set(key, []);
    expect(store.get(key, 2)).toBeUndefined();
  });
  it('文件夹改名与删除只影响该目录，不影响同名前缀目录', () => {
    const store = new WidthStore({ [key]: [10, 20], [key.replace('目录/', '目录2/')]: [30, 40] });
    store.rename('目录', '新目录');
    expect(store.get(key, 2)).toBeUndefined();
    expect(store.get(key.replace('目录/', '新目录/'), 2)).toEqual([10, 20]);
    store.rename('新目录', null);
    expect(Object.values(store.toJSON())).toEqual([[30, 40]]);
  });
  it('忽略损坏与不合理记录，限制拖动范围', () => {
    for (const raw of [[], [null], [NaN], [Infinity], [3], [301], '10']) expect(sanitizeWidths(raw)).toBeUndefined();
    expect(new WidthStore({ invalid: [10] }).toJSON()).toEqual({});
    expect(clampCh(-20)).toBe(4);
    expect(clampCh(500)).toBe(300);
  });
});
