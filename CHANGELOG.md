# Changelog

本项目的重要变更记录（格式参考 Keep a Changelog）。

## [0.3.1] - 2026-09-20

- **修复慢网络下图片白块**：原生 loading=lazy 在快速滚动或慢速网络下预取距离不足，且 CSS 瀑布流会把新分页卡片填到视口上方导致永不触发加载。改为自定义 IntersectionObserver（提前 1800px 预取）+ shimmer 骨架占位 + 淡入 + 失败自动重试一次。
- figures.json 为每张图存入原始宽高，卡片使用 aspect-ratio 预留布局，消除加载时的版面跳动。
- **界面重设计**：过高的粘置头部（约 530px）拆分为可滚走的简介 hero + 115px 紧凑粘置工具条，首屏可见图片从 1.5 行提升到约 3 行；介绍文案增加加粗重点与六会议品牌配色。
- 重录新界面的 docs/demo.gif。
- 仓库内容整理：内部运维脚本与工作笔记移出公开仓库，scripts/ 只保留可复现的数据管线；新增 "Suggest a figure" Issue 模板（不写代码也能推荐论文/图片）。

## [0.3.0] - 2026-09-20

- 新增三个会议：**CVPR / ACL / AAAI（2023–2025）**，与 ICLR / ICML / NeurIPS 同管线处理。
- 画廊规模由 60 张人工精选扩充至 **2,298 张**（2,238 张管线选图 + 60 张 v1 人工底）：
  ICLR 370 / ICML 310 / NeurIPS 803 / CVPR 225 / ACL 326 / AAAI 264。
- **人工逐页复核全部候选图**：六个会议的候选图按 40 格/页拼成联系表（共 81 页）
  逐页检查，剔除纯图表、聊天/示例页、视频帧条带、结果照片墙、UI 截图、波形页等，
  并辅以多轮随机抽样复查；`data/exclude.txt` 累计排除约 1,400 张低质量裁剪。
- 新增候选池与抽取管线：CVF Open Access、ACL Anthology（long/short/findings）、
  AAAI OJS issue archive（`build_pool_new.py` / `extract_new.py`）。
- 补齐 95 条 proceedings 记录缺失的作者字段（NeurIPS 87、ICML 8），
  最终 figures.json 缺图 0、缺作者 0。
- 双语 README（英文在前）、"如何用画廊画你自己的主图"方法论章节、
  30 秒级真实操作演示 GIF（docs/demo.gif）、GitHub social preview 与 banner。
- 清理无引用 stale JPEG 752 张；`clean_stale.py` 扩展为六会议。

## [0.2.0] - 2026-09-18

- ICLR / ICML / NeurIPS 自动管线扩量（2023–2025）。
- 新增"设计感"自动评分：基于矢量元素、标签密度、位图占比、配色与边缘切割检测，
  25+ 条 reject 规则过滤纯大图拼接、纯表格与默认样式图表；dHash 感知哈希去重。
- 随机抽样与逐页联系表人工复核流程（`sheet_qa.py` / `enum_sheets.py`）。

## [0.1.0] - 2026-09-17

- 首版：ICLR / ICML / NeurIPS 2023–2025 各 20 张，共 60 张人工目检精选 Figure 1。
- 纯静态画廊网页：会议 / 年份 / 视觉模式筛选、标题与作者搜索、灯箱大图。
- 完整数据管线：会议索引抓取、OpenReview 接收列表核验、PDF 下载、Figure 1 自动裁剪。
- README、版权与下架政策、GitHub Pages 自动部署。
