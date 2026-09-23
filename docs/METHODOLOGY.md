# Methodology · 数据与选图方法 / Curation Pipeline

> 本画廊不是"把论文里的第一张图抓下来"，而是一条**可复现的设计质量筛选管线**：
> 候选池 → PDF 渲染裁图 → 25+ 条设计感规则打分 → 感知哈希去重 →
> 会议/年份配额与视觉模式分层 → 人工逐页复核全部候选图。
>
> This is not a raw figure dump: every figure passes a reproducible
> design-quality pipeline (pool → PDF crop → 25+ heuristic rules → dHash
> de-duplication → venue/year quotas with pattern stratification →
> **manual page-by-page review of every candidate**).

## 1. 候选论文池 / Candidate pools

| Venue 会议 | Years 年份 | Source 来源 | Pool size 规模 |
|---|---|---|---|
| ICLR | 2023–2026 | OpenReview API 全量接收列表（poster / spotlight / oral） | ~12,900 |
| ICML | 2023–2025 | PMLR proceedings 索引（v202 / v235 / v267） | ~7,800 |
| ICML | 2026 | OpenReview API 全量接收列表 + arXiv 评论字段（PMLR 卷尚未出版） | 6,341 |
| NeurIPS | 2023–2024 | NeurIPS proceedings 索引 | ~7,700 |
| NeurIPS | 2025 | arXiv 评论字段 `co:"NeurIPS 2025"`（正式 proceedings 上线前的备用源） | ~2,800 |
| CVPR | 2023–2026 | CVF Open Access `openaccess.thecvf.com/CVPR{year}?day=all`（排除 supplemental） | ~12,000 |
| ACL | 2023–2026 | ACL Anthology events 页（仅 long / short / findings，跳过 front matter） | ~11,400 |
| AAAI | 2023–2026 | AAAI OJS issue archive（technical tracks，跨分页按 issue 边界收集） | ~8,100 |

- ICLR 接收状态以 OpenReview note 的 `venue` 字段为准（排除 `Submitted`）；
  PDF 优先取 OpenReview 官方附件，arXiv 评论字段标题模糊匹配（token F1 ≥ 0.92）作为备用源。
- CVPR 每篇论文在 CVF 页面对应两个 `dd`：作者表单与 PDF 链接；只取 `/papers/*.pdf`，
  排除 supplemental material。
- ACL 只收录 `acl-long` / `acl-short` / `findings-acl` 三类；编号 `.0` 为 front matter，跳过。
- AAAI 的 OJS archive 每页 25 个 issue 且**会议技术轨道跨页**，脚本按 issue 边界翻页收集，
  PDF 直链（`a.obj_galley_link.pdf`）与作者均在 TOC 页直接给出。
- 所有候选按标题视觉主题关键词（diffusion / gaussian / video / robot / agent / VLA /
  avatar / 3D / multimodal / segmentation / generation…）分为 tier-1（视觉类）与 tier-2，
  优先处理 tier-1；作者字段全部来自官方列表页，无需第三方作者补全。

## 2. Figure 1 自动裁剪 / Cropping

1. PyMuPDF 打开 PDF，在第 1–4 页用正则定位所有 `Figure 1` / `Fig. 1` 图注候选；
2. 收集图注正上方同一 x 跨度内的矢量绘图（drawings）与位图（images）；
3. 跳过页眉装饰细线，并做**垂直间隙聚类**：与图注间隙 ≤ 58 pt 的框属于同一张图，
   遇到大间隙即停止，避免把标题、摘要裁进来；
4. 取内容面积最大的候选，按约 180–216 DPI 裁剪输出 PNG。

已知局限：双栏跨栏图、图注与图分离、Figure 1 是整页表格时会误裁；
这类图会在评分阶段被过滤，或在人工复核中剔除。

## 3. 设计感评分与筛选 / Design-quality scoring

每张裁剪图同时记录：

- 矢量路径 / 矩形 / 曲线数量（作者手绘设计元素的密度）
- 图内文字标签数量与字符数
- 位图数量与位图覆盖面积比例
- 图边缘被截断的文字数（完整性信号）
- 配色丰富度、饱和度、边缘密度（PIL/numpy）

25+ 条 reject 规则，主要类别包括：

- **photo dump（纯大图拼接）**：位图占比 > 0.82 且几乎没有矢量元素与标签；
- **default / raster chart（默认图表、坐标轴截图）**：文字密集、配色单一；
- **unlabeled plot / panels（无标签坐标图、无标注面板）**；
- **text wall / table page（文字墙、整页表格）**；
- **edge cut（边缘截断）/ too small / bad aspect（尺寸或比例异常）**：v0.5 起边缘截断
  改为对渲染 PNG 四边采样墨迹的 border_ink 检测（旧的 PDF 矢量 edge_cut 对宽幅全幅图
  大量误报，已弃用）；
