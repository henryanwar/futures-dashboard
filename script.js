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

    // --- DATA DISPLAY ELEMENTS ---
    const nlvDisplay = document.getElementById('nlv');
    const notionalValueDisplay = document.getElementById('notional-value');
    const leverageDisplay = document.getElementById('leverage');
    const positionsList = document.getElementById('positions-list');
    const netPositionDisplay = document.getElementById('net-position');
    const riskAssessmentDisplay = document.getElementById('risk-assessment');

    // --- HELPERS ---
    const formatCurrency = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    const getRiskAssessment = leverage => {
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
    };

    const handleError = msg => {
        console.error(msg);
        alert(`Error: ${msg}`);
        loader.classList.add('hidden');
        loginSection.classList.remove('hidden');
    };

    // --- MANUAL PRICE LOGIC ---
    const getManualPrices = () => JSON.parse(localStorage.getItem(MANUAL_PRICES_KEY)) || {};
    
    const saveManualPrice = (symbol, price) => {
        const prices = getManualPrices();
        prices[symbol.toUpperCase()] = price;
        localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(prices));
        renderPriceList();
    };
    
    const deleteManualPrice = (symbol) => {
        const prices = getManualPrices();
        delete prices[symbol.toUpperCase()];
        localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(prices));
        renderPriceList();
    };

    const renderPriceList = () => {
        const prices = getManualPrices();
        priceListDiv.innerHTML = '<h3>Saved Prices</h3>';
        if (Object.keys(prices).length === 0) {
            priceListDiv.innerHTML += '<p>No prices saved yet.</p>';
            return;
        }
        for (const [symbol, price] of Object.entries(prices)) {
            const entry = document.createElement('div');
            entry.className = 'price-entry';
            entry.innerHTML = `
                <input type="text" value="${symbol}" disabled>
                <input type="number" value="${price}" disabled>
                <button data-symbol="${symbol}" class="delete-btn" style="background-color: #6c757d;">X</button>
            `;
            priceListDiv.appendChild(entry);
        }
    };
    
    // --- FETCH DASHBOARD DATA ---
    const getDashboardData = async sessionToken => {
        try {
            const accRes = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, { headers: { Authorization: sessionToken } });
            if (!accRes.ok) throw new Error('Accounts fetch failed');
            const accNum = (await accRes.json()).data.items[0]?.account['account-number'];
            if (!accNum) throw new Error('No account found');

            const balRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/balances`, { headers: { Authorization: sessionToken } });
            if (!balRes.ok) throw new Error('Balance fetch failed');
            const netLiq = parseFloat((await balRes.json()).data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiq);

            const posRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/positions`, { headers: { Authorization: sessionToken } });
            if (!posRes.ok) throw new Error('Positions fetch failed');
            const futures = (await posRes.json()).data.items.filter(p => p['instrument-type'] === 'Future');

            positionsList.innerHTML = '';
            let netQty = 0, totalNotional = 0;
            let priceSourceMessage = " (Manual)";

            if (futures.length) {
                const manualPrices = getManualPrices();
                futures.forEach(p => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${p.symbol} (${p['underlying-symbol']})</span> <strong>Qty: ${p.quantity}</strong>`;
                    positionsList.appendChild(li);
                    netQty += parseInt(p.quantity, 10);
                    
                    const price = manualPrices[p.symbol.toUpperCase()];
                    if (price) {
                        totalNotional += parseFloat(price) * parseInt(p.multiplier, 10) * p.quantity;
                    }
                });
            }
            
            if (totalNotional === 0 && futures.length > 0) {
                notionalValueDisplay.textContent = "Price Not Found in Settings";
            } else {
                notionalValueDisplay.textContent = formatCurrency(totalNotional) + priceSourceMessage;
            }

            netPositionDisplay.textContent = netQty > 0 ? 'Net Long' : netQty < 0 ? 'Net Short' : 'Flat';
            const leverage = netLiq ? totalNotional / netLiq : 0;
            leverageDisplay.textContent = `${leverage.toFixed(2)}x`;
            getRiskAssessment(leverage);

            loader.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        } catch (err) {
            handleError(err.message);
        }
    };

    // --- AUTH & EVENT LISTENERS ---
    const performLogin = async payload => {
        loader.classList.remove('hidden');
        loginSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        try {
            const res = await fetch(`${TASTYTRADE_API_URL}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(res.status === 401 ? 'Invalid credentials' : 'Login failed');
            const data = await res.json();
            const token = data.data['session-token'];
            if (payload.password) localStorage.setItem('tastytradeRememberToken', data.data['remember-token']);
            await getDashboardData(token);
        } catch (e) {
            handleError(e.message);
        }
    };

    loginBtn.addEventListener('click', () => {
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        if (!user || !pass) return alert('Enter both username and password.');
        performLogin({ login: user, password: pass, 'remember-me': true });
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('tastytradeRememberToken');
        resultsSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    });
    
    settingsToggleBtn.addEventListener('click', () => {
        renderPriceList();
        settingsPanel.classList.remove('hidden');
    });
    
    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('hidden');
        // Re-fetch data to reflect any price changes
        const saved = localStorage.getItem('tastytradeRememberToken');
        if (saved) performLogin({ 'remember-token': saved });
    });
    
    addPriceBtn.addEventListener('click', () => {
        const symbol = newSymbolInput.value.trim().toUpperCase();
        const price = parseFloat(newPriceInput.value);
        if (symbol && price) {
            saveManualPrice(symbol, price);
            newSymbolInput.value = '';
            newPriceInput.value = '';
        } else {
            alert('Please enter a valid symbol and price.');
        }
    });
    
    priceListDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const symbol = e.target.dataset.symbol;
            if (confirm(`Are you sure you want to delete the price for ${symbol}?`)) {
                deleteManualPrice(symbol);
            }
        }
    });

    // Auto-login if token saved
    const saved = localStorage.getItem('tastytradeRememberToken');
    if (saved) performLogin({ 'remember-token': saved });
    
    // Pre-populate settings with requested symbols
    const initialPrices = {
        "/MNQ": 0, "/MES": 0, "/MCL": 0, "/RTY": 0,
        "/M2K": 0, "/ZB": 0, "/MGC": 0
    };
    const currentPrices = getManualPrices();
    for (const [symbol, price] of Object.entries(initialPrices)) {
        if (!currentPrices.hasOwnProperty(symbol)) {
            currentPrices[symbol] = price;
        }
    }
    localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(currentPrices));
});
