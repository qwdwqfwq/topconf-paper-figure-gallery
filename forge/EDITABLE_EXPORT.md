# Figure Forge 第四步：位图到可编辑图

## 桌面端精确复刻工作流

桌面端这张 CDTA 图的工作流：先在原图坐标系中逐项测量和校准文字、模块、线条、图表与照片区域，保存为包含 `canvas_px` 和 `objects` 的 JSON；浏览器底层的 `importPrecisionScene()` 可按 `crop` 坐标从同一张原图裁出独立照片，生成包含可编辑文字、形状、箭头和照片对象的场景。页面已移除手动导入控件；第四步默认使用自动重建。桌面端校准后的 [示例场景](./examples/cdta-precise-scene.json) 含 287 个对象、17 个照片裁片和 46 个文字框，可作为结构参考。

该场景是对这张原图的人工测量结果。对其他位图使用这个底层导入函数时，必须为该图制作并核对对应场景；单靠自动视觉模型识别，不能保证任意位图达到相同的视觉精度。原图可比场景画布在右侧或底部少至多 1% 的留白像素，导入时在白底上按左上角对齐，不改变对象坐标。

第四步接收第三步生成的位图，在浏览器内调用第一步配置的服务商、基础 URL 和 API Key，取得逐元素的场景 JSON，然后从**同一份场景**生成 SVG、PPTX、VSDX、draw.io。API Key 只在浏览器请求时使用；本站不内置、提交或转存用户密钥。重建所用的是该服务商的视觉理解模型；它可能与第三步的生图模型不同，因为图像生成接口通常不负责图像理解。

## 运行顺序

1. 第三步完成后，`syncStep3Bitmap()` 保存生成图。`ensureBitmapDataUrl()` 将其变成可供视觉模型读取的 data URI。`planReconstructionTiles()` 将图像划成目标尺寸约 900 px、边缘重叠 28 px 的区域，减少单次视觉请求的输出长度。
2. `editableReconstructionModel()` 从第一步的视觉模型、主模型及该服务商模型表中选择视觉模型。页面沿用 `cfg()`、`baseURL()`、`cleanKey($('#key').value)`；无需第二把 API Key。
3. `requestEditableScene()` 将每个区域的裁片和 `editableScenePrompt()` 一起发送；最多同时请求两个区域。OpenAI 兼容服务商（包括方舟）调用 `POST {baseURL}/chat/completions`，请求体含 `model`、`temperature:0.1`、`max_tokens:16000`、system 提示和 `image_url` data URI；Anthropic 原生配置调用 `POST {baseURL}/v1/messages`，使用 base64 image source。方舟请求禁用 thinking，以留出结构化输出空间。每次请求（包括接收完整响应体）限时 150 秒；对暂时失败或无效输出最多再试一次。超时裁片不重复发送原尺寸，而是细分后继续重建；若最小裁片仍超时，使用可编辑色块保底并标为“需检查”。400、401、403、404、配额或计费错误立即停止并在界面显示实际原因。
4. 提示词要求裁片内的像素坐标和逐对象拆分：文字、容器、连线、箭头、图标、图表、照片区域各自成节点；立方体或棱柱的前、顶、侧面必须是独立闭合多边形。`extractJSON()` 和 `materializeEditableScene()` 解析、归一化类型、颜色与坐标。照片区域从相应裁片裁成独立 PNG。`mergeReconstructionTiles()` 先过滤视觉模型虚构的长线：如果任一端落在裁片角点的 1 px 范围内，且线长至少为 `max(100 px, 裁片短边的 16%)`，即视为角点伪影。短刻度线及内部连线保留，过滤数量显示在界面。随后把坐标平移回原图，用中心点归属去除重叠区域的重复对象，并保留每个面独立编辑。
5. `auditReconScene()` 阻止用整页图片冒充可编辑图；重建失败时第四步保持禁用并显示错误，不把原位图作为“可编辑导出”交付。
6. `sceneToSvgString()` 生成逐对象 SVG；`sceneToDrawio()` 写入独立 `mxCell`，自由轮廓用 stencil；`buildNativePptx()` 生成 DrawingML 原生形状和文字；`sceneToVsdxFiles()` 生成 Visio 原生几何、文字和独立照片。曲线路径以线段采样进入后三种格式。封装后的 PPTX/VSDX 是 OOXML ZIP，浏览器中直接下载。
7. 用户选字体和格式、确认导出。页面显示每个裁片的进度、自动下载并提供备用下载链接。PPTX/VSDX 只保留一个 Blob URL，避免将整份文件额外复制成 data URL。重建场景在同一次第三步结果中复用，切换格式不再次调用模型。

场景的最小格式：

```json
{
  "canvas": {"width": 1200, "height": 675},
  "nodes": [
    {"type": "polyline", "points": "300,200 440,200 440,340 300,340", "closed": true, "fill": "#77AADA", "stroke": "#222222", "strokeWidth": 2},
    {"type": "text", "x": 300, "y": 390, "w": 300, "h": 45, "text": "Editable cube", "fontSize": 32, "fill": "#111111"}
  ]
}
```

自动复刻采用同一套通用闭环：识别可编辑对象、渲染对象场景、与原图逐像素比较、定位召回率较低的区域、把现有场景 JSON 连同原图和渲染图发回视觉模型修正。每个裁片最多修正两轮，总修正次数最多 12 次；修正必须改善综合误差，且不能让任一关键指标明显下降。文字校准最多检查 64 个文字框，先处理小字号。对于仍存在明显结构缺漏的复杂裁片，最多选两个误差最大的区域再次切分；候选场景只有通过同一组非退化比较才会取代原场景。修正门槛与最终校验一致：综合分数和深色笔画召回率至少 0.98，局部召回率和边缘 F1 至少 0.97，颜色相似度至少 0.98。未达标时页面标注“需检查”。

复刻质量受视觉模型的目标识别、OCR、坐标、图层顺序及字体可用性影响。四种格式共享场景，因而不会凭格式转换自动恢复模型遗漏的对象；照片仍是独立位图。跨裁片的大对象或箭头可能需要人工核对。当前流程保证按对象编辑和禁止整页位图伪装，**不保证任意输入像素级一致**。桌面端 CDTA 示例达到的精度还包含针对该图的人工测量和校准；自动流程仍需用其他位图实测，未通过终稿质量校验的结果不能宣称论文可用。

## 本地验证与部署

`node forge/test-reconstruction-core.mjs` 检查裁片覆盖、重叠去重、坐标合并、角点伪影过滤、曲线和立方体面的独立性。`node forge/test-editable-export.mjs` 生成包含三面立方体、曲线、箭头、文字和照片的四格式测试场景，并检查多边形保持闭合及 draw.io 独立单元。`node forge/test-reconstruction-browser.cjs` 在浏览器内模拟视觉 API 返回角点长线，检查合并场景及四种格式下载。可进一步用 PowerPoint、Visio 分别打开 PPTX/VSDX，数原生对象并导出图片进行视觉核对；对所有 OOXML XML 部件运行解析检查。部署由 `.github/workflows/deploy.yml` 在推送 `main` 后发布到 GitHub Pages。站点为纯前端，无本地 Office/Visio、Python、OpenAI 专有 SDK 或 GPT 专有 API 运行时依赖。构建时的 PPTX 模板是静态 JSON 包，`forge/editable-native.mjs` 通过标准浏览器 API 生成各部件。服务商只需支持所配置的多模态请求协议及足够长的结构化 JSON 输出。
