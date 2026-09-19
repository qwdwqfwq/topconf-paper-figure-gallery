# Launch kit / 发布素材

Live gallery: https://qwdwqfwq.github.io/topconf-paper-figure-gallery/
Repo: https://github.com/qwdwqfwq/topconf-paper-figure-gallery
Demo GIF: `docs/demo.gif` · Social card: `docs/social-preview.png`

---

## 1. r/MachineLearning (and r/computervision, r/LanguageTechnology)

**Title:** [R] I built a searchable gallery of well-designed Figure 1 / teaser figures from ICLR, ICML, NeurIPS, CVPR, ACL and AAAI (2023–2025) — for overview-figure inspiration

**Body:**

Like many of you, I always struggle with the *first* figure of a paper — the overview/teaser. Before drawing anything, I'd end up scrolling through random "paper figure" posts on Xiaohongshu/Twitter and saving a dozen PDFs. So I built the thing I wanted to exist:

**Top-Conf Figure Gallery** — https://qwdwqfwq.github.io/topconf-paper-figure-gallery/

- **2,298 curated Figure 1 / teaser figures** from **ICLR, ICML, NeurIPS, CVPR, ACL and AAAI (2023–2025)** (NeurIPS 803 · ICLR 370 · ACL 326 · ICML 310 · AAAI 264 · CVPR 225)
- Filter by **venue / year / visual pattern** (conceptual diagram, framework, pipeline, architecture, benchmark taxonomy…) or full-text search titles and authors (`DPO`, `gaussian`, `agent`, `robot`…)
- Masonry + lightbox with keyboard navigation; every card links to the paper and lists authors
- Pure static HTML/CSS/JS, no backend, works offline

**It's not a raw figure dump.** Every figure is cropped from the officially published PDF and passes a design-quality pipeline: 25+ heuristic rules explicitly reject default matplotlib charts, plain tables, GUI screenshots, unlabeled photo dumps and result grids; perceptual hashing removes duplicates. Six rounds of random-seed audits showed bad crops were spread uniformly across score ranks, so I switched to **page-by-page full-enumeration human QA** — every remaining candidate across all six venues was eyeballed on 81 contact sheets, plus two extra random audits on the backfilled set (~1,400 figures excluded in total). The pipeline is fully open and reproducible (`scripts/`, `docs/METHODOLOGY.md`).

A few honest notes:
- Counts differ across venues on purpose and I didn't pad any venue to a round number. The distribution was surprising: NeurIPS has the most designed overview figures (803); CVPR ended up lowest (225) because CV papers' Figure 1 is often a qualitative-results photo wall or video-frame strip, which the QA removes; ACL/AAAI framework diagrams are steadier than expected (326/264); theory-heavy ICML leans to default charts (310). The numbers reflect the real share of *designed* teaser figures, not venue quality.
- Images belong to their authors and publishers (most are CC BY 4.0); the gallery is an attributed educational index with a 72-hour takedown policy.
- Community growth is the plan: PRs for missing good figures and new venues (CHI, CoRL, RSS, EMNLP…) are very welcome — see CONTRIBUTING.md.

The README also includes a short "how to use this gallery to design your own overview figure" guide (reading direction, one-accent-color rules, label legibility at column width).