- **screenshot（软件截图、终端输出）**、**heatmap/results grid（结果网格照片墙）**；
- **duplicate**：感知哈希 dHash 去重；另有手动排除清单 `data/exclude.txt`。

最后按**会议-年份配额**（proportional + largest remainder）取每个会议-年份内
得分靠前的图，并对视觉模式做分层以保证多样性。

> **关于数量 / On counts**：各会议不设统一的入选指标，只保留达到设计标准的图。
> NeurIPS 的设计型 overview figure 占比最高（979 张）；CVPR 虽为视觉会议，
> 但其 Figure 1 常是定性结果照片墙 / 视频帧条带，在人工复核中被大量剔除，
> 最终收录 308 张；ACL / AAAI 的 system/framework 图文混排主图占比稳定
> （385 / 301 张）；理论向的 ICML 多为默认图表，收录 787 张。
> 这些差异反映的是"设计型主图"占比的真实分布，不是采集失败或会议水平排序。

## 4. 视觉模式标签 / Visual patterns

标签描述的是**图的视觉功能**（不是论文领域），属于本画廊的实用分类：

| Tag | 判定线索 Visual cue |
|---|---|
| `teaser` | 经过版式设计的主视觉 / 图文混排 teaser |
| `conceptual` | 用视觉隐喻解释核心概念（卡通、示意图） |
| `framework` | 系统 / 智能体模块协作总览 |
| `pipeline` | 端到端数据流、阶段式流程 |
| `architecture` | 模型内部层、模块、张量连接 |
| `taxonomy` | 任务 / 能力 / 数据的分类全景（benchmark overview） |
| `results` | 经过设计的结果对比（非纯照片墙） |
| `comparison` | 方法对比矩阵 / 对照图 |

## 5. 人工复核 / Manual review

评分只能做粗筛，最终把关靠人眼。v0.3 的复核分两步，**六个会议的每一张候选图都经过人工逐页检查**：

1. **先随机抽样检查**：用 `scripts/sheet_qa.py <seed>` 按会议-年份分层随机生成 32 格
   联系表（不同 seed 得到不同样本）。抽查发现不合格裁剪在评分排名的各个分段都有出现
   ——只砍掉低分尾部并不能保证质量，因此对全部候选图改为逐页复核。
2. **逐页联系表复核**：`scripts/enum_sheets.py <venue>` 把每个会议的全部候选图按 40 格/页
   拼成联系表（ICLR 12 页、ICML 10 页、NeurIPS 25 页、CVPR 15 页、ACL 11 页、AAAI 8 页，
   共 81 页），逐页剔除纯图表、聊天/示例页、代码与表格页、视频帧条带、结果照片墙
   （含人脸/食物/3D 渲染网格）、UI/网页/手机截图与波形页；被剔除的 id 记录在
   `data/enum_<venue>_ids.txt`，汇总进 `data/exclude.txt` 后重跑选图。
3. **补位图二轮复核**：重跑选图后新进入画廊的补位图片再做两轮随机抽样联系表检查，
   补掉少量漏网的不合格裁剪后定稿。

v0.3 定稿为 **2,238 张管线选图 + 60 张 v1 人工底 = 2,298 张**
（ICLR 370 / ICML 310 / NeurIPS 803 / CVPR 225 / ACL 326 / AAAI 264）；
v0.4 在此基础上扩至 2,730 张（见 §5b），v0.5 扩至 3,528 张（见 §5c）。
`data/exclude.txt` 累计排除约 1,400 张低质量裁剪。

## 5b. v0.4：高等级论文索引 / Oral · Spotlight · Best tier index

v0.4 对 ICLR / ICML / NeurIPS 2023–2025 的高等级论文做了完整索引，而不是只按视觉分排序：

1. **名单 / Rosters**：以官方接受名单为准，共 3,822 篇 oral / spotlight
   （OpenReview venue 字段；ICLR 2023 当年未使用 oral/spotlight 命名，
   官方 *notable top 5%* 记为 Oral、*notable top 25%* 记为 Spotlight；
   ICML 2023 只有 OralPoster 一档，记为 Oral）。
2. **奖项 / Awards**：三大会 2023–2025 的 Best / Outstanding Paper 与
   Honorable Mention 共 66 篇，按官方公告人工核对（个别标题与 OpenReview 记录有出入时，
   以标题模糊匹配 + 人工确认）。
3. **宽松补裁 / Rescue pass**：理论/方法论文的 Figure 1 常无标准图注或位于前 6 页，
   严格裁图会漏图。补裁轮放宽图注字号容差（+10 pt）、扫描前 6 页，
   无图注时退回页内最大图；下载失败逐篇重试，最终下载失败为 0。
   仍无图的论文（纯理论正文）不产生卡片，这是内容本身决定的空缺。
