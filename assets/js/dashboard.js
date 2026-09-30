/* Dashboard: loads data/oil_panel.csv and does every calculation in the browser. */
(function () {
  "use strict";
  const T = window.OilTheme;
  const { getJSON, esc } = window.Oil;
  const $ = (id) => document.getElementById(id);

  const VARIABLES = {
    production_kbd: { label: "Production", unit: "kb/d" },
    imports_kbd: { label: "Imports", unit: "kb/d" },
    exports_kbd: { label: "Exports", unit: "kb/d" },
    demand_kbd: { label: "Demand", unit: "kb/d", group: "Refined products" },
    refinery_intake_kbd: { label: "Refinery intake", unit: "kb/d", group: "Crude & NGL" },
    closing_stocks_kbbl: { label: "Closing stocks", unit: "thousand bbl", level: true },
  };
  const MEASURES = {
    avg: "Average rate",
    total: "Total volume (million bbl)",
    median: "Median monthly value",
    share: "Share of total (%)",
    countries: "Countries reporting",
  };
  const BREAKDOWNS = { country: "Country", region: "Region", opec_group: "OPEC group", product: "Product", year: "Year" };

  // Fixed color order per breakdown, so an entity keeps its color whatever the filters are.
  const COLOR_ORDER = {
    country: ["United States", "Saudi Arabia", "Russia", "Canada", "China", "Iraq", "Kuwait", "Norway"],
    region: ["North America", "Middle East", "Eurasia", "Asia-Pacific", "Europe", "Latin America", "Africa"],
    opec_group: ["OPEC", "OPEC+ partner", "Non-OPEC"],
    product: ["Crude oil", "NGL", "Other crude inputs", "Gasoline", "Diesel & gasoil", "Kerosene & jet fuel", "LPG", "Naphtha"],
    year: [],
  };
  const DEFAULTS = { from: 2010, to: 2025, region: "", country: "", opec: "", group: "Crude & NGL", product: "",
    variable: "production_kbd", measure: "avg", breakdown: "country" };

  let rows = [];
  let charts = {};
  let globeCtl = null;
  let globeValues = {};

  /* ---------- math ---------- */
  const daysIn = (date) => new Date(+date.slice(0, 4), +date.slice(5, 7), 0).getDate();

  function median(a) {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Stats for a set of rows on one variable. avg = mean over months of the monthly sums.
  function stats(set, v) {
    const byMonth = new Map();
    const vals = [];
    const countries = new Set();
    let volume = 0;
    for (const r of set) {
      const x = r[v];
      if (x == null) continue;
      byMonth.set(r.date, (byMonth.get(r.date) || 0) + x);
      vals.push(x);
      countries.add(r.code);
      volume += (x * daysIn(r.date)) / 1000;
    }
    let sum = 0;
    byMonth.forEach((s) => { sum += s; });
    return {
      avg: byMonth.size ? sum / byMonth.size : NaN,
      total: volume,
      median: median(vals),
      countries: countries.size,
      months: byMonth.size,
      n: vals.length,
    };
  }

  function groupBy(set, key) {
    const m = new Map();
    for (const r of set) {
      const k = r[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }

  /* ---------- state ---------- */
  function state() {
    return {
      from: +$("f-from").value, to: +$("f-to").value, region: $("f-region").value, country: $("f-country").value,
      opec: $("f-opec").value, group: $("f-group").value, product: $("f-product").value,
      variable: $("variable").value, measure: $("measure").value, breakdown: $("breakdown").value,
    };
  }

  function filterRows(s, { ignoreYears = false, ignoreCountry = false } = {}) {
    return rows.filter((r) =>
      (ignoreYears || (r.year >= s.from && r.year <= s.to)) &&
      (!s.region || r.region === s.region) &&
      (ignoreCountry || !s.country || r.code === s.country) &&
      (!s.opec || r.opec_group === s.opec) &&
      r.product_group === s.group &&
      (!s.product || r.product === s.product) &&
      r[s.variable] != null);
  }

  /* ---------- formatting ---------- */
  function unitOf(s) { return VARIABLES[s.variable].unit; }
  function fmtFor(s, measure) {
    switch (measure) {
      case "total": return { decimals: 1, suffix: " million bbl" };
      case "share": return { decimals: 1, suffix: "%" };
      case "countries": return { decimals: 0 };
      default: return { decimals: 0, suffix: " " + unitOf(s) };
    }
  }
  function measureLabel(s, measure) {
    const v = VARIABLES[s.variable];
    if (measure === "avg") return v.level ? `Average ${v.label.toLowerCase()} (${v.unit})` : `Average ${v.label.toLowerCase()} (${v.unit})`;
    if (measure === "median") return `Median monthly ${v.label.toLowerCase()} per country and product (${v.unit})`;
    if (measure === "total") return `Total ${v.label.toLowerCase()} (million barrels)`;
    if (measure === "share") return `Share of ${v.label.toLowerCase()} (%)`;
    return "Countries reporting";
  }

  function valueOf(st, measure, whole) {
    if (measure === "share") return whole > 0 ? (st.avg / whole) * 100 : NaN;
    return st[measure];
  }

  /* ---------- controls ---------- */
  function fillSelect(el, items, keepFirst) {
    const first = keepFirst ? el.options[0].outerHTML : "";
    el.innerHTML = first + items.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  }

  function setupControls() {
    const years = [...new Set(rows.map((r) => r.year))].sort();
    const ys = years.map((y) => [y, y === 2026 ? "2026 (partial)" : String(y)]);
    fillSelect($("f-from"), ys);
    fillSelect($("f-to"), ys);
    const uniq = (k) => [...new Set(rows.map((r) => r[k]))].sort();
    fillSelect($("f-region"), uniq("region").map((x) => [x, x]), true);
    const countries = [...new Map(rows.map((r) => [r.code, r.country])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    fillSelect($("f-country"), countries, true);
    fillSelect($("f-opec"), ["OPEC", "OPEC+ partner", "Non-OPEC"].map((x) => [x, x]), true);
    fillSelect($("f-group"), [["Crude & NGL", "Crude & NGL"], ["Refined products", "Refined products"]]);
    fillSelect($("variable"), Object.entries(VARIABLES).map(([k, v]) => [k, v.label]));
    fillSelect($("measure"), Object.entries(MEASURES));
    fillSelect($("breakdown"), Object.entries(BREAKDOWNS));
    applyDefaults();
    readUrl();

    ["f-from", "f-to", "f-region", "f-country", "f-opec", "f-product", "variable", "measure", "breakdown"]
      .forEach((id) => $(id).addEventListener("change", render));
    $("f-group").addEventListener("change", () => { updateProductOptions(); render(); });
    $("reset").addEventListener("click", () => {
      $("reset").classList.add("is-resetting");
      setTimeout(() => $("reset").classList.remove("is-resetting"), 600);
      applyDefaults();
      render();
    });
    $("copy-link").addEventListener("click", copyLink);
  }

  /* ---------- shareable links: the current view lives in the URL ---------- */
  const URL_KEYS = { from: "f-from", to: "f-to", region: "f-region", country: "f-country", opec: "f-opec",
    group: "f-group", product: "f-product", variable: "variable", measure: "measure", breakdown: "breakdown" };

  function readUrl() {
    const q = new URLSearchParams(location.search);
    const set = (key) => {
      const el = $(URL_KEYS[key]);
      if (q.has(key) && [...el.options].some((o) => o.value === q.get(key))) el.value = q.get(key);
    };
    set("group");
    updateProductOptions();   // product choices depend on the group
    Object.keys(URL_KEYS).filter((k) => k !== "group").forEach(set);
  }

  function writeUrl(s) {
    const q = new URLSearchParams();
    Object.keys(URL_KEYS).forEach((k) => { if (String(s[k]) !== String(DEFAULTS[k])) q.set(k, s[k]); });
    const qs = q.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function copyLink() {
    const btn = $("copy-link");
    const done = (text) => { btn.textContent = text; setTimeout(() => { btn.textContent = "Copy link to this view"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => done("Link copied ✓"), () => done("Copy the address bar instead"));
    else done("Copy the address bar instead");
  }

  function applyDefaults() {
    $("f-from").value = DEFAULTS.from; $("f-to").value = DEFAULTS.to;
    $("f-region").value = DEFAULTS.region; $("f-country").value = DEFAULTS.country;
    $("f-opec").value = DEFAULTS.opec; $("f-group").value = DEFAULTS.group;
    updateProductOptions();
    $("f-product").value = DEFAULTS.product;
    $("variable").value = DEFAULTS.variable; $("measure").value = DEFAULTS.measure; $("breakdown").value = DEFAULTS.breakdown;
  }

  function updateProductOptions() {
    const g = $("f-group").value;
    const prods = [...new Set(rows.filter((r) => r.product_group === g).map((r) => r.product))];
    const order = COLOR_ORDER.product;
    prods.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
    fillSelect($("f-product"), prods.map((p) => [p, p]), true);
  }

  // Keep the switches consistent: some variables only exist for one product group.
  function validate() {
    const g = $("f-group").value;
    [...$("variable").options].forEach((o) => {
      const need = VARIABLES[o.value].group;
      o.disabled = !!need && need !== g;
    });
    if ($("variable").selectedOptions[0].disabled) $("variable").value = "production_kbd";
    const level = VARIABLES[$("variable").value].level;
    $("measure").querySelector('option[value="total"]').disabled = !!level;
    if (level && $("measure").value === "total") $("measure").value = "avg";
    if (+$("f-from").value > +$("f-to").value) $("f-to").value = $("f-from").value;
  }

  /* ---------- render ---------- */
  function topGroups(groups, s, n) {
    const entries = [...groups.entries()].map(([k, set]) => [k, set, stats(set, s.variable)]);
    if (s.breakdown === "year") return entries.sort((a, b) => a[0] - b[0]);
    entries.sort((a, b) => b[2].avg - a[2].avg);
    if (entries.length <= n) return entries;
    const rest = entries.slice(n - 1).flatMap((e) => e[1]);
    const label = `Other ${BREAKDOWNS[s.breakdown].toLowerCase()}s`.replace("countrys", "countries");
    return [...entries.slice(0, n - 1), [label, rest, stats(rest, s.variable)]];
  }

  function render() {
    validate();
    const s = state();
    const set = filterRows(s);
    const v = VARIABLES[s.variable];
    const unit = unitOf(s);
    T.assignColors(COLOR_ORDER[s.breakdown]);

    $("status").textContent = set.length ? "" : "No rows match these filters. Try widening them or press Reset.";

    // Summary numbers
    const all = stats(set, s.variable);
    $("s-avg-label").textContent = `Average ${v.label.toLowerCase()} (${unit})`;
    T.setStat($("s-avg"), Math.round(all.avg));
    if (v.level) {
      const lastMonth = set.reduce((m, r) => (r.date > m ? r.date : m), "");
      const lvl = set.filter((r) => r.date === lastMonth).reduce((t, r) => t + r[s.variable], 0) / 1000;
      $("s-total-label").textContent = `Stocks in the last month, ${lastMonth || "–"} (million bbl)`;
      T.setStat($("s-total"), lvl);
    } else {
      $("s-total-label").textContent = `Total ${v.label.toLowerCase()} over the period (million bbl)`;
      T.setStat($("s-total"), all.total);
    }
    const first = s.from === s.to ? s.from - 1 : s.from;
    const noYears = filterRows(s, { ignoreYears: true });
    const a0 = stats(noYears.filter((r) => r.year === first), s.variable).avg;
    const a1 = stats(noYears.filter((r) => r.year === s.to), s.variable).avg;
    const change = (a1 / a0 - 1) * 100;
    $("s-change-label").textContent = isFinite(change)
      ? `Change in average ${v.label.toLowerCase()}, ${first} to ${s.to}` : `Change, ${first} to ${s.to} (no data for one of the years)`;
    T.setStat($("s-change"), isFinite(change) ? change : NaN);   // NaN shows as "–"
    T.setStat($("s-countries"), all.countries);
    T.setStat($("s-rows"), all.n);

    // Breakdown
    const groups = groupBy(set, s.breakdown);
    const whole = [...groups.values()].reduce((t, g) => t + (stats(g, s.variable).avg || 0), 0);
    const mLabel = measureLabel(s, s.measure);
    const f = fmtFor(s, s.measure);
    const bd = BREAKDOWNS[s.breakdown].toLowerCase();

    // 1. bar: measure by breakdown group
    const top = topGroups(groups, s, s.breakdown === "year" ? 99 : 12);
    const barShare = (e) => valueOf(e[2], s.measure, whole);
    $("t-bar").textContent = `${mLabel} by ${bd}`;
    $("st-bar").textContent = `${s.from}–${s.to}${s.breakdown === "year" ? "" : ", largest 11 plus the rest"}`;
    draw("bar", "#c-bar", {
      type: "bar", horizontal: s.breakdown !== "year", legend: false, format: f,
      labels: top.map((e) => String(e[0])),
      datasets: [{ label: mLabel, data: top.map((e) => round(barShare(e))) }],
    });

    // 2. trend: measure by year, one line per top group
    const yearsInRange = [];
    for (let y = s.from; y <= s.to; y++) yearsInRange.push(y);
    const trendGroups = s.breakdown === "year" ? [["All selected", set]] : topGroups(groups, s, 6).map((e) => [e[0], e[1]]);
    const yearWhole = yearsInRange.map((y) => [...groups.values()]
      .reduce((t, g) => t + (stats(g.filter((r) => r.year === y), s.variable).avg || 0), 0));
    $("t-trend").textContent = `${mLabel} by year`;
    $("st-trend").textContent = s.breakdown === "year" ? "All selected rows" : `Largest 5 ${bd === "country" ? "countries" : bd + "s"} plus the rest`;
    draw("trend", "#c-trend", {
      type: "line", format: f, beginAtZero: s.measure !== "avg",
      labels: yearsInRange.map(String),
      datasets: trendGroups.map(([k, g]) => ({
        label: String(k),
        data: yearsInRange.map((y, i) => round(valueOf(stats(g.filter((r) => r.year === y), s.variable), s.measure, yearWhole[i]))),
      })),
    });

    // 3. share doughnut (always share of the average rate)
    const shareTop = s.breakdown === "year" ? top : topGroups(groups, s, 8);
    $("t-share").textContent = `Share of ${v.label.toLowerCase()} by ${bd}`;
    $("st-share").textContent = `Each group's average rate ÷ the total, ${s.from}–${s.to}`;
    draw("share", "#c-share", {
      type: "doughnut", format: { decimals: 1, suffix: "%" },
      labels: shareTop.map((e) => String(e[0])),
      datasets: [{ label: "Share", data: shareTop.map((e) => round(whole > 0 ? (e[2].avg / whole) * 100 : NaN, 1)) }],
    });

    // 4. monthly sum of the variable
    const byMonth = new Map();
    set.forEach((r) => byMonth.set(r.date, (byMonth.get(r.date) || 0) + r[s.variable]));
    const months = [...byMonth.keys()].sort();
    $("t-month").textContent = `Monthly ${v.label.toLowerCase()}, all selected rows (${unit})`;
    $("st-month").textContent = "Sum over the filtered countries and products in each month";
    draw("month", "#c-month", {
      type: "line", legend: false, format: { decimals: 0, suffix: " " + unit }, beginAtZero: false, fill: true,
      labels: months, datasets: [{ label: v.label, data: months.map((m) => round(byMonth.get(m))) }],
    });

    renderTable(groups, s, whole);
    renderGlobe(s);
    writeUrl(s);
  }

  const round = (x, d = 1) => (x == null || isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

  function draw(key, sel, cfg) {
    if (!charts[key]) charts[key] = T.chart(sel, cfg);
    else {
      Object.assign(charts[key].$oil, { format: (x) => T.fmt(x, cfg.format) });
      const c = charts[key];
      if (c.options.indexAxis !== undefined && cfg.horizontal !== undefined) {
        const horiz = !!cfg.horizontal;
        if ((c.options.indexAxis === "y") !== horiz) {   // orientation changed: rebuild once
          c.destroy();
          charts[key] = T.chart(sel, cfg);
          return;
        }
      }
      c.options.scales && Object.values(c.options.scales).forEach((ax) => {
        if (ax.ticks && ax.ticks.callback && ax.axis !== c.options.indexAxis) ax.ticks.callback = (x) => T.fmt(x, cfg.format);
      });
      if (c.options.plugins && c.options.plugins.tooltip) {
        c.options.plugins.tooltip.callbacks.label = (ctx) => {
          const x = c.config.type === "doughnut" ? ctx.parsed : (c.options.indexAxis === "y" ? ctx.parsed.x : ctx.parsed.y);
          const name = c.config.type === "doughnut" ? ctx.label : ctx.dataset.label;
          return (name ? name + ": " : "") + T.fmt(x, cfg.format);
        };
      }
      if (cfg.beginAtZero !== undefined && c.options.scales) {
        const valAx = c.options.indexAxis === "y" ? c.options.scales.x : c.options.scales.y;
        if (valAx) valAx.beginAtZero = cfg.beginAtZero;
      }
      T.update(c, { labels: cfg.labels, datasets: cfg.datasets });
    }
  }

  function renderTable(groups, s, whole) {
    const entries = [...groups.entries()].map(([k, set]) => [k, stats(set, s.variable)]);
    if (s.breakdown === "year") entries.sort((a, b) => a[0] - b[0]);
    else entries.sort((a, b) => b[1].avg - a[1].avg);
    const unit = unitOf(s);
    const level = VARIABLES[s.variable].level;
    $("th-group").textContent = BREAKDOWNS[s.breakdown];
    document.querySelectorAll("table.data-table thead th")[1].textContent = `Average (${unit})`;
    document.querySelectorAll("table.data-table thead th")[3].textContent = `Median monthly value (${unit})`;
    $("table-caption").textContent = `${VARIABLES[s.variable].label} by ${BREAKDOWNS[s.breakdown].toLowerCase()}, ${s.from}–${s.to}`;
    const n = (x, d = 0) => (x == null || isNaN(x) ? "–" : T.fmt(x, { decimals: d }));
    const tbody = $("tbody");
    tbody.innerHTML = entries.map(([k, st]) => `<tr>
      <td>${esc(k)}</td>
      <td class="num">${n(st.avg)}</td>
      <td class="num">${level ? "–" : n(st.total, 1)}</td>
      <td class="num">${n(st.median, 1)}</td>
      <td class="num">${whole > 0 ? n((st.avg / whole) * 100, 1) + "%" : "–"}</td>
      <td class="num">${st.countries}</td>
      <td class="num">${st.months}</td></tr>`).join("");
    T.freshRows(tbody);
  }

  /* ---------- mini globe ---------- */
  function renderGlobe(s) {
    const set = filterRows(s, { ignoreCountry: true });
    globeValues = {};
    groupBy(set, "code").forEach((g, code) => { globeValues[code] = stats(g, s.variable).avg; });
    const max = Math.max(1, ...Object.values(globeValues).filter(isFinite));
    if (globeCtl) globeCtl.refresh(max);
  }

  async function setupGlobe() {
    const el = $("mini-globe");
    if (!window.Globe) return;
    const world = await getJSON("data/world.geojson");
    const g = new window.Globe(el).polygonsData(world.features);
    const val = (f) => { const x = globeValues[f.properties.code]; return x == null || !isFinite(x) ? null : x; };
    globeCtl = T.globe(g, el, {
      valueOf: val,
      max: Math.max(1, ...Object.values(globeValues).filter(isFinite)),
      label: (f) => {
        const x = val(f);
        const s = state();
        return `<b>${esc(f.properties.name)}</b><br>${x == null ? "No data for these filters"
          : T.fmt(x, { decimals: 0, suffix: " " + unitOf(s) }) + " average " + VARIABLES[s.variable].label.toLowerCase()}`;
      },
      onSelect: (f) => {
        const code = f.properties.code;
        if ([...$("f-country").options].some((o) => o.value === code)) {
          $("f-country").value = code;
          render();
        }
      },
    });
  }

  /* ---------- load ---------- */
  function load() {
    return new Promise((resolve, reject) => {
      Papa.parse("data/oil_panel.csv", {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: (res) => resolve(res.data), error: reject,
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      rows = await load();
      $("row-count").textContent = rows.length.toLocaleString("en-US");
      setupControls();
      T.reveal();
      await setupGlobe();
      render();
    } catch (e) {
      console.error(e);
      $("status").textContent = "The data failed to load. Try reloading the page.";
    }
  });
})();
