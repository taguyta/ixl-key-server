// ==UserScript==
// @name         IXL Auto Answerer
// @namespace    http://tampermonkey.net/
// @version      16.22
// @description  Auto answer IXL with server-validated license key, draggable panel, fixed submit without selection
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
    if (window.__ixlAutoAnswererLoaded) return;
    window.__ixlAutoAnswererLoaded = true;

    const GROQ_API_KEY = "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";
    const MODEL = "groq/compound";
    const SERVER = "https://ixl-key-server.onrender.com";
    const VERSION = "16.22";

    let licenseKey = GM_getValue('license_key', '');
    let running = false;
    let questionCount = 0;
    let sameQuestionStreak = 0;
    let lastQuestion = '';

    GM_addStyle(`
        #ixl-loader { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999998; background: #2c3e50; color: #fff; padding: 20px 30px; border-radius: 10px; font-family: Arial; box-shadow: 0 0 20px rgba(0,0,0,0.5); width: 400px; max-width: 90%; display: flex; align-items: center; gap: 10px; transition: all 0.5s ease; }
        #ixl-loader input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px; font-size: 14px; }
        #ixl-loader button { padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        #ixl-panel { position: fixed; top: 10px; right: 10px; z-index: 999999; background: #2c3e50; color: #fff; padding: 15px; border-radius: 10px; font-family: Arial; width: 320px; box-shadow: 0 0 20px rgba(0,0,0,0.5); display: none; }
        #ixl-panel.show { display: block; }
        #ixl-status { text-align: center; padding: 5px; background: #c0392b; border-radius: 3px; margin-bottom: 8px; font-weight: bold; }
        #ixl-status.on { background: #27ae60; }
        #ixl-toggle { width: 100%; background: #3498db; border: none; color: #fff; padding: 8px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        #ixl-log { background: #34495e; height: 150px; overflow-y: auto; font-size: 12px; padding: 8px; margin-top: 8px; white-space: pre-wrap; }
        #ixl-panel .drag-handle { cursor: move; background: #1a252f; padding: 8px 15px; margin: -15px -15px 10px -15px; border-radius: 10px 10px 0 0; user-select: none; display: flex; align-items: center; justify-content: space-between; touch-action: none; }
        #ixl-panel .drag-handle h3 { margin: 0; color: #3498db; font-size: 16px; }
    `);

    const loader = document.createElement('div');
    loader.id = 'ixl-loader';
    loader.innerHTML = `<input type="text" id="ixl-key" placeholder="Enter License Key"><button id="ixl-activate" type="button">Activate</button>`;
    document.body.appendChild(loader);
    if (licenseKey) document.getElementById('ixl-key').value = licenseKey;

    const panel = document.createElement('div');
    panel.id = 'ixl-panel';
    panel.innerHTML = `
        <div class="drag-handle"><h3>IXL Auto Answerer</h3><span>⠿</span></div>
        <div id="ixl-status">Status: OFF</div>
        <button id="ixl-toggle" type="button">Start</button>
        <div id="ixl-log">Ready.</div>
    `;
    document.body.appendChild(panel);

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

    function log(msg) {
        const d = document.getElementById('ixl-log');
        d.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + msg;
        d.scrollTop = d.scrollHeight;
        console.log('[IXL] ' + msg);
    }

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
            setTimeout(() => { loader.style.display = 'none'; panel.classList.add('show'); log('Activated'); }, 300);
        }
    });

    function solveBasicMath(q) {
        const m = q.match(/^(Add|Subtract|Multiply|Divide|Evaluate)\.?\s+([\d,]+)\s*([+\-*/])\s*([\d,]+)/i);
        if (!m) return null;
        const a = parseFloat(m[2].replace(/,/g,'')), b = parseFloat(m[4].replace(/,/g,''));
        let r;
        switch(m[3]) { case '+': r=a+b; break; case '-': r=a-b; break; case '*': r=a*b; break; case '/': r=a/b; break; default: return null; }
        return r % 1 === 0 ? r.toString() : r.toFixed(2).replace(/\.?0+$/,'');
    }

    function getQuestion() {
        const docs = getAllDocuments();
        for (const doc of docs) {
            const sels = ['.question-component .question-text','.question-component','.crisp-question','.skill-practice-question','.question-text','.question'];
            for (const s of sels) {
                const el = doc.querySelector(s);
                if (el && el.textContent.trim()) return el.textContent.replace(/\s+/g,' ').trim();
            }
        }
        return '';
    }

    function getAllDocuments() {
        const docs = [document];
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                if (iframe.contentDocument) docs.push(iframe.contentDocument);
            } catch(e) {}
        }
        return docs;
    }

    function normalizeMinus(s) {
        return s.replace(/[\u2013\u2014\u2212]/g, '-');
    }

    function extractNumbers(text) {
        const normalized = normalizeMinus(text);
        const matches = normalized.match(/-?\d+(?:\.\d+)?/g);
        return matches ? matches.map(Number) : [];
    }

    function getAnswerChoices() {
        const choices = new Set();
        const docs = getAllDocuments();
        for (const doc of docs) {
            const all = doc.querySelectorAll('div, span, p, li, button, label, [role="radio"], input[type="radio"]');
            for (const el of all) {
                if (el.offsetParent === null || el.closest('#ixl-panel') || el.closest('#ixl-loader')) continue;
                let text = normalizeMinus((el.innerText || el.textContent || '').trim());
                if (el.tagName === 'INPUT' && el.type === 'radio') {
                    text = normalizeMinus(el.value || el.getAttribute('aria-label') || '');
                }
                if (!text || text.length > 200) continue;
                // Split concatenated sets
                if (text.includes('}{') || text.includes('){')) {
                    const parts = text.split(/(?<=\))(?=\{)|(?<=\})(?=\{)/);
                    for (const part of parts) {
                        const trimmed = part.trim();
                        if (trimmed && /\d/.test(trimmed) && trimmed.length <= 100) {
                            choices.add(trimmed);
                        }
                    }
                } else {
                    choices.add(text);
                }
            }
        }
        return [...choices];
    }

    function clickByAnswerText(ans) {
        ans = normalizeMinus(String(ans).trim());
        const ansNums = extractNumbers(ans);
        const docs = getAllDocuments();
        for (const doc of docs) {
            const all = doc.querySelectorAll('div, span, p, li, button, label, [role="radio"], input[type="radio"]');
            for (const el of all) {
                if (el.offsetParent === null || el.closest('#ixl-panel') || el.closest('#ixl-loader')) continue;
                let text = normalizeMinus((el.innerText || el.textContent || '').trim());
                if (el.tagName === 'INPUT' && el.type === 'radio') {
                    text = normalizeMinus(el.value || el.getAttribute('aria-label') || '');
                }
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
                    for (let i=0;i<inputs.length;i++) { inputs[i].value = str[i] === ' ' ? '' : str[i]; inputs[i].dispatchEvent(new Event('input',{bubbles:true})); inputs[i].dispatchEvent(new Event('change',{bubbles:true})); }
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

    function clickNext() {
        const docs = getAllDocuments();
        for (const doc of docs) {
            const next = [...doc.querySelectorAll('button')].find(b => b.offsetParent && /next|continue|ok|close/i.test(b.textContent));
            if (next) { next.click(); return true; }
        }
        return false;
    }

    async function getAIChoiceIndex(question, choices) {
        const prompt = `Question:\n${question}\n\nAnswer choices:\n${choices.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\nOutput ONLY the number of the correct choice (1-based index).`;
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.groq.com/openai/v1/chat/completions',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
                data: JSON.stringify({ model: MODEL, messages:[{role:'system',content:'You are a math assistant. Select the correct answer index.'},{role:'user',content:prompt}], temperature:0.1, max_tokens:10 }),
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

    async function runLoop() {
        while (running) {
            const q = getQuestion();
            if (!q) { log('No question'); await sleep(2000); continue; }
            if (q === lastQuestion) {
                sameQuestionStreak++;
                if (sameQuestionStreak >= 3) { log('Stuck on same question. Stopping.'); running=false; updateUI(); break; }
            } else {
                sameQuestionStreak = 0;
                lastQuestion = q;
            }
            log('Question: ' + q.substring(0,80));

            let answered = false;
            // Basic math first
            let ans = solveBasicMath(q);
            if (ans) {
                // Check if multiple choice or digit input
                const choices = getAnswerChoices();
                if (choices.length > 0) {
                    answered = clickByAnswerText(ans);
                    if (!answered) {
                        // Try AI index if direct math wasn't a choice
                        const idx = await getAIChoiceIndex(q, choices);
                        if (idx >= 0) {
                            answered = clickByAnswerText(choices[idx]);
                        }
                    }
                } else {
                    answered = inputDigits(ans);
                }
            } else {
                // No basic math, use AI
                const choices = getAnswerChoices();
                if (choices.length > 0) {
                    const idx = await getAIChoiceIndex(q, choices);
                    if (idx >= 0) {
                        answered = clickByAnswerText(choices[idx]);
                    }
                    if (!answered) {
                        ans = await getAIAnswer(q);
                        if (ans && ans !== 'SKIP') {
                            answered = clickByAnswerText(ans);
                        }
                    }
                } else {
                    ans = await getAIAnswer(q);
                    if (ans && ans !== 'SKIP') {
                        answered = inputDigits(ans);
                    }
                }
            }

            if (answered) {
                questionCount++;
                log('Answered ' + questionCount);
                await sleep(2500);
                if (!clickNext()) await sleep(1000);
            } else {
                log('Could not answer, trying next...');
                await sleep(2000);
                clickNext();
            }
        }
        log('Stopped.');
    }

    function updateUI() {
        document.getElementById('ixl-toggle').textContent = running ? 'Stop' : 'Start';
        const status = document.getElementById('ixl-status');
        status.textContent = 'Status: ' + (running?'ON':'OFF');
        status.className = running ? 'on' : '';
    }

    document.getElementById('ixl-toggle').addEventListener('click', () => {
        if (!licenseKey) { alert('Activate first.'); return; }
        running = !running;
        updateUI();
        if (running) runLoop();
    });

    function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
    log('Panel ready. Enter license key.');
})();
