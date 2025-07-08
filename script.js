// futures-dashboard/script.js

"use strict";
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
    const formatCurrency = v => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(v);
    function getRiskAssessment(leverage) {
        let msg='', bg='#f0f2f5', color='#1c1e21';
        if (leverage>=0.8 && leverage<=1.2) msg='Normal Risk (Market Risk)';
        else if (leverage>=0 && leverage<0.8) msg='Low Risk (Below Market Risk)';
        else if (leverage>1.2 && leverage<=1.5) msg='Slightly Elevated Risk';
        else if (leverage>1.5 && leverage<=2) msg='Elevated Risk (Above Market Risk)';
        else if (leverage>2 && leverage<=2.5) msg='Risk Limits Breached: CHECK IN';
        else if (leverage>2.5) { msg='EXTREME RISK: CUT ALL POSITIONS.'; bg='#dc3545'; color='#fff'; }
        else if (leverage<0 && leverage>=-0.5) msg='Some Risk (Net Short)';
        else if (leverage< -0.5 && leverage>= -1) msg='Elevated Risk (Net Short)';
        else if (leverage< -1 && leverage>= -1.5) msg='High Risk: CHECK IN (Net Short)';
        else if (leverage< -1.5) { msg='EXTREME RISK: CUT ALL POSITIONS. (Net Short)'; bg='#dc3545'; color='#fff'; }
        else msg='N/A';
        riskAssessmentDisplay.textContent = msg;
        riskAssessmentDisplay.style.background = bg;
        riskAssessmentDisplay.style.color = color;
    }

    function getManualPrices() {
        return JSON.parse(localStorage.getItem(MANUAL_PRICES_KEY)||'{}');
    }
    function saveManualPrice(symbol, price) {
        const m=getManualPrices();
        m[symbol.toUpperCase()] = price;
        localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(m));
        renderPriceList();
    }
    function deleteManualPrice(symbol) {
        const m=getManualPrices();
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
            row.className = 'price-entry';
            // Use flex layout for inputs and button
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '8px';

            // Symbol field (disabled)
            const symInput = document.createElement('input');
            symInput.type = 'text';
            symInput.value = sym;
            symInput.disabled = true;
            symInput.className = 'symbol-field';
            symInput.style.flexGrow = '2';
            symInput.style.marginRight = '8px';

            // Price field (editable)
            const priceInput = document.createElement('input');
            priceInput.type = 'number';
            priceInput.value = pr;
            priceInput.dataset.symbol = sym;
            priceInput.className = 'price-field';
            priceInput.style.flexGrow = '1';
            priceInput.style.marginRight = '8px';

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.textContent = 'X';
            delBtn.dataset.symbol = sym;
            delBtn.className = 'delete-field';
            // Optional button styling
            delBtn.style.backgroundColor = '#dc3545';
            delBtn.style.color = '#fff';
            delBtn.style.border = 'none';
            delBtn.style.padding = '4px 8px';
            delBtn.style.cursor = 'pointer';

            // Assemble row
            row.appendChild(symInput);
            row.appendChild(priceInput);
            row.appendChild(delBtn);
            priceListDiv.appendChild(row);
        });
        }
