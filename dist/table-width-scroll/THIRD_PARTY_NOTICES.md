# 第三方代码与参考实现

本插件使用 MIT 许可证。原始许可证条款与版权信息保留于 `./LICENSE`。

- **Gridlock Tables**：Copyright (c) 2026 Michael Sciscenti。
  参考版本 0.1.2，仓库 https://github.com/mshish/gridlock-tables 。
  `./src/tableIdentity.ts` 的 Markdown 表格解析改编自该插件。原生表格增强、拖动前冻结列宽、Pointer Events 与 Live Preview 监听方式参考该插件并重新实现。
- **Table Style Tweaks**：Copyright (c) 2026 Richard-WYZ。
  参考本工作区版本 1.0.1。滚动容器和正文宽度内的表格布局参考该插件，并针对手动列宽调整重新实现。

本仓库仅包含新插件源码和发行文件，原始参考源码不随本仓库分发。新插件运行和构建均不依赖两个参考工程目录。
