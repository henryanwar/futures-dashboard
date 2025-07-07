document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const TASTYTRADE_API_URL = 'https://api.tastytrade.com';

    // --- DOM ELEMENTS ---
    const loginSection = document.getElementById('login-section');
    const resultsSection = document.getElementById('results-section');
    const loader = document.getElementById('loader');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

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
        alert(`Error: ${msg}`);
        loader.classList.add('hidden');
        loginSection.classList.remove('hidden');
    };

    // --- FETCH DASHBOARD DATA ---
    const getDashboardData = async sessionToken => {
        try {
            // Fetch accounts
            const accRes = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, { headers: { Authorization: sessionToken } });
            if (!accRes.ok) throw new Error('Accounts fetch failed');
            const accData = await accRes.json();
            const acct = accData.data.items[0]?.account['account-number'];
            if (!acct) throw new Error('No account found');

            // Fetch balances
            const balRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${acct}/balances`, { headers: { Authorization: sessionToken } });
            if (!balRes.ok) throw new Error('Balance fetch failed');
            const balData = await balRes.json();
            const netLiq = parseFloat(balData.data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiq);

            // Fetch positions
            const posRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${acct}/positions`, { headers: { Authorization: sessionToken } });
            if (!posRes.ok) throw new Error('Positions fetch failed');
            const posData = await posRes.json();
            const futures = posData.data.items.filter(p => p['instrument-type'] === 'Future');

            positionsList.innerHTML = '';
            let netQty = 0, totalNotional = 0;

            if (futures.length) {
                // List positions
                futures.forEach(p => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${p.symbol} (${p['underlying-symbol']})</span> <strong>Qty: ${p.quantity}</strong>`;
                    positionsList.appendChild(li);
                    netQty += parseInt(p.quantity, 10);
                });

                // Prepare symbols (include leading slash)
                const liveSymbols = futures.map(p => p.symbol.startsWith('/') ? p.symbol : `/${p.symbol}`);
                const params = new URLSearchParams();
                liveSymbols.forEach(sym => params.append('symbols', sym));
                const metricsUrl = `${TASTYTRADE_API_URL}/market-metrics?${params.toString()}`;

                try {
                    // Fetch market metrics via GET with query params
                    const quoteRes = await fetch(metricsUrl, { headers: { Authorization: sessionToken } });
                    if (!quoteRes.ok) throw new Error(`Market-metrics fetch failed: ${quoteRes.status}`);
                    const quoteData = await quoteRes.json();

                    // Compute notional
                    quoteData.data.items.forEach(q => {
                        const pos = futures.find(f => {
                            const sym = f.symbol.startsWith('/') ? f.symbol : `/${f.symbol}`;
                            return sym === q.symbol;
                        });
                        if (pos && q['last-trade-price']) {
                            totalNotional += parseFloat(q['last-trade-price'])
                                * parseInt(pos.multiplier, 10)
                                * parseInt(pos.quantity, 10);
                        }
                    });
                    notionalValueDisplay.textContent = formatCurrency(totalNotional) + ' (Live)';
                } catch (liveErr) {
                    console.error('Market metrics GET error:', liveErr);
                    notionalValueDisplay.textContent = 'Price Unavailable';
                }
            } else {
                notionalValueDisplay.textContent = formatCurrency(0);
            }

            // Net position
            netPositionDisplay.textContent = netQty > 0 ? 'Net Long' : netQty < 0 ? 'Net Short' : 'Flat';

            // Leverage & risk
            const lev = netLiq ? totalNotional / netLiq : 0;
            leverageDisplay.textContent = `${lev.toFixed(2)}x`;
            getRiskAssessment(lev);

            loader.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        } catch (err) {
            handleError(err.message);
        }
    };

    // --- LOGIN / LOGOUT HANDLERS ---
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

    // --- AUTO-LOGIN ---
    const saved = localStorage.getItem('tastytradeRememberToken');
    if (saved) performLogin({ 'remember-token': saved });
});
