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

  function drawCharts(c) {
    T.assignColors(["United States", "Saudi Arabia", "Canada", "China", "Norway", "United Kingdom", "Venezuela"]);

    T.chart("#c-us-leaders", { type: "line", labels: c.us_vs_leaders.labels, datasets: lines(c.us_vs_leaders),
      yLabel: "kb/d", format: KBD });

    T.chart("#c-us-share", { type: "bar", stacked: true, labels: c.us_share.labels, datasets: lines(c.us_share),
      yLabel: "kb/d", format: KBD });

    T.chart("#c-us-exports", { type: "bar", labels: c.us_exports.labels,
      datasets: [{ label: "US crude exports", data: c.us_exports.values, key: "United States" }],
      yLabel: "kb/d", format: KBD, legend: false });

    T.chart("#c-imports", { type: "line", labels: c.imports.labels, datasets: lines(c.imports),
      yLabel: "kb/d", format: KBD });

    T.chart("#c-covid", { type: "bar", horizontal: true, labels: c.covid.labels,
      datasets: [{ label: "Change vs. April 2019", data: c.covid.values }],
      xLabel: "% change", format: { decimals: 1, suffix: "%" }, legend: false });

    T.chart("#c-jet", { type: "line", labels: c.jet_recovery.labels.map((d) => d),
      datasets: [{ label: "vs. same month of 2019", data: c.jet_recovery.values }],
      yLabel: "% vs. 2019", format: { decimals: 1, suffix: "%" }, legend: false, beginAtZero: false, fill: true });

    T.chart("#c-saudi", { type: "line", labels: c.saudi_monthly.labels,
      datasets: [{ label: "Saudi Arabia", data: c.saudi_monthly.values, key: "Saudi Arabia" }],
      yLabel: "kb/d", format: KBD, legend: false, beginAtZero: false });

    T.chart("#c-venezuela", { type: "bar", labels: c.venezuela.labels,
      datasets: [{ label: "Venezuela", data: c.venezuela.values, key: "Venezuela" }],
      yLabel: "kb/d", format: KBD, legend: false });

    T.chart("#c-north-sea", { type: "line", labels: c.north_sea.labels, datasets: lines(c.north_sea),
      yLabel: "kb/d", format: KBD });
  }

  /* ---------- globe ---------- */
  let trendChart = null;

  function showCountry(code, name, g, news) {
    const d = g[code];
    document.getElementById("gp-name").textContent = d ? d.country : name;
    const meta = document.getElementById("gp-meta");
    const stats = document.getElementById("gp-stats");
    stats.innerHTML = "";

    if (!d) {
      meta.textContent = "No usable figures for this country in the JODI files (not reported, or reported as unavailable).";
    } else if (d.year == null) {
      meta.textContent = `${d.region} · ${d.opec}. Reports to JODI, but has no complete year of crude production data.`;
    } else {
      meta.textContent = `${d.region} · ${d.opec} · ${d.current ? d.year + " average" : "last complete year in JODI: " + d.year}`;
      const rows = [["Crude production", d.production], ["Crude exports", d.exports], ["Crude imports", d.imports]];
      stats.innerHTML = rows.map(([label, v]) =>
        `<div class="stat"><span class="stat-value">${v == null ? "–" : T.fmt(v, KBD)}</span><span class="stat-label">${label}</span></div>`).join("");
    }

    // hide the trend box when there is nothing to plot
    document.getElementById("gp-trend").closest(".chart-box").hidden = !(d && d.trend && d.trend.length);
    const labels = d && d.trend_years ? d.trend_years.map(String) : [];
    const data = d && d.trend ? d.trend : [];
    const ds = [{ label: "Crude production (kb/d)", data, color: T.palette[0] }];
    if (!trendChart) {
      trendChart = T.chart("#gp-trend", { type: "line", labels, datasets: ds, format: KBD, legend: false, fill: true });
    } else {
      T.update(trendChart, { labels, datasets: ds });
    }

    const list = document.getElementById("gp-news");
    const items = news && news.countries ? news.countries[code] : null;
    list.innerHTML = items && items.length
      ? items.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
<span class="source">${esc(n.source)} · <time datetime="${esc(n.date)}">${esc(n.date)}</time></span></li>`).join("")
      : `<li class="muted">No recent oil headlines found for this country.</li>`;
  }

  function buildGlobe(world, g, news) {
    const el = document.getElementById("globe");
    if (!window.Globe) { el.textContent = "The 3D globe could not load."; return; }
    const cur = (f) => { const d = g[f.properties.code]; return d && d.current ? d.production : null; };
    const max = Math.max(...Object.values(g).filter((d) => d.current).map((d) => d.production));

    const globe = new window.Globe(el).polygonsData(world.features);
    window.__globe = globe; // handy for debugging in the console
    T.globe(globe, el, {
      valueOf: cur,
      max,
      label: (f) => {
        const v = cur(f);
        return `<b>${esc(f.properties.name)}</b><br>${v == null ? "No 2025 data" : T.fmt(v, KBD) + " crude, 2025"}`;
      },
      onSelect: (f) => showCountry(f.properties.code, f.properties.name, g, news),
    });

    if (news && news.updated) {
      document.getElementById("gp-news-updated").textContent = `Headlines from Google News, updated ${news.updated}.`;
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
    drawCharts(report.charts);
    buildGlobe(world, globeData, news);
  }

  document.addEventListener("DOMContentLoaded", () => main().catch((e) => {
    console.error(e);
    const msg = document.createElement("p");
    msg.className = "muted";
    msg.textContent = "Some data failed to load. Try reloading the page.";
    document.querySelector("main").prepend(msg);
  }));
})();
