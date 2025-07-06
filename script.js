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

    // --- FUNCTIONS ---
    const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    
    // NEW: Risk Analysis Function
    const getRiskAssessment = (leverage) => {
        let message = '';
        let color = '#f0f2f5'; // Default background color
        let textColor = '#1c1e21'; // Default text color

        if (leverage >= 0.8 && leverage <= 1.2) message = 'Normal Risk (Market Risk)';
        else if (leverage >= 0 && leverage < 0.8) message = 'Low Risk (Below Market Risk)';
        else if (leverage > 1.2 && leverage <= 1.5) message = 'Slightly Elevated Risk';
        else if (leverage > 1.5 && leverage <= 2) message = 'Elevated Risk (Above Market Risk)';
        else if (leverage > 2 && leverage <= 2.5) message = 'Risk Limits Breached: CHECK IN';
        else if (leverage > 2.5) {
            message = 'EXTREME RISK: CUT ALL POSITIONS. EXTREME RISK.';
            color = '#dc3545'; // Red background
            textColor = '#fff'; // White text
        }
        else if (leverage < 0 && leverage >= -0.5) message = 'Some Risk (Net Short)';
        else if (leverage < -0.5 && leverage >= -1) message = 'Elevated Risk (Net Short)';
        else if (leverage < -1 && leverage >= -1.5) message = 'High Risk: CHECK IN (Net Short)';
        else if (leverage < -1.5) {
            message = 'EXTREME RISK: CUT ALL POSITIONS. (Net Short)';
            color = '#dc3545'; // Red background
            textColor = '#fff'; // White text
        }
        else message = 'N/A';
        
        riskAssessmentDisplay.textContent = message;
        riskAssessmentDisplay.style.backgroundColor = color;
        riskAssessmentDisplay.style.color = textColor;
    };

    const handleApiError = (message) => {
        alert(`Error: ${message}`);
        loader.classList.add('hidden');
        loginSection.classList.remove('hidden');
    };
    
    // Main function to fetch and process data
    const getDashboardData = async (sessionToken) => {
        try {
            const accountsResponse = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, { headers: { 'Authorization': sessionToken } });
            if (!accountsResponse.ok) throw new Error('Could not fetch accounts.');
            const accountsData = await accountsResponse.json();
            const primaryAccount = accountsData.data.items[0]; 
            if (!primaryAccount) throw new Error('No accounts found for this user.');
            const accountNumber = primaryAccount.account['account-number'];

            const balanceResponse = await fetch(`${TASTYTRADE_API_URL}/accounts/${accountNumber}/balances`, { headers: { 'Authorization': sessionToken } });
            if (!balanceResponse.ok) throw new Error('Could not fetch account balance.');
            const balanceData = await balanceResponse.json();
            const netLiqValue = parseFloat(balanceData.data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiqValue);
            
            const positionsResponse = await fetch(`${TASTYTRADE_API_URL}/accounts/${accountNumber}/positions`, { headers: { 'Authorization': sessionToken } });
            if (!positionsResponse.ok) throw new Error('Could not fetch positions.');
            const positionsData = await positionsResponse.json();
            const futuresPositions = positionsData.data.items.filter(p => p['instrument-type'] === 'Future');

            // NEW: Clear previous positions list
            positionsList.innerHTML = '';
            let netQuantity = 0;

            let totalNotionalValue = 0;
            if (futuresPositions.length > 0) {
                // NEW: Populate positions list and calculate net quantity
                futuresPositions.forEach(p => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${p.symbol} (${p['underlying-symbol']})</span> <strong>Qty: ${p.quantity}</strong>`;
                    positionsList.appendChild(li);
                    netQuantity += parseInt(p.quantity, 10);
                });

                const liveSymbols = futuresPositions.map(p => p.symbol.replace(/^\//, ''));
                let priceSourceMessage = " (Live)";

                try {
                    const quotesResponse = await fetch(`${TASTYTRADE_API_URL}/market-metrics`, {
                        method: 'POST',
                        headers: { 'Authorization': sessionToken, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ symbols: liveSymbols })
                    });
                    if (!quotesResponse.ok) throw new Error('Live metrics failed.');
                    
                    const quotesData = await quotesResponse.json();
                    futuresPositions.forEach(position => {
                        const cleanSymbol = position.symbol.replace(/^\//, '');
                        const quote = quotesData.data.items.find(q => q.symbol === cleanSymbol);
                        if (quote && quote['last-trade-price']) {
                            totalNotionalValue += parseFloat(quote['last-trade-price']) * parseInt(position.multiplier, 10) * position.quantity;
                        }
                    });
                    notionalValueDisplay.textContent = formatCurrency(totalNotionalValue) + priceSourceMessage;
                } catch (liveError) {
                    priceSourceMessage = " (IWM Proxy)";
                    try {
                        const proxyUrl = `/.netlify/functions/get-price`;
                        const proxyResponse = await fetch(proxyUrl);
                        const priceData = await proxyResponse.json();
                        if (!proxyResponse.ok || priceData.error) throw new Error(priceData.error || 'Proxy request failed.');
                        
                        if (priceData.close) {
                            const iwmPrice = parseFloat(priceData.close);
                            const indexPrice = iwmPrice * 10;
                            futuresPositions.forEach(position => {
                                totalNotionalValue += indexPrice * parseInt(position.multiplier, 10) * position.quantity;
                            });
                        }
                        notionalValueDisplay.textContent = formatCurrency(totalNotionalValue) + priceSourceMessage;
                    } catch (fallbackError) {
                        handleApiError(`Fallback failed: ${fallbackError.message}`);
                        notionalValueDisplay.textContent = "Price Unavailable";
                    }
                }
            } else {
                 notionalValueDisplay.textContent = formatCurrency(0);
                 netQuantity = 0;
            }

            // NEW: Display Net Position
            if (netQuantity > 0) netPositionDisplay.textContent = 'Net Long';
            else if (netQuantity < 0) netPositionDisplay.textContent = 'Net Short';
            else netPositionDisplay.textContent = 'Flat';

            const leverage = netLiqValue > 0 ? totalNotionalValue / netLiqValue : 0;
            leverageDisplay.textContent = `${leverage.toFixed(2)}x`;

            // NEW: Call Risk Analysis Function
            getRiskAssessment(leverage);

            loader.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        } catch (error) {
            handleApiError(error.message);
        }
    };

    // Login and event listener functions
    const performLogin = async (loginPayload) => {
        loader.classList.remove('hidden');
        loginSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        try {
            const response = await fetch(`${TASTYTRADE_API_URL}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginPayload) });
            if (!response.ok) { if(response.status === 401) throw new Error('Invalid username or password.'); throw new Error('Login failed.'); }
            const data = await response.json();
            const sessionToken = data.data['session-token'];
            if (loginPayload.password) { localStorage.setItem('tastytradeRememberToken', data.data['remember-token']); }
            await getDashboardData(sessionToken);
        } catch (error) { handleApiError(error.message); }
    };
    loginBtn.addEventListener('click', () => {
        const username = document.getElementById('username').value; const password = document.getElementById('password').value;
        if (!username || !password) { alert('Please enter both username and password.'); return; }
        performLogin({ login: username, password: password, 'remember-me': true });
    });
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('tastytradeRememberToken'); resultsSection.classList.add('hidden'); loginSection.classList.remove('hidden');
        document.getElementById('username').value = ''; document.getElementById('password').value = '';
    });
    const savedToken = localStorage.getItem('tastytradeRememberToken');
    if (savedToken) { performLogin({ 'remember-token': savedToken }); }
});
