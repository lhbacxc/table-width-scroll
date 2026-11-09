# 项目维护约束

- 文本 I/O 使用 UTF-8；回答和正式文档默认中文；文档路径使用相对路径。
- 作者名称统一为 `Lhbacxc`。后续版本的 `manifest.json` 必须保留 `author: Lhbacxc` 和 `authorUrl: https://github.com/lhbacxc/table-width-scroll`，链接指向本插件仓库。
- 安装目录和 ZIP 内只包含 `main.js`、`manifest.json`、`styles.css` 三个运行文件。
- 源码目录保留 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。构建时将完整 MIT 版权和许可文本嵌入 `main.js`，安装包不额外附带这两个文档。
- 重新打包时清理安装目录的旧文件，并只保留当前版本的 ZIP。ZIP 可以保留在本地，使用 Git 忽略规则排除；远端压缩安装包仅上传到 Releases，不放在仓库文件列表中。打包过程清理旧产物的范围必须限制在本项目的 `./dist/` 内。
- README 的安装说明直接从下载并解压 ZIP 开始；对参考插件只介绍借鉴的功能及本插件的改进。
