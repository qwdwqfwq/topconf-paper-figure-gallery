# Contributing

欢迎一起把这个配图灵感画廊做得更好。提 PR 前请先阅读本说明。

## 两种贡献方式

**方式一：不开代码，开 Issue 即可（推荐大多数人）**

- 想推荐某篇论文 / 某张主图：开一个 **[Suggest a figure](https://github.com/qwdwqfwq/topconf-paper-figure-gallery/issues/new?template=add-figure-request.md)** Issue，贴上论文链接（最好注明是 Figure 1 / Teaser），维护者会按收录标准评估并处理。
- 发现某张图裁剪不完整、标错作者或标签：直接开 Bug report Issue，注明图片 id（卡片灯箱里可见，形如 `neurips2024-19`）。
- 版权问题：使用 Image removal request 模板，见 [IMAGES_POLICY.md](IMAGES_POLICY.md)。

**方式二：直接提 PR**

适合熟悉 Git / 数据管线的贡献者，流程见下文。

## 我可以贡献什么

- **补图 / 换图**：某篇论文的 Figure 1 更能代表它，或你发现某张图裁剪不完整、质量不佳。
- **新会议 / 新年份**：CHI、CoRL、RSS、EMNLP、KDD 等会议的扩展（建议先开 Issue 讨论目录命名）。
- **视觉模式修正**：`pattern` 标签标错时直接指出。
- **网页改进**：筛选、搜索、灯箱、移动端体验等。
- **数据管线修复**：解析失败、链接失效、作者信息错误。

## 收录标准（重要）

画廊只收**体现作者排版与设计投入**的 Figure 1，包括：

- 概念隐喻图（conceptual illustration）
- 系统 / 框架总览图（framework overview）
- 端到端流程图（pipeline / flowchart）
- 模型架构图（architecture）
- 经过设计的任务全景 / benchmark 总览（taxonomy / benchmark overview）
- 图文混排、有明确版式设计的 teaser

**不收录**：

- 几张大图简单拼在一起、没有版式设计的纯结果拼图（photo dumps）
- 默认样式的折线 / 柱状图、纯表格、纯截图堆叠
- 裁剪不完整、文字被切掉的图

## 本地开发

```bash
pip install -r requirements.txt
python -m http.server 8000   # 然后访问 http://localhost:8000
```

- 网页是纯静态的：`index.html` + `assets/`，数据在 `assets/figures.js`（由 `data/figures.json` 生成）。
- 修改数据后重新装配：`python scripts/assemble_gallery.py 1000`，再 `python scripts/clean_stale.py`
  （完整管线见 [docs/METHODOLOGY.md](docs/METHODOLOGY.md)）。

## 提交规范

- 一个 PR 只做一件事；提交信息用英文祈使句，如 `add ICLR 2025 conceptual figures`。
- 新增图片请把 JPEG 放到 `images/<venue>/final/`，并在 `data/figures.json` 追加一条记录：
  `id`、`venue`、`year`、`title`、`authors`、`pattern`、`image`、`paper`、`pdf_source`、
  `score`、`w`、`h`（宽高可由 `assemble_gallery.py` 自动补全）。随后运行
  `python scripts/assemble_gallery.py 1000` 重新生成 `assets/figures.js`。
- 不要提交 `pdfs/`、中间 PNG 与日志（`.gitignore` 已排除）。

## 版权

提交即表示你理解图片版权归原作者所有；发现侵权请按
[IMAGES_POLICY.md](IMAGES_POLICY.md) 的下架流程处理。
