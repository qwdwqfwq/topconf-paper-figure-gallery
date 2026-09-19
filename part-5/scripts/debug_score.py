# -*- coding: utf-8 -*-
import json, re, html, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from match2 import norm, toks, tscore, cv

DATA = Path(r"C:\Users\黎枭\Doubao\chats\2026-09-16\new-chat\topconf-paper-figure-gallery\data")

# rebuild iclr pools
iclr = {}
for year in (2023, 2024, 2025):
    pool = {}
    for off in range(0, 4000, 1000):
        p = DATA / "openreview" / f"iclr{year}_{off}.json"
        if not p.exists(): continue
        for note in json.loads(p.read_text(encoding="utf-8")).get("notes", []):
            c = note.get("content", {})
            t = cv(c.get("title"))
            if t: pool[norm(t)] = re.sub(r"\s+", " ", t).strip()
    iclr[year] = pool

for year, q in [(2025, "Large Language Diffusion Models"),
                (2025, "SpinQuant: LLM Quantization with Learnable Rotations"),
                (2023, "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers"),
                (2025, "RULER: What's the Real Context Size of Your Long-Context Language Models?")]:
    scored = sorted(((tscore(q, k), v) for k, v in iclr[year].items()), reverse=True)[:3]
    print(f"\n{year} QUERY: {q}")
    for s, v in scored:
        print(f"   {s:.3f}  {v[:90]}")
