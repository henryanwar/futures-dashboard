// script.js
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // --- CONFIGURATION ---
  const API_URL = "https://api.tastytrade.com";
  const PRICE_STORE_KEY = "tastytradeManualPrices";
  const TOKEN_STORE_KEY = "tastytradeRememberToken";
  const CONTRACT_SIZES = {
    "/MNQ": 20,
    "/MES": 5,
    "/MCL": 1000,
    "/RTY": 50,
    "/M2K": 10,
    "/ZB": 1000,
    "/MGC": 100
  };

  // --- DOM ELEMENTS ---
  const loginSection = document.getElementById("login-section");
  const resultsSection = document.getElementById("results-section");
  const loader = document.getElementById("loader");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  const settingsBtn = document.getElementById("settings-toggle-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const manualListDiv = document.getElementById("price-list");
  const newSymbolInput = document.getElementById("new-symbol");
  const newPriceInput = document.getElementById("new-price");
  const addPriceBtn = document.getElementById("add-price-btn");
  const closeSettingsBtn = document.getElementById("close-settings-btn");

  const nlvDisplay = document.getElementById("nlv");
  const notionalDisplay = document.getElementById("notional-value");
  const leverageDisplay = document.getElementById("leverage");
  const positionsList = document.getElementById("positions-list");
  const netPositionDisplay = document.getElementById("net-position");
  const riskDisplay = document.getElementById("risk-assessment");

  // --- UTILITIES ---
  const toCurrency = val => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  function getManualPrices() {
    return JSON.parse(localStorage.getItem(PRICE_STORE_KEY) || "{}");
  }

  function saveManualPrice(root, price) {
    const store = getManualPrices();
    store[root] = price;
    localStorage.setItem(PRICE_STORE_KEY, JSON.stringify(store));
    renderManualList();
  }

  function deleteManualPrice(root) {
    const store = getManualPrices();
    delete store[root];
    localStorage.setItem(PRICE_STORE_KEY, JSON.stringify(store));
    renderManualList();
  }

  function updateRisk(leverage) {
    let message = "N/A", bg = "#f0f2f5", fg = "#1c1e21";
    if (leverage >= 0.8 && leverage <= 1.2) message = "Normal Risk";
    else if (leverage >= 0 && leverage < 0.8) message = "Low Risk";
    else if (leverage > 1.2 && leverage <= 1.5) message = "Slightly Elevated";
    else if (leverage > 1.5 && leverage <= 2) message = "Elevated";
    else if (leverage > 2 && leverage <= 2.5) message = "Limits Breached";
    else if (leverage > 2.5) { message = "EXTREME RISK"; bg = "#dc3545"; fg = "#fff"; }
    else if (leverage < 0 && leverage >= -0.5) message = "Short Risk";
    else if (leverage < -0.5 && leverage >= -1) message = "Elevated Short";
    else if (leverage < -1 && leverage >= -1.5) message = "High Short";
    else if (leverage < -1.5) { message = "EXTREME SHORT RISK"; bg = "#dc3545"; fg = "#fff"; }
    riskDisplay.textContent = message;
    riskDisplay.style.background = bg;
    riskDisplay.style.color = fg;
  }

  function renderManualList() {
    const store = getManualPrices();
    manualListDiv.innerHTML = "";
    const roots = Object.keys(store);
    if (!roots.length) {
      manualListDiv.innerHTML = "<p>No manual prices set.</p>";
      return;
    }
    roots.forEach(root => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";

      const label = document.createElement("span");
      label.textContent = root;
      label.style.flex = "1";

      const input = document.createElement("input");
      input.type = "number";
      input.value = store[root];
      input.style.width = "100px";
      input.style.margin = "0 8px";
      input.addEventListener("change", () => {
        const v = parseFloat(input.value);
        if (!isNaN(v) && v > 0) saveManualPrice(root, v);
      });

      const btn = document.createElement("button");
      btn.textContent = "✕";
      btn.style.width = "32px";
      btn.style.height = "32px";
      btn.style.background = "#dc3545";
      btn.style.color = "#fff";
      btn.style.border = "none";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", () => deleteManualPrice(root));

      row.append(label, input, btn);
      manualListDiv.appendChild(row);
    });
  }

  settingsBtn.addEventListener("click", () => {
    renderManualList();
    settingsPanel.style.display = "block";
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.style.display = "none";
    const token = localStorage.getItem(TOKEN_STORE_KEY);
    if (token) loadDashboard(token);
  });

  addPriceBtn.addEventListener("click", () => {
    let root = newSymbolInput.value.trim().toUpperCase();
    if (!root) return alert("Enter valid symbol (e.g. ES or /ES)");
    if (!root.startsWith("/")) root = "/" + root;
    if (!/^\/[A-Za-z]+$/.test(root)) return alert("Symbol must be letters only, like /ES");
    const existing = getManualPrices();
    if (existing[root] !== undefined) {
      alert(`Symbol ${root} already exists.`);
      newSymbolInput.value = "";
      return;
    }
    // Add with default price of zero
    saveManualPrice(root, 0);
    newSymbolInput.value = "";
  });

  async function loadDashboard(token) {
    try {
      loader.style.display = "block";
      loginSection.style.display = "none";

      // Get account number
      const accRes = await fetch(`${API_URL}/customers/me/accounts`, { headers: { Authorization: token } });
      if (!accRes.ok) throw new Error("Accounts fetch failed");
      const accJson = await accRes.json();
      const acct = accJson.data.items[0]?.account["account-number"];
      if (!acct) throw new Error("No account found");

      // Get balance
      const balRes = await fetch(`${API_URL}/accounts/${acct}/balances`, { headers: { Authorization: token } });
      if (!balRes.ok) throw new Error("Balances fetch failed");
      const balJson = await balRes.json();
      const netLiq = parseFloat(balJson.data["net-liquidating-value"]);
      nlvDisplay.textContent = toCurrency(netLiq);

      // Get positions
      const posRes = await fetch(`${API_URL}/accounts/${acct}/positions`, { headers: { Authorization: token } });
      if (!posRes.ok) throw new Error("Positions fetch failed");
      const posJson = await posRes.json();
      const futures = posJson.data.items.filter(i => i["instrument-type"] === "Future");

      positionsList.innerHTML = "";
      let netQty = 0;
      let totalNotional = 0;
      const manual = getManualPrices();

      futures.forEach(fut => {
        netQty += parseInt(fut.quantity, 10);
        const li = document.createElement("li");
        li.textContent = fut.symbol;
        positionsList.appendChild(li);

        // Extract root (e.g. /ZB from /ZBU5)
        const match = fut.symbol.match(/^\/[A-Za-z]+/);
        const root = match ? match[0] : fut.symbol;
        const price = manual[root];
        if (price != null) {
          const size = CONTRACT_SIZES[root] || parseFloat(fut["contract-value"] || fut.multiplier || 1);
          totalNotional += price * size * parseInt(fut.quantity, 10);
        }
      });

      if (!futures.length) {
        notionalDisplay.textContent = toCurrency(0);
      } else if (totalNotional === 0) {
        notionalDisplay.innerHTML = `<span style="color:#dc3545;cursor:pointer;" title="Click gear to set manual prices">Price Not Set ⚙️</span>`;
      } else {
        notionalDisplay.textContent = toCurrency(totalNotional);
      }

      netPositionDisplay.textContent = netQty > 0 ? "Net Long" : netQty < 0 ? "Net Short" : "Flat";
      const leverage = netLiq ? totalNotional / netLiq : 0;
      leverageDisplay.textContent = `${leverage.toFixed(2)}x`;
      updateRisk(leverage);

      loader.style.display = "none";
      resultsSection.style.display = "block";
    } catch (err) {
      alert(err.message);
      loader.style.display = "none";
      loginSection.style.display = "block";
    }
  }

  async function doLogin(creds) {
    try {
      loader.style.display = "block";
      loginSection.style.display = "none";
      const res = await fetch(`${API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds)
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Invalid credentials" : "Login failed");
      const data = await res.json();
      if (creds.password) localStorage.setItem(TOKEN_STORE_KEY, data.data["remember-token"]);
      loadDashboard(data.data["session-token"]);
    } catch (err) {
      alert(err.message);
      loader.style.display = "none";
      loginSection.style.display = "block";
    }
  }

  // --- EVENTS ---
  loginBtn.addEventListener("click", () => {
    const user = document.getElementById("username").value;
    const pass = document.getElementById("password").value;
    if (!user || !pass) return alert("Enter both username and password");
    doLogin({ login: user, password: pass, "remember-me": true });
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_STORE_KEY);
    resultsSection.style.display = "none";
    loginSection.style.display = "block";
  });

  // --- INITIALIZE ---
  renderManualList();
  const savedToken = localStorage.getItem(TOKEN_STORE_KEY);
  if (savedToken) doLogin({ "remember-token": savedToken });
  else loginSection.style.display = "block";
});
