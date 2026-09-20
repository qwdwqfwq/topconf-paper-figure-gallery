# -*- coding: utf-8 -*-
"""Generate the polished bilingual README.md from data/figures.json.

Run after assemble_gallery.py. Keeps the README focused: counts, usage,
methodology ("how to design your own figure"), pipeline, and a compact
featured grid (top-scoring figures per venue/year). The full catalog lives
in the web gallery, not in the README.
"""
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
figs = json.loads((ROOT / "data" / "figures.json").read_text(encoding="utf-8"))
USER, REPO = "qwdwqfwq", "topconf-paper-figure-gallery"
PAGES = f"https://{USER}.github.io/{REPO}/"

VENUES = [("iclr", "ICLR", "🟣"), ("icml", "ICML", "🟢"), ("neurips", "NeurIPS", "🔴"),
          ("cvpr", "CVPR", "🟠"), ("acl", "ACL", "🔵"), ("aaai", "AAAI", "🟡")]
YEARS = (2023, 2024, 2025)
counts = defaultdict(lambda: defaultdict(int))
for f in figs:
    counts[f["venue"]][f["year"]] += 1
total = len(figs)
venue_total = {v: sum(counts[v].values()) for v, _, _ in VENUES}
venue_badge = "·".join(n for _, n, _ in VENUES)

# featured: top 2 by score per venue-year (deterministic)
feats = []
for v, _, _ in VENUES:
    for y in YEARS:
        items = [f for f in figs if f["venue"] == v and f["year"] == y]
        items.sort(key=lambda f: -(f.get("score") or 0))
        feats.extend(items[:2])

rows_table = "\n".join(
    f"| {ico} **{name}** | " + " | ".join(str(counts[v][y]) for y in YEARS) +
    f" | **{venue_total[v]}** |"
    for v, name, ico in VENUES)

featured_md = []
cur_v = None
for v, name, _ in VENUES:
    items = [f for f in feats if f["venue"] == v]
    if not items:
        continue
    featured_md.append(f"<br>\n\n**{name}**\n\n")
    cells = []
    for f in items:
        title = f["title"].replace("|", "\\|").replace("\n", " ")
        if len(title) > 92:
            title = title[:91] + "…"
        cells.append(
            f'<a href="{f["paper"]}"><img src="{f["image"]}" width="230"></a><br>'
            f'<sub>{f["year"]} · <a href="{f["paper"]}">{title}</a></sub>')
    # table rows of 3
    for i in range(0, len(cells), 3):
        featured_md.append("| " + " | ".join(cells[i:i + 3]) + " |")
        if i == 0:
            featured_md.append("|---|---|---|")
    featured_md.append("")

