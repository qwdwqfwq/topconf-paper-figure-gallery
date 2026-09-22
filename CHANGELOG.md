# Changelog

本项目的重要变更记录（格式参考 Keep a Changelog）。

## [Unreleased]

- **灯箱共享元素过渡动画**（社区贡献，PR #2 by @timelic）：点击卡片时图片 / 标题 / 角标通过 View Transitions API 平滑形变为灯箱，灯箱内上一张 / 下一张改为滑入滑出；不支持该 API 的低版本浏览器与系统“减少动态效果”设置自动回退为普通开合。灯箱翻页箭头改为 SVG，新增开合过程的焦点管理与窗口缩放重定位。

## [0.4.0] - 2026-09-21

> 公开版本对照（public edition）：v0.3 = 画廊第一版（v1，六会议 2,298 张，2026-09-20 首发）；v0.4 = 画廊第二版（v2，新增等级角标，2,730 张）。GitHub 沿用 0.x 语义化版本，宣发中提到的 "v2" 即指本次发布。

- **高等级论文索引（ICLR / ICML / NeurIPS，2023–2025）**：完整覆盖三大会官方 Oral / Spotlight 名单（3,822 篇候选）与 Best/Outstanding、Honorable Mention 名单（66 篇，人工核对）。
- **等级角标与筛选**：卡片左上角与灯箱内显示等级——★ 红色 Best/Outstanding（Honorable Mention 为白底红描边）、金色 Oral、银色 Spotlight；筛选栏新增与会议 / 年份 / 模式正交的 Tier 维度（All / Best Paper / Oral / Spotlight，带计数）。
- 画廊规模 2,298 → **2,730 张**；其中带等级标识 622 张（Best 系列 12、Oral 138、Spotlight 472）。纯理论获奖论文正文没有设计型配图，相应位置留空（口径见 docs/METHODOLOGY.md §5b）。
- **宽松补裁**：放宽图注容差、扫描前 6 页、无图注时退回页内最大图；逐篇重试后下载失败为 0；修复一批已裁 PNG 缺少状态记录而从未参与评分的问题（重新下载、重裁并回填状态 433 张）。
- **两轮人工 QA**：1,238 张被软规则拒绝的候选逐页复核，救回设计完整的框架 / 流程 / 概念图；自动门新增图片再逐张复核，剔除图表页、截图页与结果照片墙。
- **头部紧凑化**：hero 压缩为两行并在右侧加入实时统计（figures / Best / Oral / Spotlight），粘置工具条三行排布，图片区域成为首屏主体；等级卡片使用彩色边框与角标。
- README / METHODOLOGY 更新等级口径（含 ICLR 2023 notable 映射、ICML 2023 仅 OralPoster）与 v0.4 复核流程。

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
