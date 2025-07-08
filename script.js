document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_URL = 'https://api.tastytrade.com';
    const PRICES_KEY = 'tastytradeManualPrices';
    const LOGIN_TOKEN_KEY = 'tastytradeRememberToken';
    const CONTRACT_MULTIPLIERS = {
        '/MNQ': 2,   '/MES': 5,   '/MCL': 1000,
        '/RTY': 50,  '/M2K': 5,   '/ZB': 1000,
        '/MGC': 10
    };

    // --- DOM ELEMENTS ---
    const loginSec = document.getElementById('login-section');
    const resultsSec = document.getElementById('results-section');
    const loader = document.getElementById('loader');
    const btnLogin = document.getElementById('login-btn');
    const btnLogout = document.getElementById('logout-btn');

    const btnToggle = document.getElementById('settings-toggle-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const btnClose = document.getElementById('close-settings-btn');
    const btnAddPrice = document.getElementById('add-price-btn');
    const priceListDiv = document.getElementById('price-list');
    const newSymbolInput = document.getElementById('new-symbol');
    const newPriceInput = document.getElementById('new-price');

    const outNlv = document.getElementById('nlv');
    const outNotional = document.getElementById('notional-value');
    const outLeverage = document.getElementById('leverage');
    const positionsList = document.getElementById('positions-list');
    const outNetPos = document.getElementById('net-position');
    const outRisk = document.getElementById('risk-assessment');

    // --- HELPERS ---
    const formatCurrency = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
    const getManualPrices = () => JSON.parse(localStorage.getItem(PRICES_KEY) || '{}');
    const saveManualPrice = (sym, price) => {
        const m = getManualPrices(); m[sym.toUpperCase()] = price;
        localStorage.setItem(PRICES_KEY, JSON.stringify(m)); renderPriceList();
    };
    const deleteManualPrice = sym => {
        const m = getManualPrices(); delete m[sym.toUpperCase()];
        localStorage.setItem(PRICES_KEY, JSON.stringify(m)); renderPriceList();
    };

    function updateRisk(leverage) {
        let msg = '', bg = '#f0f2f5', fg = '#1c1e21';
        if (leverage >= 0.8 && leverage <= 1.2) msg = 'Normal Risk';
        else if (leverage >= 0 && leverage < 0.8) msg = 'Low Risk';
        else if (leverage > 1.2 && leverage <= 1.5) msg = 'Slightly Elevated';
        else if (leverage > 1.5 && leverage <= 2) msg = 'Elevated';
        else if (leverage > 2 && leverage <= 2.5) msg = 'Limits Breached';
        else if (leverage > 2.5) { msg = 'EXTREME RISK'; bg = '#dc3545'; fg = '#fff'; }
        else if (leverage < 0 && leverage >= -0.5) msg = 'Some Risk (Short)';
        else if (leverage < -0.5 && leverage >= -1) msg = 'Elevated (Short)';
        else if (leverage < -1 && leverage >= -1.5) msg = 'High Risk (Short)';
        else if (leverage < -1.5) { msg = 'EXTREME RISK (Short)'; bg = '#dc3545'; fg = '#fff'; }
        else msg = 'N/A';
        outRisk.textContent = msg;
        outRisk.style.background = bg;
        outRisk.style.color = fg;
    }

    // --- THIS IS THE CORRECTED FUNCTION ---
    function renderPriceList() {
        const m = getManualPrices();
        priceListDiv.innerHTML = '<h3>Saved Prices</h3>';
        if (!Object.keys(m).length) {
            priceListDiv.innerHTML += '<p>No prices saved.</p>';
            return;
        }
        Object.entries(m).forEach(([sym, pr]) => {
            const row = document.createElement('div');
            row.className = 'price-entry';

            // Symbol Input (Wider)
            const symInput = document.createElement('input');
            symInput.type = 'text';
            symInput.value = sym;
            symInput.disabled = true;
            symInput.style.flex = '2'; // Takes up more space

            // Price Input
            const priceInput = document.createElement('input');
            priceInput.type = 'number';
            priceInput.value = pr;
            priceInput.dataset.symbol = sym;
            priceInput.className = 'price-input';
            priceInput.style.flex = '1'; // Takes up less space
            
            // Delete Button (Smaller)
            const delBtn = document.createElement('button');
            delBtn.textContent = 'X';
            delBtn.dataset.symbol = sym;
            delBtn.className = 'delete-btn';
            delBtn.style.flex = '0 0 40px'; // Makes the button a fixed, smaller width
            delBtn.style.backgroundColor = '#dc3545';
            
            row.append(symInput, priceInput, delBtn);
            priceListDiv.appendChild(row);
        });
    }

    async function loadDashboard(token) {
        try {
            loader.classList.remove('hidden'); loginSec.classList.add('hidden');

            const accR = await fetch(`${API_URL}/customers/me/accounts`, { headers: { Authorization: token } });
            if (!accR.ok) throw new Error('Accounts fetch failed');
            const accountNum = (await accR.json()).data.items[0]?.account['account-number'];
            if (!accountNum) throw new Error('No account found');

            const balR = await fetch(`${API_URL}/accounts/${accountNum}/balances`, { headers: { Authorization: token } });
            if (!balR.ok) throw new Error('Balance fetch failed');
            const netLiq = parseFloat((await balR.json()).data['net-liquidating-value']);
            outNlv.textContent = formatCurrency(netLiq);

            const posR = await fetch(`${API_URL}/accounts/${accountNum}/positions`, { headers: { Authorization: token } });
            if (!posR.ok) throw new Error('Positions fetch failed');
            const futures = (await posR.json()).data.items.filter(i => i['instrument-type'] === 'Future');

            positionsList.innerHTML = ''; let netQty = 0, totalNotional = 0;
            const prices = getManualPrices();

            futures.forEach(f => {
                netQty += parseInt(f.quantity, 10);
                const li = document.createElement('li');
                li.innerHTML = `<span>${f.symbol} (${f['underlying-symbol']})</span> <strong>Qty: ${f.quantity}</strong>`;
                positionsList.appendChild(li);

                const root = `/${f['underlying-symbol']}`;
                const price = prices[root.toUpperCase()];

                if (price != null) {
                    const multiplier = CONTRACT_MULTIPLIERS[root.toUpperCase()] || parseFloat(f.multiplier || 1);
                    totalNotional += price * multiplier * parseInt(f.quantity, 10);
                }
            });

            outNotional.textContent = (futures.length && totalNotional === 0) 
                ? 'Price Not Set' 
                : formatCurrency(totalNotional) + ' (Manual)';
            
            outNetPos.textContent = netQty > 0 ? 'Net Long' : netQty < 0 ? 'Net Short' : 'Flat';
            const leverage = netLiq ? totalNotional / netLiq : 0;
            outLeverage.textContent = `${leverage.toFixed(2)}x`;
            updateRisk(leverage);

            loader.classList.add('hidden'); resultsSec.classList.remove('hidden');
        } catch (err) {
            alert(err.message); loader.classList.add('hidden'); loginSec.classList.remove('hidden');
        }
    }

    async function doLogin(payload) {
        try {
            loader.classList.remove('hidden'); loginSec.classList.add('hidden');
            const res = await fetch(`${API_URL}/sessions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(res.status === 401 ? 'Invalid credentials' : 'Login failed');
            const data = await res.json();
            if (payload.password) localStorage.setItem(LOGIN_TOKEN_KEY, data.data['remember-token']);
            await loadDashboard(data.data['session-token']);
        } catch (e) {
            alert(e.message); loader.classList.add('hidden'); loginSec.classList.remove('hidden');
        }
    }

    // --- EVENT LISTENERS ---
    btnLogin.addEventListener('click', () => {
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        if (!user || !pass) return alert('Enter both username and password');
        doLogin({ login: user, password: pass, 'remember-me': true });
    });
    btnLogout.addEventListener('click', () => {
        localStorage.removeItem(LOGIN_TOKEN_KEY);
        resultsSec.classList.add('hidden'); loginSec.classList.remove('hidden');
    });
    btnToggle.addEventListener('click', () => {
        renderPriceList();
        settingsPanel.classList.remove('hidden');
    });
    btnClose.addEventListener('click', () => {
        settingsPanel.classList.add('hidden');
        const token = localStorage.getItem(LOGIN_TOKEN_KEY);
        if (token) doLogin({ 'remember-token': token });
    });
    btnAddPrice.addEventListener('click', () => {
        const sym = newSymbolInput.value.trim().toUpperCase();
        const pr = parseFloat(newPriceInput.value);
        if (sym && pr > 0) {
            saveManualPrice(sym, pr);
            newSymbolInput.value = '';
            newPriceInput.value = '';
        } else alert('Please enter valid symbol and price');
    });
    priceListDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const symbol = e.target.dataset.symbol;
            if (confirm(`Are you sure you want to delete the price for ${symbol}?`)) {
                deleteManualPrice(symbol);
            }
        }
    });
    priceListDiv.addEventListener('change', (e) => {
        if (e.target.classList.contains('price-input')) {
            const symbol = e.target.dataset.symbol;
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) saveManualPrice(symbol, v);
        }
    });

    // --- INITIALIZATION ---
    const defaults = { '/MNQ': 0, '/MES': 0, '/MCL': 0, '/RTY': 0, '/M2K': 0, '/ZB': 0, '/MGC': 0 };
    const current = getManualPrices();
    let needsUpdate = false;
    Object.entries(defaults).forEach(([k, v]) => {
        if (current[k] === undefined) {
            current[k] = v;
            needsUpdate = true;
        }
    });
    if (needsUpdate) localStorage.setItem(PRICES_KEY, JSON.stringify(current));

    const savedToken = localStorage.getItem(LOGIN_TOKEN_KEY);
    if (savedToken) {
        doLogin({ 'remember-token': savedToken });
    } else {
        loginSec.classList.remove('hidden');
    }
});
