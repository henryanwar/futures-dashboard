// futures-dashboard/script.js
"use strict";

// Wrap everything in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const TASTYTRADE_API_URL = 'https://api.tastytrade.com';
    const MANUAL_PRICES_KEY = 'tastytradeManualPrices';

    // --- DOM ELEMENTS ---
    const loginSection = document.getElementById('login-section');
    const resultsSection = document.getElementById('results-section');
    const loader = document.getElementById('loader');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    const settingsPanel = document.getElementById('settings-panel');
    const settingsToggleBtn = document.getElementById('settings-toggle-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const addPriceBtn = document.getElementById('add-price-btn');
    const priceListDiv = document.getElementById('price-list');
    const newSymbolInput = document.getElementById('new-symbol');
    const newPriceInput = document.getElementById('new-price');

    const nlvDisplay = document.getElementById('nlv');
    const notionalValueDisplay = document.getElementById('notional-value');
    const leverageDisplay = document.getElementById('leverage');
    const positionsList = document.getElementById('positions-list');
    const netPositionDisplay = document.getElementById('net-position');
    const riskAssessmentDisplay = document.getElementById('risk-assessment');

    // --- HELPERS ---
    // Contract sizes for different futures (per point)
    const CONTRACT_SIZES = {
        '/MNQ': 20,
        '/MES': 5,
        '/MCL': 1000,
        '/RTY': 50,
        '/M2K': 10,
        '/ZB': 1000,
        '/MGC': 100
    };
    const formatCurrency = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
    function updateRiskAssessment(leverage) {
        let message = '', bg = '#f0f2f5', color = '#1c1e21';
        if (leverage >= 0.8 && leverage <= 1.2) message = 'Normal Risk (Market Risk)';
        else if (leverage >= 0 && leverage < 0.8) message = 'Low Risk (Below Market Risk)';
        else if (leverage > 1.2 && leverage <= 1.5) message = 'Slightly Elevated Risk';
        else if (leverage > 1.5 && leverage <= 2) message = 'Elevated Risk (Above Market Risk)';
        else if (leverage > 2 && leverage <= 2.5) message = 'Risk Limits Breached: CHECK IN';
        else if (leverage > 2.5) { message = 'EXTREME RISK: CUT ALL POSITIONS.'; bg = '#dc3545'; color = '#fff'; }
        else if (leverage < 0 && leverage >= -0.5) message = 'Some Risk (Net Short)';
        else if (leverage < -0.5 && leverage >= -1) message = 'Elevated Risk (Net Short)';
        else if (leverage < -1 && leverage >= -1.5) message = 'High Risk: CHECK IN (Net Short)';
        else if (leverage < -1.5) { message = 'EXTREME RISK: CUT ALL POSITIONS. (Net Short)'; bg = '#dc3545'; color = '#fff'; }
        else message = 'N/A';
        riskAssessmentDisplay.textContent = message;
        riskAssessmentDisplay.style.background = bg;
        riskAssessmentDisplay.style.color = color;
    }

    function getManualPrices() {
        return JSON.parse(localStorage.getItem(MANUAL_PRICES_KEY) || '{}');
    }
    function saveManualPrice(symbol, price) {
        const m = getManualPrices();
        m[symbol.toUpperCase()] = price;
        localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(m));
        renderPriceList();
    }
    function deleteManualPrice(symbol) {
        const m = getManualPrices();
        delete m[symbol.toUpperCase()];
        localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(m));
        renderPriceList();
    }

    function renderPriceList() {
        const m = getManualPrices();
        priceListDiv.innerHTML = '';
        if (Object.keys(m).length === 0) {
            priceListDiv.innerHTML = '<p>No manual prices saved.</p>';
            return;
        }
        Object.entries(m).forEach(([sym, pr]) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '8px';

            const symInput = document.createElement('input');
            symInput.type = 'text';
            symInput.value = sym;
            symInput.disabled = true;
            symInput.style.flex = '1';
            symInput.style.marginRight = '8px';
            symInput.style.padding = '6px 8px';

            const priceInput = document.createElement('input');
            priceInput.type = 'number';
            priceInput.value = pr;
            priceInput.dataset.symbol = sym;
            priceInput.style.flex = '1';
            priceInput.style.marginRight = '8px';
            priceInput.style.padding = '6px 8px';
            priceInput.addEventListener('change', e => {
                const newVal = parseFloat(e.target.value);
                if (!isNaN(newVal) && newVal > 0) saveManualPrice(sym, newVal);
            });

            const delBtn = document.createElement('button');
            delBtn.textContent = 'X';
            delBtn.dataset.symbol = sym;
            delBtn.style.width = '32px';
            delBtn.style.height = '32px';
            delBtn.style.padding = '0';
            delBtn.style.margin = '0';
            delBtn.style.border = 'none';
            delBtn.style.backgroundColor = '#dc3545';
            delBtn.style.color = '#fff';
            delBtn.style.cursor = 'pointer';
            delBtn.style.borderRadius = '4px';
            delBtn.addEventListener('click', () => deleteManualPrice(sym));

            row.appendChild(symInput);
            row.appendChild(priceInput);
            row.appendChild(delBtn);
            priceListDiv.appendChild(row);
        });
    }

    async function getDashboardData(sessionToken) {
        try {
            const accR = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, { headers: { Authorization: sessionToken } });
            if (!accR.ok) throw new Error('Accounts fetch failed');
            const accNum = (await accR.json()).data.items[0]?.account['account-number'];
            if (!accNum) throw new Error('No account found');

            const balR = await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/balances`, { headers: { Authorization: sessionToken } });
            if (!balR.ok) throw new Error('Balance fetch failed');
            const netLiq = parseFloat((await balR.json()).data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiq);

            const posR = await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/positions`, { headers: { Authorization: sessionToken } });
            if (!posR.ok) throw new Error('Positions fetch failed');
            const futures = (await posR.json()).data.items.filter(i => i['instrument-type'] === 'Future');

            positionsList.innerHTML = '';
            let netQty = 0, totalNotional = 0;
            const manual = getManualPrices();
            futures.forEach(p => {
                const li = document.createElement('li');
                li.textContent = `${p.symbol} Qty: ${p.quantity}`;
                positionsList.appendChild(li);
                netQty += parseInt(p.quantity, 10);

                const manualPrice = manual[p.symbol.toUpperCase()];
                if (manualPrice != null) {
                    // extract root symbol (e.g. /MES from /MESU3)
                    const root = (p.symbol.match(/^\/[^0-9]+/) || [p.symbol])[0];
                    // lookup contract size or fallback
                    const size = CONTRACT_SIZES[root] || parseFloat(p['contract-value'] || p.multiplier || 1);
                    const qty = parseInt(p.quantity, 10);
                    totalNotional += manualPrice * size * qty;
                }
            });
                    totalNotional += price * size * parseInt(p.quantity, 10);
                }
            });

            notionalValueDisplay.textContent = futures.length && totalNotional === 0
                ? 'Price Not Set (Manual)'
                : formatCurrency(totalNotional) + ' (Manual)';

            netPositionDisplay.textContent = netQty > 0 ? 'Net Long' : netQty < 0 ? 'Net Short' : 'Flat';
            const lev = netLiq ? totalNotional / netLiq : 0;
            leverageDisplay.textContent = `${lev.toFixed(2)}x`;
            updateRiskAssessment(lev);

            loader.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        } catch (e) {
            alert(e.message);
            loader.classList.add('hidden');
            loginSection.classList.remove('hidden');
        }
    }

    async function performLogin(payload) {
        loader.classList.remove('hidden');
        loginSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        try {
            const res = await fetch(`${TASTYTRADE_API_URL}/sessions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(res.status === 401 ? 'Invalid credentials' : 'Login failed');
            const data = await res.json();
            const token = data.data['session-token'];
            if (payload.password) localStorage.setItem('tastytradeRememberToken', data.data['remember-token']);
            await getDashboardData(token);
        } catch (e) {
            alert(e.message);
            loader.classList.add('hidden');
            loginSection.classList.remove('hidden');
        }
    }

    // EVENT LISTENERS
    loginBtn.addEventListener('click', () => {
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        if (!user || !pass) return alert('Enter both username and password');
        performLogin({ login: user, password: pass, 'remember-me': true });
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('tastytradeRememberToken');
        resultsSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
    });

    settingsToggleBtn.addEventListener('click', () => {
        renderPriceList();
        settingsPanel.classList.remove('hidden');
    });
    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('hidden');
        const saved = localStorage.getItem('tastytradeRememberToken');
        if (saved) performLogin({ 'remember-token': saved });
    });
    addPriceBtn.addEventListener('click', () => {
        const s = newSymbolInput.value.trim().toUpperCase();
        const v = parseFloat(newPriceInput.value);
        if (s && v > 0) { saveManualPrice(s, v); newSymbolInput.value = ''; newPriceInput.value = ''; }
        else alert('Valid symbol & price required');
    });

    // BOOTSTRAP
    const saved = localStorage.getItem('tastytradeRememberToken');
    if (saved) performLogin({ 'remember-token': saved });

    // PRELOAD DEFAULTS
    const defaults = { '/MNQ': 0, '/MES': 0, '/MCL': 0, '/RTY': 0, '/M2K': 0, '/ZB': 0, '/MGC': 0 };
    const cur = getManualPrices();
    Object.entries(defaults).forEach(([s, v]) => { if (!cur.hasOwnProperty(s)) cur[s] = v; });
    localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(cur));
});
