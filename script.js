// futures-dashboard/script.js
"use strict";

document.addEventListener('DOMContentLoaded', () => {
  // --- CONFIG ---
  const API = 'https://api.tastytrade.com';
  const PRICES_KEY = 'tastytradeManualPrices';
  const CONTRACT_SIZES = { '/MNQ':20, '/MES':5, '/MCL':1000, '/RTY':50, '/M2K':10, '/ZB':1000, '/MGC':100 };

  // --- ELEMENTS ---
  const loginSec = document.getElementById('login-section');
  const resultsSec = document.getElementById('results-section');
  const loader = document.getElementById('loader');
  const btnLogin = document.getElementById('login-btn');
  const btnLogout = document.getElementById('logout-btn');
  const btnToggle = document.getElementById('settings-toggle-btn');
  const panel = document.getElementById('settings-panel');
  const btnClose = document.getElementById('close-settings-btn');
  const btnAdd = document.getElementById('add-price-btn');
  const listDiv = document.getElementById('price-list');
  const inpSymbol = document.getElementById('new-symbol');
  const inpPrice = document.getElementById('new-price');
  const outNlv = document.getElementById('nlv');
  const outNotional = document.getElementById('notional-value');
  const outLev = document.getElementById('leverage');
  const outList = document.getElementById('positions-list');
  const outNet = document.getElementById('net-position');
  const outRisk = document.getElementById('risk-assessment');

  // --- HELPERS ---
  const fx = v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
  const getPrices=()=>JSON.parse(localStorage.getItem(PRICES_KEY)||'{}');
  const savePrice=(s,p)=>{const m=getPrices();m[s]=p;localStorage.setItem(PRICES_KEY,JSON.stringify(m));renderList();};
  const delPrice=s=>{const m=getPrices();delete m[s];localStorage.setItem(PRICES_KEY,JSON.stringify(m));renderList();};
  function riskMsg(l){let msg='',bg='#f0f2f5',c='#1c1e21';if(l>=.8&&l<=1.2)msg='Normal Risk';else if(l<.8&&l>=0)msg='Low Risk';else if(l>1.2&&l<=1.5)msg='Slightly Elevated';else if(l>1.5&&l<=2)msg='Elevated';else if(l>2&&l<=2.5)msg='Limits Breached';else if(l>2.5){msg='EXTREME RISK';bg='#dc3545';c='#fff';}else if(l<0&&l>=-0.5)msg='Some Risk (Short)';else if(l<-0.5&&l>=-1)msg='Elevated Risk (Short)';else if(l<-1&&l>=-1.5)msg='High Risk (Short)';else if(l<-1.5){msg='EXTREME RISK (Short)';bg='#dc3545';c='#fff';}else msg='N/A';outRisk.textContent=msg;outRisk.style.background=bg;outRisk.style.color=c;}

  function renderList(){const m=getPrices();listDiv.innerHTML='';if(!Object.keys(m).length){listDiv.innerHTML='<p>No prices.</p>';return;}Object.entries(m).forEach(([s,p])=>{const row=document.createElement('div');row.style.display='flex';row.style.marginBottom='6px';const si=document.createElement('input');si.value=s;si.disabled=true;si.style.flex='1';si.style.marginRight='4px';const pi=document.createElement('input');pi.type='number';pi.value=p;pi.style.width='80px';pi.style.marginRight='4px';pi.addEventListener('change',e=>{const v=parseFloat(e.target.value);if(v>0)savePrice(s,v);});const db=document.createElement('button');db.textContent='X';db.style.width='24px';db.style.height='24px';db.style.background='#dc3545';db.style.color='#fff';db.style.border='none';db.style.cursor='pointer';db.addEventListener('click',()=>delPrice(s));row.append(si,pi,db);listDiv.appendChild(row);});}

  async function loadDashboard(token){try{const ac=await (await fetch(`${API}/customers/me/accounts`,{headers:{Authorization:token}})).json();const num=ac.data.items[0]?.account['account-number'];if(!num)throw new Error('No account');const bal=await (await fetch(`${API}/accounts/${num}/balances`,{headers:{Authorization:token}})).json();const nl=parseFloat(bal.data['net-liquidating-value']);outNlv.textContent=fx(nl);const pos=await (await fetch(`${API}/accounts/${num}/positions`,{headers:{Authorization:token}})).json();const fut=pos.data.items.filter(i=>i['instrument-type']==='Future');let netQ=0,notional=0;outList.innerHTML='';const man=getPrices();fut.forEach(p=>{netQ+=parseInt(p.quantity,10);const li=document.createElement('li');li.textContent=`${p.symbol} Qty:${p.quantity}`;outList.appendChild(li);const pr=man[p.symbol.match(/^\/[^0-9]+/)?.[0]||p.symbol];if(pr!=null){const root=p.symbol.match(/^\/[^0-9]+/)?.[0]||p.symbol;const sz=CONTRACT_SIZES[root]||parseFloat(p['contract-value']||p.multiplier||1);notional+=pr*sz*parseInt(p.quantity,10);} });outNotional.textContent=fut.length&&notional===0?'Price Not Set':fx(notional)+' (Manual)';outNet.textContent=netQ>0?'Net Long':netQ<0?'Net Short':'Flat';const lev=nl?notional/nl:0;outLev.textContent=`${lev.toFixed(2)}x`;riskMsg(lev);loader.classList.add('hidden');resultsSec.classList.remove('hidden');}catch(e){alert(e.message);loader.classList.add('hidden');loginSec.classList.remove('hidden');}}

  async function doLogin(payload){loader.classList.remove('hidden');loginSec.classList.add('hidden');resultsSec.classList.add('hidden');try{const res=await fetch(`${API}/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error(res.status===401?'Bad cred':'Login failed');const d=await res.json();if(payload.password)localStorage.setItem('tastytradeRememberToken',d.data['remember-token']);await loadDashboard(d.data['session-token']);}catch(e){alert(e.message);loader.classList.add('hidden');loginSec.classList.remove('hidden');}}

  btnLogin.addEventListener('click',()=>{const u=document.getElementById('username').value;const p=document.getElementById('password').value;if(!u||!p)return alert('Enter both');doLogin({login:u,password:p,'remember-me':true});});
  btnLogout.addEventListener('click',()=>{localStorage.removeItem('tastytradeRememberToken');loginSec.classList.remove('hidden');resultsSec.classList.add('hidden');});
  btnToggle.addEventListener('click',()=>{renderList();panel.classList.remove('hidden');});
  btnClose.addEventListener('click',()=>{panel.classList.add('hidden');const tk=localStorage.getItem('tastytradeRememberToken');if(tk)doLogin({'remember-token':tk});});
  btnAdd.addEventListener('click',()=>{const s=inpSymbol.value.trim().toUpperCase();const v=parseFloat(inpPrice.value);if(s&&v>0){savePrice(s,v);inpSymbol.value='';inpPrice.value='';}else alert('Symbol & price');});

  // init
  const tok=localStorage.getItem('tastytradeRememberToken');if(tok)doLogin({'remember-token':tok});else loginSec.classList.remove('hidden');

  // defaults
  const defs={'/MNQ':0,'/MES':0,'/MCL':0,'/RTY':0,'/M2K':0,'/ZB':0,'/MGC':0};const cur=getPrices();Object.entries(defs).forEach(([k,v])=>{if(!cur[k])cur[k]=v;});localStorage.setItem(PRICES_KEY,JSON.stringify(cur));
});