async function getDashboardData(sessionToken) {
        try {
            // Accounts
            const accR=await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`,{headers:{Authorization:sessionToken}});
            if(!accR.ok) throw new Error('Accounts fetch failed');
            const accNum=(await accR.json()).data.items[0]?.account['account-number'];
            if(!accNum) throw new Error('No account found');

            // Balances
            const balR=await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/balances`,{headers:{Authorization:sessionToken}});
            if(!balR.ok) throw new Error('Balance fetch failed');
            const netLiq=parseFloat((await balR.json()).data['net-liquidating-value']);
            nlvDisplay.textContent=formatCurrency(netLiq);

            // Positions
            const posR=await fetch(`${TASTYTRADE_API_URL}/accounts/${accNum}/positions`,{headers:{Authorization:sessionToken}});
            if(!posR.ok) throw new Error('Positions fetch failed');
            const futures=(await posR.json()).data.items.filter(p=>p['instrument-type']==='Future');

            positionsList.innerHTML='';
            let netQty=0, totalNotional=0;
            const manualPrices=getManualPrices();

            futures.forEach(p=>{
                const li=document.createElement('li');
                li.innerHTML=`${p.symbol} (${p['underlying-symbol']}) Qty: ${p.quantity}`;
                positionsList.appendChild(li);
                netQty+=parseInt(p.quantity,10);

                const price=manualPrices[p.symbol.toUpperCase()];
                if(price!=null) {
                    const size=parseFloat(p['contract-value']||p.multiplier||1);
                    totalNotional+=price*size*parseInt(p.quantity,10);
                }
            });

            notionalValueDisplay.textContent = futures.length&&totalNotional===0?
                'Price Not Set (Manual)':
                formatCurrency(totalNotional)+' (Manual)';

            netPositionDisplay.textContent = netQty>0?'Net Long':netQty<0?'Net Short':'Flat';
            const lev=netLiq?totalNotional/netLiq:0;
            leverageDisplay.textContent=`${lev.toFixed(2)}x`;
            getRiskAssessment(lev);

            loader.classList.add('hidden');
            resultsSection.classList.remove('hidden');
        } catch(e) {
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
            const res=await fetch(`${TASTYTRADE_API_URL}/sessions`,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(payload)
            });
            if(!res.ok) throw new Error(res.status===401?'Invalid credentials':'Login failed');
            const data=await res.json();
            const token=data.data['session-token'];
            if(payload.password) localStorage.setItem('tastytradeRememberToken',data.data['remember-token']);
            await getDashboardData(token);
        } catch(e) {
            alert(e.message);
            loader.classList.add('hidden');
            loginSection.classList.remove('hidden');
        }
    }

    // Event Listeners
    loginBtn.addEventListener('click',()=>{
        const u=document.getElementById('username').value;
        const p=document.getElementById('password').value;
        if(!u||!p) return alert('Enter both username and password');
        performLogin({login:u,password:p,'remember-me':true});
    });
    logoutBtn.addEventListener('click',()=>{
        localStorage.removeItem('tastytradeRememberToken');
        resultsSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
    });

    settingsToggleBtn.addEventListener('click',()=>{
        renderPriceList();
        settingsPanel.classList.remove('hidden');
    });
    closeSettingsBtn.addEventListener('click',()=>{
        settingsPanel.classList.add('hidden');
        const saved=localStorage.getItem('tastytradeRememberToken');
        if(saved) performLogin({'remember-token':saved});
    });

    addPriceBtn.addEventListener('click',()=>{
        const s=newSymbolInput.value.trim().toUpperCase();
        const v=parseFloat(newPriceInput.value);
        if(s&&v>0) { saveManualPrice(s,v); newSymbolInput.value=''; newPriceInput.value=''; }
        else alert('Valid symbol & price required');
    });
    priceListDiv.addEventListener('click',e=>{
        if(e.target.classList.contains('delete-field')) {
            deleteManualPrice(e.target.dataset.symbol);
        }
    });
    priceListDiv.addEventListener('change',e=>{
        if(e.target.classList.contains('price-field')) {
            const sym=e.target.dataset.symbol;
            const v=parseFloat(e.target.value);
            if(sym&&v>0) saveManualPrice(sym,v);
        }
    });

    // Bootstrap
    const saved=localStorage.getItem('tastytradeRememberToken');
    if(saved) performLogin({'remember-token':saved});

    // Preload common symbols
    const defaults={"/MNQ":0,"/MES":0,"/MCL":0,"/RTY":0,"/M2K":0,"/ZB":0,"/MGC":0};
    const cur=getManualPrices();
    Object.entries(defaults).forEach(([s,v])=>{ if(!cur.hasOwnProperty(s)) cur[s]=v; });
    localStorage.setItem(MANUAL_PRICES_KEY,JSON.stringify(cur));
});
