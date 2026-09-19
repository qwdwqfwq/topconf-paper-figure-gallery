# -*- coding: utf-8 -*-
"""Generate the high-star-style README.md from data/figures.json."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
figs = json.loads((ROOT/"data"/"figures.json").read_text(encoding="utf-8"))
USER, REPO = "qwdwqfwq", "topconf-paper-figure-gallery"
PAGES = f"https://{USER}.github.io/{REPO}/"
VENUE_NAME = {"iclr": "ICLR", "icml": "ICML", "neurips": "NeurIPS"}
PATTERN_CN = {"teaser": "Teaser 主视觉", "conceptual": "Conceptual 概念示意",
              "framework": "Framework 框架", "pipeline": "Pipeline 流程",
              "architecture": "Architecture 架构", "taxonomy": "Taxonomy 全景",
              "results": "Results 结果", "comparison": "Comparison 对比"}

def esc(s): return s.replace("|", "\\|")
def fauthors(a):
    a = a or []
    return a[0] + (" et al." if len(a) > 1 else "") if a else ""

counts = {v: {y: 0 for y in (2023, 2024, 2025)} for v in VENUE_NAME}
for f in figs:
    counts[f["venue"]][f["year"]] += 1
total = len(figs)

badges = f"""
<div align="center">

<img src="docs/banner.jpg" alt="Top-Conf Figure Gallery banner" width="920">

# 🎨 Top-Conf Figure Gallery
### 顶会论文主图灵感画廊 · ICLR / ICML / NeurIPS

