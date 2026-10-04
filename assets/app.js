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
  const TIERS = { best: "Best Paper", oral: "Oral", spotlight: "Spotlight" };
  const PAGE = 60;

  /* ---------- i18n: dynamic labels ---------- */
  GAL_I18N.register({
    en: {
      "chip.all": "All",
      "pat.teaser": "Teaser", "pat.conceptual": "Conceptual", "pat.framework": "Framework",
      "pat.pipeline": "Pipeline", "pat.architecture": "Architecture",
      "pat.taxonomy": "Taxonomy / Benchmark", "pat.results": "Results", "pat.comparison": "Comparison",
      "tier.best": "Best Paper", "tier.oral": "Oral", "tier.spotlight": "Spotlight",
      "rib.best": "★ Best Paper", "rib.honor": "Honorable Mention",
      "rib.oral": "● Oral", "rib.spot": "● Spotlight",
      "card.viewImage": "View image", "card.paper": "paper ↗",
      "card.aria": "View {t}",
      "end": "— End · {n} figures —",
      "count.full": "<b>{n}</b> figures · {active}",
      "count.base": "<b>{n}</b> / {m} figures",
    },
    zh: {
      "chip.all": "全部",
      "pat.teaser": "主视觉", "pat.conceptual": "概念图", "pat.framework": "框架总览",
      "pat.pipeline": "流程图", "pat.architecture": "架构图",
      "pat.taxonomy": "全景 / 基准", "pat.results": "结果", "pat.comparison": "对比",
      "tier.best": "最佳论文", "tier.oral": "口头报告", "tier.spotlight": "焦点论文",
      "rib.best": "★ 最佳论文", "rib.honor": "荣誉提名",
      "rib.oral": "● 口头报告", "rib.spot": "● 焦点论文",
      "card.viewImage": "查看图片", "card.paper": "论文 ↗",
      "card.aria": "查看 {t}",
      "end": "— 已加载全部 · 共 {n} 张 —",
      "count.full": "<b>{n}</b> 张 · {active}",
      "count.base": "<b>{n}</b> / {m} 张",
    },
  });
  const patLabel = (p) => GAL_I18N.t("pat." + p);
  const tierLabel = (v) => GAL_I18N.t("tier." + v);

  const state = { venue: "all", year: "all", tier: "all", pattern: "all", q: "", sort: "venue" };
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
  const nBest = figures.filter((f) => f.award).length;
  const nOral = figures.filter((f) => (f.award ? false : f.tier === "oral")).length;
  const nSpot = figures.filter((f) => (!f.award && f.tier === "spotlight")).length;
  $("#total-best").textContent = nBest.toLocaleString();
  $("#total-oral").textContent = nOral.toLocaleString();
  $("#total-spotlight").textContent = nSpot.toLocaleString();

  /* ---------- filter chips ---------- */
  const chipBoxes = [];
  function chipText(btn, counts) {
    const label = btn.dataset.lk ? GAL_I18N.t(btn.dataset.lk) : btn.dataset.static;
    // No count on the “All” chip: counts["all"] is undefined and used to render
    // a bogus “0” next to it.
    const n = counts ? counts[btn.dataset.val] : null;
    return label + (n ? ` <span class="n">${n}</span>` : "");
  }
  function makeChips(containerId, key, values, labelKeyFor, counts) {
    const box = $(containerId);
    const all = document.createElement("button");
    all.className = "chip active";
    all.dataset.lk = "chip.all";
    all.dataset.val = "all";
    box.appendChild(all);
    values.forEach((v) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.dataset.val = v;
      const lk = labelKeyFor(v);
      if (lk && lk.startsWith("static:")) c.dataset.static = lk.slice(7);
      else if (lk) c.dataset.lk = lk;
      else c.dataset.static = String(v);
      box.appendChild(c);
    });
    chipBoxes.push({ box, counts });
    box.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state[key] = btn.dataset.val;
      box.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === btn));
      render();
    });
  }

  const years = [...new Set(figures.map((f) => f.year))].sort();
  const usedPatterns = PATTERN_ORDER.filter((p) => figures.some((f) => f.pattern === p));

  makeChips("#venue-chips", "venue", Object.keys(VENUES), (v) => "static:" + VENUES[v].name,
    Object.fromEntries(Object.keys(VENUES).map((v) => [v, figures.filter((f) => f.venue === v).length])));
  makeChips("#year-chips", "year", years, () => null);
  makeChips("#tier-chips", "tier", ["best", "oral", "spotlight"], (v) => "tier." + v,
    { best: nBest, oral: nOral, spotlight: nSpot });
  makeChips("#pattern-chips", "pattern", usedPatterns, (v) => "pat." + v);

  function relabelChips() {
    chipBoxes.forEach(({ box, counts }) => {
      box.querySelectorAll(".chip").forEach((btn) => { btn.innerHTML = chipText(btn, counts); });
    });
  }
  // Chips are built empty above; without this first pass they stay blank until
  // the visitor happens to switch language (langchange calls relabelChips).
  relabelChips();

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
    state.venue = state.year = state.tier = state.pattern = "all"; state.q = "";
    searchInput.value = ""; clearBtn.hidden = true;
    document.querySelectorAll(".chips").forEach((b) => {
      b.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.val === "all"));
    });
    render();
  });

  /* ---------- filtering / sorting ---------- */
  function matches(f) {
    if (state.venue !== "all" && f.venue !== state.venue) return false;
    if (state.year !== "all" && String(f.year) !== String(state.year)) return false;
    if (state.pattern !== "all" && f.pattern !== state.pattern) return false;
    if (state.tier === "best") { if (!f.award) return false; }
    else if (state.tier === "oral") { if (f.award || f.tier !== "oral") return false; }
    else if (state.tier === "spotlight") { if (f.award || f.tier !== "spotlight") return false; }
    if (state.q) {
      const hay = [f.title, (f.authors || []).join(" "), VENUES[f.venue].name,
                   f.year, f.pattern, PATTERNS[f.pattern] || "", patLabel(f.pattern),
                   f.tier ? TIERS[f.tier] : "", f.tier ? tierLabel(f.tier) : "",
                   f.award ? "best paper award outstanding 最佳论文" : ""]
        .join(" ").toLowerCase();
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
  function ribbonInfo(f) {
    if (f.award === "best") return { className: "rb-best", key: "rib.best" };
    if (f.award === "honorable") return { className: "rb-honor", key: "rib.honor" };
    if (f.tier === "oral") return { className: "rb-oral", key: "rib.oral" };
    if (f.tier === "spotlight") return { className: "rb-spot", key: "rib.spot" };
    return null;
  }
  function ribbonHtml(f) {
    const info = ribbonInfo(f);
    return info ? `<span class="ribbon ${info.className}">${GAL_I18N.t(info.key)}</span>` : "";
  }
  function cardHtml(f, idx) {
    const ratio = (f.w && f.h) ? `aspect-ratio:${f.w} / ${f.h};` : "min-height:170px;";
    const eager = idx < 24;
    const imgAttrs = eager ? `src="${f.image}"` : `data-src="${f.image}"`;
    return `
    <article class="card${f.award ? " is-award" : f.tier ? " is-" + f.tier : ""}" data-id="${f.id}" tabindex="0" role="button" aria-label="${GAL_I18N.t("card.aria", { t: escapeHtml(f.title) })}">
      <span class="card-close-target" aria-hidden="true"></span>
      <div class="img-slot" style="${ratio}">
        ${ribbonHtml(f)}
        <img class="card-img${eager ? " loaded" : ""}" ${imgAttrs} alt="${escapeHtml(f.title)} Figure 1" decoding="async">
      </div>
      <div class="card-body">
        <div class="card-badges">
          <span class="badge ${f.venue}">${VENUES[f.venue].name}</span>
          <span class="badge year">${f.year}</span>
          <span class="badge pattern">${patLabel(f.pattern)}</span>
        </div>
        <h3 class="card-title">${escapeHtml(f.title)}</h3>
        <p class="card-authors">${escapeHtml(authorsText(f))}</p>
        <span class="card-link"><span class="card-link-image">${GAL_I18N.t("card.viewImage")}</span><span class="card-link-separator">/</span><span class="card-link-paper">${GAL_I18N.t("card.paper")}</span></span>
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
      endHint.textContent = GAL_I18N.t("end", { n: filtered.length.toLocaleString() });
    } else {
      sentinel.hidden = false;
      endHint.hidden = true;
    }
  }

  function render() {
    filtered = sorted(figures.filter(matches));
    // Filter/sort/search changes rewrite the query only; the figure hash, if the
    // lightbox happens to be open, is carried through untouched.
    writeUrl("replaceState", location.hash);
    gallery.innerHTML = "";
    shown = 0;
    empty.hidden = filtered.length > 0;
    appendChunk();
    const active = [
      state.venue !== "all" ? VENUES[state.venue].name : null,
      state.year !== "all" ? state.year : null,
      state.tier !== "all" ? tierLabel(state.tier) : null,
      state.pattern !== "all" ? patLabel(state.pattern) : null,
    ].filter(Boolean);
    countEl.innerHTML = active.length
      ? GAL_I18N.t("count.full", { n: filtered.length.toLocaleString(), active: active.map(escapeHtml).join(" · ") })
      : GAL_I18N.t("count.base", { n: filtered.length.toLocaleString(), m: figures.length.toLocaleString() });
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

  /* ---------- shareable URL state (filters in the query, figure in the hash) ----------
     Filters and the search box live in ?v=&y=&t=&p=&q=&s=, the open figure lives in
     #f=<id>. Hash-only writes never reload GitHub Pages, so switching figures or
     clearing the hash costs nothing. */
  const URL_KEYS = ["v", "y", "t", "p", "q", "s"];
  let internalUrlWrite = false;

  function validFilter(key, value) {
    if (key === "v") return value === "all" || Object.prototype.hasOwnProperty.call(VENUES, value);
    if (key === "y") return value === "all" || years.some((x) => String(x) === value);
    if (key === "t") return value === "all" || Object.prototype.hasOwnProperty.call(TIERS, value);
    if (key === "p") return value === "all" || Object.prototype.hasOwnProperty.call(PATTERNS, value);
    if (key === "s") return ["venue", "year", "title"].indexOf(value) !== -1;
    if (key === "q") return true;
    return false;
  }

  // Unknown params are preserved so this never strips somebody else's tracking
  // link (?utm_source=…) off a shared URL.
  function queryString() {
    const params = new URLSearchParams(location.search);
    URL_KEYS.forEach((key) => params.delete(key));
    if (state.venue !== "all") params.set("v", state.venue);
    if (state.year !== "all") params.set("y", state.year);
    if (state.tier !== "all") params.set("t", state.tier);
    if (state.pattern !== "all") params.set("p", state.pattern);
    if (state.q) params.set("q", state.q);
    if (state.sort !== "venue") params.set("s", state.sort);
    return params.toString();
  }

  function writeUrl(method, hash) {
    const query = queryString();
    const url = location.pathname + (query ? "?" + query : "") + (hash || "");
    internalUrlWrite = true;
    try {
      history[method](history.state, "", url);
    } catch (_) {
      location.hash = hash || "";
    } finally {
      internalUrlWrite = false;
    }
  }

  function figureHash() {
    const match = /^#f=([A-Za-z0-9._-]+)$/.exec(location.hash);
    return match ? match[1] : null;
  }

  /* ---------- lightbox with prev/next over the filtered list ---------- */
  const lb = $("#lightbox");
  const lbImg = $("#lb-img");
  const lbClose = $("#lb-close");
  const lbDialog = lb.querySelector(".lightbox-dialog");
  const lbContent = lb.querySelector(".lightbox-content");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const transitionParts = {
    shell: "gallery-card-shell",
    image: "gallery-card-image",
    badges: "gallery-card-badges",
    title: "gallery-card-title",
    authorsOut: "gallery-card-authors-out",
    authorsIn: "gallery-card-authors-in",
    imageAction: "gallery-card-image-action",
    paperAction: "gallery-card-paper-action",
    separator: "gallery-card-link-separator",
    ribbon: "gallery-card-ribbon",
    close: "gallery-lightbox-close",
    swap: "gallery-dialog-swap",
  };
  let currentId = null;
  let lightboxBusy = false;
  let opener = null;
  // Set while a router-driven open/close runs, so the transition's own state
  // changes are not mistaken for a user navigation.
  let routerBusy = false;

  function currentIndex() { return filtered.findIndex((x) => x.id === currentId); }

  function lightboxControls() {
    return Array.from(lbDialog.querySelectorAll("a[href], button:not([disabled])"))
      .filter((element) => getComputedStyle(element).visibility !== "hidden");
  }

  function trapLightboxFocus(e) {
    if (e.key !== "Tab" || lb.hidden) return;
    const controls = lightboxControls();
    if (!controls.length) { e.preventDefault(); return; }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function positionLightboxNav() {
    const imageRect = lb.querySelector(".lightbox-img-wrap").getBoundingClientRect();
    if (!imageRect.height) return;
    const center = `${imageRect.top + imageRect.height / 2}px`;
    $("#lb-prev").style.top = center;
    $("#lb-next").style.top = center;
  }

  function positionLightboxSeparator() {
    const image = $("#lb-image").getBoundingClientRect();
    const paper = $("#lb-paper").getBoundingClientRect();
    const actions = lbDialog.querySelector(".lb-actions").getBoundingClientRect();
    const target = $("#lb-separator-target");
    target.style.left = `${(image.right + paper.left) / 2 - actions.left}px`;
    target.style.top = `${(image.top + image.bottom + paper.top + paper.bottom) / 4 - actions.top}px`;
  }

  function setFigureContent(f) {
    currentId = f.id;
    lbImg.src = f.image;
    lbImg.alt = f.title;
    const aBadge = $("#lb-award");
    if (f.award) {
      aBadge.hidden = false;
      aBadge.textContent = GAL_I18N.t(f.award === "best" ? "rib.best" : "rib.honor");
      aBadge.className = "badge tier-badge " + (f.award === "best" ? "rb-best" : "rb-honor");
    } else aBadge.hidden = true;
    const tBadge = $("#lb-tier");
    if (f.tier) {
      tBadge.hidden = false;
      tBadge.textContent = tierLabel(f.tier);
      tBadge.className = "badge tier-badge " + (f.tier === "oral" ? "rb-oral" : "rb-spotlight");
    } else tBadge.hidden = true;
    const vBadge = $("#lb-venue");
    vBadge.textContent = VENUES[f.venue].name;
    vBadge.className = "badge " + f.venue;
    $("#lb-year").textContent = f.year;
    const pBadge = $("#lb-pattern");
    pBadge.textContent = patLabel(f.pattern);
    const ribbonTarget = $("#lb-ribbon-target");
    const ribbon = ribbonInfo(f);
    ribbonTarget.textContent = ribbon ? GAL_I18N.t(ribbon.key) : "";
    ribbonTarget.className = `ribbon ribbon-target${ribbon ? " " + ribbon.className : ""}`;
    $("#lb-title").textContent = f.title;
    $("#lb-authors").textContent = (f.authors || []).join(", ");
    $("#lb-paper").href = f.paper || "#";
    $("#lb-image").href = f.image;
    const i = currentIndex();
    $("#lb-prev").style.visibility = i > 0 ? "visible" : "hidden";
    $("#lb-next").style.visibility = i < filtered.length - 1 ? "visible" : "hidden";
  }

  function cardFor(id) {
    return Array.from(gallery.querySelectorAll(".card")).find((card) => card.dataset.id === id) || null;
  }

  function isInViewport(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function canTransition() {
    return typeof document.startViewTransition === "function" && !reducedMotion.matches;
  }

  async function decodeLightboxImage() {
    if (typeof lbImg.decode !== "function") return;
    try { await lbImg.decode(); } catch (_) { /* Keep the existing image error behavior. */ }
  }

  function componentPairs(card, direction) {
    const cardAuthors = card && card.querySelector(".card-authors");
    const dialogAuthors = $("#lb-authors");
    const cardParts = card ? {
      shell: card,
      image: card.querySelector(".card-img"),
      badges: card.querySelector(".card-badges"),
      title: card.querySelector(".card-title"),
      imageAction: card.querySelector(".card-link-image"),
      paperAction: card.querySelector(".card-link-paper"),
      separator: card.querySelector(".card-link-separator"),
      close: card.querySelector(".card-close-target"),
    } : {};
    const dialogParts = {
      shell: lbDialog,
      image: lbImg,
      badges: lbDialog.querySelector(".lb-badges"),
      title: $("#lb-title"),
      imageAction: $("#lb-image"),
      paperAction: $("#lb-paper"),
      separator: $("#lb-separator-target"),
      close: lbClose,
    };
    const pairs = Object.keys(dialogParts).map((key) => ({
      source: direction === "closing" ? dialogParts[key] : cardParts[key],
      destination: direction === "closing" ? cardParts[key] : dialogParts[key],
      name: transitionParts[key],
    }));
    const ribbon = card && card.querySelector(".ribbon");
    if (ribbon) {
      pairs.push({
        source: direction === "opening" ? ribbon : $("#lb-ribbon-target"),
        destination: direction === "closing" ? ribbon : $("#lb-ribbon-target"),
        name: transitionParts.ribbon,
      });
    }
    // Single-line card text and wrapping dialog text need separate snapshots.
    // Neither snapshot should be resized between those two layouts.
    if (cardAuthors && isInViewport(cardAuthors)) {
      pairs.push(
        { source: direction === "closing" ? dialogAuthors : cardAuthors,
          destination: null, name: transitionParts.authorsOut },
        { source: null,
          destination: direction === "closing" ? cardAuthors : dialogAuthors,
          travelFrom: direction === "closing" ? dialogAuthors : cardAuthors,
          name: transitionParts.authorsIn },
      );
    }
    return pairs;
  }

  async function transitionLightbox(update, options) {
    const { pairs = [], direction } = options;
    if (!canTransition()) {
      await update();
      return;
    }

    const activePairs = pairs.reduce((result, pair) => {
      if (pair.source && !isInViewport(pair.source)) return result;
      const destinationVisible = isInViewport(pair.destination);
      if (direction !== "opening" && !destinationVisible && pair.name !== transitionParts.shell
          && pair.name !== transitionParts.authorsOut) {
        return result;
      }
      const destination = direction === "opening" || destinationVisible
        ? pair.destination
        : null;
      if (!pair.source && !destination) return result;
      result.push({ ...pair, destination });
      return result;
    }, []);
    const authorPair = activePairs.find((pair) => pair.name === transitionParts.authorsIn);
    const authorStart = authorPair && authorPair.travelFrom
      ? authorPair.travelFrom.getBoundingClientRect()
      : null;
    const actionPairs = activePairs.filter((pair) =>
      pair.name === transitionParts.imageAction || pair.name === transitionParts.paperAction);
    // A shared link opens the dialog with no originating card, so `source` can be
    // undefined. Skipping those pairs keeps the transition working instead of
    // throwing, which used to abort the open and leave the dialog hidden.
    const rectOf = (element) => (element ? element.getBoundingClientRect() : null);
    const actionStarts = new Map(actionPairs
      .filter((pair) => rectOf(pair.source) && rectOf(pair.destination))
      .map((pair) => [pair.name, pair.source.getBoundingClientRect()]));
    let updated = false;
    let transition;

    document.documentElement.dataset.figureTransition = direction;
    activePairs.forEach(({ source, name }) => {
      if (source) source.style.viewTransitionName = name;
    });

    try {
      transition = document.startViewTransition(async () => {
        activePairs.forEach(({ source }) => {
          if (source) source.style.viewTransitionName = "";
        });
        updated = true;
        await update();
        activePairs.forEach(({ destination, name }) => {
          if (destination) destination.style.viewTransitionName = name;
        });
        actionPairs.forEach(({ destination, name }) => {
          if (!destination) return;
          const key = name === transitionParts.imageAction ? "image-action" : "paper-action";
          const startRect = actionStarts.get(name);
          const endRect = destination.getBoundingClientRect();
          // No originating card (cold start from a shared link): there is nothing
          // to morph from, so the destination simply keeps its own layout.
          if (!startRect) return;
          for (const [side, rect] of [["from", startRect], ["to", endRect]]) {
            for (const axis of ["width", "height"]) {
              document.documentElement.style.setProperty(`--gallery-${key}-${side}-${axis}`, `${rect[axis]}px`);
            }
          }
        });
        if (authorStart && authorPair.destination) {
          const authorEnd = authorPair.destination.getBoundingClientRect();
          for (const [side, rect] of [["from", authorStart], ["to", authorEnd]]) {
            for (const [axis, value] of [["x", rect.left], ["y", rect.top],
                                         ["width", rect.width], ["height", rect.height]]) {
              document.documentElement.style.setProperty(`--gallery-author-${side}-${axis}`, `${value}px`);
            }
          }
        }
      });
      await transition.finished;
    } catch (_) {
      if (!updated) await update();
    } finally {
      activePairs.forEach(({ source, destination }) => {
        if (source) source.style.viewTransitionName = "";
        if (destination) destination.style.viewTransitionName = "";
      });
      for (const side of ["from", "to"]) {
        for (const axis of ["x", "y", "width", "height"]) {
          document.documentElement.style.removeProperty(`--gallery-author-${side}-${axis}`);
        }
        for (const key of ["image-action", "paper-action"]) {
          for (const axis of ["width", "height"]) {
            document.documentElement.style.removeProperty(`--gallery-${key}-${side}-${axis}`);
          }
        }
      }
      delete document.documentElement.dataset.figureTransition;
    }
  }

  async function openFigure(f, card) {
    if (lightboxBusy || !lb.hidden) return;
    // Written before the transition so a share taken mid-animation already has
    // the right URL. pushState keeps one history entry so Back returns to the grid.
    if (!card) writeUrl("replaceState", "#f=" + f.id);
    else writeUrl("pushState", "#f=" + f.id);
    lightboxBusy = true;
    opener = card || document.activeElement;
    lbDialog.style.height = "";
    setFigureContent(f);
    await decodeLightboxImage();

    try {
      await transitionLightbox(() => {
        lb.hidden = false;
        document.body.style.overflow = "hidden";
        positionLightboxNav();
        positionLightboxSeparator();
      }, {
        pairs: componentPairs(card, "opening"),
        direction: "opening",
      });
      lbClose.focus({ preventScroll: true });
    } finally {
      lightboxBusy = false;
    }
  }

  async function step(d) {
    if (lightboxBusy) return;
    const i = currentIndex();
    const j = i + d;
    if (j < 0 || j >= filtered.length) return;

    lightboxBusy = true;
    // Stepping replaces the entry instead of stacking one per figure, so Back
    // always returns to the grid rather than walking through the whole list.
    writeUrl("replaceState", "#f=" + filtered[j].id);
    if (!lbDialog.style.height) {
      lbDialog.style.height = `${lbDialog.getBoundingClientRect().height}px`;
    }
    try {
      await transitionLightbox(async () => {
        setFigureContent(filtered[j]);
        await decodeLightboxImage();
      }, {
        pairs: [{ source: lbContent, destination: lbContent, name: transitionParts.swap }],
        direction: d > 0 ? "switch-next" : "switch-prev",
      });
    } finally {
      lightboxBusy = false;
    }
  }

  async function closeLb() {
    if (lightboxBusy || lb.hidden) return;
    lightboxBusy = true;
    const targetCard = cardFor(currentId);
    const returnFocus = targetCard || opener;

    try {
      await transitionLightbox(() => {
        lb.hidden = true;
        document.body.style.overflow = "";
      }, {
        pairs: componentPairs(targetCard, "closing"),
        direction: "closing",
      });
      if (returnFocus && typeof returnFocus.focus === "function") {
        returnFocus.focus({ preventScroll: true });
      }
    } finally {
      lbDialog.style.height = "";
      lightboxBusy = false;
    }
    // After the flags are cleared so the URL write cannot race the close.
    writeUrl("replaceState", "");
  }

  /* ---------- URL -> UI ---------- */
  function syncUiFromState() {
    const keyByBox = { "venue-chips": "venue", "year-chips": "year", "tier-chips": "tier", "pattern-chips": "pattern" };
    document.querySelectorAll(".chips").forEach((box) => {
      const key = keyByBox[box.id];
      if (!key) return;
      box.querySelectorAll(".chip").forEach((chip) => {
        chip.classList.toggle("active", chip.dataset.val === state[key]);
      });
    });
    searchInput.value = state.q;
    clearBtn.hidden = !state.q;
    $("#sort").value = state.sort;
  }

  function readUrlState() {
    const params = new URLSearchParams(location.search);
    ["v", "y", "t", "p", "s", "q"].forEach((key) => {
      if (!params.has(key)) return;
      const value = params.get(key);
      if (!validFilter(key, value)) return;
      if (key === "v") state.venue = value;
      else if (key === "y") state.year = value;
      else if (key === "t") state.tier = value;
      else if (key === "p") state.pattern = value;
      else if (key === "s") state.sort = value;
      else if (key === "q") state.q = value.trim().toLowerCase();
    });
  }

  // The only place the lightbox is opened or closed without a click.
  async function applyHashToLightbox() {
    const id = figureHash();
    if (id === currentId) return;
    if (id === null) {
      if (!lb.hidden) await closeLb();
      return;
    }
    if (!lb.hidden) {
      // Another entry for a figure already on screen (Back/Forward): swap in place.
      const openF = filtered.find((x) => x.id === id);
      if (openF) {
        setFigureContent(openF);
        await decodeLightboxImage();
      }
      return;
    }
    const f = figures.find((x) => x.id === id);
    if (!f) return; // unknown or stale id: leave the grid alone
    if (!filtered.some((x) => x.id === id)) {
      // The link carries filters that hide its own target — drop only what gets
      // in the way, then re-render, so a shared figure is actually visible.
      if (state.venue !== "all" && f.venue !== state.venue) state.venue = "all";
      if (state.year !== "all" && String(f.year) !== String(state.year)) state.year = "all";
      if (state.tier !== "all" && !matches(f)) state.tier = "all";
      if (state.pattern !== "all" && f.pattern !== state.pattern) state.pattern = "all";
      if (state.q && !matches(f)) state.q = "";
      syncUiFromState();
      render();
    }
    await openFigure(f, null);
  }

  async function applyUrlToUi() {
    const before = JSON.stringify(state);
    readUrlState();
    if (JSON.stringify(state) !== before) {
      syncUiFromState();
      render();
    }
    await applyHashToLightbox();
  }

  function handleUrlChange() {
    if (internalUrlWrite || routerBusy) return;
    routerBusy = true;
    applyUrlToUi()
      .catch(() => { /* keep the grid usable if a transition fails */ })
      .then(() => { routerBusy = false; });
  }

  window.addEventListener("popstate", handleUrlChange);
  // hashchange is a backstop for engines where a hash-only popstate does not
  // fire; applyHashToLightbox is a no-op when the id already matches.
  window.addEventListener("hashchange", handleUrlChange);

  gallery.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) {
      const f = figures.find((x) => x.id === card.dataset.id);
      if (f) openFigure(f, card);
    }
  });
  gallery.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".card");
    if (card) { e.preventDefault(); const f = figures.find((x) => x.id === card.dataset.id); if (f) openFigure(f, card); }
  });
  lbClose.addEventListener("click", closeLb);
  $("#lb-prev").addEventListener("click", () => step(-1));
  $("#lb-next").addEventListener("click", () => step(1));
  lb.querySelector(".lightbox-backdrop").addEventListener("click", closeLb);
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    trapLightboxFocus(e);
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
  window.addEventListener("resize", () => {
    if (!lb.hidden && !lightboxBusy) {
      positionLightboxNav();
      positionLightboxSeparator();
    }
  });

  /* ---------- language toggle ---------- */
  const langToggle = $("#lang-toggle");
  function syncToggle() {
    langToggle.textContent = GAL_I18N.lang === "zh" ? "EN" : "中";
    langToggle.title = GAL_I18N.t("toggle.title");
  }
  langToggle.addEventListener("click", () => {
    GAL_I18N.setLang(GAL_I18N.lang === "zh" ? "en" : "zh");
  });
  document.addEventListener("langchange", () => {
    syncToggle();
    relabelChips();
    if (!lb.hidden && currentId) {
      const f = figures.find((x) => x.id === currentId);
      if (f) setFigureContent(f);
    }
    render();
  });

  syncToggle();
  GAL_I18N.apply();
  // Filters from the URL must be in state before the first render, otherwise the
  // grid paints the unfiltered list for one frame.
  readUrlState();
  syncUiFromState();
  render();
  // Cold start: `#f=<id>` from a shared link opens that figure, which also warms
  // the 60-card chunk it lives in whenever the filters still include it.
  // `window.__tcLastError` records a failed cold start for debugging; it is never
  // user-visible and never blocks the grid.
  applyHashToLightbox().catch((err) => { window.__tcLastError = String((err && err.stack) || err); });
})();
