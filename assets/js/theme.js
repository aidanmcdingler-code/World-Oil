/* ==========================================================================
   World Oil — shared theme + motion helpers  (window.OilTheme)
   Load after Chart.js and before the page scripts. Everything visual — chart
   styling, colors, number formatting, count-ups, scroll reveal, chart entry
   animation, globe styling — lives here so both pages stay consistent.

   API
     OilTheme.chart(canvas, {type, labels, datasets, yLabel, xLabel, format,
                    stacked, horizontal, legend, fill, options})  -> Chart
     OilTheme.update(chart, {labels, datasets})   dashboard re-render (dim + animate)
     OilTheme.assignColors(keys)   pin entity -> color slot once (keeps colors stable)
     OilTheme.colorFor(key)        that entity's color ("Other" -> gray)
     OilTheme.palette              current 8 categorical colors (array)
     OilTheme.seqColor(t)          0..1 -> sequential color (globe shading)
     OilTheme.fmt(n, {decimals, suffix, prefix, compact})
     OilTheme.countUp(root)        animate .stat-value[data-value] inside root
     OilTheme.setStat(el, value)   dashboard: tween a stat to a new value + flash
     OilTheme.reveal()             scroll reveal, nav shadow, progress bar
     OilTheme.globe(globe, el, {valueOf, max, label, onSelect})  style a globe.gl instance
     OilTheme.freshRows(tbody)     fade-in newly rendered table rows
   ========================================================================== */
