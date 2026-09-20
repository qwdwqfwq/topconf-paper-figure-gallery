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
| ICLR | 2023–2025 | OpenReview API 全量接收列表（poster / spotlight / oral） | ~7,500 |
| ICML | 2023–2025 | PMLR proceedings 索引（v202 / v235 / v267） | ~7,800 |
| NeurIPS | 2023–2024 | NeurIPS proceedings 索引 | ~7,700 |
| NeurIPS | 2025 | arXiv 评论字段 `co:"NeurIPS 2025"`（正式 proceedings 上线前的备用源） | ~2,800 |
| CVPR | 2023–2025 | CVF Open Access `openaccess.thecvf.com/CVPR{year}?day=all`（排除 supplemental） | 7,940 |
| ACL | 2023–2025 | ACL Anthology events 页（仅 long / short / findings，跳过 front matter） | 6,977 |
| AAAI | 2023–2025 | AAAI OJS issue archive（technical tracks，跨分页按 issue 边界收集） | 6,937 |

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
- **edge cut（边缘截断）/ too small / bad aspect（尺寸或比例异常）**；
- **screenshot（软件截图、终端输出）**、**heatmap/results grid（结果网格照片墙）**；
- **duplicate**：感知哈希 dHash 去重；另有手动排除清单 `data/exclude.txt`。

最后按**会议-年份配额**（proportional + largest remainder）取每个会议-年份内
得分靠前的图，并对视觉模式做分层以保证多样性。

> **关于数量 / On counts**：各会议不设统一的入选指标，只保留达到设计标准的图。
> NeurIPS 的设计型 overview figure 占比最高（803 张）；CVPR 虽为视觉会议，
> 但其 Figure 1 常是定性结果照片墙 / 视频帧条带，在人工复核中被大量剔除，
> 最终收录 225 张；ACL / AAAI 的 system/framework 图文混排主图占比稳定
> （326 / 264 张）；理论向的 ICML 多为默认图表，收录 310 张。
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

最终入选 **2,238 张管线选图 + 60 张 v1 人工底 = 2,298 张**
（ICLR 370 / ICML 310 / NeurIPS 803 / CVPR 225 / ACL 326 / AAAI 264）；
`data/exclude.txt` 累计排除约 1,400 张低质量裁剪。

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