[![Website](https://img.shields.io/website?down_color=lightgrey&label=Gallery&up_color=blue&up_message=online&url={PAGES})]({PAGES})
![Figures](https://img.shields.io/badge/figures-{total}-orange)
[![Venues](https://img.shields.io/badge/venues-ICLR%20%C2%B7%20ICML%20%C2%B7%20NeurIPS-purple)](#)
![Years](https://img.shields.io/badge/years-2023--2025-success)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](requirements.txt)
[![License: MIT](https://img.shields.io/badge/code%20license-MIT-green.svg)](LICENSE)
[![Images license](https://img.shields.io/badge/images-CC%20BY%20(attribution)-yellow.svg)](IMAGES_POLICY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
![Last commit](https://img.shields.io/github/last-commit/{USER}/{REPO})
![Stars](https://img.shields.io/github/stars/{USER}/{REPO}?style=social)

**做论文配图时，先看看顶会里最会画图的人是怎么画的。**
一个可搜索、可筛选的 Figure 1 / Teaser 画廊，纯静态、零构建、双击即开。

[🌐 在线画廊]({PAGES}) · [📚 数据与方法](docs/METHODOLOGY.md) · [⚖️ 图片版权 / 下架](IMAGES_POLICY.md) · [🤝 贡献指南](CONTRIBUTING.md)

</div>

---
"""

features = f"""
## ✨ 这是什么

写论文最头疼的不是"画什么图"，而是**想不到主图还能怎么排版、怎么隐喻**。
本仓库把 ICLR / ICML / NeurIPS 近三年里**真正体现作者排版与设计功力**的 Figure 1
集中起来，做成一个集群式画廊：

- 🗂️ 按 **会议 / 年份 / 视觉模式**（概念图、框架图、流程图、架构图、任务全景…）筛选
- 🔍 标题、作者、关键词 **全文搜索**（如 `DPO`、`robot`、`gaussian`、`Song`）
- 🖼️ 卡片瀑布流 + 点击**灯箱大图**，一键跳转原文
- 🚫 明确**剔除**纯大图拼接（几张照片堆一起）、默认样式图表和纯表格——只留有设计的图
- 📦 纯静态页面（HTML/CSS/JS），无需联网、无需构建，`file://` 双击即可打开
- 🔁 数据管线完全开源：会议索引 → PDF 下载 → Figure 1 裁剪 → 设计感评分，可复现、可扩展

## 📊 收录规模

| 会议 | 2023 | 2024 | 2025 | 合计 |
|---|---:|---:|---:|---:|
| 🟣 **ICLR** | {counts['iclr'][2023]} | {counts['iclr'][2024]} | {counts['iclr'][2025]} | **{sum(counts['iclr'].values())}** |
| 🟢 **ICML** | {counts['icml'][2023]} | {counts['icml'][2024]} | {counts['icml'][2025]} | **{sum(counts['icml'].values())}** |
| 🔴 **NeurIPS** | {counts['neurips'][2023]} | {counts['neurips'][2024]} | {counts['neurips'][2025]} | **{sum(counts['neurips'].values())}** |
| | | | **总计** | **{total}** |

> 图片均从正式出版 PDF 渲染裁剪（约 180–216 DPI），网页版压缩为 ≤1500px JPEG；
> 每张图都标注论文标题、全部作者与原文链接。

## 🧭 视觉模式分类

学术界对"论文图类型"没有统一标准，下面是本画廊按**图的视觉功能**做的实用分类：

| 标签 | 含义 | 代表 |
|---|---|---|
| `conceptual` | 用视觉隐喻讲清核心概念的卡通 / 示意图 | DPO、Tree of Thoughts、HippoRAG |
| `framework` | 系统 / 智能体模块协作总览 | HuggingGPT、SWE-agent、MetaGPT |
| `pipeline` | 端到端阶段式数据流 | LRM、VidMan、LiveStar |
| `architecture` | 模型内部层与张量连接 | BLIP-2、Caduceus、Medusa |
| `taxonomy` | 任务 / 能力 / 数据全景（benchmark overview） | EmbodiedBench、SimWorld |
| `teaser` | 经过版式设计的图文混排主视觉 | VIMA、PixArt-α |

"""

start = """
## 🚀 快速开始

**方式一：直接打开** —— 下载/克隆仓库后双击 `index.html`（数据已内联，无需联网）。

**方式二：本地服务器**

```bash
git clone https://github.com/{u}/{r}.git
cd {r}
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

**方式三：在线浏览** —— 直接访问 [GitHub Pages]({pages})。

## 🗃️ 仓库结构

```
├── index.html               # 画廊主页
├── assets/
│   ├── style.css / app.js   # 样式与筛选/搜索/灯箱逻辑
│   └── figures.js           # 图片元数据（由 data/figures.json 生成）
├── images/<venue>/final/    # 画廊图片（JPEG）
├── data/
│   ├── figures.json         # 精选清单：标题/作者/模式/链接/来源
│   ├── pool/                # 全量候选论文池（复现用）
│   ├── indexes.json          # proceedings 全量索引
│   └── openreview/          # ICLR OpenReview 原始导出
├── scripts/                 # 完整数据管线（见 docs/METHODOLOGY.md）
├── docs/                    # 方法文档与 banner
└── .github/workflows/       # GitHub Pages 自动部署
```

## 🔧 数据管线与复现

完整说明见 [docs/METHODOLOGY.md](docs/METHODOLOGY.md)：

```bash
pip install -r requirements.txt
python scripts/build_pool.py        # 候选论文池（proceedings + OpenReview + arXiv）
python scripts/extract_all.py       # 并行下载 PDF、裁剪 Figure 1（断点续跑）
python scripts/score_select.py      # 设计感评分、去重、按配额选图
python scripts/build_web.py         # 生成网页 JPEG 与 assets/figures.js
```

## 🗺️ Roadmap

- [x] 60 张人工精选种子画廊（v0.1）
- [ ] 扩展至每个会议约 1,000 张（共 ~3,000），自动设计感评分 + 人工抽检
- [ ] CVPR / ACL / CHI / RSS 等会议扩展
- [ ] 相似图推荐、按配色检索、一键导出 BibTeX

## 🤝 贡献

欢迎补图、修标签、修 bug、扩展新会议——先看 [CONTRIBUTING.md](CONTRIBUTING.md)，
特别注意**收录标准**：不要纯照片墙和默认图表。

## ⚠️ 版权说明

图片版权归**原作者与出版方**所有，本仓库仅作非商业教育/研究用途的署名索引；
ICLR / ICML(PMLR) / NeurIPS 正式出版论文多为 CC BY 4.0。
版权方若要求下架，请提 Issue 或邮件 **939123836@qq.com**，核实后 72 小时内删除。
详见 [IMAGES_POLICY.md](IMAGES_POLICY.md)。

## 📌 引用

如果你在研究/教学中用到本画廊，欢迎 star 并引用：

```bibtex
@misc{topconf_figure_gallery,
  title  = {Top-Conf Figure Gallery: A Curated Gallery of Figure 1 / Teaser Designs from ICLR, ICML and NeurIPS},
  year   = {2026},
  url    = {https://github.com/%s/%s}
}
```
""".replace("{u}", USER).replace("{r}", REPO).replace("{pages}", PAGES) % (USER, REPO)

# catalog (cap to keep README readable; full set lives on the website)
CAP = 90
catalog = ["\n## 🖼️ 图录（%d 张，完整筛选体验请用[在线画廊](%s)）\n" % (total, PAGES)]
shown = 0
for venue in ("iclr", "icml", "neurips"):
    for year in (2023, 2024, 2025):
        items = [f for f in figs if f["venue"] == venue and f["year"] == year]
        if not items: continue
        catalog.append(f"\n<details><summary><b>{VENUE_NAME[venue]} {year}</b>（{len(items)} 张）</summary>\n")
        catalog.append("| 预览 | 论文 | 第一作者 | 模式 |")
        catalog.append("|---|---|---|---|")
        for f in items:
            catalog.append(f'| <img src="{f["image"]}" width="240"> | [{esc(f["title"])}]({f["paper"]}) | {esc(fauthors(f["authors"]))} | {PATTERN_CN.get(f["pattern"], f["pattern"])} |')
            shown += 1
        catalog.append("\n</details>\n")
        if shown >= CAP: break
    if shown >= CAP: break

readme = badges + features + start + "".join(catalog)
(ROOT/"README.md").write_text(readme, encoding="utf-8")
print("README written:", total, "figures,", len(readme), "chars")
