# Changelog

本项目的重要变更记录（格式参考 Keep a Changelog）。

## [0.6.0] - 2026-09-25

> 公开版本对照（public edition）：v0.3 = 画廊第一版（v1，六会议 2,298 张，2026-09-20 首发）；v0.4 = 画廊第二版（v2，新增等级角标，2,730 张）；v0.5 = 画廊第三版（v3，收录 2026 年已公开会议，3,528 张）；v0.6 = 画廊第四版（v4，FigureForge 纯静态化并去重，3,516 张）。宣发中提到的 "v4" 即指本次发布。

- **FigureForge 纯静态化**：画图工具从内测服务端版改为纯静态页面，全部在浏览器本地运行（CLIP 文本模型随仓库打包、本地推理），无后端、双击即开，可直接托管在 GitHub Pages。
- **参考图真正作为图像输入**：SVG 路径把勾选的参考图以多模态消息（base64 图像）发送给视觉模型；位图路径对火山方舟 Seedream 使用多图参考参数（硅基流动单图参考，失败自动降级为无参考 / 纯文本）。模型不支持视觉时自动降级为参考图文字标签注入。
- **服务商扩至十家**：新增 Kimi（月之暗面）、通义千问 Qwen、腾讯混元、Anthropic Claude；同时支持 OpenAI 兼容协议与 Anthropic 原生协议（/v1/messages）。混元 / Anthropic 官方接口不开放浏览器跨域，提供"使用中转"勾选与 Base URL 覆盖。
- **模型列表自动实时更新**：两层机制——页面每次打开 cache-bust 拉取仓库托管的 `forge/data/manifest.json`（维护者更新推荐名单即对所有用户生效）；填入 Key 后实时 GET 服务商 `/models`，账号已开通模型与新发布模型自动出现，无需更新页面。
- **跨代重复去重**：清理 v1 人工底与管线选图对同一论文的 12 组重复收录（保留管线版本），画廊规模 3,528 → **3,516 张**；旧图移入 `_local/trash_dups/` 备份。
- **真实案例实测与演示物料**：机器人操作案例经 CLIP+BM25 混合检索、多模态生成得到三面板可编辑 SVG 主图；录制全流程演示 GIF（`forge/demo-forge.gif`），并完成"直接在豆包输 prompt vs FigureForge"效果对比（位图对照组文字乱码、版式错误、不可编辑）。

## [0.5.0] - 2026-09-23

> 公开版本对照（public edition）：v0.3 = 画廊第一版（v1，六会议 2,298 张，2026-09-20 首发）；v0.4 = 画廊第二版（v2，新增等级角标，2,730 张）；v0.5 = 画廊第三版（v3，收录 2026 年已公开会议，3,528 张）。GitHub 沿用 0.x 语义化版本，宣发中提到的 "v3" 即指本次发布。

- **2026 年会议收录**：新增 ICLR / ICML / CVPR / ACL / AAAI 2026 已公开论文的 Figure 1 / Teaser 共 **798 张**（ICLR 247、ICML 372、CVPR 83、ACL 59、AAAI 37），候选池 8,963 篇，与历年数据同管线处理。
- **ML 两大会 2026 等级角标**：ICLR 2026 Oral 146 篇（含 Best 1、Honorable Mention 1）；ICML 2026 Oral 99 篇、Spotlight 239 篇（含 Best 1、Honorable Mention 4）。ICLR 2026 官方未设 Spotlight 档。
- **NeurIPS 2026 暂不收录**：官方录用名单尚未公布（会期 12 月），公布后补全。
- **边界墨迹检测替代矢量 edge-cut 规则**：旧规则对宽幅 / 全幅设计图大量误报（837 张中抽样仅 2–3 张真切），改为对渲染 PNG 四边采样的 border_ink 检测；逐张联系表复核后，高等级图误杀全部回捞。
- **抽取通道修复**：学术站点持续负载下 Python requests 被限速（单文件 120s+），下载器改用 curl_cffi 浏览器指纹（TLS/JA3 对齐 Chrome），速度恢复至正常区间；OpenReview PDF 走浏览器 clearance cookie + 代理串行批量下载。
- **全部 798 张逐张人工 QA**：65 张联系表（12 图/张）逐页检查，无坏图、无补删；两篇 2026 Best 论文为纯理论工作、正文无图，无法收录（口径见 docs/METHODOLOGY.md §5b）。
- 年份筛选新增 **2026**（chip 由数据自动派生）；README / METHODOLOGY 更新覆盖年份、数量与等级口径。

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