(function () {
  "use strict";

  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionOK = () => !reducedMotion.matches;

  /* ---------- tokens ---------- */
  const TOKEN_NAMES = [
    "surface", "surface-2", "ink", "ink-2", "ink-muted", "grid", "axis", "border-strong",
    "accent", "series-other", "font-sans", "font-mono",
    "series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "series-7", "series-8",
    "seq-0", "seq-1", "seq-2", "seq-3", "seq-4", "seq-5", "seq-6",
  ];
  let T = {};
  function readTokens() {
    const cs = getComputedStyle(root);
    T = {};
    TOKEN_NAMES.forEach((n) => { T[n] = cs.getPropertyValue("--" + n).trim(); });
    OilTheme.palette = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => T["series-" + i]);
  }

  /* ---------- color: identity follows the entity, never its rank ---------- */
  const slotOf = new Map();        // key -> slot index 0..7
  const OTHER = /^(other|others|rest of world|all other)/i;
  function assignColors(keys) {
    slotOf.clear();
    keys.filter((k) => !OTHER.test(k)).slice(0, 8).forEach((k, i) => slotOf.set(k, i));
  }
  function colorFor(key) {
    if (key == null || OTHER.test(String(key))) return T["series-other"];
    if (!slotOf.has(key)) {
      if (slotOf.size >= 8) return T["series-other"];   // never generate a 9th hue
      slotOf.set(key, slotOf.size);
    }
    return OilTheme.palette[slotOf.get(key)];
  }
  function alpha(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function seqColor(t) {
    if (t == null || isNaN(t)) return T["surface-2"];
    t = Math.min(1, Math.max(0, t));
    const stops = [0, 1, 2, 3, 4, 5, 6].map((i) => hexToRgb(T["seq-" + i]));
    const x = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i;
    const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /* ---------- numbers ---------- */
  function fmt(n, o) {
    o = o || {};
    if (n == null || isNaN(n)) return "–";
    const d = o.decimals == null ? 0 : +o.decimals;
    let body;
    if (o.compact) {
      body = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: d || 1 }).format(n);
    } else {
      body = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
    }
    return (o.prefix || "") + body + (o.suffix || "");
  }
  function formatter(format) {
    if (typeof format === "function") return format;
    return (v) => fmt(v, format || {});
  }

  /* ---------- Chart.js defaults + styling plugin ---------- */
  function applyDefaults() {
    if (!window.Chart) return;
    const C = window.Chart.defaults;
    C.font.family = T["font-sans"];
    C.font.size = 12;
    C.color = T["ink-muted"];
    C.borderColor = T.grid;
    C.maintainAspectRatio = false;
    C.responsive = true;
    C.animation.duration = motionOK() ? 900 : 0;
    C.animation.easing = "easeOutQuart";
    C.plugins.legend.display = false;          // HTML legend instead (see below)
    const tt = C.plugins.tooltip;
    tt.backgroundColor = T["surface-2"];
    tt.titleColor = T.ink;
    tt.bodyColor = T["ink-2"];
    tt.borderColor = T["border-strong"];
    tt.borderWidth = 1;
    tt.padding = 10;
    tt.cornerRadius = 8;
    tt.boxPadding = 4;
    tt.usePointStyle = true;
    tt.titleFont = { weight: "600" };
    C.elements.line.borderWidth = 2;
    C.elements.line.borderCapStyle = "round";
    C.elements.line.borderJoinStyle = "round";
    C.elements.line.tension = 0.25;
    C.elements.point.radius = 0;
    C.elements.point.hoverRadius = 5;
    C.elements.point.hitRadius = 12;
    C.elements.point.borderWidth = 2;
    C.elements.bar.borderRadius = 4;
    C.elements.bar.borderSkipped = "start";   // rounded data-end, square baseline
    C.elements.arc.borderWidth = 2;
  }

  // Colors every dataset from its entity key on every update, so page code can
  // just swap chart.data and call chart.update() and still get stable colors.
  const stylePlugin = {
    id: "oilStyle",
    beforeUpdate(chart) {
      const type = chart.config.type;
      const multi = chart.data.datasets.length > 1;
      chart.data.datasets.forEach((ds, i) => {
        const key = ds.key != null ? ds.key : ds.label;
        const dsType = ds.type || type;
        if (dsType === "doughnut" || dsType === "pie" || dsType === "polarArea") {
          ds.backgroundColor = chart.data.labels.map((l) => colorFor(l));
          ds.borderColor = T.surface;
          ds.hoverOffset = 6;
          return;
        }
        const c = ds.color || (multi ? colorFor(key) : T["series-1"]);
        if (dsType === "line") {
          ds.borderColor = c;
          ds.backgroundColor = ds.fill ? alpha(c, 0.1) : c;
          ds.pointBackgroundColor = c;
          ds.pointBorderColor = T.surface;
          ds.pointHoverBorderColor = T.surface;
        } else if (dsType === "bar") {
          ds.backgroundColor = c;
          ds.hoverBackgroundColor = alpha(c, 0.8);
          ds.maxBarThickness = ds.maxBarThickness || 24;
          // 2px surface gap between stacked segments / touching bars
          ds.borderColor = T.surface;
          ds.borderWidth = chart.options.scales && chart.options.scales.x && chart.options.scales.x.stacked ? { top: 2, right: 0, bottom: 0, left: 0 } : 0;
        } else {
          ds.backgroundColor = c;
          ds.borderColor = c;
        }
      });
    },
  };

  // HTML legend above the plot for >= 2 series (or any doughnut). Click toggles.
  const legendPlugin = {
    id: "oilLegend",
    afterUpdate(chart) {
      const opt = chart.options.plugins.oilLegend;
      const type = chart.config.type;
      const isArc = type === "doughnut" || type === "pie";
      const box = chart.canvas.parentNode;
      let ul = box.previousElementSibling;
      if (!ul || !ul.classList.contains("legend")) {
        ul = document.createElement("ul");
        ul.className = "legend";
        box.parentNode.insertBefore(ul, box);
      }
      const show = opt !== false && (isArc || chart.data.datasets.length > 1);
      ul.hidden = !show;
      if (!show) return;
      const items = chart.options.plugins.legend.labels.generateLabels(chart);
      ul.innerHTML = "";
      items.forEach((it) => {
        const li = document.createElement("li");
        if (it.hidden) li.classList.add("off");
        const sw = document.createElement("span");
        const isLine = !isArc && (chart.data.datasets[it.datasetIndex].type || type) === "line";
        sw.className = "swatch" + (isLine ? " line" : "");
        sw.style.background = isLine ? it.strokeStyle : it.fillStyle;
        const tx = document.createElement("span");
        tx.textContent = it.text;
        li.append(sw, tx);
        li.tabIndex = 0;
        li.setAttribute("role", "button");
        const toggle = () => {
          if (isArc) chart.toggleDataVisibility(it.index);
          else chart.setDatasetVisibility(it.datasetIndex, !chart.isDatasetVisible(it.datasetIndex));
          chart.update();
        };
        li.addEventListener("click", toggle);
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
        ul.appendChild(li);
      });
    },
  };

  const charts = new Set();

  function wrap(canvas) {
    if (canvas.parentNode.classList.contains("chart-box")) return canvas.parentNode;
    const box = document.createElement("div");
    box.className = "chart-box";
    canvas.parentNode.insertBefore(box, canvas);
    box.appendChild(canvas);
    return box;
  }

  function axis(label, fmtFn, extra) {
    return Object.assign({
      grid: { color: T.grid, drawTicks: false, lineWidth: 1 },
      border: { display: true, color: T.axis },
      ticks: { color: T["ink-muted"], padding: 8, callback: fmtFn },
      title: label ? { display: true, text: label, color: T["ink-muted"], font: { size: 12, weight: "500" } } : { display: false },
    }, extra || {});
  }

  function chart(canvas, cfg) {
    if (typeof canvas === "string") canvas = document.querySelector(canvas);
    cfg = cfg || {};
    const type = cfg.type || "line";
    const f = formatter(cfg.format);
    const isArc = type === "doughnut" || type === "pie";
    const horizontal = !!cfg.horizontal;
    wrap(canvas);

    // every bar keeps its name; time axes thin their labels
    const catAxis = axis(horizontal ? cfg.yLabel : cfg.xLabel, undefined, {
      grid: { display: false, drawTicks: false },
      ticks: { color: T["ink-muted"], padding: 8, maxRotation: 0, autoSkip: !horizontal, autoSkipPadding: 16 },
      stacked: !!cfg.stacked,
    });
    // ticks are clean numbers (no unit on every tick); the axis title carries the unit
    const tickFmt = typeof cfg.format === "function" ? f
      : (v) => fmt(v, { compact: Math.abs(v) >= 10000, decimals: 0, prefix: (cfg.format || {}).prefix, suffix: (cfg.format || {}).suffix === "%" ? "%" : "" })
          .replace(/^(-?[\d,]+)$/, (m) => (Number.isInteger(v) ? m : fmt(v, { decimals: 1 })));
    const valAxis = axis(horizontal ? cfg.xLabel : cfg.yLabel, tickFmt, { beginAtZero: cfg.beginAtZero !== false, stacked: !!cfg.stacked });

    const options = {
      indexAxis: horizontal ? "y" : "x",
      interaction: isArc ? { mode: "nearest", intersect: true } : { mode: "index", intersect: false, axis: horizontal ? "y" : "x" },
      scales: isArc ? {} : (horizontal ? { x: valAxis, y: catAxis } : { x: catAxis, y: valAxis }),
      layout: { padding: { top: 4, right: 8 } },
      cutout: type === "doughnut" ? "62%" : undefined,
      plugins: {
        oilLegend: cfg.legend,
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = isArc ? ctx.parsed : (horizontal ? ctx.parsed.x : ctx.parsed.y);
              const name = isArc ? ctx.label : ctx.dataset.label;
              return (name ? name + ": " : "") + f(v);
            },
          },
        },
      },
      animation: entryAnimation(type),
    };
    const merged = deepMerge(options, cfg.options || {});
    const datasets = (cfg.datasets || []).map((d) => Object.assign({ fill: !!cfg.fill && type === "line" }, d));

    const c = new window.Chart(canvas, {
      type,
      data: { labels: cfg.labels || [], datasets },
      options: merged,
      plugins: [stylePlugin, legendPlugin],
    });
    c.$oil = { format: f, entered: false };
    charts.add(c);
    holdUntilVisible(c);
    return c;
  }

  /* ---------- chart entry animation: draws in when scrolled into view ---------- */
  function entryAnimation(type) {
    if (!motionOK()) return false;
    return {
      duration: 900,
      easing: "easeOutQuart",
      // stagger points/bars left -> right only on the first draw
      delay(ctx) {
        const c = ctx.chart;
        if (c.$oil && c.$oil.entered) return 0;
        if (ctx.type !== "data" || ctx.mode !== "default") return 0;
        const n = Math.max(1, (c.data.labels || []).length);
        const perPoint = type === "line" ? 700 / n : Math.min(60, 500 / n);
        return ctx.dataIndex * perPoint + ctx.datasetIndex * 80;
      },
    };
  }

  let chartObserver;
  function holdUntilVisible(c) {
    if (!motionOK() || !("IntersectionObserver" in window)) { c.$oil.entered = true; return; }
    // flatten to the pre-animation state; the real draw plays on first view
    c.stop();
    c.reset();
    c.draw();
    if (!chartObserver) {
      chartObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const inst = window.Chart.getChart(e.target);
          chartObserver.unobserve(e.target);
          if (!inst) return;
          inst.update();
          setTimeout(() => { inst.$oil.entered = true; }, 1800);
        });
      }, { threshold: 0.35 });
    }
    chartObserver.observe(c.canvas);
  }

  // Dashboard re-render: hold the old frame dimmed, then animate to the new data.
  function update(c, next) {
    const card = c.canvas.closest(".chart-card");
    if (card) card.classList.add("is-updating");
    if (next && next.labels) c.data.labels = next.labels;
    if (next && next.datasets) c.data.datasets = next.datasets;
    c.$oil.entered = true;
    if (chartObserver) chartObserver.unobserve(c.canvas);
    c.update(motionOK() ? undefined : "none");
    if (card) setTimeout(() => card.classList.remove("is-updating"), 160);
    return c;
  }

  /* ---------- stat count-up ---------- */
  function readFmt(el) {
    return {
      decimals: el.dataset.decimals != null ? +el.dataset.decimals : 0,
      suffix: el.dataset.suffix || "",
      prefix: el.dataset.prefix || "",
      compact: el.dataset.compact === "true",
    };
  }
  function tween(el, from, to, ms) {
    const o = readFmt(el);
    if (!motionOK() || ms <= 0 || from === to) { el.textContent = fmt(to, o); el._shown = to; return; }
    const t0 = performance.now();
    cancelAnimationFrame(el._raf);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 4);   // easeOutQuart
      const v = from + (to - from) * e;
      el.textContent = fmt(v, o);
      el._shown = v;
      if (p < 1) el._raf = requestAnimationFrame(step);
      else { el.textContent = fmt(to, o); el._shown = to; }
    };
    el._raf = requestAnimationFrame(step);
  }
  let statObserver;
  function countUp(scope) {
    const els = (scope || document).querySelectorAll(".stat-value[data-value]");
    els.forEach((el) => {
      const to = parseFloat(el.dataset.value);
      if (isNaN(to)) return;
      el.setAttribute("aria-label", fmt(to, readFmt(el)));   // screen readers get the final value
      if (el._shown != null) { tween(el, el._shown, to, 700); return; }
      if (!motionOK() || !("IntersectionObserver" in window)) { tween(el, to, to, 0); return; }
      el.textContent = fmt(0, readFmt(el));
      if (!statObserver) {
        statObserver = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            statObserver.unobserve(e.target);
            const i = [...e.target.closest(".stats, body").querySelectorAll(".stat-value")].indexOf(e.target);
            setTimeout(() => tween(e.target, 0, parseFloat(e.target.dataset.value), 1400), Math.max(0, i) * 90);
          });
        }, { threshold: 0.6 });
      }
      statObserver.observe(el);
    });
  }
  function setStat(el, value) {
    if (typeof el === "string") el = document.querySelector(el);
    if (statObserver) statObserver.unobserve(el);   // a pending first count-up would fight this tween
    const from = el._shown != null ? el._shown : parseFloat(el.dataset.value) || 0;
    el.dataset.value = value;
    el.setAttribute("aria-label", fmt(value, readFmt(el)));
    tween(el, from, value, 600);
    if (from !== value && motionOK()) {
      el.classList.remove("is-changed");
      void el.offsetWidth;   // restart the flash
      el.classList.add("is-changed");
    }
  }

  /* ---------- scroll reveal, nav shadow, progress bar ---------- */
  function reveal() {
    const targets = [
      ["section.globe-section", "scale", 0],
      ["section.finding", "", 0],
      ["section.stocks", "", 0],
      ["section.methods", "", 0],
      [".chart-grid > .chart-card", "", 90],
      ["#mini-globe", "scale", 0],
      [".table-wrap", "", 0],
    ];
    targets.forEach(([sel, kind, stagger]) => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", kind);
        if (stagger) el.style.setProperty("--reveal-delay", (i % 2) * stagger + "ms");
      });
    });
    // inside a finding, the chart card trails the text slightly
    document.querySelectorAll("section.finding > .chart-card").forEach((el) => {
      el.setAttribute("data-reveal", "scale");
      el.style.setProperty("--reveal-delay", "120ms");
    });

    if (motionOK() && "IntersectionObserver" in window) {
      root.classList.add("js-reveal");
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
      document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    }

    const nav = document.querySelector("nav.topnav");
    let bar = document.querySelector(".progress");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "progress";
      bar.setAttribute("aria-hidden", "true");
      document.body.prepend(bar);
    }
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.setProperty("--progress", max > 0 ? (y / max).toFixed(4) : 0);
        if (nav) nav.classList.toggle("is-scrolled", y > 8);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- table rows fade in after a filter change ---------- */
  function freshRows(tbody) {
    if (typeof tbody === "string") tbody = document.querySelector(tbody);
    if (!tbody || !motionOK()) return;
    tbody.classList.remove("is-fresh");
    void tbody.offsetWidth;
    [...tbody.rows].slice(0, 25).forEach((r, i) => { r.style.animationDelay = i * 12 + "ms"; });
    tbody.classList.add("is-fresh");
  }

  /* ---------- globe.gl styling + motion ----------
     OilTheme.globe(globe, containerEl, {
       valueOf: feature => number | null,   // the measure being shaded
       max: number,                          // value that maps to the brightest color
       label: feature => html string,        // hover label content
       onSelect: feature => void,            // click handler (panel update)
     })
  */
  function globe(g, el, o) {
    o = o || {};
    if (typeof el === "string") el = document.querySelector(el);
    // sqrt scale keeps mid-sized producers visible next to the giants;
    // null/NaN (no data) stays the neutral surface gray
    const shade = (f) => {
      const v = o.valueOf ? o.valueOf(f) : null;
      return v == null || isNaN(v) ? T["surface-2"] : seqColor(Math.sqrt(Math.max(0, v) / (o.max || 1)));
    };
    let hovered = null;
    let selected = null;

    g.backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor(T.accent)
      .atmosphereAltitude(0.16)
      .polygonCapColor((f) => (f === hovered || f === selected ? T.accent : shade(f)))
      .polygonSideColor(() => "rgba(0,0,0,0.25)")
      .polygonStrokeColor(() => "rgba(255,255,255,0.10)")
      .polygonAltitude((f) => (f === selected ? 0.06 : f === hovered ? 0.035 : 0.008))
      .polygonsTransitionDuration(motionOK() ? 400 : 0)
      .polygonLabel((f) => `<div class="globe-tip">${o.label ? o.label(f) : ""}</div>`)
      .onPolygonHover((f) => {
        hovered = f || null;
        el.style.cursor = f ? "pointer" : "grab";
        g.polygonCapColor(g.polygonCapColor()).polygonAltitude(g.polygonAltitude());
        // hold the spin while a country is under the cursor so it doesn't slide away mid-click
        if (f) { ctl.autoRotate = false; clearTimeout(idle); } else pauseSpin();
      })
      .onPolygonClick((f, ev, coords) => select(f, coords));

    let lastSel = null;
    let lastSelAt = 0;
    function select(f, coords) {
      if (!f) return;
      const now = performance.now();
      if (f === lastSel && now - lastSelAt < 400) return;   // our pointerup path + globe.gl's click
      lastSel = f;
      lastSelAt = now;
      selected = f;
      g.polygonCapColor(g.polygonCapColor()).polygonAltitude(g.polygonAltitude());
      if (coords) g.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 1.8 }, motionOK() ? 1200 : 0);
      pauseSpin();
      const panel = document.querySelector("aside.globe-panel");
      if (panel && motionOK()) {
        panel.classList.add("is-swapping");
        setTimeout(() => { if (o.onSelect) o.onSelect(f); panel.classList.remove("is-swapping"); }, 180);
      } else if (o.onSelect) o.onSelect(f);
    }

    // globe.gl (three-render-objects) drops a click if the pointer moved at all while
    // pressed, so 1px of hand jitter loses it. Treat a short, near-still press as a click.
    let down = null;
    el.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener("pointerup", (e) => {
      const d = down;
      down = null;
      if (!d || !hovered) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6 || performance.now() - d.t >= 500) return;
      const r = el.getBoundingClientRect();
      const coords = g.toGlobeCoords ? g.toGlobeCoords(e.clientX - r.left, e.clientY - r.top) : null;
      select(hovered, coords);
    });

    const mat = g.globeMaterial && g.globeMaterial();
    if (mat && mat.color) {
      mat.color.set("#0e1116");
      if (mat.emissive) mat.emissive.set("#07090c");
      if ("shininess" in mat) mat.shininess = 8;
    }

    // slow auto-spin; pauses while the user drags or after a click, resumes after 6s idle
    const ctl = g.controls();
    ctl.autoRotate = motionOK();
    ctl.autoRotateSpeed = 0.45;
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.minDistance = 180;
    ctl.maxDistance = 520;
    let idle;
    function pauseSpin() {
      ctl.autoRotate = false;
      clearTimeout(idle);
      if (motionOK()) idle = setTimeout(() => { ctl.autoRotate = true; }, 6000);
    }
    ctl.addEventListener("start", pauseSpin);

    // start pulled back, then ease in on first view
    g.pointOfView({ lat: 25, lng: 30, altitude: motionOK() ? 3.4 : 2.3 }, 0);
    if (motionOK() && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { io.disconnect(); g.pointOfView({ lat: 25, lng: 30, altitude: 2.3 }, 1600); }
      }, { threshold: 0.3 });
      io.observe(el);
    }

    // keep the canvas sized to its container
    const size = () => g.width(el.clientWidth).height(el.clientHeight);
    size();
    if ("ResizeObserver" in window) new ResizeObserver(size).observe(el);

    return {
      refresh(newMax) {   // call after changing the measure or year
        if (newMax) o.max = newMax;
        g.polygonCapColor(g.polygonCapColor());
      },
      select(f) { selected = f; g.polygonCapColor(g.polygonCapColor()).polygonAltitude(g.polygonAltitude()); },
    };
  }

  /* ---------- utils ---------- */
  function deepMerge(a, b) {
    Object.keys(b).forEach((k) => {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && typeof b[k] !== "function") {
        a[k] = deepMerge(a[k] && typeof a[k] === "object" ? a[k] : {}, b[k]);
      } else a[k] = b[k];
    });
    return a;
  }

  // switch themes at runtime (optional toggle); charts re-read tokens
  function setTheme(mode) {
    if (mode === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    readTokens();
    applyDefaults();
    charts.forEach((c) => {
      Object.values(c.options.scales || {}).forEach((s) => {
        if (s.grid) s.grid.color = T.grid;
        if (s.border) s.border.color = T.axis;
        if (s.ticks) s.ticks.color = T["ink-muted"];
        if (s.title) s.title.color = T["ink-muted"];
      });
      c.update("none");
    });
  }

  const OilTheme = {
    palette: [],
    chart, update, assignColors, colorFor, seqColor, fmt,
    countUp, setStat, reveal, globe, freshRows, setTheme,
    alpha,
    get tokens() { return Object.assign({}, T); },
  };
  window.OilTheme = OilTheme;

  readTokens();
  applyDefaults();
})();
