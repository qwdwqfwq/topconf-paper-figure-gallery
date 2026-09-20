/* ===== Top-Conf Figure Gallery: filtering, search, infinite scroll, lightbox ===== */
(function () {
  "use strict";

  const VENUES = {
    iclr:    { name: "ICLR",    cn: "ICLR" },
    icml:    { name: "ICML",    cn: "ICML" },
    neurips: { name: "NeurIPS", cn: "NeurIPS" },
    cvpr:    { name: "CVPR", cn: "CVPR" },
    acl:     { name: "ACL", cn: "ACL" },
    aaai:    { name: "AAAI", cn: "AAAI" },
  };
  const PATTERNS = {
    teaser:       "Teaser",
    conceptual:   "Conceptual",
    framework:    "Framework",
    pipeline:     "Pipeline",
    architecture: "Architecture",
    taxonomy:     "Taxonomy / Benchmark",
    results:      "Results",
    comparison:   "Comparison",
  };
  const PATTERN_ORDER = ["teaser", "conceptual", "framework", "pipeline", "architecture", "taxonomy", "results", "comparison"];
  const PAGE = 60;

  const state = { venue: "all", year: "all", pattern: "all", q: "", sort: "venue" };
  const figures = (window.FIGURES || []).slice();
  let filtered = [];
  let shown = 0;

  const $ = (s) => document.querySelector(s);
  const gallery = $("#gallery");
  const empty = $("#empty");
  const sentinel = $("#sentinel");
  const endHint = $("#end-hint");
  const countEl = $("#result-count");
  $("#total-figures").textContent = figures.length.toLocaleString();

  /* ---------- filter chips ---------- */
  function makeChips(containerId, key, values, labels, counts) {
    const box = $(containerId);
    const all = document.createElement("button");
    all.className = "chip active";
    all.textContent = "All";
    all.dataset[key] = "all";
    box.appendChild(all);
    values.forEach((v) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.dataset[key] = v;
      c.innerHTML = labels(v) + (counts ? ` <span class="n">${counts[v] || 0}</span>` : "");
      box.appendChild(c);
    });
    box.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state[key] = btn.dataset[key];
      box.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === btn));
      render();
    });
  }

  const years = [...new Set(figures.map((f) => f.year))].sort();
  const usedPatterns = PATTERN_ORDER.filter((p) => figures.some((f) => f.pattern === p));

  makeChips("#venue-chips", "venue", Object.keys(VENUES),
    (v) => VENUES[v].name,
    Object.fromEntries(Object.keys(VENUES).map((v) => [v, figures.filter((f) => f.venue === v).length])));
  makeChips("#year-chips", "year", years, (v) => v);
  makeChips("#pattern-chips", "pattern", usedPatterns, (v) => PATTERNS[v] || v);

  /* ---------- search ---------- */
  const searchInput = $("#search");
  const clearBtn = $("#clear-search");
  let qTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.q = searchInput.value.trim().toLowerCase();
      clearBtn.hidden = !state.q;
      render();
    }, 150);
  });
  clearBtn.addEventListener("click", () => {
    searchInput.value = ""; state.q = ""; clearBtn.hidden = true; render();
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("#reset-all").addEventListener("click", () => {
    state.venue = state.year = state.pattern = "all"; state.q = "";
    searchInput.value = ""; clearBtn.hidden = true;
    document.querySelectorAll(".chips").forEach((b) => {
      b.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", Object.values(c.dataset)[0] === "all"));
    });
    render();
  });

  /* ---------- filtering / sorting ---------- */
  function matches(f) {
    if (state.venue !== "all" && f.venue !== state.venue) return false;
    if (state.year !== "all" && String(f.year) !== String(state.year)) return false;
    if (state.pattern !== "all" && f.pattern !== state.pattern) return false;
    if (state.q) {
      const hay = [f.title, (f.authors || []).join(" "), VENUES[f.venue].name,
                   f.year, f.pattern, PATTERNS[f.pattern] || ""].join(" ").toLowerCase();
      if (!state.q.split(/\s+/).every((tok) => hay.includes(tok))) return false;
    }
    return true;
  }

  function sorted(list) {
    const venueRank = { iclr: 0, icml: 1, neurips: 2, cvpr: 3, acl: 4, aaai: 5 };
    const l = list.slice();
    if (state.sort === "year") l.sort((a, b) => a.year - b.year || venueRank[a.venue] - venueRank[b.venue] || a.id.localeCompare(b.id));
    else if (state.sort === "title") l.sort((a, b) => a.title.localeCompare(b.title));
    else l.sort((a, b) => venueRank[a.venue] - venueRank[b.venue] || a.year - b.year || a.id.localeCompare(b.id));
    return l;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function authorsText(f) {
    const a = f.authors || [];
    if (!a.length) return "";
    return a.length > 5 ? a.slice(0, 5).join(", ") + " et al." : a.join(", ");
  }

  /* ---------- chunked render ---------- */
  function cardHtml(f, idx) {
    const ratio = (f.w && f.h) ? `aspect-ratio:${f.w} / ${f.h};` : "min-height:170px;";
    const eager = idx < 24;
    const imgAttrs = eager ? `src="${f.image}"` : `data-src="${f.image}"`;
    return `
    <article class="card" data-id="${f.id}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(f.title)}">
      <div class="img-slot" style="${ratio}">
        <img class="card-img${eager ? " loaded" : ""}" ${imgAttrs} alt="${escapeHtml(f.title)} Figure 1" decoding="async">
      </div>
      <div class="card-body">
        <div class="card-badges">
          <span class="badge ${f.venue}">${VENUES[f.venue].name}</span>
          <span class="badge year">${f.year}</span>
          <span class="badge pattern">${PATTERNS[f.pattern] || f.pattern}</span>
        </div>
        <h3 class="card-title">${escapeHtml(f.title)}</h3>
        <p class="card-authors">${escapeHtml(authorsText(f))}</p>
        <span class="card-link">View figure / paper ↗</span>
      </div>
    </article>`;
  }

  /* ---------- custom lazy loading (preloads ~2 screens ahead) ---------- */
  let lazyIO = null;
  function wireImg(img) {
    const slot = img.parentElement;
    function markLoaded() { img.classList.add("loaded"); slot.classList.add("loaded"); }
    if (img.complete && img.naturalWidth > 0) { markLoaded(); return; }
    img.addEventListener("load", markLoaded, { once: true });
    img.addEventListener("error", () => {
      if (img.dataset.src && !img.dataset.retried) {
        img.dataset.retried = "1";
        setTimeout(() => { img.src = img.dataset.src + "?retry=1"; }, 1200);
      } else if (img.dataset.src) {
        slot.classList.add("img-failed");
        slot.addEventListener("click", function once() {
          slot.classList.remove("img-failed");
          img.dataset.retried = "";
          img.src = img.dataset.src;
        }, { once: true });
      } else {
        slot.classList.add("img-failed");
      }
    });
    if ("IntersectionObserver" in window) {
      if (!lazyIO) {
        lazyIO = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              const im = en.target;
              if (im.dataset.src && !im.src) im.src = im.dataset.src;
              lazyIO.unobserve(im);
            }
          });
        }, { rootMargin: "1800px 0px" });
      }
      lazyIO.observe(img);
    } else if (img.dataset.src) {
      img.src = img.dataset.src;
    }
  }
  function wireNewCards() {
    gallery.querySelectorAll(".card-img").forEach(wireImg);
  }

  function appendChunk() {
    const slice = filtered.slice(shown, shown + PAGE);
    gallery.insertAdjacentHTML("beforeend", slice.map((f, i) => cardHtml(f, shown + i)).join(""));
    wireNewCards();
    // CSS masonry can place newly appended cards ABOVE the current viewport
    // (columns fill top-down); start those requests immediately instead of
    // waiting for an intersection that will never happen.
    gallery.querySelectorAll(".card-img[data-src]").forEach((im) => {
      const r = im.getBoundingClientRect();
      if (r.top < window.innerHeight + 1800) im.src = im.dataset.src;
    });
    shown += slice.length;
    if (shown >= filtered.length) {
      sentinel.hidden = true;
      endHint.hidden = filtered.length <= PAGE;
      endHint.textContent = `— End · 共 ${filtered.length.toLocaleString()} figures —`;
    } else {
      sentinel.hidden = false;
      endHint.hidden = true;
    }
  }

  function render() {
    filtered = sorted(figures.filter(matches));
    gallery.innerHTML = "";
    shown = 0;
    empty.hidden = filtered.length > 0;
    appendChunk();
    const active = [
      state.venue !== "all" ? VENUES[state.venue].name : null,
      state.year !== "all" ? state.year : null,
      state.pattern !== "all" ? (PATTERNS[state.pattern] || state.pattern) : null,
    ].filter(Boolean);
    countEl.innerHTML = active.length
      ? `<b>${filtered.length.toLocaleString()}</b> figures · ${active.map(escapeHtml).join(" · ")}`
      : `<b>${filtered.length.toLocaleString()}</b> / ${figures.length.toLocaleString()} figures`;
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !sentinel.hidden) appendChunk();
    }, { rootMargin: "1400px" });
    io.observe(sentinel);
  } else {
    window.addEventListener("scroll", () => {
      const r = sentinel.getBoundingClientRect();
      if (!sentinel.hidden && r.top < window.innerHeight + 1400) appendChunk();
    }, { passive: true });
  }

  /* ---------- lightbox with prev/next over the filtered list ---------- */
  const lb = $("#lightbox");
  let currentId = null;
  function currentIndex() { return filtered.findIndex((x) => x.id === currentId); }
  function openFigure(f) {
    currentId = f.id;
    $("#lb-img").src = f.image;
    $("#lb-img").alt = f.title;
    const vBadge = $("#lb-venue");
    vBadge.textContent = VENUES[f.venue].name;
    vBadge.className = "badge " + f.venue;
    $("#lb-year").textContent = f.year;
    const pBadge = $("#lb-pattern");
    pBadge.textContent = PATTERNS[f.pattern] || f.pattern;
    $("#lb-title").textContent = f.title;
    $("#lb-authors").textContent = (f.authors || []).join(", ");
    $("#lb-paper").href = f.paper || "#";
    $("#lb-image").href = f.image;
    const i = currentIndex();
    $("#lb-prev").style.visibility = i > 0 ? "visible" : "hidden";
    $("#lb-next").style.visibility = i < filtered.length - 1 ? "visible" : "hidden";
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function step(d) {
    const i = currentIndex();
    const j = i + d;
    if (j >= 0 && j < filtered.length) openFigure(filtered[j]);
  }
  function closeLb() { lb.hidden = true; document.body.style.overflow = ""; }

  gallery.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) {
      const f = figures.find((x) => x.id === card.dataset.id);
      if (f) openFigure(f);
    }
  });
  gallery.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".card");
    if (card) { e.preventDefault(); const f = figures.find((x) => x.id === card.dataset.id); if (f) openFigure(f); }
  });
  $("#lb-close").addEventListener("click", closeLb);
  $("#lb-prev").addEventListener("click", () => step(-1));
  $("#lb-next").addEventListener("click", () => step(1));
  lb.querySelector(".lightbox-backdrop").addEventListener("click", closeLb);
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  render();
})();
