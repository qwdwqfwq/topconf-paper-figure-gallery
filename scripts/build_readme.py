# -*- coding: utf-8 -*-
"""Generate README.md with a full catalog of the 60 curated figures."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
figs = json.loads((ROOT / "data/figures.json").read_text(encoding="utf-8"))
VENUE_NAME = {"iclr": "ICLR", "icml": "ICML", "neurips": "NeurIPS"}
PATTERN_CN = {
 "teaser": "Teaser 结果拼图", "conceptual": "Conceptual 概念示意",
 "framework": "Framework 框架", "pipeline": "Pipeline 流程",
 "architecture": "Architecture 架构", "taxonomy": "Taxonomy 分类",
}

def short_authors(a):
    a = a or []
    return a[0] + (" et al." if len(a) > 1 else "") if a else ""

def esc(s):
    return s.replace("|", "\\|")

tables = []
for venue in ["iclr", "icml", "neurips"]:
    for year in [2023, 2024, 2025]:
        items = [f for f in figs if f["venue"] == venue and f["year"] == year]
        if not items:
            continue
        tables.append(f"\n### {VENUE_NAME[venue]} {year}（{len(items)} 张）\n")
        tables.append("| 预览 | 论文 | 第一作者 | 视觉模式 |")
        tables.append("|---|---|---|---|")
        for f in items:
            img = f'<img src="{f["image"]}" width="260">'
            title = f'[{esc(f["title"])}]({f["paper"]})'
            tables.append(f"| {img} | {title} | {esc(short_authors(f['authors']))} | {PATTERN_CN.get(f['pattern'], f['pattern'])} |")
catalog = "\n".join(tables)

counts = {v: sum(1 for f in figs if f["venue"] == v) for v in VENUE_NAME}

readme = f"""# Top-Conf Figure Gallery · 顶会论文主图灵感画廊

精选 **ICLR / ICML / NeurIPS 2023–2025** 三大机器学习顶会的 **60 张 Figure 1 / Teaser**——
那些让人一眼记住论文的概念示意图、系统流程图、架构图与结果拼图。

做论文配图时，与其从零开始想"主图画什么"，不如先把顶会里最精致的一批图摆在面前找灵感：
本仓库提供一个**纯静态网页**，可按会议、年份、视觉模式筛选，并支持标题 / 作者关键词搜索。

> 🖼️ 在线浏览（GitHub Pages）：部署后替换为你的 Pages 地址，例如
> `https://<your-username>.github.io/topconf-paper-figure-gallery/`
>
> 本地浏览：直接双击 `index.html` 即可（无需联网、无需构建）；
> 或在仓库目录运行 `python -m http.server 8000` 后访问 `http://localhost:8000`。

## 收录范围

| 会议 | 2023 | 2024 | 2025 | 合计 |
|---|---:|---:|---:|---:|
| ICLR | 7 | 7 | 6 | {counts['iclr']} |
| ICML | 7 | 7 | 6 | {counts['icml']} |
| NeurIPS | 7 | 7 | 6 | {counts['neurips']} |

选图标准：**Figure 1 本身具有较强视觉表达**——卡通化概念隐喻、精心设计的框架图、
高质量结果拼图；纯文字表格、默认样式折线图、截图堆叠类的 Figure 1 未收录。
每张图均从正式出版 PDF 以约 216 DPI 渲染裁剪，网页版为宽度 ≤1500px 的 JPEG（约 8 MB / 60 张）。

## 视觉模式分类

| 标签 | 含义 |
|---|---|
| `teaser` | 结果展示 / 效果拼图，用最惊艳的样本抓住读者 |
| `conceptual` | 核心概念的视觉隐喻（如 DPO 的"奖励模型"卡通、HippoRAG 的海马体） |
| `framework` | 系统 / 智能体整体框架总览（模块如何协作） |
| `pipeline` | 端到端处理流程（数据如何一步步流过） |
| `architecture` | 模型内部架构（层、模块、张量流） |
| `taxonomy` | 分类体系 / Benchmark 任务全景 |

## 目录结构

```
├── index.html              # 画廊主页（直接打开）
├── assets/
│   ├── style.css           # 样式
│   ├── app.js              # 筛选 / 搜索 / 灯箱逻辑
│   └── figures.js          # 60 张图的元数据（由 data/figures.json 生成）
├── images/<venue>/final/   # 60 张网页图片（JPEG）
├── data/
│   ├── figures.json        # 精选清单（标题、作者、模式、论文链接、图片路径）
│   ├── indexes.json        # 会议全量论文索引（复现用）
│   ├── matched.json        # 152 篇候选池及裁剪状态（复现用）
│   └── openreview/         # ICLR OpenReview 原始导出（复现用）
└── scripts/                # 完整可复现的数据管线
```

## 复现管线

```bash
python -m pip install pymupdf requests beautifulsoup4 pillow
python scripts/build_index.py        # 抓取 NeurIPS / PMLR 全量索引
python scripts/match3.py             # 候选论文匹配 + 视觉关键词补量
python scripts/resolve_arxiv.py      # ICLR 论文解析 arXiv PDF 源（共 3 轮）
python scripts/extract_figures.py    # 下载 PDF 并自动裁剪 Figure 1（可断点续跑）
python scripts/contact_sheet.py      # 生成目检拼图，人工筛选
python scripts/curate.py             # 复制入选图、抽取作者、生成 figures.json
python scripts/enrich_authors.py     # NeurIPS 作者元数据补全
python scripts/enrich_icml.py        # PMLR 作者元数据补全
python scripts/build_web.py          # 生成网页 JPEG 与 assets/figures.js
```

> ICLR 接收列表来自 OpenReview API（需通过 Cloudflare 验证后导出，原始 JSON 见 `data/openreview/`）；
> NeurIPS 2025 正式 proceedings 尚未上线，该年图来自 arXiv 上标注 NeurIPS 2025 的论文。

## 版权与署名

- 所有图片的版权归**原论文作者及出版方**所有，本仓库仅作学习、研究与配图灵感的**非商业教育用途**。
- ICLR、ICML(PMLR)、NeurIPS 正式出版论文多以 **CC BY 4.0** 许可发布；
  少数经 arXiv 获取的图片许可可能不同，每张图均在 `data/figures.json` 与网页卡片中标注了论文链接与来源。
- 若您是版权方，认为某张图片的收录不当，请邮件联系 **939123836@qq.com**，
  我们会在核实后**第一时间删除**对应内容。

## 图录（共 {len(figs)} 张）

{catalog}
"""
(ROOT / "README.md").write_text(readme, encoding="utf-8")
print("README.md written,", len(figs), "entries")
