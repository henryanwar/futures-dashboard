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
        console.error(msg);
        alert(`Error: ${msg}`);
        loader.classList.add('hidden');
        loginSection.classList.remove('hidden');
    };

    // --- FETCH DASHBOARD DATA ---
    const getDashboardData = async sessionToken => {
        try {
            // 1) Fetch accounts
            const accRes = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, { headers: { Authorization: sessionToken } });
            if (!accRes.ok) throw new Error('Accounts fetch failed');
            const accData = await accRes.json();
            const acct = accData.data.items[0]?.account['account-number'];
            if (!acct) throw new Error('No account found');

            // 2) Fetch balances
            const balRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${acct}/balances`, { headers: { Authorization: sessionToken } });
            if (!balRes.ok) throw new Error('Balance fetch failed');
            const balData = await balRes.json();
            const netLiq = parseFloat(balData.data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiq);

            // 3) Fetch positions
            const posRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${acct}/positions`, { headers: { Authorization: sessionToken } });
            if (!posRes.ok) throw new Error('Positions fetch failed');
            const posData = await posRes.json();
            const futures = posData.data.items.filter(p => p['instrument-type'] === 'Future');

            positionsList.innerHTML = '';
            let netQty = 0, totalNotional = 0;

            if (futures.length) {
                futures.forEach(p => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${p.symbol} (${p['underlying-symbol']})</span> <strong>Qty: ${p.quantity}</strong>`;
                    positionsList.appendChild(li);
                    netQty += parseInt(p.quantity, 10);
                });

                // Prepare symbol list with leading slash if missing
                const liveSymbols = futures.map(p => p.symbol.startsWith('/') ? p.symbol : `/${p.symbol}`);
                console.debug('Requesting market-metrics for:', liveSymbols);

                try {
                    // 4) POST to market-metrics endpoint
                    const quoteRes = await fetch(`${TASTYTRADE_API_URL}/market-metrics`, {
                        method: 'POST',
                        headers: {
                            Authorization: sessionToken,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ symbols: liveSymbols })
                    });
                    if (!quoteRes.ok) {
                        const errText = await quoteRes.text();
                        throw new Error(`Market-metrics failed ${quoteRes.status}: ${errText}`);
                    }
                    const quoteData = await quoteRes.json();
                    console.debug('Market-metrics response:', quoteData);

                    // 5) Compute total notional value
                    quoteData.data.items.forEach(q => {
                        const symMatch = futures.find(p => {
                            const full = p.symbol.startsWith('/') ? p.symbol : `/${p.symbol}`;
                            return full === q.symbol;
                        });
                        if (symMatch && q['last-trade-price']) {
                            totalNotional += parseFloat(q['last-trade-price'])
                                * parseInt(symMatch.multiplier || 1, 10)
                                * parseInt(symMatch.quantity, 10);
                        }
                    });
                    notionalValueDisplay.textContent = formatCurrency(totalNotional) + ' (Live)';
                } catch (liveErr) {
                    console.error('Live price fetch error:', liveErr);
                    notionalValueDisplay.textContent = 'Price Unavailable';
                }
            } else {
                notionalValueDisplay.textContent = formatCurrency(0);
            }

            // Net position indicator
            netPositionDisplay.textContent = netQty > 0 ? 'Net Long' : netQty < 0 ? 'Net Short' : 'Flat';

            // Leverage computation & risk assessment
            const leverage = netLiq ? totalNotional / netLiq : 0;
            leverageDisplay.textContent = `${leverage.toFixed(2)}x`;
            getRiskAssessment(leverage);

            loader.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        } catch (err) {
            handleError(err.message);
        }
    };

    // --- LOGIN / LOGOUT ---
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
            const sessionToken = data.data['session-token'];
            if (payload.password) localStorage.setItem('tastytradeRememberToken', data.data['remember-token']);
            await getDashboardData(sessionToken);
        } catch (e) {
            handleError(e.message);
        }
    };

    loginBtn.addEventListener('click', () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        if (!username || !password) return alert('Enter both username and password.');
        performLogin({ login: username, password: password, 'remember-me': true });
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('tastytradeRememberToken');
        resultsSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    });

    // Auto-login if token present
    const savedToken = localStorage.getItem('tastytradeRememberToken');
    if (savedToken) performLogin({ 'remember-token': savedToken });
});
