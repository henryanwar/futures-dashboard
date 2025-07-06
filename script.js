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

    // --- FUNCTIONS ---
    const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    const handleApiError = (message) => {
        alert(`Error: ${message}`);
        loader.classList.add('hidden');
        loginSection.classList.remove('hidden');
    };
    
    // Main function to fetch and process data
    const getDashboardData = async (sessionToken) => {
        try {
            // 1. Get user accounts
            const accountsResponse = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, { headers: { 'Authorization': sessionToken } });
            if (!accountsResponse.ok) throw new Error('Could not fetch accounts.');
            const accountsData = await accountsResponse.json();
            const primaryAccount = accountsData.data.items[0]; 
            if (!primaryAccount) throw new Error('No accounts found for this user.');
            const accountNumber = primaryAccount.account['account-number'];

            // 2. Get account balances
            const balanceResponse = await fetch(`${TASTYTRADE_API_URL}/accounts/${accountNumber}/balances`, { headers: { 'Authorization': sessionToken } });
            if (!balanceResponse.ok) throw new Error('Could not fetch account balance.');
            const balanceData = await balanceResponse.json();
            const netLiqValue = parseFloat(balanceData.data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiqValue);
            
            // 3. Get account positions
            const positionsResponse = await fetch(`${TASTYTRADE_API_URL}/accounts/${accountNumber}/positions`, { headers: { 'Authorization': sessionToken } });
            if (!positionsResponse.ok) throw new Error('Could not fetch positions.');
            const positionsData = await positionsResponse.json();
            const futuresPositions = positionsData.data.items.filter(p => p['instrument-type'] === 'Future');

            // 4. Calculate total notional value
            let totalNotionalValue = 0;
            if (futuresPositions.length > 0) {
                const liveSymbols = futuresPositions.map(p => p.symbol.replace(/^\//, ''));
                let priceSourceMessage = " (Live)";

                try {
                    // ATTEMPT 1: Get LIVE prices for the futures contract from Tastytrade
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
                            totalNotionalValue += parseFloat(quote['last-trade-price']) * parseInt(position.multiplier, 10) * Math.abs(parseInt(position.quantity, 10));
                        }
                    });
                    notionalValueDisplay.textContent = formatCurrency(totalNotionalValue) + priceSourceMessage;

                } catch (liveError) {
                    priceSourceMessage = " (IWM Proxy)";
                    try {
                        // ATTEMPT 2 (FALLBACK): Get IWM ETF closing price from Tastytrade
                        const proxySymbol = 'IWM';
                        const quotesResponse = await fetch(`${TASTYTRADE_API_URL}/instruments/quotes`, {
                            method: 'POST',
                            headers: { 'Authorization': sessionToken, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ symbols: [proxySymbol] })
                        });
                        if (!quotesResponse.ok) throw new Error(`Could not fetch IWM quote from Tastytrade.`);
                        
                        const quotesData = await quotesResponse.json();
                        const quote = quotesData.data.items[0];

                        if (!quote || !quote.close) throw new Error('Could not parse IWM close price from API response.');
                        
                        const price = parseFloat(quote.close);
                        
                        // Apply the IWM closing price to the futures position
                        futuresPositions.forEach(position => {
                            totalNotionalValue += price * parseInt(position.multiplier, 10) * Math.abs(parseInt(position.quantity, 10));
                        });
                        
                        notionalValueDisplay.textContent = formatCurrency(totalNotionalValue) + priceSourceMessage;

                    } catch (fallbackError) {
                        handleApiError(`Fallback failed: ${fallbackError.message}`);
                        notionalValueDisplay.textContent = "Price Unavailable";
                        totalNotionalValue = 0;
                    }
                }
            } else {
                 notionalValueDisplay.textContent = formatCurrency(0);
            }

            const leverage = netLiqValue > 0 ? totalNotionalValue / netLiqValue : 0;
            leverageDisplay.textContent = `${leverage.toFixed(2)}x`;

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