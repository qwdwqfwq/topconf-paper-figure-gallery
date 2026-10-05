# Changelog

本项目的重要变更记录（格式参考 Keep a Changelog）。

## [Unreleased]

- **Forge 第四步导出与画廊清理**：修复 AI 位图生成后可编辑导出未解锁的问题，并移除 3 个已确认的纯柱状图/折线图条目。

- **模型「未开通 / 未找到」故障排查与提示修复（10 家逐一实测）**：
  - **Claude 现在会实时拉取可用模型**：Anthropic 同样提供 `GET /v1/models`（实测带 `anthropic-dangerous-direct-browser-access` 头后浏览器 401 可读），但旧代码对非 OpenAI 协议的 provider 直接跳过，Claude 用户只能看到托管清单、选到未开通的模型也无从判断。现已支持。
  - **方舟 404 给出专门指引**：方舟对"账号未开通该模型"返回 `404 ModelNotOpen`（[错误示例](https://bbs.pyvideotrans.com/show/3982)），此前只显示通用的"未找到该模型"。现在明确提示到方舟控制台「开通」该模型、或从「你的账号已开通」分组重选，并说明方舟模型列表接口不支持浏览器查询。
  - **新增「该模型可能未开通」行内提醒**：填入 Key 后能实时拉到列表的服务商（硅基流动 / 智谱 / DeepSeek / OpenAI / Kimi / 通义 / Claude / 自定义），若当前选中的模型不在该列表内，模型下拉框下方会出现黄色提醒，避免调用后才撞上 403/404。
  - **逐家实测结论**：`/models` 浏览器可拉取的是 硅基流动、智谱、DeepSeek、OpenAI、Kimi、通义、Claude（需 browser 头）；**方舟（预检 404）与混元（CORS 拦截）不可**，这两家只能依赖随仓库更新的托管清单，界面会标注"该服务商未开放浏览器查询 · 已用托管清单"。托管清单里的方舟模型 ID 格式与官方模型广场一致（`模型名-版本号`，如 `doubao-seed-2-1-pro-260628`），未发现错误 ID。

- **画廊清洗纯图表，收录口径改为「手搓主图」**：用仓库自带的 CLIP 图文嵌入（`forge/data/image_emb.bin`）+ 本地视觉特征（大留白 / 细笔画 / 长直轴线）对全部 3,516 张逐一打分排序，再逐张目视复核，删除 64 张「脚本就能画出来」的折线图 / 柱状图 / 散点图 / 热力图（含 2026 年多篇理论、scaling law 论文的主图）；3,516 → **3,452 张**，六个会议的年度统计同步更新。同步重建全部索引：`data/figures.json`、`assets/figures.js`、`forge/data/{figures,ids,bm25}.json`（idf / avgdl 按新语料重算）、`image_emb.bin`、`text_emb.bin`，并提升 `dataVersion` 让客户端自动拉新。
- **新增收录筛查规则 `scripts/filter_charts.py`**：把五条「纯图表」提示词与四条「手绘论文主图」提示词的 CLIP 文本向量固化在 `scripts/chart_prompts.json`，无需浏览器即可对新候选图打分；`margin ≥ 0.045` 提示复核、`0.030–0.045` 需人工看联系表、以下保留。可在命令行输出报告、联系表或指定区间清单。
- **README 演示 GIF 按反馈重制**：改为「完整显示、不裁切任何截图」（contain 适配），配色改为 256 色自适应调色板且**关闭抖动**（逐帧平均色差 1.9–4.5/255，接近原图），并去掉会过期的具体张数；1200×760 / 5 帧 / 784 KB。
- **效果对比图去数字化**：`forge/tutorial/compare.png` 去掉「3,516 张」等会随收录变动的数字，避免再次过期。
- **README 两阶段分析截图换新**：`forge/tutorial/03_analyze.png` 换成当前界面的四维归纳结果（1600×957）。三张 README 图与 GIF 都加了 `?v=20261002` 以绕开 GitHub 图片代理缓存。
- **README 增加贡献者名单**：致谢 [@timelic](https://github.com/timelic)（灯箱共享元素过渡与细节打磨，PR #2 / #3）与 [@TansyZenix](https://github.com/TansyZenix)（灯箱焦点限制、SVG sandbox、键盘可达性、数据校验 CI，PR #5–#8），并在收录标准里写明不收默认图表。

- **步骤二参考图改为框内滚动**：参考图区改为固定高度（70vh / 760px 上限）的内部滚动框，页面本身不再被卡片撑长（此前全部加载后页面高度可达 31 万像素，要拉很久才能到步骤三）；框内继续下滑照旧分批加载全部图，重新检索会把框内滚动位置复位到顶部。FigureForge 头部那句张数也改为从索引实时取数，不再写死。
- **README 演示 GIF 换新**：`forge/demo-forge.gif` 按当前界面重新制作（上传 PDF 解析 → 从 3,516 张里勾选参考图 → 两阶段归纳 → 生成初稿 → 同一个 prompt 的效果对比），960×620、5 帧、564 KB（旧图 602 KB）；中英文两处引用都加了 `?v=20261001` 以绕过 GitHub 图片代理缓存。
- **效果对比图重做**：`forge/tutorial/compare.png` 由 1080×2044 的竖排长图改为 1861×708 的左右并排图，两张图同屏可见、不用下拉；并去掉结尾的「客观结论」说明块与 README 里对应的「对比如下」引语。

- **修复画廊筛选标签首屏为空白**：中英切换功能上线后，筛选按钮改为脚本动态生成，但首次渲染漏了一次标签填充，只有切换过一次语言才会显示文字（会议 / 年份 / 等级 / 模式四行全是空胶囊）。现已补齐首次填充；同时修掉「全部」按钮后面的假计数 `0`，以及点「重置」后「全部」不再高亮（旧代码假设 `dataset` 第一个值一定是 `val`）的问题。
- **方舟 / 智谱 / 通义走原生 PDF 直传**：实测这几家都提供 OpenAI 兼容的 `/responses` 端点（预检与鉴权行为已确认），因此视觉模型现在优先尝试把 PDF 作为 `input_file` 直传（和 OpenAI 同一通道），由服务商自己解析；接口不支持时自动退回本地文本 / 页面图像。纯文本模型不发起这次尝试。
- **FigureForge 10 家服务商都能解析 PDF**：PDF 现在按三条通道依次尝试——① 服务商原生文档直传（OpenAI Responses `input_file` / Anthropic `document` / OpenAI 兼容中转的 `file`）；② 本地 PDF.js 提取正文后作为普通文本发送；③ 本地把 PDF 渲染成页面图像（视觉模型专用，扫描版也能读）。通道按服务商能力自动决定：火山方舟 / 硅基流动 / 智谱 / Kimi / 通义 / 混元 / DeepSeek 直接走文本通道，纯文本模型（如 DeepSeek）不会再浪费一次图像请求；定位章节与归纳始终由所选模型完成。三条通道都失败时，步骤一会逐条列出真实报错。
- **Anthropic / 混元支持浏览器直连**：Anthropic 请求现在携带 `anthropic-dangerous-direct-browser-access` 头（实测 401 可读），混元的 CORS 预检与响应头实测同样正常，两家不再强制要求中转；清单里对应的 `cors` 标记已更正。
- **修复 PDF.js 缓冲区被接管导致的二次提取失败**：pdf.js 会把传入的 ArrayBuffer 转移给 worker，文本提取之后再渲染页面会报 detached ArrayBuffer；现在每次提取都传入独立副本。

- **FigureForge 步骤一～三排版重构**：步骤一改为五个独立分框（绘图意图 / 论文内容来源 / 解析模型与接口 / 论文正文 / 检索参考图），宽屏两列、窄屏单列，不再有折叠面板和右侧空白；步骤二、步骤三沿用同一套分框配色（已选参考图 / 生成方式 / 出图模型）；精简了解析、中转、来源与检索说明文案，「尚未上传 PDF」标红加粗，接口地址仅在中转 / 自定义接入时显示，模型清单说明压缩为一行小字。
- **FigureForge 参考图可浏览全部**：步骤二不再只返回前 30 张——有输入时全部 3,516 张按匹配分数排序，不填内容时按会议 → 年份（与画廊首页一致）排序，首屏 60 张、向下滚动分批加载，标题栏显示总数、底部提示已显示全部；勾选与切换语言改为就地更新卡片，长列表滚动位置不再被重置。
- **FigureForge PDF 解析兜底**：文档直传（OpenAI Responses / Anthropic / 中转网关）失败时，自动用本地 PDF.js 提取正文并交给同一个解析模型，Ark、Kimi、Qwen、GLM、DeepSeek 等服务商也能按绘图意图解析；解析失败时在步骤一直接显示服务商返回的真实原因，不再只提示「模型解析失败」。同时修复筛选出 0 张时静默报错、空结果提示不显示的问题。
- **画廊首页窄屏修复**：顶栏检索行改为可换行、搜索框允许收缩，修复 640px 以下整页横向溢出（此前手机端布局宽度被撑到 630px）。

- **FigureForge 生图等待时间**：SVG、位图及参考图归纳请求的客户端等待时间延长到 5 分钟，同步更新超时提示，保留全部历史记录。

- **FigureForge 解析与上传视觉优化**：将 PDF 解析说明改为高对比的状态卡，按等待、完成和失败区分颜色与层级；上传入口改为醒目的气泡式按钮，加入悬停、按压回弹、焦点轮廓和减少动态效果兼容，保留原有 PDF 解析逻辑与历史记录。
- **FigureForge 本地索引与 CLIP 缓存修复**：Service Worker 现在对清单使用网络优先、对索引 / 模型使用持久化缓存，并等待大文件写入完成；移除清单时间戳造成的重复缓存，重新进入页面可复用已下载资源。加载界面显示缓存命中状态，并在索引或 CLIP 下载超过 180 秒时给出明确错误，而不是无限转圈；同时修复文本模型请求的脚本语法错误并避免浏览器复用旧 Service Worker。
- **FigureForge 模型直读 PDF 与统一 API 配置**：移除 PDF.js 作为语义提取链路；步骤一新增论文解析模型（对话 / 视觉模型）、服务商、Key 与中转地址设置。上传 PDF 后，解析模型按“概览 / 架构 / Pipeline / 结果 / 自定义”绘图意图定位章节、归纳段落并生成可编辑的绘图 prompt。支持 OpenAI Responses 的 `input_file`、Anthropic 文档消息和 OpenAI 兼容网关的文件消息；解析失败时明确提示，不静默注入低质量本地兜底内容。步骤三复用步骤一的服务商与 Key，只选择最终出图模型：SVG 选对话 / 视觉模型，位图选图像生成模型。

## [0.7.1] - 2026-09-28

### Fixed / FigureForge workflow

- **FigureForge 绘图意图驱动的 PDF 提取**：新增可折叠的“绘图意图”设置；可在自由输入、基础提取、按意图提取和自定义章节之间切换。选择 Pipeline、Architecture、Training 或 Results 时，浏览器仅从本地 PDF 截取匹配章节，并与标题、摘要及用户提示词组合后交给已选文本模型。
- **参考图灯箱体验**：FigureForge 参考图复用画廊的大图灯箱交互，支持开合动画、前后图滑动动画、键盘左右切换、Escape 关闭、原图和论文链接，并尊重减少动态效果设置。

- **绘图意图先行**：将可折叠的“先选择绘图意图”设置移到步骤一，用户先选择目标图类型和论文内容提取方式，再检索参考图；按意图提取的章节与标题、摘要及用户提示词组合后交给已选文本模型。

### Fixed / Community contributions
- **采纳社区 PR #6（[@TansyZenix](https://github.com/TansyZenix)）**：为 FigureForge 生成的 SVG 预览增加 `sandbox` 隔离，保留预览与下载能力，降低不可信 SVG 在同源页面中的脚本风险。
- **采纳社区 PR #7（[@TansyZenix](https://github.com/TansyZenix)）**：参考图卡片支持键盘聚焦、Enter/Space 选择，并通过 ARIA 状态向辅助技术反馈选择状态。
- **采纳社区 PR #5（[@TansyZenix](https://github.com/TansyZenix)）**：画廊灯箱打开时把 Tab 焦点限制在可见控件之间，跳过隐藏的前后翻页控件。
- **采纳社区 PR #8（[@TansyZenix](https://github.com/TansyZenix)）**：新增 GitHub Actions 数据守护，校验元数据、ID、图片路径、生成索引和来源字段，避免数据回归。

- **修复社区贡献被覆盖（[#4](https://github.com/qwdwqfwq/topconf-paper-figure-gallery/issues/4)）**：v0.5 提交 `665761f` 覆盖了此前已合并的 PR #2 / #3 灯箱代码及更新记录。本次在当前版本上恢复其实现，保留 2026 年数据、FigureForge 入口和后续更新。感谢 [@timelic](https://github.com/timelic) 贡献两项 PR，并发现和报告此次回归。
- **社区贡献（[@timelic](https://github.com/timelic)，[#2](https://github.com/qwdwqfwq/topconf-paper-figure-gallery/pull/2)）**：采纳灯箱共享元素过渡动画；卡片图片 / 标题 / 等级角标通过 View Transitions API 平滑进入灯箱，灯箱翻页使用滑入滑出效果，并为不支持该 API 的浏览器和“减少动态效果”设置保留兼容回退。
- **社区贡献（[@timelic](https://github.com/timelic)，[#3](https://github.com/qwdwqfwq/topconf-paper-figure-gallery/pull/3)）**：继续打磨灯箱过渡；作者名单、查看图片 / 论文链接、等级角标、卡片圆角和分隔符在单行 / 换行布局与窗口缩放时保持连续过渡。

## [0.6.0] - 2026-09-25

> 公开版本对照（public edition）：v0.3 = 画廊第一版（v1，六会议 2,298 张，2026-09-20 首发）；v0.4 = 画廊第二版（v2，新增等级角标，2,730 张）；v0.5 = 画廊第三版（v3，收录 2026 年已公开会议，3,528 张）；v0.6 = 画廊第四版（v4，FigureForge 纯静态化并去重，3,516 张）。宣发中提到的 "v4" 即指本次发布。


- **FigureForge 纯静态化**：画图工具从内测服务端版改为纯静态页面，全部在浏览器本地运行（CLIP 文本模型随仓库打包、本地推理），无后端、双击即开，可直接托管在 GitHub Pages。
- **两阶段生成（核心）**：参考图勾选上限由 3 提升到 10，默认勾选 8–10 张同类型图。Pass 1 视觉模型（关闭深度思考，约 20 秒）通读全部参考图，从 Layout / Elements / Palette / Hierarchy 四维度归纳版式共性、自动挑 2–3 张代表图并产出 refinedPrompt；Pass 2 再用归纳结果 + 代表图生成——多选也不会让版式互相打架。直接模式可精选 2–3 张、跳过归纳。
- **参考图真正作为图像输入**：SVG 路径把参考图以多模态消息（base64 图像）发送给视觉模型；位图路径对火山方舟 Seedream 使用多图参考参数（5.0 Pro 最多 10 张，硅基流动单图参考，失败自动降级为无参考 / 纯文本）。模型不支持视觉时自动降级为参考图文字标签注入。
- **以“快”为核心打磨**：Pass 1 关闭深度思考（60–90 秒 → 约 20 秒）；SVG 改为极简单面板、max 8192、截断自动补全；所有请求加超时（文本 90 秒 / 图像 150 秒）与“换更快模型”提示；检索结果按相关度评分降序、卡片显示评分。
- **服务商扩至十家**：新增 Kimi（月之暗面）、通义千问 Qwen、腾讯混元、Anthropic Claude；同时支持 OpenAI 兼容协议与 Anthropic 原生协议（/v1/messages）。混元 / Anthropic 官方接口不开放浏览器跨域，提供"使用中转"勾选与 Base URL 覆盖。
- **模型列表自动实时更新**：两层机制——页面每次打开 cache-bust 拉取仓库托管的 `forge/data/manifest.json`（维护者更新推荐名单即对所有用户生效）；填入 Key 后实时 GET 服务商 `/models`，账号已开通模型与新发布模型自动出现，无需更新页面。
- **跨代重复去重**：清理 v1 人工底与管线选图对同一论文的 12 组重复收录（保留管线版本），画廊规模 3,528 → **3,516 张**；旧图移入 `_local/trash_dups/` 备份。
- **画廊三处 FigureForge 入口**：首页 hero 下新增紫色全宽「FigureForge Beta」CTA、粘置工具条常驻「FigureForge ↗」按钮、README 顶部导航入口。
- **真实案例实测与客观对比**：用同一多智能体 framework prompt，对比豆包 Seedream 5.0 Pro 裸 prompt（文字干净但版式通用、缺论文叙事）与 FigureForge 两阶段（四面板：Baseline 对比 / Pipeline / 组件架构 / 跨任务泛化，版式地道）；位图定版式（小字号需核对）、SVG 文字 100% 准确可编辑，对比不拉踩；教学截图置于 `forge/tutorial/`。

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