4. **两轮人工 QA**：
   - 规则软门（"照片墙 / 边缘截断"等指标）会误伤全幅框架图与管线图。
     1,238 张软拒绝候选拼成 31 页联系表逐页人工判定，保留其中设计完整的
     框架 / 流程 / 概念图（白名单强制放行，仍经过 dHash 去重与尺寸下限）；
   - 自动门通过的新增图片再出 8 页联系表逐张复核，剔除漏网的图表页、
     截图页与结果照片墙。
5. **角标 / Badges**：卡片左上角与灯箱内显示等级——
   ★ 红色 = Best / Outstanding（Honorable Mention 为白底红描边）、
   金色 = Oral、银色 = Spotlight；筛选栏的 Tier 维度与会议 / 年份 / 模式正交。

v0.4 后画廊共 **2,730 张**，其中带等级标识 622 张
（Best/Outstanding/Honorable 12、Oral 138、Spotlight 472）。

## 5c. v0.5：2026 年会议收录 / 2026 proceedings

v0.5 应社区要求收录 2026 年已公开的会议，流程与历年一致，差异点如下：

1. **可用性核查 / Availability**：CVPR 2026（CVF 完整列表）、ACL 2026
   （ACL Anthology events 页）、AAAI-26（OJS 12 个 technical tracks）均已出版；
   ICML 2026 的 PMLR 卷尚未出版，改用 OpenReview 接收列表 + arXiv 评论字段；
   NeurIPS 2026 录用名单未公布（会期 12 月），本届不收录。
2. **候选池 / Pool**：五会议 tier-1 候选共 8,963 篇
   （ICLR 1,912、ICML 2,191、CVPR 3,040、ACL 1,015、AAAI 805）。
3. **等级口径 / Tiers**：ICLR 2026 官方只设 Oral（224 篇）与 Poster，没有
   Spotlight 档；ICML 2026 为 168 Oral、536 Spotlight（Oral 是 Spotlight 子集），
   名单取自官方日程页。Best / Outstanding 与 Honorable Mention 按官方博客核对。
4. **抽取通道 / Fetch channel**：持续负载下 Python requests 在 CVF / ACL 站点
   被限速（单文件 120s+），下载器改用 curl_cffi 浏览器指纹（TLS/JA3 对齐 Chrome）；
   OpenReview PDF 经浏览器通过 Turnstile 验证后导出 clearance cookie，
   走代理串行批量下载，高等级论文 PDF 全部入库。
5. **edge-cut 规则修正**：旧 PDF 矢量 edge_cut 在 837 张入选图上触发，抽样 12 张
   仅 2–3 张真切；改为渲染图四边墨迹的 border_ink 检测（左右边墨迹行占比 > 0.15、
   顶边 > 0.5 判截断，底边不判——底部常含图注），已知真值上可分；
   个别高等级图被误报时人工核验后回捞。
6. **人工 QA**：798 张入选图拼成 65 张联系表（12 图/张，含 id / 角标 / 标题），
   逐张目检，无坏图、无补删。两篇 2026 Best 论文为纯理论工作、正文无图，
   不产生卡片，这是内容本身决定的空缺。

v0.5 后画廊共 **3,528 张**，其中 2026 年 798 张
（ICLR 247、ICML 372、CVPR 83、ACL 59、AAAI 37）。

## 6. 复现 / Reproduce

```bash
pip install -r requirements.txt

# ICLR / ICML / NeurIPS（OpenReview / PMLR / proceedings + arXiv）
python scripts/build_pool.py
python scripts/extract_all.py

# CVPR / ACL / AAAI（CVF / ACL Anthology / AAAI OJS；部分学术站点需在可访问的网络环境运行）
python scripts/build_pool_new.py cvpr,acl,aaai
python scripts/extract_new.py cvpr,acl,aaai 12      # 12 workers，可断点续跑

# 六会议统一打分、配额选图
python scripts/score_select.py 980

# 装配网页 JPEG（images/<venue>/final/）与 assets/figures.js
python scripts/assemble_gallery.py 1000
python scripts/clean_stale.py

# 人工复核：enum_sheets 逐页检查全部候选，sheet_qa 随机抽样；不合格 id 写入
# data/exclude.txt 后重跑 score_select + assemble
python scripts/enum_sheets.py iclr
python scripts/sheet_qa.py 31

# 文档与发布素材
python scripts/build_readme3.py     # 双语 README
python scripts/make_social.py       # docs/banner.jpg + docs/social-preview.png
python scripts/record_demo.py       # docs/demo.gif（需先 python -m http.server 8765）
```

中间产物（PDF、全量裁剪 PNG、运行状态文件、blob 缓存等）不入库，见 `.gitignore`。
