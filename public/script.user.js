// ==UserScript==
// @name         Tempest Hub
// @namespace    http://tampermonkey.net/
// @version      18.9
// @description  Multi-cheat hub. License required. Runs at document-start with deferred UI initialization.
// @match        https://www.ixl.com/*
// @run-at       document-start
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
    if (window.__tempestHubLoaded) return;
    window.__tempestHubLoaded = true;

    // ==================== CONFIG ====================
    const GROQ_API_KEY = "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";
    const MODEL = "groq/compound";
    const SERVER = "https://ixl-key-server.onrender.com";
    const VERSION = "18.9";

    // ==================== STATE ====================
    let licenseKey = GM_getValue('license_key', '');
    let activeCheat = null;
    let running = false;
    let questionCount = 0;
    let sameQuestionStreak = 0;
    let lastQuestion = '';
    let updateRequired = false;

    // User customization
    let panelBgColor = GM_getValue('panelBgColor', '#2c3e50');
    let panelTextColor = GM_getValue('panelTextColor', '#ffffff');
    let snowEnabled = GM_getValue('snowEnabled', false);

    // Network interception storage
    let currentAnswerFromNetwork = null;

    // ==================== NETWORK INTERCEPTION (immediate) ====================
    function deepSearchForNumberBlocks(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (Array.isArray(obj.numberBlocksByDigits)) return obj.numberBlocksByDigits;
        for (const key in obj) {
            const res = deepSearchForNumberBlocks(obj[key]);
            if (res) return res;
        }
        return null;
    }

    function extractAnswerFromText(text) {
        try {
            const data = JSON.parse(text);
            const digits = deepSearchForNumberBlocks(data);
            if (digits && digits.length > 0) {
                const ans = digits.join('');
                currentAnswerFromNetwork = ans;
                console.log('[Tempest] Captured numberBlocksByDigits:', digits, '=>', ans);
                return;
            }
            const searchObj = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                for (const key in obj) {
                    const val = obj[key];
                    if (typeof val === 'string' && /^(answer|correct|solution)$/i.test(key)) {
                        currentAnswerFromNetwork = val;
                        console.log('[Tempest] Captured answer from key', key, ':', val);
                        return;
                    } else if (typeof val === 'object') {
                        searchObj(val);
                    }
                }
            };
            searchObj(data);
        } catch(e) {}
    }

    function hookFetch() {
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const resp = await origFetch.apply(this, args);
            const clone = resp.clone();
            try {
                const text = await clone.text();
                extractAnswerFromText(text);
            } catch(e) {}
            return resp;
        };
    }

    function hookXHR() {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.addEventListener('load', function() {
                try {
                    if (this.responseText) extractAnswerFromText(this.responseText);
                } catch(e) {}
            });
            origOpen.call(this, method, url, ...rest);
        };
    }

    hookFetch();
    hookXHR();

    // ==================== UI CREATION (deferred) ====================
    function initUI() {
        if (document.getElementById('ixl-loader')) return; // already initialized

        // Styles
        GM_addStyle(`
            #ixl-loader { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999998; background: #2c3e50; color: #fff; padding: 20px 30px; border-radius: 10px; font-family: Arial; box-shadow: 0 0 20px rgba(0,0,0,0.5); width: 400px; max-width: 90%; display: flex; align-items: center; gap: 10px; }
            #ixl-loader input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px; font-size: 14px; }
            #ixl-loader button { padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
            #tempest-hub { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999999; background: #2c3e50; color: #fff; padding: 25px; border-radius: 15px; font-family: Arial; box-shadow: 0 0 30px rgba(0,0,0,0.6); width: 350px; display: none; }
            #tempest-hub.show { display: block; }
            #tempest-hub h2 { margin: 0 0 15px; text-align: center; color: #3498db; }
            .hub-btn { display: block; width: 100%; padding: 12px; margin-bottom: 10px; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; transition: background 0.3s; }
            .hub-btn:hover { background: #2980b9; }
            .hub-btn:disabled { background: #7f8c8d; cursor: not-allowed; }
            #ixl-panel { position: fixed; top: 10px; right: 10px; z-index: 999999; color: ${panelTextColor}; background: ${panelBgColor}; padding: 15px; border-radius: 10px; font-family: Arial; width: 340px; box-shadow: 0 0 20px rgba(0,0,0,0.5); display: none; overflow: hidden; }
            #ixl-panel.show { display: block; }
            #ixl-status { text-align: center; padding: 5px; background: #c0392b; border-radius: 3px; margin-bottom: 8px; font-weight: bold; }
            #ixl-status.on { background: #27ae60; }
            #ixl-toggle { width: 100%; background: #3498db; border: none; color: #fff; padding: 8px; border-radius: 5px; cursor: pointer; font-weight: bold; }
            #ixl-log { background: #34495e; height: 150px; overflow-y: auto; font-size: 12px; padding: 8px; margin-top: 8px; white-space: pre-wrap; color: #fff; }
            #ixl-panel .drag-handle { cursor: move; background: #1a252f; padding: 8px 15px; margin: -15px -15px 10px -15px; border-radius: 10px 10px 0 0; user-select: none; display: flex; align-items: center; justify-content: space-between; touch-action: none; color: #3498db; }
            #ixl-panel .drag-handle h3 { margin: 0; color: #3498db; font-size: 16px; }
            #settings-btn { position: absolute; top: 10px; right: 10px; background: none; border: none; color: inherit; cursor: pointer; font-size: 20px; z-index: 1000001; }
            #settings-area { display: none; margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; }
            #settings-area.show { display: block; }
            .settings-row { margin: 8px 0; }
            .settings-row label { display: inline-block; width: 100px; color: inherit; }
            .settings-row input[type="color"] { width: 50px; height: 30px; padding: 0; border: none; background: none; }
            .snowflake { position: absolute; color: #fff; user-select: none; pointer-events: none; animation: fall linear infinite; }
            @keyframes fall {
                0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
                100% { transform: translateY(calc(100% + 20px)) rotate(360deg); opacity: 0; }
            }
            #update-banner { background: #e67e22; color: #fff; padding: 8px; text-align: center; font-size: 13px; display: none; cursor: pointer; }
            #update-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000000; display: flex; justify-content: center; align-items: center; font-family: Arial; }
            #update-overlay .box { background: #fff; color: #000; padding: 30px; border-radius: 10px; text-align: center; max-width: 400px; }
            #update-overlay button { margin: 10px; padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
        `);

        // Loader
        const loader = document.createElement('div');
        loader.id = 'ixl-loader';
        loader.innerHTML = `<input type="text" id="ixl-key" placeholder="Enter License Key"><button id="ixl-activate" type="button">Activate</button>`;
        document.body.appendChild(loader);
        if (licenseKey) document.getElementById('ixl-key').value = licenseKey;

        // Hub
        const hub = document.createElement('div');
        hub.id = 'tempest-hub';
        hub.innerHTML = `<h2>Tempest Hub</h2><button class="hub-btn" data-cheat="ixl">IXL Auto Answerer</button><button class="hub-btn" disabled>McGraw Hill</button>`;
        document.body.appendChild(hub);

        // Panel
        const panel = document.createElement('div');
        panel.id = 'ixl-panel';
        panel.innerHTML = `
            <div class="drag-handle"><h3>Tempest</h3><span>⠿</span></div>
            <div id="update-banner">Update available – click to install</div>
            <div id="ixl-status">Status: OFF</div>
            <button id="ixl-toggle" type="button">Start</button>
            <div id="ixl-log">Ready.</div>
            <button id="settings-btn">⚙️</button>
            <div id="settings-area">
                <div class="settings-row"><label>BG Color:</label><input type="color" id="bg-color" value="${panelBgColor}"></div>
                <div class="settings-row"><label>Text Color:</label><input type="color" id="text-color" value="${panelTextColor}"></div>
                <div class="settings-row"><label>Snow:</label><input type="checkbox" id="snow-toggle" ${snowEnabled ? 'checked' : ''}></div>
            </div>
        `;
        document.body.appendChild(panel);

        // Apply stored colors
        panel.style.backgroundColor = panelBgColor;
        panel.style.color = panelTextColor;
        document.getElementById('ixl-log').style.color = '#fff';

        // Dragging
        const dragHandle = panel.querySelector('.drag-handle');
        let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
        dragHandle.addEventListener('pointerdown', e => {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            dragHandle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        dragHandle.addEventListener('pointermove', e => {
            if (!isDragging) return;
            panel.style.left = (e.clientX - dragOffsetX) + 'px';
            panel.style.top = (e.clientY - dragOffsetY) + 'px';
            panel.style.right = 'auto';
        });
        dragHandle.addEventListener('pointerup', e => { isDragging = false; dragHandle.releasePointerCapture(e.pointerId); });
        dragHandle.addEventListener('pointercancel', e => { isDragging = false; });

        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => {
            document.getElementById('settings-area').classList.toggle('show');
        });
        document.getElementById('bg-color').addEventListener('input', function() {
            panelBgColor = this.value;
            GM_setValue('panelBgColor', panelBgColor);
            panel.style.backgroundColor = panelBgColor;
        });
        document.getElementById('text-color').addEventListener('input', function() {
            panelTextColor = this.value;
            GM_setValue('panelTextColor', panelTextColor);
            panel.style.color = panelTextColor;
        });
        document.getElementById('snow-toggle').addEventListener('change', function() {
            snowEnabled = this.checked;
            GM_setValue('snowEnabled', snowEnabled);
            if (snowEnabled) startSnow(); else stopSnow();
        });

        // Snow effect
        let snowInterval = null;
        function startSnow() {
            if (snowInterval) return;
            snowInterval = setInterval(() => {
                const flake = document.createElement('div');
                flake.className = 'snowflake';
                flake.textContent = '❄';
                flake.style.left = Math.random() * panel.offsetWidth + 'px';
                flake.style.top = '-20px';
                flake.style.fontSize = (10 + Math.random() * 10) + 'px';
                flake.style.animationDuration = (3 + Math.random() * 3) + 's';
                panel.appendChild(flake);
                setTimeout(() => flake.remove(), 6000);
            }, 200);
        }
        function stopSnow() {
            if (snowInterval) { clearInterval(snowInterval); snowInterval = null; }
            panel.querySelectorAll('.snowflake').forEach(el => el.remove());
        }
        if (snowEnabled) startSnow();

        function log(msg) {
            const d = document.getElementById('ixl-log');
            d.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + msg;
            d.scrollTop = d.scrollHeight;
            console.log('[Tempest] ' + msg);
        }

        // Update check
        async function checkForUpdates() {
            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: `${SERVER}/script.user.js?nocache=${Date.now()}`,
                        onload: resolve,
                        onerror: reject,
                        timeout: 5000
                    });
                });
                const versionMatch = response.responseText.match(/@version\s+([\d.]+)/);
                if (versionMatch && versionMatch[1] !== VERSION) {
                    updateRequired = true;
                    document.getElementById('ixl-toggle').disabled = true;
                    showUpdateOverlay();
                }
            } catch (e) { console.log('Update check failed:', e); }
        }
        function showUpdateOverlay() {
            if (document.getElementById('update-overlay')) return;
            const overlay = document.createElement('div');
            overlay.id = 'update-overlay';
            overlay.innerHTML = `
                <div class="box">
                    <h2>Update Required</h2>
                    <p>A new version of Tempest is available. You must update to continue.</p>
                    <button id="update-now-btn">Update Now</button>
                    <button id="reload-after-update-btn">I've Updated – Reload</button>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('update-now-btn').addEventListener('click', function() {
                window.open(`${SERVER}/script.user.js`, '_blank');
                setTimeout(() => location.reload(), 10000);
            });
            document.getElementById('reload-after-update-btn').addEventListener('click', function() {
                location.reload();
            });
        }
        setInterval(checkForUpdates, 5 * 60 * 1000);

        // License
        async function validateKey(key) {
            if (!key) { alert('Please enter a license key.'); return false; }
            try {
                const res = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({ method:'GET', url:`${SERVER}/api/validate-key?key=${encodeURIComponent(key)}`, onload:resolve, onerror:reject, timeout:10000 });
                });
                const data = JSON.parse(res.responseText);
                if (!data.valid) { alert('License invalid: ' + data.reason); return false; }
                licenseKey = key;
                GM_setValue('license_key', key);
                log('License OK, remaining: ' + Math.round(data.remainingMs / 60000) + ' min');
                return true;
            } catch(e) { alert('Cannot reach server'); return false; }
        }

        document.getElementById('ixl-activate').addEventListener('click', async () => {
            if (await validateKey(document.getElementById('ixl-key').value.trim())) {
                loader.style.opacity = '0';
                setTimeout(() => { loader.style.display = 'none'; hub.classList.add('show'); checkForUpdates(); }, 300);
            }
        });

        // Hub button
        hub.addEventListener('click', function(e) {
            const btn = e.target.closest('.hub-btn');
            if (!btn || btn.disabled) return;
            const cheat = btn.dataset.cheat;
            if (cheat === 'ixl') {
                activeCheat = 'ixl';
                startIXLCheat();
            } else {
                alert('Coming soon');
            }
            hub.classList.remove('show');
        });

        function startIXLCheat() {
            document.querySelector('#ixl-panel .drag-handle h3').textContent = 'IXL Auto Answerer';
            panel.classList.add('show');
            document.getElementById('ixl-status').textContent = 'Status: OFF';
            document.getElementById('ixl-status').className = '';
            document.getElementById('ixl-toggle').disabled = false;
            document.getElementById('ixl-log').textContent = 'Ready.';
            running = false;
            questionCount = 0;
            sameQuestionStreak = 0;
            lastQuestion = '';
        }

        // ==================== IXL MODULE ====================
        function getAllDocuments() {
            const docs = [document];
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                try { if (iframe.contentDocument) docs.push(iframe.contentDocument); } catch(e) {}
            }
            return docs;
        }

        function normalizeMinus(s) { return s.replace(/[\u2013\u2014\u2212]/g, '-'); }
        function extractNumbers(text) {
            const normalized = normalizeMinus(text);
            return (normalized.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        }

        function getQuestion() {
            const docs = getAllDocuments();
            for (const doc of docs) {
                const sels = [
                    '.question-component .question-text',
                    '.question-component',
                    '.crisp-question',
                    '.skill-practice-question',
                    '.question-text',
                    '.question',
                    '.problem-text',
                    '.passage-text'
                ];
                for (const s of sels) {
                    const el = doc.querySelector(s);
                    if (el && el.textContent.trim()) return el.textContent.replace(/\s+/g,' ').trim();
                }
            }
            return '';
        }

        function getQuestionArea() {
            for (const sel of ['.question-component','.crisp-question','.skill-practice-question','.question-view','.practice-item-root']) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim()) return el;
            }
            return document.body;
        }

        function getAnswerChoices() {
            const area = getQuestionArea();
            const choices = new Set();
            const all = area.querySelectorAll('div, span, p, li, button, label, [role="radio"], input[type="radio"]');
            for (const el of all) {
                if (el.offsetParent === null || el.closest('#ixl-panel') || el.closest('#ixl-loader') || el.closest('#tempest-hub')) continue;
                let text = normalizeMinus((el.innerText || el.textContent || '').trim());
                if (el.tagName === 'INPUT' && el.type === 'radio') text = normalizeMinus(el.value || el.getAttribute('aria-label') || '');
                if (!text || text.length > 200) continue;
                if (text.includes('}{') || text.includes('){')) {
                    const parts = text.split(/(?<=\))(?=\{)|(?<=\})(?=\{)/);
                    for (const part of parts) {
                        const trimmed = part.trim();
                        if (trimmed && /\d/.test(trimmed) && trimmed.length <= 100) choices.add(trimmed);
                    }
                } else {
                    choices.add(text);
                }
            }
            return [...choices];
        }

        function clickByAnswerText(ans) {
            const area = getQuestionArea();
            ans = normalizeMinus(String(ans).trim());
            const ansNums = extractNumbers(ans);
            const all = area.querySelectorAll('div, span, p, li, button, label, [role="radio"], input[type="radio"]');
            for (const el of all) {
                if (el.offsetParent === null || el.closest('#ixl-panel') || el.closest('#ixl-loader') || el.closest('#tempest-hub')) continue;
                let text = normalizeMinus((el.innerText || el.textContent || '').trim());
                if (el.tagName === 'INPUT' && el.type === 'radio') text = normalizeMinus(el.value || el.getAttribute('aria-label') || '');
                if (!text) continue;
                const textNums = extractNumbers(text);
                if (text.replace(/\s+/g,'').toLowerCase() === ans.replace(/\s+/g,'').toLowerCase()) {
                    log(`Exact match: ${text}`);
                    el.click();
                    return true;
                }
                if (ansNums.length > 0 && textNums.length === ansNums.length) {
                    const sortedAns = [...ansNums].sort((a,b)=>a-b);
                    const sortedText = [...textNums].sort((a,b)=>a-b);
                    if (sortedAns.every((v,i) => v === sortedText[i])) {
                        log(`Number set match: ${text}`);
                        el.click();
                        return true;
                    }
                }
            }
            return false;
        }

        function inputDigits(ans) {
            ans = normalizeMinus(String(ans).trim());
            const docs = getAllDocuments();
            for (const doc of docs) {
                const inputs = [...doc.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')]
                    .filter(i => i.offsetParent !== null && !i.closest('#ixl-panel'));
                if (inputs.length > 0) {
                    if (inputs.length === 1) {
                        inputs[0].value = ans.replace(/,/g,'');
                        inputs[0].dispatchEvent(new Event('input',{bubbles:true}));
                        inputs[0].dispatchEvent(new Event('change',{bubbles:true}));
                    } else {
                        const digits = ans.replace(/,/g,'').replace(/[^0-9]/g,'');
                        if (!digits) return false;
                        let str = digits;
                        if (str.length < inputs.length) str = ' '.repeat(inputs.length - str.length) + str;
                        if (str.length > inputs.length) str = str.slice(-inputs.length);
                        for (let i=0;i<inputs.length;i++) {
                            inputs[i].value = str[i] === ' ' ? '' : str[i];
                            inputs[i].dispatchEvent(new Event('input',{bubbles:true}));
                            inputs[i].dispatchEvent(new Event('change',{bubbles:true}));
                        }
                    }
                    return true;
                }
            }
            return false;
        }

        function clickSubmit() {
            const docs = getAllDocuments();
            for (const doc of docs) {
                const btn = doc.querySelector('.submit-button, .check-answer-button, button[type="submit"]');
                if (btn && btn.offsetParent) { btn.click(); return; }
                const buttons = doc.querySelectorAll('button');
                for (const b of buttons) if (b.offsetParent && /submit|check|enter|ok/i.test(b.textContent)) { b.click(); return; }
            }
        }

        function clickNextOrSkip() {
            const docs = getAllDocuments();
            for (const doc of docs) {
                const buttons = doc.querySelectorAll('button, [role="button"], a');
                for (const b of buttons) {
                    if (!b.offsetParent) continue;
                    const text = (b.innerText || b.textContent || b.getAttribute('aria-label') || '').toLowerCase();
                    if (/skip to content|accessibility|jump to/i.test(text)) continue;
                    if (/next|skip|continue|forward|arrow|»|>/.test(text)) {
                        log(`Clicking skip/next: ${text}`);
                        b.click();
                        return true;
                    }
                }
                const iconSelectors = '.icon-next, .icon-skip, .icon-forward, .fa-arrow-right, .fa-chevron-right, .fa-forward';
                const icons = doc.querySelectorAll(iconSelectors);
                for (const icon of icons) {
                    if (icon.offsetParent) {
                        icon.click();
                        log('Clicked icon for next/skip');
                        return true;
                    }
                }
            }
            return false;
        }

        function isVisualQuestion(questionText) {
            return /shown|cube|picture|graph|figure|tens|ones|base[- ]ten|count the/i.test(questionText);
        }

        async function getAIChoiceIndex(question, choices) {
            const prompt = `Question:\n${question}\n\nAnswer choices:\n${choices.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\nOutput ONLY the number of the correct choice (1-based index).`;
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.groq.com/openai/v1/chat/completions',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
                    data: JSON.stringify({ model: MODEL, messages:[{role:'system',content:'You are a knowledgeable assistant. Select the correct answer index.'},{role:'user',content:prompt}], temperature:0.1, max_tokens:10 }),
                    onload: res => {
                        try {
                            const d = JSON.parse(res.responseText);
                            const content = d.choices[0].message.content.trim();
                            const idx = parseInt(content);
                            if (!isNaN(idx) && idx >= 1 && idx <= choices.length) resolve(idx-1);
                            else resolve(-1);
                        } catch(e) { resolve(-1); }
                    },
                    onerror: () => resolve(-1)
                });
            });
        }

        async function getAIAnswer(q) {
            return new Promise(resolve => {
                GM_xmlhttpRequest({
                    method:'POST', url:'https://api.groq.com/openai/v1/chat/completions',
                    headers:{'Content-Type':'application/json','Authorization':'Bearer '+GROQ_API_KEY},
                    data:JSON.stringify({model:MODEL, messages:[{role:'system',content:'Answer with ONLY the final answer, preserving set notation if applicable.'},{role:'user',content:q}], temperature:0.1, max_tokens:150}),
                    onload: res => { try { const d=JSON.parse(res.responseText); resolve(d.choices[0].message.content.trim()); } catch(e){ resolve(null); } },
                    onerror: () => resolve(null)
                });
            });
        }

        async function waitForNetworkAnswer(timeoutMs = 5000) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                if (currentAnswerFromNetwork) return currentAnswerFromNetwork;
                await sleep(200);
            }
            return null;
        }

        async function runIXLLoop() {
            while (running) {
                const q = getQuestion();
                if (!q) { log('No question'); await sleep(2000); continue; }

                if (q !== lastQuestion) {
                    currentAnswerFromNetwork = null;
                    lastQuestion = q;
                    sameQuestionStreak = 0;
                    log('New question, waiting for network answer...');
                    const netAns = await waitForNetworkAnswer(5000);
                    if (netAns) {
                        log('Got network answer: ' + netAns);
                        let answered = false;
                        const choices = getAnswerChoices();
                        if (choices.length > 0) {
                            answered = clickByAnswerText(netAns);
                        } else {
                            answered = inputDigits(netAns);
                        }
                        if (answered) {
                            questionCount++;
                            log('Answered ' + questionCount);
                            await sleep(2500);
                            if (!clickNextOrSkip()) await sleep(1000);
                            continue;
                        }
                    }
                } else {
                    sameQuestionStreak++;
                    if (sameQuestionStreak >= 5) {
                        log('Stuck. Trying skip...');
                        if (!clickNextOrSkip()) await sleep(10000);
                        sameQuestionStreak = 0;
                        continue;
                    }
                }

                log('Question: ' + q.substring(0,80));

                // Fallback: visual cube counting
                if (/cube/i.test(q) && /shown/i.test(q)) {
                    log('Cube counting question detected.');
                    const aiAns = await getAIAnswer(q);
                    if (aiAns && aiAns !== 'SKIP' && inputDigits(aiAns)) {
                        questionCount++;
                        log('AI answered ' + questionCount);
                        await sleep(2500);
                        if (!clickNextOrSkip()) await sleep(1000);
                        continue;
                    }
                    log('Could not solve cube, skipping...');
                    if (clickNextOrSkip()) await sleep(2000);
                    else await sleep(5000);
                    continue;
                }

                // General visual question skip
                if (isVisualQuestion(q)) {
                    log('Visual question detected, skipping...');
                    if (clickNextOrSkip()) await sleep(2000);
                    else await sleep(5000);
                    continue;
                }

                // Fallback to basic math and AI
                let answered = false;
                let ans = solveBasicMath(q);
                if (ans) {
                    const choices = getAnswerChoices();
                    if (choices.length > 0) {
                        answered = clickByAnswerText(ans);
                        if (!answered) {
                            const idx = await getAIChoiceIndex(q, choices);
                            if (idx >= 0) answered = clickByAnswerText(choices[idx]);
                        }
                    } else {
                        answered = inputDigits(ans);
                    }
                } else {
                    const choices = getAnswerChoices();
                    if (choices.length > 0) {
                        const idx = await getAIChoiceIndex(q, choices);
                        if (idx >= 0) answered = clickByAnswerText(choices[idx]);
                        if (!answered) {
                            ans = await getAIAnswer(q);
                            if (ans && ans !== 'SKIP') answered = clickByAnswerText(ans);
                        }
                    } else {
                        ans = await getAIAnswer(q);
                        if (ans && ans !== 'SKIP') answered = inputDigits(ans);
                    }
                }

                if (answered) {
                    questionCount++;
                    log('Answered ' + questionCount);
                    await sleep(2500);
                    if (!clickNextOrSkip()) await sleep(1000);
                } else {
                    log('Could not answer, trying next...');
                    await sleep(2000);
                    clickNextOrSkip();
                }
            }
        }

        function solveBasicMath(q) {
            const m = q.match(/^(Add|Subtract|Multiply|Divide|Evaluate)\.?\s+([\d,]+)\s*([+\-*/])\s*([\d,]+)/i);
            if (!m) return null;
            const a = parseFloat(m[2].replace(/,/g,'')), b = parseFloat(m[4].replace(/,/g,''));
            let r;
            switch(m[3]) { case '+': r=a+b; break; case '-': r=a-b; break; case '*': r=a*b; break; case '/': r=a/b; break; default: return null; }
            return r % 1 === 0 ? r.toString() : r.toFixed(2).replace(/\.?0+$/,'');
        }

        function updateUI() {
            document.getElementById('ixl-toggle').textContent = running ? 'Stop' : 'Start';
            const status = document.getElementById('ixl-status');
            status.textContent = 'Status: ' + (running?'ON':'OFF');
            status.className = running ? 'on' : '';
        }

        document.getElementById('ixl-toggle').addEventListener('click', () => {
            if (!licenseKey) { alert('Activate first.'); return; }
            if (!activeCheat) { alert('Select a cheat from hub first.'); return; }
            running = !running;
            updateUI();
            if (running) {
                log('Started ' + activeCheat);
                runIXLLoop();
            } else {
                log('Stopped');
            }
        });

        function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
        log('Tempest Hub ready. Enter license key.');
    }

    // Wait for DOM ready, then init UI
    if (document.body) {
        initUI();
    } else {
        document.addEventListener('DOMContentLoaded', initUI);
        // fallback if DOMContentLoaded already fired
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            initUI();
        }
    }
})();
