# 项目维护约束

- 文本 I/O 使用 UTF-8；回答和正式文档默认中文；文档路径使用相对路径。
- 作者名称统一为 `Lhbacxc`。后续版本的 `manifest.json` 必须保留 `author: Lhbacxc` 和 `authorUrl: https://github.com/lhbacxc/table-width-scroll`，链接指向本插件仓库。
- 安装目录和 ZIP 内只包含 `main.js`、`manifest.json`、`styles.css` 三个运行文件。
- 源码目录保留 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。构建时将完整 MIT 版权和许可文本嵌入 `main.js`，安装包不额外附带这两个文档。
- 重新打包时清理安装目录的旧文件，并只保留当前版本的 ZIP。ZIP 可以保留在本地，使用 Git 忽略规则排除；远端压缩安装包仅上传到 Releases，不放在仓库文件列表中。打包过程清理旧产物的范围必须限制在本项目的 `./dist/` 内。
- README 的安装说明直接从下载并解压 ZIP 开始；对参考插件只介绍借鉴的功能及本插件的改进。

## 首读文档

- 项目入门与修改位置：`./docs/onboarding.md`。
- 设计与模块职责：`./docs/design.md`；验证证据、排障与应用内验收：`./docs/verification.md`。
- 使用和安装说明：`./README.md`；人工验收笔记：`./docs/test-note.md`。

## 开发与验证

- 命令在本文件所在插件根目录执行；工程使用 Node.js，无 Python/Conda 依赖。当前锁文件中的 Playwright 要求 Node.js ≥20，项目未单独配置 engines。
- 安装使用 `npm ci`，保留锁文件；Obsidian 1.14.4 与 CodeMirror state 6.7.6、view 6.43.13 为固定依赖，不单独漂移升级。
- 开发监听：`npm run dev`，不执行类型检查；生产构建：`npm run build`，执行 TypeScript 检查并生成 main.js。
- 单元测试：`npm test`，匹配 `./tests/**/*.test.ts`；浏览器测试：`npm run test:browser`，匹配 `./tests/**/*.spec.ts`。
- 浏览器按 TWS_BROWSER_PATH、Chrome、Edge 顺序查找，未找到时使用已安装的 Playwright 默认浏览器。配置位置为 `./playwright.config.ts`。
- 先构建成功再执行 `npm run package`；打包脚本只复制三个运行文件并压缩，不重新构建。它通过 powershell.exe 调用，`./scripts/package.ps1` 保持带 BOM 的 UTF-8，以兼容 Windows PowerShell 5.1 中文解析。
- CLI 使用 PowerShell，显式设置 UTF-8 与 ErrorActionPreference=Stop；外部命令非零退出时中止后续步骤。未配置 lint、覆盖率或 GitHub Actions。

## 实现约束

- TypeScript 严格模式，沿用 camelCase 文件名、PascalCase 类型名、两空格缩进和单引号。纯数据逻辑保持独立于 Obsidian。
- 增强原生表格和 CodeMirror widget，保留原生单元格编辑；阅读视图与 Live Preview 共用标识及列宽记录。
- 可见区域跟随正文宽度，超出部分在表格内部滚动；列宽以 ch 保存在插件 data.json，不改写 Markdown。
- 冻结列也保存在插件 data.json：默认首列，允许每表覆盖前 N 列；显式 0 与跟随默认不同。宽度重置和冻结重置保持独立，路径迁移同时处理两种记录。
- 冻结不复制或替换原生单元格；相关实现与验收范围见 `./docs/frozen-columns.md`。widget 移除后释放 ResizeObserver，不能只清理仍在 DOM 内的表格。
- 冻结入口使用原生菜单与 SuggestModal，不在表格顶部插入常驻控件。原生六点手柄不进入列宽手势；Menu.onHide 是单回调槽，不覆盖它，不修改全局 Menu 原型。
- Live Preview 保留原生行手柄所需的左侧 padding，不能把水平 padding 全部清零；冻结预算扣除容器 padding，sticky 不重复叠加它。手柄可见性用真实鼠标命中与 hover 验证，dispatchEvent 不能验证裁剪。
- 表格标识由路径、解析后的表头、相同表头出现次数组成。修改标识或存储逻辑时，核对恢复、文件及目录改名、删除和列数变化测试。
- DOM 装饰保持幂等，样式通过 body.tws-enabled 与所属视图限定作用域，支持 tws-off；关闭、销毁、重置或卸载前先取消未完成手势，再清理自身资源。
- 保存时先快照，再串行 saveData，避免旧写入覆盖新数据；失败使用 Notice 与日志反馈。
- 浏览器测试使用实际源码、真实 CodeMirror 和模拟 Obsidian API，不能宣称真实主题、移动端与插件组合已通过验收。已知范围见验证文档。

## 长期文档维护

- 开始维护时读取本文件与相应文档；架构、环境、命令、目录职责或经验证的排障约束变化时，增量同步对应文档。
- 保留已有规则，详细事实放在 `./docs/`，本文件只保留关键执行约束与入口。没有长期事实变化时不写文档。
- 文档使用中文、UTF-8 和相对路径；只记录确认事实，保留验证失败与未完成的适用范围。
