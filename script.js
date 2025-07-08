// script.js
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // --- CONFIGURATION ---
  const API_URL = "https://api.tastytrade.com";
  const MEM_KEY = "tastytradeManualPrices";
  const TOKEN_KEY = "tastytradeRememberToken";
  const CONTRACT_SIZES = {
    "/MNQ": 20,
    "/MES": 5,
    "/MCL": 1000,
    "/RTY": 50,
    "/M2K": 10,
    "/ZB": 1000,
    "/MGC": 100
  };

  // --- DOM REFS ---
  const loginSection = document.getElementById("login-section");
  const resultsSection = document.getElementById("results-section");
  const loader = document.getElementById("loader");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  const settingsBtn = document.getElementById("settings-toggle-btn");
  const settingsSection = document.getElementById("settings-panel");
  const manualList = document.getElementById("price-list");
  const symbolInput = document.getElementById("new-symbol");
  const priceInput = document.getElementById("new-price");
  const addPriceBtn = document.getElementById("add-price-btn");
  const closeSettingsBtn = document.getElementById("close-settings-btn");

  const nlvDisplay = document.getElementById("nlv");
  const notionalDisplay = document.getElementById("notional-value");
  const leverageDisplay = document.getElementById("leverage");
  const positionsList = document.getElementById("positions-list");
  const netPosDisplay = document.getElementById("net-position");
  const riskDisplay = document.getElementById("risk-assessment");

  // --- UTILS ---
  const toCurrency = v => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

  function getManualPrices() {
    return JSON.parse(localStorage.getItem(MEM_KEY) || "{}");
  }
  function saveManualPrice(root, price) {
    const m = getManualPrices();
    m[root] = price;
    localStorage.setItem(MEM_KEY, JSON.stringify(m));
    renderManualList();
  }
  function deleteManualPrice(root) {
    const m = getManualPrices();
    delete m[root];
    localStorage.setItem(MEM_KEY, JSON.stringify(m));
    renderManualList();
  }

  function updateRisk(leverage) {
    let msg = "N/A", bg = "#f0f2f5", fg = "#1c1e21";
    if (leverage >= 0.8 && leverage <= 1.2) msg = "Normal Risk";
    else if (leverage >= 0 && leverage < 0.8) msg = "Low Risk";
    else if (leverage > 1.2 && leverage <= 1.5) msg = "Slightly Elevated";
    else if (leverage > 1.5 && leverage <= 2) msg = "Elevated";
    else if (leverage > 2 && leverage <= 2.5) msg = "Limits Breached";
    else if (leverage > 2.5) { msg = "EXTREME RISK"; bg = "#dc3545"; fg = "#fff"; }
    else if (leverage < 0 && leverage >= -0.5) msg = "Short Risk";
    else if (leverage < -0.5 && leverage >= -1) msg = "Elevated Short";
    else if (leverage < -1 && leverage >= -1.5) msg = "High Short";
    else if (leverage < -1.5) { msg = "EXTREME SHORT RISK"; bg = "#dc3545"; fg = "#fff"; }
    riskDisplay.textContent = msg;
    riskDisplay.style.background = bg;
    riskDisplay.style.color = fg;
  }

  function renderManualList() {
    const m = getManualPrices();
    manualList.innerHTML = "";
    const entries = Object.keys(m);
    if (!entries.length) {
      manualList.innerHTML = "<p>No manual prices set.</p>";
      return;
    }
    entries.forEach(root => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";

      const lbl = document.createElement("span");
      lbl.textContent = root;
      lbl.style.flex = "1";

      const inp = document.createElement("input");
      inp.type = "number";
      inp.value = m[root];
      inp.style.width = "100px";
      inp.style.margin = "0 8px";
      inp.addEventListener("change", () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v > 0) saveManualPrice(root, v);
      });

      const del = document.createElement("button");
      del.textContent = "✕";
      del.style.width = "32px";
      del.style.height = "32px";
      del.style.background = "#dc3545";
      del.style.color = "#fff";
      del.style.border = "none";
      del.style.cursor = "pointer";
      del.addEventListener("click", () => deleteManualPrice(root));

      row.append(lbl, inp, del);
      manualList.appendChild(row);
    });
  }

  settingsBtn.addEventListener("click", () => {
    renderManualList();
    settingsSection.style.display = "block";
  });
  closeSettingsBtn.addEventListener("click", () => {
    settingsSection.style.display = "none";
    const tok = localStorage.getItem(TOKEN_KEY);
    if (tok) loadDashboard(tok);
  });
  addPriceBtn.addEventListener("click", () => {
    const r = symbolInput.value.trim().toUpperCase();
    const v = parseFloat(priceInput.value);
    if (r && /^\/[A-Za-z]+$/.test(r) && v > 0) {
      saveManualPrice(r, v);
      symbolInput.value = "";
      priceInput.value = "";
    } else {
      alert("Enter valid root (like /ZB) and positive price.");
    }
  });

  async function loadDashboard(token) {
    try {
      loader.style.display = "block";
      loginSection.style.display = "none";

      // Fetch account
      const accRes = await fetch(`${API_URL}/customers/me/accounts`, { headers: { Authorization: token } });
      if (!accRes.ok) throw new Error("Accounts fetch failed");
      const accJson = await accRes.json();
      const acct = accJson.data.items[0]?.account['account-number'];
      if (!acct) throw new Error("No account found");

      // Fetch balance
      const balRes = await fetch(`${API_URL}/accounts/${acct}/balances`, { headers: { Authorization: token } });
      if (!balRes.ok) throw new Error("Balances fetch failed");
      const balJson = await balRes.json();
      const netLiq = parseFloat(balJson.data['net-liquidating-value']);
      nlvDisplay.textContent = toCurrency(netLiq);

      // Fetch positions
      const posRes = await fetch(`${API_URL}/accounts/${acct}/positions`, { headers: { Authorization: token } });
      if (!posRes.ok) throw new Error("Positions fetch failed");
      const posJson = await posRes.json();
      const futures = posJson.data.items.filter(i => i['instrument-type'] === 'Future');

      positionsList.innerHTML = "";
      let netQty = 0, totalNotional = 0;
      const manual = getManualPrices();

      futures.forEach(f => {
        netQty += parseInt(f.quantity, 10);
        const li = document.createElement("li");
        li.textContent = `${f.symbol}`;
        positionsList.appendChild(li);

        // extract root
        const m = f.symbol.match(/^\/[A-Za-z]+/);
        const root = m ? m[0] : f.symbol;
        const price = manual[root];
        if (price != null) {
          const size = CONTRACT_SIZES[root] || parseFloat(f['contract-value'] || f.multiplier || 1);
          totalNotional += price * size * parseInt(f.quantity, 10);
        }
      });

      if (futures.length === 0) {
        notionalDisplay.textContent = toCurrency(0);
      } else if (totalNotional === 0) {
        notionalDisplay.innerHTML = `<span style="color:#dc3545;cursor:pointer;" title="Click gear to set manual prices">Price Not Set ⚙️</span>`;
      } else {
        notionalDisplay.textContent = toCurrency(totalNotional);
      }

      outNetPos.textContent = netQty > 0 ? 'Net Long' : netQty < 0 ? 'Net Short' : 'Flat';
      const lev = netLiq ? totalNotional / netLiq : 0;
      leverageDisplay.textContent = `${lev.toFixed(2)}x`;
      updateRisk(lev);

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Invalid credentials' : 'Login failed');
      const d = await res.json();
      if (creds.password) localStorage.setItem(TOKEN_KEY, d.data['remember-token']);
      loadDashboard(d.data['session-token']);
    } catch (err) {
      alert(err.message);
      loader.style.display = "none";
      loginSection.style.display = "block";
    }
  }

  // --- BIND EVENTS ---
  loginBtn.addEventListener('click', () => {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    if (!u || !p) return alert('Enter both username and password');
    doLogin({ login: u, password: p, 'remember-me': true });
  });
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    resultsSection.style.display = "none";
    loginSection.style.display = "block";
  });

  // --- INIT ---
  renderManualList();
  const savedToken = localStorage.getItem(TOKEN_KEY);
  if (savedToken) doLogin({ 'remember-token': savedToken });
  else loginSection.style.display = "block";
});
