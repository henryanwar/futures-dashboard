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
            // 1) Fetch account number
            const accRes = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, { headers: { Authorization: sessionToken } });
            if (!accRes.ok) throw new Error('Accounts fetch failed');
            const accNum = (await accRes.json()).data.items[0]?.account['account-number'];
            if (!accNum) throw new Error('No account found');

            // 2) Fetch balances
            const balRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/balances`, { headers: { Authorization: sessionToken } });
            if (!balRes.ok) throw new Error('Balance fetch failed');
            const netLiq = parseFloat((await balRes.json()).data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiq);

            // 3) Fetch positions
            const posRes = await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/positions`, { headers: { Authorization: sessionToken } });
            if (!posRes.ok) throw new Error('Positions fetch failed');
            const futures = (await posRes.json()).data.items.filter(p => p['instrument-type'] === 'Future');

            positionsList.innerHTML = '';
            let netQty = 0, totalNotional = 0;

            if (futures.length) {
                futures.forEach(p => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${p.symbol} (${p['underlying-symbol']})</span> <strong>Qty: ${p.quantity}</strong>`;
                    positionsList.appendChild(li);
                    netQty += parseInt(p.quantity, 10);
                });

                // --- THIS IS THE FINAL FIX ---
                // The API expects a comma-separated string for symbols in a GET request.
                const symbols = futures.map(p => p.symbol);
                const encodedSymbols = symbols.map(s => encodeURIComponent(s)).join(',');
                const url = `${TASTYTRADE_API_URL}/market-metrics?symbols=${encodedSymbols}`;
                
                // 4) Fetch live quotes via GET
                const quoteRes = await fetch(url, { headers: { Authorization: sessionToken } });
                if (!quoteRes.ok) throw new Error('Market-metrics GET failed');
                const quoteData = await quoteRes.json();
                
                // 5) Compute total notional
                const quoteLookup = (quoteData.data.items || []).reduce((m, q) => {
                    m[q.symbol] = q; // Use the full symbol as the key
                    return m;
                }, {});

                futures.forEach(pos => {
                    const quote = quoteLookup[pos.symbol]; // Match on the full symbol
                    if (quote && quote['last-trade-price'] != null) {
                        const price = parseFloat(quote['last-trade-price']);
                        const multiplier = parseFloat(pos.multiplier);
                        const quantity = parseInt(pos.quantity, 10);
                        totalNotional += price * multiplier * quantity;
                    }
                });
