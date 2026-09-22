# -*- coding: utf-8 -*-
"""Design-quality scoring + selection for the large gallery.

Reads data/extract_state.jsonl (per-paper crop stats) and data/pool/*.jsonl,
computes extra visual metrics from images/<venue>/all/<id>.png, then:
  - hard-rejects tiny / incomplete / photo-dump / table / default-chart crops;
  - scores designed figures (vectors, labels, color, composition);
  - dHash-deduplicates within venue;
  - allocates a per-venue quota across years proportionally to good candidates;
  - writes data/selected.json (ranked) and data/scores.jsonl (all scored rows).

Run repeatedly while extraction is still in progress; it just reads current state.
"""
import json, math, re, sys
from pathlib import Path
from collections import defaultdict
from PIL import Image, ImageFilter, ImageStat, ImageChops

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
POOL = DATA / "pool"
IMGDIR = ROOT / "images"
STATE = DATA / "extract_state.jsonl"
QUOTA = int(sys.argv[1]) if len(sys.argv) > 1 else 980  # NEW figures per venue (v1 curated added separately)

# ---------- pattern taxonomy (keyword priority; applied to title) ----------
PATTERN_RULES = [
    ("taxonomy",   r"benchmark|benchmarking|\beval(uat\w*|ing)\b|taxonomy|\bsuite\b|comprehensive|holistic|survey|leaderboard|test ?suite|taskonomy"),
    ("framework",  r"\bagent(s|ic)?\b|framework|system|tool(use|chain)?|platform|operating|ecosystem|workbench|environment for|collaborat"),
    ("pipeline",   r"pipeline|workflow|end-to-end|generation|retrieval|augmented|distill|flow|feedforward|feed-forward|two-stage|coarse-to-fine"),
    ("architecture",r"architecture|network|transformer|attention|\bmamba\b|state space|\bssm\b|encoder|decoder|diffusion model|quantiz|mixture|moe\b|convolution|\bcnn\b|\brnn\b|gaussian splat|neural field|\bvlm\b|\blm\b"),
    ("conceptual", r"rethinking|understanding|perspective|theory|theoretical|principle|preference|contrastive|self-|emergent|mechanis|interpret|geometric|manifold|optimization for|equilibrium|symmetr|causal|entropy|bayesian|provable|does (your|the|one)|a note on|towards"),
    ("comparison", r"comparison|versus|\bvs\.?\b|empirical (study|analysis)|revisiting|on the (effect|role|dangers)|how (well|far|do)|systematic"),
    ("results",    r"results? from|in the wild|showcase|gallery of|visual results"),
]
def classify(title):
    t = title.lower()
    for pat, rx in [(p, r) for p, r in PATTERN_RULES]:
        if re.search(rx, t):
            return pat
    return "teaser"

# ---------- visual metrics ----------
def dhash(im, n=9):
    g = im.convert("L").resize((n, n - 1), Image.LANCZOS)
    px = list(g.getdata())
    bits = [px[r * n + c + 1] > px[r * n + c] for r in range(n - 1) for c in range(n - 1)]
    return sum(int(b) << i for i, b in enumerate(bits))

def hamming(h1, h2): return (h1 ^ h2).bit_count()

def _frac(mask255):
    h = mask255.histogram()
    return h[255] / max(1, sum(h))

