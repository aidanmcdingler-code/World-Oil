/* Shared by both pages: the live stock ticker tape under the nav, plus small helpers.
   Market data comes from TradingView's free embed widgets; none of it feeds any
   number in the report or dashboard. */
(function () {
  "use strict";

  const TICKERS = [
    ["TVC:USOIL", "WTI crude"],
    ["TVC:UKOIL", "Brent crude"],
    ["NYSE:XOM", "ExxonMobil"],
    ["NYSE:CVX", "Chevron"],
    ["NYSE:SHEL", "Shell"],
    ["NYSE:BP", "BP"],
    ["NYSE:TTE", "TotalEnergies"],
    ["NYSE:COP", "ConocoPhillips"],
    ["NYSE:EQNR", "Equinor"],
    ["NYSE:OXY", "Occidental"],
    ["NYSE:SLB", "SLB"],
    ["NYSE:PBR", "Petrobras"],
  ];

  function theme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  // TradingView widgets read their settings from the JSON inside their own <script> tag
  function tradingView(el, widget, config) {
    if (!el) return;
    el.innerHTML = "";
    const box = document.createElement("div");
    box.className = "tradingview-widget-container";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    box.appendChild(inner);
    const s = document.createElement("script");
    s.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`;
    s.async = true;
    s.textContent = JSON.stringify(Object.assign({ colorTheme: theme(), isTransparent: true, locale: "en" }, config));
    box.appendChild(s);
    el.appendChild(box);
  }

  function tickerTape() {
    tradingView(document.getElementById("ticker-tape"), "ticker-tape", {
      symbols: TICKERS.map(([proName, title]) => ({ proName, title })),
      showSymbolLogo: true,
      displayMode: "adaptive",
    });
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  function monthName(ym) {
    const [y, m] = String(ym).split("-");
    return `${MONTHS[+m - 1]} ${y}`;
  }

  window.Oil = { TICKERS, tradingView, getJSON, esc, monthName };
  document.addEventListener("DOMContentLoaded", tickerTape);
})();