readme = f"""<div align="center">

<img src="docs/banner.jpg" alt="Top-Conf Figure Gallery banner" width="920">

# 🎨 Top-Conf Figure Gallery
### 顶会论文主图灵感画廊 · ICLR · ICML · NeurIPS · CVPR · ACL · AAAI · 2023–2025

<img src="docs/demo.gif" alt="Search, filter and lightbox demo" width="920">

[![Website](https://img.shields.io/website?down_color=lightgrey&label=Gallery&up_color=blue&up_message=online&url={PAGES})]({PAGES})
![Figures](https://img.shields.io/badge/figures-{total}-orange)
![Venues](https://img.shields.io/badge/venues-{venue_badge.replace(' ', '%20')}-purple)
![Years](https://img.shields.io/badge/years-2023--2025-success)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](requirements.txt)
[![License: MIT](https://img.shields.io/badge/code%20license-MIT-green.svg)](LICENSE)
[![Images license](https://img.shields.io/badge/images-CC%20BY%20(attribution)-yellow.svg)](IMAGES_POLICY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
![Last commit](https://img.shields.io/github/last-commit/{USER}/{REPO})
![Stars](https://img.shields.io/github/stars/{USER}/{REPO}?style=social)

**Before you design your paper's Figure 1, see how the best papers do it.**
A searchable, filterable gallery of well-designed Figure 1 / teaser figures — pure static
HTML/CSS/JS, no build step, works offline.

**做论文配图前，先看看顶会里最会画图的人是怎么画的。**
一个可搜索、可筛选的 Figure 1 / Teaser 画廊，纯静态、零构建、双击即开。

[🌐 Live gallery 在线画廊]({PAGES}) · [📚 Methodology 数据与方法](docs/METHODOLOGY.md) ·
[⚖️ Image policy 版权 / 下架](IMAGES_POLICY.md) · [🤝 Contributing 贡献指南](CONTRIBUTING.md)

</div>

---

## English

**Top-Conf Figure Gallery** collects visually *designed* Figure 1 / teaser figures
(conceptual diagrams, system frameworks, pipelines, architectures, benchmark overviews)
from six top ML/AI conferences, 2023–2025. It is a reference library for researchers
who want a clearer overview figure — it is not a ranking of papers. Every card links
back to its source paper and records venue, year, authors and a visual-pattern tag.

- 🗂️ Filter by **venue / year / visual pattern**; infinite-scroll masonry and a lightbox
- 🔍 Full-text **search over titles and authors** (e.g. `DPO`, `robot`, `gaussian`, `agent`)
- 🚫 **Every figure is hand-reviewed.** 25+ heuristic rules first discard default
  matplotlib charts, plain tables, GUI screenshots and unlabeled photo dumps; a human then
  reviews every remaining candidate, page by page — see [METHODOLOGY.md](docs/METHODOLOGY.md)
- 📦 Pure static site (HTML/CSS/JS), no backend, no build; clone and double-click
- 🔁 Fully open, reproducible pipeline: proceedings index → PDF download → Figure 1 crop
  → design-quality scoring → dHash de-duplication → manual page-by-page review

### 🎓 How to use this gallery to design your own overview figure

1. **Write the one-sentence story first** — input → transformation → output. Everything
   in the figure should serve that sentence.
2. **Pick a reading direction that matches the story**: left-to-right for a pipeline,
   centre-out for a system/framework, top-to-bottom for a hierarchy or taxonomy.
3. **Give each stage one visual verb and one accent colour** — boxes for modules, arrows
   for data flow, icons for data types. Use a neutral background; reserve colour for what
   matters (your contribution, the novel path, the output).
4. **Steal hierarchy and spacing, not artwork.** Filter `framework` / `pipeline` /
   `architecture` / `conceptual` and study how 8–12 similar papers align modules to a
   grid, size labels, and separate "what exists" from "what is new" (dashed/grey vs
   coloured/full).
5. **Label at paper width.** Export, then view the figure at the width of a two-column
   page: any label you cannot read must be enlarged, moved, or deleted.
6. **One figure, one message.** If a reviewer should remember a single claim, the figure's
   visual centre must already state it — results belong in Figure 2, not the teaser.

### Add a paper or a better figure

The easiest way is to open a **[Suggest a figure](https://github.com/{USER}/{REPO}/issues/new?template=add-figure-request.md)**
issue with the paper link — no coding required. If you'd like to open a PR,
[CONTRIBUTING.md](CONTRIBUTING.md) describes the metadata format and the quality bar.
Community contributions (new papers, better crops, new venues such as CHI / RSS / CoRL)
are the intended growth path after the 2023–2025 baseline.

Image files remain attributed to their authors and publishers; see
[IMAGES_POLICY.md](IMAGES_POLICY.md) for the educational-use and 72-hour takedown policy.

---

## ✨ 这是什么

写论文最头疼的不是"画什么图"，而是**想不到主图还能怎么排版、怎么隐喻**。
本仓库把六大顶会 2023–2025 里**真正体现作者排版与设计功力**的 Figure 1 / Teaser
集中起来，做成一个可检索的集群式画廊：

- 🗂️ 按 **会议 / 年份 / 视觉模式**（概念图、框架图、流程图、架构图、任务全景…）筛选
- 🔍 标题、作者、关键词 **全文搜索**（如 `DPO`、`robot`、`gaussian`、`agent`）
- 🖼️ 卡片瀑布流 + 点击**灯箱大图**，键盘 ←/→ 翻图，一键跳转原文
- 🚫 明确**剔除**默认 matplotlib 图表、纯表格、GUI 截图、无标签照片墙——只留有设计的图
- 📦 纯静态页面（HTML/CSS/JS），无需联网、无需构建，`file://` 双击即可打开
- 🔁 数据管线完全开源：会议索引 → PDF 下载 → Figure 1 裁剪 → 25+ 条规则打分 → dHash 去重 → 逐张人工复核

## 🎓 怎么用这个画廊画你自己的主图

1. **先写一句话故事**——输入 → 变换 → 输出，图上每个元素都要服务这句话。
2. **按故事选阅读方向**：流程用从左到右，系统/框架用由中心向外，层级/全景用自上而下。
3. **每个阶段只给一种视觉动词、一个强调色**：方框=模块，箭头=数据流，图标=数据类型；
   背景保持克制，颜色只留给重点（你的贡献、新路径、输出）。
4. **抄信息层级与留白，不抄画风**：用 `framework` / `pipeline` / `architecture` /
   `conceptual` 筛选，看 8–12 张同类图如何对齐网格、分配字号、区分"已有部分"
   （虚线/灰色）与"本文新增"（彩色/实心）。
5. **按论文成图宽度检查可读性**：导出后缩到双栏论文里的实际宽度，看不清的标签放大、挪位或删掉。
6. **一图一主旨**：如果希望审稿人只记住一个结论，图的视觉中心就必须直接说出它；
   结果对比留给 Figure 2，不要塞进 teaser。

## 📊 收录规模 / Coverage

| 会议 | 2023 | 2024 | 2025 | 合计 |
|---|---:|---:|---:|---:|
{rows_table}
| | | | **总计 Total** | **{total}** |

> 图片均从正式出版 PDF 渲染裁剪（约 180–216 DPI），网页版压缩为 ≤1500px JPEG；
> 每张图都标注论文标题、全部作者与原文链接。六个会议的每一张候选图都经过人工逐页复核
> （见 [METHODOLOGY](docs/METHODOLOGY.md)）。各会议数量不设统一指标，只保留达到设计标准的图，
> 因此数量差异反映的是各会议"设计型主图"的占比，而不是会议水平：
> NeurIPS 的设计型 overview figure 最多（803）；CVPR 的 Figure 1 常为结果照片墙，入选较少（225）；
> ACL/AAAI 的框架图文混排占比稳定（326/264）；理论向的 ICML 默认图表更多（310）。

## 🧭 视觉模式分类

标签描述的是**图的视觉功能**（不是论文领域），属于本画廊的实用分类：

| 标签 | 含义 | 代表 |
|---|---|---|
| `conceptual` | 用视觉隐喻讲清核心概念的卡通 / 示意图 | DPO、Tree of Thoughts、HippoRAG |
| `framework` | 系统 / 智能体模块协作总览 | HuggingGPT、SWE-agent、MetaGPT |
| `pipeline` | 端到端阶段式数据流 | LRM、VidMan、LiveStar |
| `architecture` | 模型内部层与张量连接 | BLIP-2、Caduceus、Medusa |
| `taxonomy` | 任务 / 能力 / 数据全景（benchmark overview） | EmbodiedBench、SimWorld |
| `teaser` | 经过版式设计的图文混排主视觉 | VIMA、PixArt-α |

## 🚀 快速开始

**方式一：在线浏览** —— 直接访问 [GitHub Pages 在线画廊]({PAGES})。

**方式二：本地服务器**

```bash
git clone https://github.com/{USER}/{REPO}.git
cd {REPO}
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

**方式三：直接打开** —— 双击 `index.html`（数据已内联在 `assets/figures.js`，无需联网）。

## 🗃️ 仓库结构

```
├── index.html               # 画廊主页（搜索 / 筛选 / 无限滚动 / 灯箱）
├── assets/
│   ├── style.css / app.js   # 样式与交互逻辑
│   └── figures.js           # 图片元数据（由 data/figures.json 生成）
├── images/<venue>/final/    # 画廊图片（≤1500px JPEG）
├── data/
│   ├── figures.json         # 画廊唯一权威清单：标题/作者/模式/链接/来源
│   └── pool/                # 全量候选论文池（复现用）
├── scripts/                 # 完整数据管线（见 docs/METHODOLOGY.md）
├── docs/                    # 方法文档、banner、演示 GIF
└── .github/workflows/       # GitHub Pages 自动部署
```

## 🔧 数据管线与复现

完整说明见 [docs/METHODOLOGY.md](docs/METHODOLOGY.md)：

```bash
pip install -r requirements.txt
# ICLR / ICML / NeurIPS（OpenReview / PMLR / NeurIPS proceedings / arXiv）
python scripts/build_pool.py          # 候选论文池
python scripts/extract_all.py         # 并行下载 PDF、裁剪 Figure 1（断点续跑）
# CVPR / ACL / AAAI（CVF / ACL Anthology / AAAI OJS；部分学术站点需在可访问的网络环境运行）
python scripts/build_pool_new.py cvpr,acl,aaai
python scripts/extract_new.py cvpr,acl,aaai 12
# 六个会议统一打分、装配
python scripts/score_select.py 980    # 25+ 条 reject 规则、设计感评分、dHash 去重、按配额选图
python scripts/assemble_gallery.py 1000   # PNG→JPEG、生成 figures.json / figures.js
python scripts/clean_stale.py         # 删除无引用图片
# 人工复核：enum_sheets 按会议生成 40 格/页联系表逐页检查；sheet_qa 可随机抽样复核
python scripts/enum_sheets.py iclr
python scripts/sheet_qa.py 31
```

## 🗺️ Roadmap

- [x] 60 张人工精选种子画廊（v0.1）
- [x] ICLR / ICML / NeurIPS 自动管线扩量（v0.2–v0.3）
- [x] CVPR / ACL / AAAI（2023–2025）同管线扩展（v0.3）
- [ ] 持续人工复核、清理不合格图片，开放社区 PR 补图机制
- [ ] CHI / CoRL / RSS / EMNLP 等会议扩展
- [ ] 相似图推荐、按配色检索、一键导出 BibTeX

## 🤝 贡献

欢迎补图、修标签、修 bug、扩展新会议。**不会写代码也没关系**：直接开一个
[Suggest a figure](https://github.com/{USER}/{REPO}/issues/new?template=add-figure-request.md)
Issue，贴上论文链接和你推荐的图即可，维护者会处理。提 PR 前请先看 [CONTRIBUTING.md](CONTRIBUTING.md)，
特别注意**收录标准**：不要纯照片墙和默认图表。提 PR 即代表你确认图片来自正式出版论文、
且仅用于署名的学术参考。

## ⚠️ 版权说明

图片版权归**原作者与出版方**所有，本仓库仅作非商业教育/研究用途的署名索引；
ICLR / ICML(PMLR) / NeurIPS / CVPR(CVF) / ACL Anthology 正式出版论文多为 CC BY 4.0，
AAAI 论文版权归 AAAI 与作者所有（fair-use 学术参考）。
版权方若要求下架，请提 Issue 或邮件 **939123836@qq.com**，核实后 72 小时内删除。
详见 [IMAGES_POLICY.md](IMAGES_POLICY.md)。

## 📌 引用

如果你在研究/教学中用到本画廊，欢迎 star 并引用：

```bibtex
@misc{{topconf_figure_gallery,
  title  = {{Top-Conf Figure Gallery: A Curated Gallery of Figure 1 / Teaser Designs from ICLR, ICML, NeurIPS, CVPR, ACL and AAAI (2023-2025)}},
  year   = {{2026}},
  url    = {{https://github.com/{USER}/{REPO}}}
}}
```

## 🖼️ 精选图录（每会议-年份评分最高的 2 张；完整 {total} 张请用[在线画廊]({PAGES})）

{chr(10).join(featured_md)}
<sub>图片版权归原作者及出版方所有，点击图片跳转原文。</sub>
"""

(ROOT / "README.md").write_text(readme, encoding="utf-8")
print("README written:", total, "figures,", len(readme), "chars,", len(feats), "featured")
