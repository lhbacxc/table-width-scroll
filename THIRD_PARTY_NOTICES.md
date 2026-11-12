# 第三方代码与参考实现

本插件使用 MIT 许可证。原始许可证条款与版权信息保留于 `./LICENSE`。

- **Gridlock Tables**：Copyright (c) 2026 Michael Sciscenti。
  参考版本 0.1.2，仓库 https://github.com/mshish/gridlock-tables 。
  `./src/tableIdentity.ts` 的 Markdown 表格解析改编自该插件。原生表格增强、拖动前冻结列宽、Pointer Events 与 Live Preview 监听方式参考该插件并重新实现。
- **Table Style Tweaks**：Copyright (c) 2026 Richard-WYZ。
  参考本工作区版本 1.0.1。滚动容器和正文宽度内的表格布局参考该插件，并针对手动列宽调整重新实现。
- **Bases Freeze Panes**：Copyright (c) 2026 Michael Lip，MIT。
  核对提交 `7796100a051a731d50ef356c829777726f705a93`，仓库 https://github.com/theluckystrike/bases-freeze-panes 。
  原生单元格的 sticky、实色背景、容器隔离方式用于 `./src/freezeDom.ts` 与 `./styles.css` 的冻结列实现；未引入其 Bases 补丁、授权和网络功能。
- **Dream Table**：Copyright (c) 2026 desdrianton，MIT。
  核对提交 `a899271d30d26a31743be72e686cf58feaab54bf`，仓库 https://github.com/desdrianton/obsidian_my_dream_table 。
  `./src/freezeDom.ts` 的临时取消 sticky、保留小数精度测量偏移与 ResizeObserver 思路改编自 `src/render/renderTable.ts`；冻结边框补绘参考其 styles.css。未使用专用代码块、序列化格式或表格编辑器。

本仓库仅包含新插件源码和发行文件，原始参考源码不随本仓库分发。新插件运行和构建均不依赖参考工程目录。以上 MIT 版权及完整许可文本统一保留在 `./LICENSE`，构建时嵌入 main.js。
