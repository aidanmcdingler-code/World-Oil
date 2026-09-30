/* Report page: fills every number from data/report.json, draws the finding charts,
   and runs the globe (data/globe.json + data/world.geojson + data/news.json). */
(function () {
  "use strict";
  const { getJSON, esc, monthName, tradingView } = window.Oil;
  const T = window.OilTheme;
  const KBD = { suffix: " kb/d" };

  const minus = (s) => s.replace("-", "−");

  function formatFact(v, how) {
    if (how === "month") return monthName(v);
    if (how === "year") return String(v);
    if (typeof v !== "number") return String(v);
    switch (how) {
      case "n": return Math.round(v).toLocaleString("en-US");
      case "abs0": return Math.abs(v).toFixed(0);
      case "abs1": return Math.abs(v).toFixed(1);
      case "signed1": return (v > 0 ? "+" : "") + minus(v.toFixed(1));
      default: return minus(v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
    }
  }

  // Every [data-f] element gets its value from report.json, so text and data can't drift apart.
  function fillFacts(facts) {
    document.querySelectorAll("[data-f]").forEach((el) => {
      const v = facts[el.dataset.f];
      if (v === undefined) { console.warn("report.json has no fact", el.dataset.f); return; }
      if (el.classList.contains("stat-value")) {
        el.dataset.value = v * (parseFloat(el.dataset.scale) || 1);
      } else {
        // years (keys ending in "year") must not get a thousands separator
        el.textContent = formatFact(v, el.dataset.fmt || (/year$/.test(el.dataset.f) ? "year" : ""));
      }
    });
    T.countUp(document);
  }

  function lines(ch) {
    return Object.entries(ch.series).map(([label, data]) => ({ label, data }));
  }

  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // component CSS sets display, which would override the hidden attribute
  const show = (el, on) => { el.hidden = !on; el.style.display = on ? "" : "none"; };

  // Chart notes (chartjs-plugin-annotation): a dashed marker line with a short label.
  // x is a category label ("2015", "2020-04"); dates that come from the data use report.json facts.
  function notes(list, { zeroLine = false } = {}) {
    if (!window.Chart || !Chart.registry.plugins.get("annotation")) return {};
    const ink = cssVar("--ink-2") || "#c3c2b7";
    const line = cssVar("--ink-muted") || "#8b8a84";
    const bg = cssVar("--surface-2") || "#1d2024";
    const annotations = {};
    list.forEach(([x, text, position = "start"], i) => {
      annotations["n" + i] = {
        type: "line", scaleID: "x", value: String(x),
        borderColor: line, borderWidth: 1, borderDash: [4, 4],
        label: { display: true, content: text, position, backgroundColor: bg, color: ink,
          font: { size: 11, weight: "500" }, padding: { x: 6, y: 3 }, borderRadius: 4 },
      };
    });
    if (zeroLine) {
      annotations.zero = { type: "line", scaleID: "y", value: 0, borderColor: line, borderWidth: 1,
        label: { display: true, content: "2019 level", position: "end", backgroundColor: bg, color: ink,
          font: { size: 11 }, padding: { x: 6, y: 3 } } };
    }
    return { plugins: { annotation: { annotations } } };
  }

  function drawCharts(c, f) {
    T.assignColors(["United States", "Saudi Arabia", "Canada", "China", "Norway", "United Kingdom", "Venezuela"]);

    T.chart("#c-us-leaders", { type: "line", labels: c.us_vs_leaders.labels, datasets: lines(c.us_vs_leaders),
      yLabel: "kb/d", format: KBD,
      options: notes([["2014", "Shale boom, then price crash"], [f.us_pass_sa_year, "US passes Saudi Arabia", "end"]]) });

    T.chart("#c-us-share", { type: "bar", stacked: true, labels: c.us_share.labels, datasets: lines(c.us_share),
      yLabel: "kb/d", format: KBD });

    T.chart("#c-us-exports", { type: "bar", labels: c.us_exports.labels,
      datasets: [{ label: "US crude exports", data: c.us_exports.values, key: "United States" }],
      yLabel: "kb/d", format: KBD, legend: false,
      options: notes([["2015", "Export ban lifted, Dec 2015"]]) });

    T.chart("#c-imports", { type: "line", labels: c.imports.labels, datasets: lines(c.imports),
      yLabel: "kb/d", format: KBD,
      options: notes([[f.cn_pass_us_imp_year, "China passes the US"]]) });

    T.chart("#c-covid", { type: "bar", horizontal: true, labels: c.covid.labels,
      datasets: [{ label: "Change vs. April 2019", data: c.covid.values }],
      xLabel: "% change", format: { decimals: 1, suffix: "%" }, legend: false });

    T.chart("#c-jet", { type: "line", labels: c.jet_recovery.labels,
      datasets: [{ label: "vs. same month of 2019", data: c.jet_recovery.values }],
      yLabel: "% vs. 2019", format: { decimals: 1, suffix: "%" }, legend: false, beginAtZero: false, fill: true,
      options: notes([["2020-04", "Lockdowns"], [f.jet_first_back, "Back to 2019 level", "end"]], { zeroLine: true }) });

    T.chart("#c-saudi", { type: "line", labels: c.saudi_monthly.labels,
      datasets: [{ label: "Saudi Arabia", data: c.saudi_monthly.values, key: "Saudi Arabia" }],
      yLabel: "kb/d", format: KBD, legend: false, beginAtZero: false,
      options: notes([[f.sa_peak_month, "Price war record"], ["2023-07", "Voluntary 1 mb/d cut", "end"]]) });

    T.chart("#c-venezuela", { type: "bar", labels: c.venezuela.labels,
      datasets: [{ label: "Venezuela", data: c.venezuela.values, key: "Venezuela" }],
      yLabel: "kb/d", format: KBD, legend: false,
      options: notes([["2019", "US sanctions on PDVSA"]]) });

    T.chart("#c-north-sea", { type: "line", labels: c.north_sea.labels, datasets: lines(c.north_sea),
      yLabel: "kb/d", format: KBD,
      options: notes([[f.no_low_year, "Johan Sverdrup starts, Oct 2019"]]) });
  }

  /* ---------- globe: year slider, production shading, export/import columns ---------- */
  const G = { year: 2025, mode: "p", selected: null, ctl: null, globe: null, data: null, news: null, timer: null };
  let trendChart = null;

  // Hand-placed anchors where a polygon average lands badly (antimeridian, overseas territories)
  const ANCHORS = { RU: [61, 96], US: [39, -98], CA: [57, -106], FR: [46.5, 2.5], NO: [61, 9],
    NZ: [-41.5, 173], ID: [-2, 118], MY: [3.5, 102], GB: [53, -1.5], CL: [-33, -71] };

  function anchor(f) {
    if (ANCHORS[f.properties.code]) return ANCHORS[f.properties.code];
    const gm = f.geometry;
    const polys = gm.type === "Polygon" ? [gm.coordinates] : gm.coordinates;
    // largest outer ring by bounding-box area, then the mean of its points
    let best = null, bestArea = -1;
    polys.forEach((poly) => {
      const ring = poly[0];
      const xs = ring.map((c) => c[0]), ys = ring.map((c) => c[1]);
      const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      if (area > bestArea) { bestArea = area; best = ring; }
    });
    const lng = best.reduce((t, c) => t + c[0], 0) / best.length;
    const lat = best.reduce((t, c) => t + c[1], 0) / best.length;
    return [lat, lng];
  }

  const yearVals = (code, year = G.year) => {
    const d = G.data.countries[code];
    return d && d.years[String(year)] ? d.years[String(year)] : null;
  };

  function showCountry(code, name) {
    G.selected = { code, name };
    const d = G.data.countries[code];
    document.getElementById("gp-name").textContent = d ? d.country : name;
    const meta = document.getElementById("gp-meta");
    const stats = document.getElementById("gp-stats");
    stats.innerHTML = "";
    const prodYears = d ? Object.keys(d.years).filter((y) => d.years[y].p != null) : [];

    if (!d) {
      meta.textContent = "No usable figures for this country in the JODI files (not reported, or reported as unavailable).";
    } else {
      const v = yearVals(code) || {};
      meta.textContent = `${d.region} · ${d.opec} · ${G.year} average`
        + (prodYears.length ? "" : ". Reports to JODI, but has no complete year of crude production data.");
      const rows = [["Crude production", v.p], ["Crude exports", v.x], ["Crude imports", v.m]];
      stats.innerHTML = rows.map(([label, x]) =>
        `<div class="stat"><span class="stat-value">${x == null ? "–" : T.fmt(x, KBD)}</span><span class="stat-label">${label}</span></div>`).join("");
      if (!Object.keys(v).length) stats.insertAdjacentHTML("beforeend", `<p class="muted">No complete ${G.year} figures in JODI.</p>`);
    }

    // hide the trend box when there is nothing to plot
    show(document.getElementById("gp-trend").closest(".chart-box"), prodYears.length > 0);
    const ds = [{ label: "Crude production (kb/d)", data: prodYears.map((y) => d.years[y].p), color: T.palette[0] }];
    if (!trendChart) {
      trendChart = T.chart("#gp-trend", { type: "line", labels: prodYears, datasets: ds, format: KBD, legend: false, fill: true });
    } else {
      T.update(trendChart, { labels: prodYears, datasets: ds });
    }

    const list = document.getElementById("gp-news");
    const items = G.news && G.news.countries ? G.news.countries[code] : null;
    list.innerHTML = items && items.length
      ? items.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
<span class="source">${esc(n.source)} · <time datetime="${esc(n.date)}">${esc(n.date)}</time></span></li>`).join("")
      : `<li class="muted">No recent oil headlines found for this country.</li>`;
  }

  // Export (amber) and import (blue) columns, side by side at each country's anchor
  function tradeColumns(features) {
    if (G.mode !== "trade") return [];
    const max = Math.max(G.data.meta.max.x, G.data.meta.max.m);
    const out = [];
    features.forEach((f) => {
      const v = yearVals(f.properties.code);
      if (!v) return;
      const [lat, lng] = f.__anchor || (f.__anchor = anchor(f));
      if (v.x > 0) out.push({ lat, lng: lng - 1.4, kind: "Exports", v: v.x, name: f.properties.name, alt: (v.x / max) * 0.6 });
      if (v.m > 0) out.push({ lat, lng: lng + 1.4, kind: "Imports", v: v.m, name: f.properties.name, alt: (v.m / max) * 0.6 });
    });
    return out;
  }

  function refreshGlobe(features) {
    document.getElementById("g-year-out").textContent = G.year;
    const slider = document.getElementById("g-year");
    slider.value = G.year;
    if (T.syncRange) T.syncRange(slider);   // keep the styled track fill in step during Play
    show(document.getElementById("g-legend-prod"), G.mode === "p");
    show(document.getElementById("g-legend-trade"), G.mode !== "p");
    const colors = { Exports: cssVar("--accent") || "#f5a524", Imports: cssVar("--series-1") || "#4c8dff" };
    G.globe.pointsData(tradeColumns(features)).pointColor((d) => colors[d.kind]);
    G.ctl.refresh(G.data.meta.max.p);   // fixed scale across years so colors compare
    if (G.selected) showCountry(G.selected.code, G.selected.name);
  }

  function buildGlobe(world) {
    const el = document.getElementById("globe");
    if (!window.Globe) { el.textContent = "The 3D globe could not load."; return; }
    G.year = G.data.meta.last;
    const features = world.features;
    const shade = (f) => {
      if (G.mode !== "p") return null;
      const v = yearVals(f.properties.code);
      return v && v.p != null ? v.p : null;
    };

    G.globe = new window.Globe(el).polygonsData(features)
      .pointAltitude("alt").pointRadius(0.9).pointResolution(12).pointsMerge(false)
      .pointsTransitionDuration(600)
      .pointLabel((d) => `<div class="globe-tip"><b>${esc(d.name)}</b><br>${d.kind}: ${T.fmt(d.v, KBD)}, ${G.year}</div>`);
    window.__globe = G.globe; // handy for debugging in the console
    G.ctl = T.globe(G.globe, el, {
      valueOf: shade,
      max: G.data.meta.max.p,
      label: (f) => {
        const v = yearVals(f.properties.code) || {};
        const line = G.mode === "p"
          ? (v.p == null ? `No complete ${G.year} production data` : `${T.fmt(v.p, KBD)} crude, ${G.year}`)
          : `Exports ${v.x == null ? "–" : T.fmt(v.x, KBD)} · Imports ${v.m == null ? "–" : T.fmt(v.m, KBD)}, ${G.year}`;
        return `<b>${esc(f.properties.name)}</b><br>${line}`;
      },
      onSelect: (f) => showCountry(f.properties.code, f.properties.name),
    });

    const slider = document.getElementById("g-year");
    const play = document.getElementById("g-play");
    function stop() {
      clearInterval(G.timer);
      G.timer = null;
      play.textContent = "▶ Play 2010–2025";
      play.setAttribute("aria-pressed", "false");
    }
    slider.min = G.data.meta.first;
    slider.max = G.data.meta.last;
    slider.addEventListener("input", () => { stop(); G.year = +slider.value; refreshGlobe(features); });

    document.querySelectorAll("[data-globe-mode]").forEach((b) => b.addEventListener("click", () => {
      G.mode = b.dataset.globeMode;
      document.querySelectorAll("[data-globe-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      refreshGlobe(features);
    }));

    play.addEventListener("click", () => {
      if (G.timer) { stop(); return; }
      if (G.year >= G.data.meta.last) G.year = G.data.meta.first - 1;
      play.textContent = "❚❚ Pause";
      play.setAttribute("aria-pressed", "true");
      G.timer = setInterval(() => {
        G.year += 1;
        refreshGlobe(features);
        if (G.year >= G.data.meta.last) stop();
      }, 900);
    });

    refreshGlobe(features);
    if (G.news && G.news.updated) {
      document.getElementById("gp-news-updated").textContent = `Headlines from Google News, updated ${G.news.updated}.`;
    }
  }

  function liveChart() {
    tradingView(document.getElementById("tv-chart"), "symbol-overview", {
      symbols: [["ExxonMobil", "NYSE:XOM|1M"], ["Chevron", "NYSE:CVX|1M"], ["Shell", "NYSE:SHEL|1M"],
        ["BP", "NYSE:BP|1M"], ["TotalEnergies", "NYSE:TTE|1M"], ["WTI crude", "TVC:USOIL|1M"]],
      chartOnly: false, autosize: true, width: "100%", height: "100%",
      showVolume: false, chartType: "area", scalePosition: "right", scaleMode: "Normal",
      lineColor: "#f5a524", topColor: "rgba(245,165,36,0.25)", bottomColor: "rgba(245,165,36,0)",
      fontFamily: "Inter, sans-serif", dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W"],
    });
  }

  async function main() {
    T.reveal();
    liveChart();
    const [report, globeData, world] = await Promise.all([
      getJSON("data/report.json"), getJSON("data/globe.json"), getJSON("data/world.geojson")]);
    const news = await getJSON("data/news.json").catch(() => null);
    fillFacts(report.facts);
    drawCharts(report.charts, report.facts);
    G.data = globeData;
    G.news = news;
    buildGlobe(world);
  }

  document.addEventListener("DOMContentLoaded", () => main().catch((e) => {
    console.error(e);
    const msg = document.createElement("p");
    msg.className = "muted";
    msg.textContent = "Some data failed to load. Try reloading the page.";
    document.querySelector("main").prepend(msg);
  }));
})();
