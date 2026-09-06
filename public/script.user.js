// ==UserScript==
// @name         IXL Auto Answerer
// @namespace    http://tampermonkey.net/
// @version      16.13
// @description  Simplified auto answerer
// @match        https://www.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      ixl-key-server.onrender.com
// @connect      api.groq.com
// @updateURL    https://ixl-key-server.onrender.com/script.user.js
// @downloadURL  https://ixl-key-server.onrender.com/script.user.js
// ==/UserScript==

(function() {
    'use strict';
    if (window.__ixlLoaded) return;
    window.__ixlLoaded = true;

    const GROQ_API_KEY = "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";
    const MODEL = "groq/compound";
    const SERVER = "https://ixl-key-server.onrender.com";
    const VERSION = "16.13";

    let licenseKey = GM_getValue('license_key', '');
    let running = false;

    // Styles
    GM_addStyle(`
        #ixl-loader { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index:999998; background:#2c3e50; color:#fff; padding:20px; border-radius:10px; font-family:Arial; width:350px; display:flex; gap:10px; }
        #ixl-loader input { flex:1; padding:8px; border-radius:5px; border:none; }
        #ixl-loader button { background:#3498db; color:#fff; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; }
        #ixl-panel { position: fixed; top:10px; right:10px; z-index:999999; background:#2c3e50; color:#fff; padding:15px; border-radius:10px; font-family:Arial; width:300px; display:none; }
        #ixl-panel.show { display:block; }
        #ixl-status { text-align:center; padding:5px; background:#c0392b; border-radius:3px; margin-bottom:8px; }
        #ixl-status.on { background:#27ae60; }
        #ixl-toggle { width:100%; background:#3498db; border:none; color:#fff; padding:8px; border-radius:5px; cursor:pointer; font-weight:bold; }
        #ixl-log { background:#34495e; height:150px; overflow-y:auto; font-size:12px; padding:8px; margin-top:8px; white-space:pre-wrap; }
    `);

    // Loader
    const loader = document.createElement('div');
    loader.id = 'ixl-loader';
    loader.innerHTML = `<input type="text" id="ixl-key" placeholder="License Key"><button id="ixl-activate">Activate</button>`;
    document.body.appendChild(loader);

    if (licenseKey) document.getElementById('ixl-key').value = licenseKey;

    // Panel
    const panel = document.createElement('div');
    panel.id = 'ixl-panel';
    panel.innerHTML = `<div id="ixl-status">Status: OFF</div><button id="ixl-toggle">Start</button><div id="ixl-log">Ready.</div>`;
    document.body.appendChild(panel);

    function log(msg) {
        const d = document.getElementById('ixl-log');
        d.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + msg;
        d.scrollTop = d.scrollHeight;
        console.log('[IXL] ' + msg);
    }

    async function validateKey(key) {
        if (!key) return alert('Enter license key');
        try {
            const res = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({ method:'GET', url:`${SERVER}/api/validate-key?key=${encodeURIComponent(key)}`, onload:resolve, onerror:reject, timeout:10000 });
            });
            const data = JSON.parse(res.responseText);
            if (!data.valid) { alert('Invalid: ' + data.reason); return false; }
            licenseKey = key;
            GM_setValue('license_key', key);
            return true;
        } catch(e) { alert('Cannot reach server'); return false; }
    }

    document.getElementById('ixl-activate').onclick = async () => {
        if (await validateKey(document.getElementById('ixl-key').value.trim())) {
            loader.style.display = 'none';
            panel.classList.add('show');
            log('Activated');
        }
    };

    function solveMath(q) {
        const m = q.match(/^(Add|Subtract|Multiply|Divide|Evaluate)\.?\s+([\d,]+)\s*([+\-*/])\s*([\d,]+)/i);
        if (!m) return null;
        let a = parseFloat(m[2].replace(/,/g,''));
        let b = parseFloat(m[4].replace(/,/g,''));
        let r;
        switch(m[3]) { case '+': r=a+b; break; case '-': r=a-b; break; case '*': r=a*b; break; case '/': r=a/b; break; default: return null; }
        return r % 1 === 0 ? r.toString() : r.toFixed(2).replace(/\.?0+$/,'');
    }

    function getQuestion() {
        const sels = ['.question-component', '.crisp-question', '.question-text', '.question'];
        for (const s of sels) {
            const el = document.querySelector(s);
            if (el && el.textContent.trim()) return el.textContent.replace(/\s+/g,' ').trim();
        }
        return '';
    }

    function inputAnswer(ans) {
        ans = String(ans).trim();
        // Try to click matching option
        const opts = document.querySelectorAll('[class*="choice"], [class*="option"], [class*="answer"], label, button');
        for (const o of opts) {
            if (o.offsetParent === null) continue;
            const text = (o.innerText || o.textContent || '').trim();
            if (text.replace(/\s+/g,'').toLowerCase() === ans.replace(/\s+/g,'').toLowerCase()) {
                o.click();
                setTimeout(() => clickSubmit(), 200);
                return true;
            }
        }
        // Digit boxes
        const inputs = [...document.querySelectorAll('input[type="text"], input[type="number"]')].filter(i => i.offsetParent !== null && !i.closest('#ixl-panel'));
        if (inputs.length === 0) return false;
        if (inputs.length === 1) { inputs[0].value = ans; inputs[0].dispatchEvent(new Event('input',{bubbles:true})); }
        else {
            const digits = ans.replace(/,/g,'').replace(/[^0-9]/g,'');
            if (!digits) return false;
            let str = digits;
            if (str.length < inputs.length) str = ' '.repeat(inputs.length - str.length) + str;
            if (str.length > inputs.length) str = str.slice(-inputs.length);
            for (let i=0;i<inputs.length;i++) { inputs[i].value = str[i] === ' ' ? '' : str[i]; inputs[i].dispatchEvent(new Event('input',{bubbles:true})); }
        }
        setTimeout(() => clickSubmit(), 700);
        return true;
    }

    function clickSubmit() {
        const btn = document.querySelector('.submit-button, .check-answer-button, button[type="submit"]');
        if (btn) btn.click();
        else {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) if (b.offsetParent && /submit|check|enter|ok/i.test(b.textContent)) { b.click(); break; }
        }
    }

    async function aiAnswer(q) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:'POST', url:'https://api.groq.com/openai/v1/chat/completions',
                headers:{'Content-Type':'application/json','Authorization':'Bearer '+GROQ_API_KEY},
                data:JSON.stringify({model:MODEL, messages:[{role:'system',content:'Answer with ONLY the final answer.'},{role:'user',content:q}], temperature:0.1, max_tokens:150}),
                onload: res => { try { const d=JSON.parse(res.responseText); resolve(d.choices[0].message.content.trim()); } catch(e){ resolve(null); } },
                onerror: () => resolve(null)
            });
        });
    }

    let count=0;
    async function run() {
        while (running) {
            const q = getQuestion();
            if (!q) { log('No question'); await sleep(2000); continue; }
            let ans = solveMath(q);
            if (!ans) ans = await aiAnswer(q);
            if (ans && ans !== 'SKIP') {
                if (inputAnswer(ans)) { count++; log('Answered '+count); await sleep(2500); }
                else { log('Input failed'); await sleep(2000); }
            } else { await sleep(2000); }
            // click next
            const next = [...document.querySelectorAll('button')].find(b => b.offsetParent && /next|continue|ok|close/i.test(b.textContent));
            if (next) { next.click(); await sleep(500); }
        }
    }

    document.getElementById('ixl-toggle').onclick = () => {
        running = !running;
        document.getElementById('ixl-toggle').textContent = running ? 'Stop' : 'Start';
        const st = document.getElementById('ixl-status');
        st.textContent = 'Status: ' + (running?'ON':'OFF');
        st.className = running ? 'on' : '';
        if (running) run();
    };

    function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
})();