def visual_metrics(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.resize((256, max(1, round(256 * h / w))), Image.LANCZOS)
    hsv = small.convert("HSV")
    S = hsv.split()[1]
    sat = ImageStat.Stat(S).mean[0] / 255.0
    L = small.convert("L")
    bright = L.point(lambda x: 255 if x > 245 else 0)
    gray = S.point(lambda x: 255 if x < 10 else 0)
    white = _frac(ImageChops.multiply(bright, gray))
    q = small.quantize(colors=64)
    colors = len([c for c in q.getcolors(maxcolors=64)])
    edges = L.filter(ImageFilter.FIND_EDGES).point(lambda x: 255 if x > 30 else 0)
    edge = _frac(edges)
    return {"sat": round(float(sat), 4), "white": round(white, 4), "colors": int(colors),
            "edge": round(edge, 4), "ar": round(w / h, 3), "w": w, "h": h}

# ---------- load ----------
pool = {}
for p in POOL.glob("*.jsonl"):
    for line in p.read_text(encoding="utf-8").splitlines():
        r = json.loads(line); pool[r["id"]] = r

state = {}
for line in STATE.read_text(encoding="utf-8").splitlines():
    r = json.loads(line)
    if r.get("ok"): state[r["id"]] = r

rows = []
for fid, s in state.items():
    m = pool.get(fid)
    img = IMGDIR / s.get("venue", fid.split("20")[0]) / "all" / f"{fid}.png"
    if m is None or not img.exists():
        continue
    try:
        vm = visual_metrics(img)
    except Exception:
        continue
    area = vm["w"] * vm["h"]
    vec = (s["paths"] + s["curves"] + 0.5 * s["rects"]) / (area / 1e5)
    label_density = s["spans"] / (area / 1e5)
    rows.append({**s, **vm, "id": fid, "title": m["title"], "venue": m["venue"],
                 "year": m["year"], "tier": m.get("tier", 2), "pdf": m.get("pdf"),
                 "page": m.get("page", ""), "authors": m.get("authors", []),
                 "paper": m.get("page") or m.get("abs") or m.get("arxiv") or "",
                 "vec": round(vec, 2), "label_density": round(label_density, 2)})

# manual QA exclusions (one id per line in data/exclude.txt)
EXCLUDE = set()
_exf = DATA / "exclude.txt"
if _exf.exists():
    EXCLUDE = {ln.strip() for ln in _exf.read_text(encoding="utf-8").splitlines() if ln.strip()}

# ---------- hard filters ----------
def reject(r):
    if r["id"] in EXCLUDE: return "manual exclude"
    if r["w"] < 500 or r["h"] < 260: return "too small"
    if not (0.32 <= r["ar"] <= 4.2): return "bad aspect"
    if r["edge_cut"] > 6: return "edge cut"
    if r["bitmap_frac"] > 0.82 and r["paths"] < 8 and r["spans"] < 12:
        return "photo dump"
    if r["bitmap_frac"] > 0.65 and r["paths"] < 4 and r["spans"] < 6:
        return "photo dump"
    # photo collage / boards: mostly bitmaps, almost no hand-drawn structure
    if r["vec"] < 10 and r["spans"] < 35 and r["bitmap_frac"] > 0.45:
        return "photo dump"
    if r["bitmap_frac"] > 0.55 and r["spans"] < 25 and r["rects"] < 5:
        return "photo dump"
    if (r["paths"] + r["curves"]) < 200 and r["spans"] < 12 and r["rects"] < 3 and r["white"] < 0.55:
        return "photo dump"
    # panels / maps / photo grids with almost no labels
    if r["spans"] < 12 and r["white"] < 0.50 and r["bitmap_frac"] > 0.05:
        return "unlabeled panels"
    # raster result grids: photos or heatmap bitmaps, few vectors/labels, dark-ish
    if (r["bitmap_frac"] > 0.45 and r["sat"] > 0.18 and r["rects"] < 35 and r["spans"] < 90
            and r["paths"] < 800 and r["white"] < 0.50):
        return "raster results grid"
    if r["paths"] < 100 and r["bitmap_frac"] > 0.2 and r["sat"] < 0.10 and r["spans"] < 60:
        return "photo dump"
    # table: lots of text, almost no curves/color
    if r["label_density"] > 260 and r["curves"] < 6 and r["colors"] < 10:
        return "table"
    # text-wall qualitative results / GUI screenshots
    if r["sat"] < 0.04 and r["bitmap_frac"] < 0.05 and r["rects"] < 4 and r["spans"] > 45 and r["white"] > 0.70:
        return "text wall"
    if (r["spans"] > 100 and r["rects"] > 30 and r["paths"] < 200 and r["sat"] < 0.10
            and r["bitmap_frac"] < 0.05):
        return "screenshot/text"
    # plots with essentially no labels are plots, not designed figures
    if r["spans"] < 3 and (r["paths"] > 200 or r["bitmap_frac"] < 0.5):
        return "unlabeled plot"
    # sparse chart panels: few labels, few boxes, mostly axes/curves, low color
    if (r["spans"] < 25 and r["rects"] < 40 and r["bitmap_frac"] < 0.25
            and r["curves"] < 200 and (r["paths"] + r["curves"]) > 60 and r["sat"] < 0.20):
        return "default chart"
    # bar/scatter chart pages: bars look like many plain rects, few labels
    if (r["paths"] < 600 and r["curves"] < 160 and 18 < r["rects"] < 95
            and r["spans"] < 75 and r["sat"] < 0.16 and r["bitmap_frac"] < 0.15
            and r["rects"] < 70 and r["chars"] < 400):
        return "default chart"
    # small vector chart page: a couple of line/bar panels, no designed panels
    if (r["bitmap_frac"] < 0.40 and r["sat"] < 0.07 and r["rects"] < 36
            and r["spans"] < 100 and r["paths"] < 1200 and r["curves"] < 260
            and (r["paths"] + r["curves"]) > 35):
        return "default chart"
    # table-like pages: long separator curves, almost no boxes/color
    if (r["curves"] > 400 and r["rects"] < 8 and r["sat"] < 0.05
            and r["bitmap_frac"] < 0.45 and r["spans"] < 90):
        return "default chart"
    # chart embedded on a raster/vector canvas with thousands of axis paths, grey
    if (r["bitmap_frac"] < 0.40 and r["sat"] < 0.08 and r["rects"] < 10
            and r["spans"] < 90 and r["paths"] > 3000):
        return "default chart"
    # axes-heavy chart pages (histogram / multi-line panels)
    if r["bitmap_frac"] < 0.12 and r["paths"] > 3000 and (
            (r["sat"] < 0.10 and r["spans"] < 90 and r["curves"] < 1200)
            or (r["sat"] < 0.06 and r["spans"] < 40 and r["rects"] < 25)):
        return "default chart"
    # rasterized line/bar/heatmap chart pages
    if (r["bitmap_frac"] > 0.50 and r["spans"] < 70 and r["sat"] < 0.18
            and r["rects"] < 12 and r["curves"] < 1000):
        return "raster chart"
    if (r["bitmap_frac"] > 0.60 and r["spans"] < 100 and r["sat"] < 0.13 and r["curves"] < 2500):
        return "raster chart"
    # GUI/screenshot grids: hundreds of plain rectangles, dark, few labels
    if r["rects"] > 200 and r["spans"] < 60 and r["white"] < 0.45:
        return "screenshot/text"
    # dense table / text-heavy qualitative page
    if (r["spans"] > 150 and r["chars"] > 1400 and r["sat"] < 0.15
            and r["white"] < 0.60 and r["bitmap_frac"] < 0.30):
        return "table/text page"
    if (r["spans"] > 80 and r["chars"] > 1500 and r["sat"] < 0.05 and r["bitmap_frac"] < 0.10):
        return "table/text page"
    # default matplotlib/statistical chart: dense axes/gridlines, no boxes, grey
    if r["bitmap_frac"] < 0.15 and r["sat"] < 0.09 and r["rects"] < 12 and r["paths"] > 800:
        return "default chart"
    if r["bitmap_frac"] < 0.1 and r["sat"] < 0.1 and r["rects"] < 15 and r["curves"] > 200:
        return "default chart"
    if r["bitmap_frac"] < 0.25 and r["sat"] < 0.12 and r["spans"] < 50 and r["rects"] < 15 and (r["paths"] + r["curves"]) > 800:
        return "default chart"
    if r["sat"] < 0.03 and r["spans"] < 30 and r["white"] > 0.70 and (r["paths"] + r["curves"]) > 150:
        return "default chart"
    if r["bitmap_frac"] < 0.15 and r["sat"] < 0.03 and r["spans"] < 100 and r["rects"] < 30 and (r["paths"] + r["curves"]) > 3000:
        return "default chart"
    if r["curves"] > 1000 and r["sat"] < 0.08 and r["bitmap_frac"] < 0.05 and r["spans"] < 40:
        return "default chart"
    if r["curves"] > 150 and r["rects"] < 3 and r["spans"] < 40 and r["bitmap_frac"] < 0.2 and r["sat"] < 0.10:
        return "default chart"
    # heatmap cell grids: hundreds of small colored rects, low saturation
    if r["rects"] > 400 and r["sat"] < 0.12 and r["bitmap_frac"] < 0.30 and r["spans"] < 120:
        return "heatmap grid"
    # multi-panel line-chart pages: hundreds/thousands of curves on white bg,
    # no module boxes (colored/dark framework figures drawn with paths are
    # protected by the white + saturation gates)
    if (r["curves"] > 800 and r["rects"] < 8 and r["spans"] < 40
            and r["bitmap_frac"] < 0.2 and r["white"] > 0.50 and r["sat"] < 0.10):
        return "default chart"
    if (r["curves"] > 300 and r["rects"] < 5 and r["spans"] < 70
            and r["sat"] < 0.10 and r["bitmap_frac"] < 0.15 and r["white"] > 0.55):
        return "default chart"
    # axes-dense grey chart pages even with many tick labels
    if (r["paths"] > 1500 and r["rects"] < 20 and r["sat"] < 0.06
            and r["spans"] < 150 and r["white"] < 0.55 and r["bitmap_frac"] < 0.2):
        return "default chart"
    # colorful heatmap strips: saturated tiny cells, almost no boxes/curves
    if (r["sat"] > 0.25 and r["rects"] < 15 and r["bitmap_frac"] < 0.10
            and r["spans"] > 40 and r["white"] < 0.45 and r["curves"] < 50
            and r["paths"] < 300):
        return "heatmap grid"
    # densely labeled rasterized pages (photo/result grids with captions everywhere)
    if (r["bitmap_frac"] > 0.75 and r["label_density"] > 45 and r["sat"] < 0.20
            and r["rects"] < 200):
        return "raster results grid"
    # dense multi-panel plot grids (contour / heatmap / surface meshes)
    if r["paths"] > 50000 and r["spans"] < 60 and r["rects"] < 40:
        return "plot grid"
    if r["paths"] > 15000 and r["rects"] < 10 and r["bitmap_frac"] < 0.12:
        return "plot grid"
    if r["bitmap_frac"] < 0.08 and r["sat"] < 0.10 and r["paths"] > 10000 and r["rects"] < 30:
        return "plot grid"
    # shaded 3D surface / rendered-plot panels
    if 0.32 < r["bitmap_frac"] < 0.60 and r["sat"] < 0.22 and r["spans"] < 45 and r["rects"] < 22 and r["white"] < 0.62:
        return "rendered plot"
    # --- v0.3 QA: CVPR-style result/frame/example pages that slipped through ---
    # NOTE: fully rasterized framework overviews (bmp~1) are metric-identical to
    # photo grids, so the bitmap gate stays below 0.88; high-bmp cases are left
    # for manual contact-sheet QA.
    # result frame / photo-grid pages: bitmap-heavy, almost no drawn structure
    if (0.55 < r["bitmap_frac"] < 0.88 and r["vec"] < 75 and r["paths"] < 140
            and r["rects"] < 35 and r["spans"] < 110 and r["sat"] < 0.20
            and r["white"] < 0.75 and r["chars"] < 900):
        return "result frame grid"
    # dark qualitative example / text pages: many chars, tiny structure
    # (module architectures are protected by paths/rects/bmp gates)
    if (r["chars"] > 650 and r["paths"] < 120 and r["rects"] < 30
            and r["spans"] > 80 and r["bitmap_frac"] < 0.35 and r["white"] < 0.50):
        return "example/text page"
    # sparse math / toy-concept pages with almost no drawn content on white
    if (r["vec"] < 15 and r["bitmap_frac"] < 0.05 and r["white"] > 0.72
            and r["rects"] < 20 and (r["paths"] + r["curves"]) < 120):
        return "sparse math"
    # radar/bar chart pages on white with photo strips (curves-drawn axes)
    if (0.40 < r["bitmap_frac"] < 0.60 and r["white"] > 0.60 and r["sat"] < 0.08
            and r["paths"] < 350 and r["spans"] < 60 and r["rects"] < 25
            and r["curves"] > 60 and r["chars"] > 200):
        return "default chart"
    # box-less bar/line chart pages with moderate structure but no modules;
    # module architectures protected by boxes, labels, paths and non-white bg
    if (r["bitmap_frac"] < 0.25 and r["sat"] < 0.12 and 30 <= r["rects"] < 60
            and r["spans"] < 80 and r["paths"] < 400 and r["curves"] < 250
            and r["white"] < 0.50 and r["chars"] < 350):
        return "default chart"
    # desaturated radar/bar pages on white, bitmap-heavy, axes-dense
    if (0.45 < r["bitmap_frac"] < 0.70 and r["white"] > 0.62 and r["sat"] < 0.05
            and r["spans"] < 80 and r["rects"] < 60 and r["paths"] < 1500
            and 300 < r["curves"] < 1500 and r["chars"] > 300):
        return "default chart"
    # saturated heatmap/chart pages, bitmap-dominated, few modules
    if (r["bitmap_frac"] > 0.85 and r["sat"] > 0.22 and r["rects"] < 60
            and r["spans"] < 60):
        return "raster chart"
    if r["white"] > 0.985 and r["edge"] < 0.01: return "blank"
    return None

# ---------- score ----------
def score(r):
    sc = 0.0
    sc += min(30, 1.7 * math.log1p(r["paths"] + r["curves"]))          # hand-drawn structure
    sc += min(14, 1.3 * math.log1p(r["rects"] + 1))                    # boxes / modules
    sc += min(18, 1.1 * math.log1p(r["spans"]))                        # labels
    sc += min(16, 80 * r["sat"])                                       # color
    sc += min(10, 0.18 * r["colors"])                                  # palette
    sc += 12 * min(1.0, r["edge"] / 0.10)                              # visual richness
    # composition: mixed vector+bitmap designed teasers score well; pure vector tiny diagrams less
    if 0.05 < r["bitmap_frac"] < 0.6 and r["paths"] > 20: sc += 8
    if r["bitmap_frac"] < 0.25 and r["paths"] > 60: sc += 6
    # completeness / size
    if r["edge_cut"] == 0: sc += 4
    sc += min(6, math.log1p(r["w"] * r["h"] / 4e5) * 3)
    if r["tier"] == 1: sc += 2
    # penalties
    if r["bitmap_frac"] > 0.7: sc -= 12
    if r["sat"] < 0.05: sc -= 8
    if r["label_density"] > 200: sc -= 10
    if r["edge_cut"]: sc -= min(8, r["edge_cut"])
    return round(sc, 2)

# ---------- main pipeline (only when executed as a script) ----------
if __name__ != "__main__":
    raise SystemExit

kept, rejects = [], []
for r in rows:
    why = reject(r)
    if why: r["reject"] = why; rejects.append(r); continue
    r["score"] = score(r); r["pattern"] = classify(r["title"]); kept.append(r)

# ---------- dHash dedup within venue ----------
kept.sort(key=lambda r: -r["score"])
seen = defaultdict(list)
selected_pool = []
for r in kept:
    h = dhash(Image.open(IMGDIR / r["venue"] / "all" / f"{r['id']}.png"))
    if any(hamming(h, h2) <= 6 for h2 in seen[r["venue"]]):
        r["reject"] = "duplicate"; rejects.append(r); continue
    seen[r["venue"]].append(h)
    selected_pool.append(r)

# ---------- quota allocation across years (proportional to good candidates) ----------
by = defaultdict(list)
for r in selected_pool: by[(r["venue"], r["year"])].append(r)
selected = []
alloc = {}
for venue in ("iclr", "icml", "neurips", "cvpr", "acl", "aaai"):
    years = sorted(y for (v, y) in by if v == venue)
    totals = {y: len(by[(venue, y)]) for y in years}
    tot = sum(totals.values())
    n_y = len(years)
    raw = {y: QUOTA * totals[y] / max(1, tot) for y in years}
    # floor + largest remainder, capped by availability
    base = {y: min(totals[y], int(raw[y])) for y in years}
    rem = QUOTA - sum(base.values())
    frac = sorted(years, key=lambda y: raw[y] - int(raw[y]), reverse=True)
    for y in frac:
        if rem <= 0: break
        if base[y] < totals[y]: base[y] += 1; rem -= 1
    for y in years:
        take = min(base[y], totals[y])
        alloc[f"{venue}-{y}"] = {"wanted": base[y], "available": totals[y], "taken": take}
        selected.extend(by[(venue, y)][:take])

# pattern diversity soft-mix: report distribution
dist = defaultdict(lambda: defaultdict(int))
for r in selected: dist[r["venue"]][r["pattern"]] += 1

DATA.joinpath("selected.json").write_text(
    json.dumps({"selected": selected, "allocation": alloc,
                "pattern_dist": {k: dict(v) for k, v in dist.items()}},
               ensure_ascii=False, indent=1), encoding="utf-8")
with DATA.joinpath("scores.jsonl").open("w", encoding="utf-8") as f:
    for r in kept + rejects:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")

from collections import Counter
print("candidates ok:", len(rows))
print("rejected:", Counter(r["reject"] for r in rejects))
print("selected:", len(selected))
for k, v in sorted(alloc.items()): print(" ", k, v)
for v, d in dist.items(): print(v, dict(d))