Feedback welcome — especially false negatives (great figures missing) and false positives (figures that shouldn't be there).

---

## 2. Hacker News

**Title:** Show HN: A Gallery of Well-Designed Paper Figure 1s from Top ML Conferences

**Body:**

A searchable/filterable gallery of 2,298 curated Figure 1 / teaser figures from ICLR, ICML, NeurIPS, CVPR, ACL and AAAI (2023–2025), meant as an inspiration reference when you design your own paper's overview figure.

https://qwdwqfwq.github.io/topconf-paper-figure-gallery/

It's a pure static site (no backend, works offline). Each figure is cropped from the published PDF and filtered by ~25 heuristic design-quality rules (default charts, tables, screenshots and photo dumps are rejected), perceptual-hash de-duplicated, and then checked in page-by-page full-enumeration human QA across all six venues (about 1,400 candidates rejected). The full pipeline is open source:

https://github.com/qwdwqfwq/topconf-paper-figure-gallery

---

## 3. X / Twitter post (and DM text for repost accounts e.g. @ak92501)

**Post:**
Before you draw your paper's Figure 1, see how the best papers do it 🎨

A searchable gallery of curated Figure 1 / teaser designs from ICLR · ICML · NeurIPS · CVPR · ACL · AAAI (2023–2025).

Filter by venue, year or visual pattern (framework / pipeline / architecture / conceptual…), search any topic, every card links to the paper.

🔗 https://qwdwqfwq.github.io/topconf-paper-figure-gallery/
Code & pipeline: https://github.com/qwdwqfwq/topconf-paper-figure-gallery

(attach docs/demo.gif)

**DM to repost accounts:**
Hi! I built an open gallery of well-designed Figure 1/teaser figures from six top ML conferences (ICLR/ICML/NeurIPS/CVPR/ACL/AAAI, 2023–2025), searchable by topic and visual pattern — might be useful for your followers doing paper writing season. Link: https://qwdwqfwq.github.io/topconf-paper-figure-gallery/ Demo GIF attached. Thanks for considering a repost!

---

## 4. 知乎专栏（长文）

**标题：** 如何画论文主图（Figure 1）？我把六大顶会 2023–2025 最会"画图"的主图做成了可搜索画廊

**正文结构：**
1. 痛点：主图是论文被引用/转发率最高的一张图，但新人没有"图感"，小红书帖子零散且质量参差。
2. 作品：Top-Conf Figure Gallery（在线链接 + demo GIF），ICLR/ICML/NeurIPS/CVPR/ACL/AAAI 2023–2025，按会议/年份/视觉模式（概念图/框架图/流程图/架构图/任务全景）筛选，标题作者全文搜索，灯箱键盘翻图，一键跳原文，纯静态离线可用。
3. "怎么用这个画廊画你自己的主图"六条方法论（先写一句话故事；按故事选阅读方向；一个阶段一种视觉动词+一个强调色；抄层级与留白不抄画风；按双栏成图宽度检查标签；一图一主旨）。
4. 技术与态度：不是简单抓第一张图——PDF 渲染裁 Figure 1、25+ 条设计质量规则剔除默认图表/表格/截图/照片墙、dHash 去重、配额选图；六轮随机抽检发现坏图在评分各分段均匀分布后，改为**全量枚举逐张人眼目检**（81 页联系表覆盖六会议全部候选，另加两轮补位抽检，累计排除约 1,400 张）；最终 2,298 张（NeurIPS 803 / ICLR 370 / ACL 326 / ICML 310 / AAAI 264 / CVPR 225），各会议数量不硬凑，并如实说明 CVPR 因结果照片墙多反而入选最少；管线完全开源可复现。
5. 版权：署名索引、CC BY 为主、72 小时下架邮箱。
6. 结尾：欢迎 PR 补图与新会议（CHI/CoRL/RSS/EMNLP），求 star 与反馈。

## 5. 小红书（短文 + 9 图：banner、demo gif 转 3-4 帧、3 张优秀主图案例、方法论卡片）

**标题：** 论文主图没灵感？六大顶会主图画廊来了🎨（附搜图方法）

**正文：**
写论文最头疼的不是画什么，是想不到主图还能怎么排版！
做了一个顶会 Figure 1 / Teaser 灵感画廊：
✅ ICLR/ICML/NeurIPS/CVPR/ACL/AAAI 2023–2025
✅ 按会议/年份/图类型筛选（概念图、框架图、流程图、架构图、benchmark全景）
✅ 直接搜关键词：gaussian / agent / DPO / robot…
✅ 每张图都能跳原文看作者怎么设计
✅ 纯网页，免费，不用登录
链接放评论区/主页，GitHub 开源可本地打开～
#论文配图 #科研工具 #顶会 #机器学习 #博士日常 #论文写作

## 6. 机器之心 / PaperWeekly 投稿邮件

**主题：** 投稿 | 一个收录六大顶会论文主图（Figure 1）的开源灵感画廊

您好，我做了一个开源项目 Top-Conf Figure Gallery：把 ICLR、ICML、NeurIPS、CVPR、ACL、AAAI 六大顶会 2023–2025 年中经过设计质量筛选的 Figure 1 / Teaser 集中为可搜索、可按视觉模式筛选的在线画廊，最终收录 2,298 张（六会议全部候选图均经过逐张人眼目检），并开源了从会议索引、PDF 裁图到 25+ 条设计规则打分、全量目检 QA 的完整可复现管线。
- 在线画廊：https://qwdwqfwq.github.io/topconf-paper-figure-gallery/
- 代码：https://github.com/qwdwqfwq/topconf-paper-figure-gallery
论文投稿季对需要画主图的同学应该有实用价值，请问是否适合贵平台报道/转载？可以提供介绍长文与演示 GIF。谢谢！
