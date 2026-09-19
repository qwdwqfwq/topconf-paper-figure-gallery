# Changelog

本项目的重要变更记录（格式参考 Keep a Changelog）。

## [Unreleased]

- 扩展至每个会议约 1000 张精选 Figure 1（ICLR / ICML / NeurIPS，2023–2025）。
- 新增"设计感"自动评分：基于矢量元素、标签密度、位图占比、配色与边缘切割检测，
  过滤纯大图拼接、纯表格与默认样式图表。

## [0.1.0] - 2026-09-17

- 首版：ICLR / ICML / NeurIPS 2023–2025 各 20 张，共 60 张人工目检精选 Figure 1。
- 纯静态画廊网页：会议 / 年份 / 视觉模式筛选、标题与作者搜索、灯箱大图。
- 完整数据管线：会议索引抓取、OpenReview 接收列表核验、PDF 下载、Figure 1 自动裁剪。
- README、版权与下架政策、GitHub Pages 自动部署。
