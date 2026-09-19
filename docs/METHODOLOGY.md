# Methodology · 数据与选图方法

## 1. 候选论文池

| 会议 | 年份 | 论文池来源 | 规模（约） |
|---|---|---|---|
| ICML | 2023–2025 | PMLR proceedings 索引（v202 / v235 / v267） | 7,800 |
| NeurIPS | 2023–2024 | NeurIPS proceedings 索引 | 7,700 |
| NeurIPS | 2025 | arXiv 评论字段 `co:"NeurIPS 2025"`（正式 proceedings 尚未上线） | 2,800 |
| ICLR | 2023–2025 | OpenReview API 全量接收列表（poster / spotlight / oral） | 7,500 |

- ICLR 接收状态以 OpenReview note 的 `venue` 字段为准（排除 `Submitted`）。
- ICLR 的 PDF 优先取 OpenReview 官方附件（`/pdf?id=forum`），
  同时用 arXiv 评论字段做标题模糊匹配（token F1 ≥ 0.92）作为备用源。
- 候选按标题中的视觉主题关键词（diffusion / gaussian / video / robot / agent /
  VLA / avatar / 3D / multimodal…）分为 tier-1（视觉类）与 tier-2，优先处理 tier-1。

## 2. Figure 1 自动裁剪

1. PyMuPDF 打开 PDF，在第 1–4 页用正则定位所有 `Figure 1` / `Fig. 1` 图注候选；
2. 收集图注正上方同一 x 跨度内的矢量绘图（drawings）与位图（images）；
3. 跳过页眉装饰细线，并做**垂直间隙聚类**：与图注间隙 ≤ 58 pt 的框属于同一张图，
   遇到大间隙即停止，避免把标题、摘要裁进来；
4. 取内容面积最大的候选，按约 180–216 DPI 裁剪输出。

已知局限：双栏跨栏图、图注与图分离、Figure 1 是整页表格时会误裁；
这类图会在评分阶段被过滤或在人工抽检中剔除。

## 3. 设计感评分与筛选

每张裁剪图同时记录：

- 矢量路径 / 矩形 / 曲线数量（作者手绘设计元素）
- 图内文字标签数量与字符数
- 位图数量与位图覆盖面积比例
- 图边缘被截断的文字数（完整性信号）
- 配色丰富度、饱和度、边缘密度（PIL/numpy）

并据此过滤：

- **纯大图拼接（photo dump）**：位图占比 > 0.82 且几乎没有矢量元素与标签；
- **纯表格 / 默认图表**：文字密集、配色单一、以坐标轴为主；
- **尺寸过小或边缘截断严重**的裁剪。

最后用感知哈希（dHash）去重，按会议-年份配额取排名靠前的图，
并对视觉模式做分层以保证多样性。自动评分之后再做分组拼图人工抽检与替换。

## 4. 视觉模式标签

标签描述的是**图的视觉功能**（不是论文领域），属于本画廊的实用分类，
并非学术界统一标准：

| 标签 | 判定线索 |
|---|---|
| `teaser` | 经过版式设计的主视觉 / 图文混排 teaser |
| `conceptual` | 用视觉隐喻解释核心概念（卡通、示意图） |
| `framework` | 系统 / 智能体模块协作总览 |
| `pipeline` | 端到端数据流、阶段式流程 |
| `architecture` | 模型内部层、模块、张量连接 |
| `taxonomy` | 任务 / 能力 / 数据的分类全景（benchmark overview） |
| `results` | 经过设计的结果对比（非纯照片墙） |
| `comparison` | 方法对比矩阵 / 对照图 |

## 5. 复现

```bash
pip install -r requirements.txt
python scripts/build_pool.py          # 构建候选池 data/pool/*.jsonl
python scripts/extract_all.py         # 并行下载 PDF + 裁剪 Figure 1（可断点续跑）
python scripts/score_select.py        # 设计感评分、去重、按配额选图
python scripts/build_web.py           # 生成网页 JPEG 与 assets/figures.js
```

中间产物（PDF、全量裁剪 PNG、日志）不入库，见 `.gitignore`。
