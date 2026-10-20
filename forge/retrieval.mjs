// Pure CPU retrieval. No imports, model downloads, API calls, or startup indexing.
const STOP = new Set(('a an the of for to in on and or with by as at from is are be this that we our it its into using use used through via can has have do paper figure diagram draw create generate please scientific research illustration overview method approach proposed framework architecture show showing input output model network learning 请 帮我 绘制 生成 论文 主图 示意图').split(' '));
const CONCEPTS = [
  ['多模态', 'multimodal|multi-modal|多模态'],
  ['图文', 'vision-language|image-text|图文|视觉语言'],
  ['扩散', 'diffusion|denoising|扩散|去噪'],
  ['图像生成', 'image generation|image synthesis|text-to-image|图像生成|生成图像|文生图'],
  ['图神经网络', 'graph neural|gnn|图神经网络'],
  ['知识图谱', 'knowledge graph|知识图谱'],
  ['强化学习', 'reinforcement learning|强化学习'],
  ['医学分割', 'medical segmentation|医学分割|医学图像分割'],
  ['分割', 'segmentation|分割'],
  ['目标检测', 'object detection|目标检测'],
  ['深度估计', 'depth estimation|深度估计'],
  ['三维', '3d|three-dimensional|三维'],
  ['点云', 'point cloud|点云'],
  ['机器人', 'robot|robotic|robotics|机器人'],
  ['推荐系统', 'recommendation|recommender|推荐系统'],
  ['时间序列', 'time series|时间序列'],
  ['检索增强', 'retrieval augmented|retrieval-augmented|rag|检索增强'],
  ['大语言模型', 'large language|llm|llms|大语言模型'],
  ['对比学习', 'contrastive|对比学习'],
  ['自监督', 'self-supervised|自监督'],
  ['因果', 'causal|causality|因果'],
  ['联邦', 'federated|联邦'],
  ['蒸馏', 'distillation|蒸馏'],
  ['注意力', 'attention|注意力'],
  ['双分支', 'dual-branch|two-branch|two-stream|dual-stream|双分支|双流', true],
  ['编码解码', 'encoder-decoder|encoder decoder|编码器解码器|编码解码', true],
  ['融合', 'fusion|fusing|融合', true],
  ['反馈', 'feedback|反馈', true],
  ['分层', 'hierarchical|hierarchy|分层|层次', true],
  ['流水线', 'pipeline|流水线|流程图', true],
  ['多阶段', 'multi-stage|two-stage|多阶段|两阶段', true],
];
const words = s => String(s || '').toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
const unique = a => [...new Set(a)];
function contains(s, phrase) {
  return /[\u3400-\u9fff]/.test(phrase) ? s.includes(phrase) :
    new RegExp('(^|[^a-z0-9])' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]+') + '($|[^a-z0-9])', 'i').test(s);
}
function concepts(text) {
  return CONCEPTS.filter(c => c[1].split('|').some(p => contains(text, p)));
}
export function prepareQuery(raw, idf = {}) {
  const text = String(raw).toLowerCase();
  const found = concepts(text);
  const terms = unique(words(raw).filter(w => !STOP.has(w)));
  // Keywords from the entire prompt participate in lexical matching; place the
  // rarest terms first for the single, existing 77-token CLIP pass.
  const expanded = unique([...found.flatMap(c => words(c[1].split('|')[0])), ...terms]);
  const structuralTerms = new Set(found.filter(c => c[2]).flatMap(c => c[1].split('|').flatMap(words)));
  const topicTerms = expanded.filter(t => !structuralTerms.has(t));
  const prioritized = [...expanded].sort((a, b) => (idf[b] || 0) - (idf[a] || 0));
  const clipText = unique([...found.map(c => c[1].split('|')[0]), ...prioritized]).join(' ').split(/\s+/).slice(0, 40).join(' ') || raw;
  return {raw, terms: expanded, topicTerms, concepts: found, clipText};
}
export function buildIndex(data) {
  const {figs, ids, bm, IE, TE} = data;
  if (figs.length !== ids.length || bm.docs.length !== ids.length ||
      IE.length !== ids.length * 512 || TE.length !== ids.length * 512 ||
      figs.some((f, i) => f.id !== ids[i]))
    throw new Error('检索数据行未对齐，已停止搜索，避免错误匹配。');
  const df = new Map();
  const rows = figs.map((f, i) => {
    const tokens = words(bm.docs[i].join(' '));
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    const title = new Set(words(f.title));
    // The shipped BM25 text is title + abstract, not image OCR.
    const tags = concepts(tokens.join(' ')).filter(c => c[2]).map(c => c[0]);
    return {tf, title, length: tokens.length, tags};
  });
  const idf = Object.fromEntries([...df].map(([t, n]) => [t, Math.log(1 + (ids.length - n + .5) / (n + .5))]));
  return {rows, idf, avgdl: rows.reduce((s, r) => s + r.length, 0) / rows.length};
}
const clamp = x => Math.max(0, Math.min(1, x));
export function rank(index, query, candidates, imageScores, textScores) {
  const terms = query.terms.filter(t => !STOP.has(t));
  const requested = query.concepts.filter(c => c[2]).map(c => c[0]);
  // Structural words are useful tie breakers, but should not drown out the task.
  const importance = t => Math.min(index.idf[t] || 6, 6) * (query.topicTerms.length && !query.topicTerms.includes(t) ? .2 : 1);
  const total = terms.reduce((s, t) => s + importance(t), 0) || 1;
  const rows = candidates.map(i => {
    const r = index.rows[i];
    let lexical = 0, covered = 0;
    const hits = [];
    for (const t of terms) {
      const tf = r.tf.get(t) || 0;
      if (!tf) continue;
      const title = r.title.has(t);
      lexical += (index.idf[t] || 0) * tf * 2.5 / (tf + 1.5 * (.25 + .75 * r.length / index.avgdl)) * (title ? 1.7 : 1);
      covered += importance(t) * (title ? 1 : .8);
      hits.push(t);
    }
    const matched = requested.filter(t => r.tags.includes(t));
    const coverage = covered / total;
    const structure = requested.length ? matched.length / requested.length : 0;
    const image = imageScores[i], text = textScores[i];
    return {i, lexical, coverage, structure, image, text, hits, matched, rrf: 0};
  });
  // Four independent routes. Empty/zero lexical routes contribute no rank bonus.
  const routes = [['image', .35], ['text', .25], ['lexical', .3], ['structure', .1]];
  for (const [field, weight] of routes) {
    const ordered = rows.filter(r => Number.isFinite(r[field]) && r[field] > 0).sort((a,b) => b[field]-a[field] || a.i-b.i);
    let tieRank = 0;
    ordered.forEach((r, k) => {
      if (!k || r[field] !== ordered[k-1][field]) tieRank = k;
      r.rrf += weight * 61 / (61 + tieRank);
    });
  }
  for (const r of rows) {
    // Absolute evidence, not per-query min/max or a percentage of correctness.
    const semantic = clamp((.6 * r.image + .4 * r.text - .10) / .45);
    const lexical = r.lexical / (r.lexical + 12);
    r.s = .30 * semantic + .40 * r.coverage + .10 * lexical + .15 * r.rrf;
    // Absent structural evidence is unknown: no mismatch penalty.
    r.s += .05 * r.structure;
    r.score = Math.round(1000 * r.s) / 10;
    r.reason = `检索相关度 ${r.score}（非准确率）｜关键词：${r.hits.slice(0,8).join('、') || '未命中'}｜摘要结构线索：${r.matched.join('、') || '无可确认线索'}`;
  }
  return rows.sort((a,b) => b.s-a.s || a.i-b.i);
}
