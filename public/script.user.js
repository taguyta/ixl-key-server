// ==UserScript==
// @name         IXL Auto Answerer
// @namespace    http://tampermonkey.net/
// @version      16.10
// @description  Auto answer IXL with server-validated license key, loader GUI, groq/compound model, mandatory updates, basic math solver
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

    // Prevent duplicate instances (fixes pile‑up)
    if (window.__ixlAutoAnswererLoaded) return;
    window.__ixlAutoAnswererLoaded = true;

    const GROQ_API_KEY = "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";
    const DEFAULT_MODEL = "groq/compound";
    const SERVER_URL = "https://ixl-key-server.onrender.com";
    const SECRET = "IXL_CHEAT_SECRET_2024";
    const CURRENT_VERSION = "16.10";

    let autoAnswer = false;
    let licenseKey = GM_getValue('license_key', '');
    let manualQuestionEl = null;
    let lastQuestionTextNormalized = '';
    let updateRequired = false;

    const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

    // ========== STYLES ==========
    GM_addStyle(`
        #ixl-loader {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            z-index: 999998;
            background: #2c3e50; color: #fff;
            padding: 20px 30px; border-radius: 10px;
            font-family: Arial; box-shadow: 0 0 20px rgba(0,0,0,0.5);
            width: 400px; max-width: 90%;
            display: flex; align-items: center; gap: 10px;
            transition: all 0.5s ease;
        }
        #ixl-loader input {
            flex: 1; padding: 10px;
            border: 1px solid #ccc; border-radius: 5px;
            font-size: 14px;
        }
        #ixl-loader button {
            padding: 10px 20px; background: #3498db;
            color: white; border: none; border-radius: 5px;
            cursor: pointer; font-weight: bold;
        }
        #ixl-cheat-panel {
            position: fixed; top: 10px; right: 10px;
            z-index: 999999;
            background: #2c3e50; color: #fff;
            padding: 0; border-radius: 10px;
            font-family: Arial; width: 380px;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
            overflow: hidden;
            opacity: 0; transform: scale(0.8);
            transition: opacity 0.4s ease, transform 0.4s ease;
            pointer-events: none;
        }
        #ixl-cheat-panel.show {
            opacity: 1; transform: scale(1);
            pointer-events: auto;
        }
        #ixl-cheat-panel .drag-handle {
            background: #1a252f; padding: 8px 15px;
            cursor: move; user-select: none;
            display: flex; align-items: center; justify-content: space-between;
        }
        #ixl-cheat-panel .drag-handle h3 { margin: 0; color: #3498db; }
        #ixl-cheat-panel .panel-content { padding: 15px; }
        .ixl-btn { background: #3498db; color: white; border: none;
            padding: 8px 12px; margin: 3px; cursor: pointer;
            border-radius: 5px; font-weight: bold; }
        .ixl-btn.stop { background: #e74c3c; }
        .ixl-row { margin: 8px 0; }
        #ixl-log { background: #34495e; padding: 8px; height: 180px;
            overflow-y: auto; font-size: 12px; margin-top: 10px;
            border-radius: 5px; white-space: pre-wrap; }
        #ixl-status { text-align: center; padding: 5px;
            border-radius: 3px; background: #c0392b; font-weight: bold; }
        #ixl-status.on { background: #27ae60; }
        #update-banner {
            background: #e67e22; color: #fff;
            padding: 8px; text-align: center;
            font-size: 13px; display: none; cursor: pointer;
        }
        #update-overlay {
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 1000000;
            display: flex; justify-content: center; align-items: center;
            font-family: Arial;
        }
        #update-overlay .box {
            background: #fff; color: #000;
            padding: 30px; border-radius: 10px;
            text-align: center; max-width: 400px;
        }
        #update-overlay button {
            margin: 10px; padding: 10px 20px;
            background: #e74c3c; color: white;
            border: none; border-radius: 5px;
            cursor: pointer; font-size: 16px;
        }
    `);

    function init() {
        // ========== LOADER ==========
        const loader = document.createElement('div');
        loader.id = 'ixl-loader';
        loader.innerHTML = `
            <input type="text" id="ixl-license-input" placeholder="Enter License Key">
            <button id="ixl-activate" type="button">Activate</button>
        `;
        document.body.appendChild(loader);

        // ========== MAIN PANEL ==========
        const panel = document.createElement('div');
        panel.id = 'ixl-cheat-panel';
        panel.innerHTML = `
            <div class="drag-handle"><h3>IXL Auto Answerer</h3><span style="cursor:move;font-size:18px;">⠿</span></div>
            <div id="update-banner">Update available – click to install</div>
            <div class="panel-content">
                <div id="ixl-status">Status: OFF</div>
                <div class="ixl-row"><button type="button" class="ixl-btn" id="ixl-toggle">Start</button></div>
                <div id="ixl-log">Ready. Click Start to begin.</div>
            </div>
        `;
        document.body.appendChild(panel);

        // Load saved license key
        if (licenseKey) {
            document.getElementById('ixl-license-input').value = licenseKey;
        }

        // ========== DRAGGING ==========
        const dragHandle = panel.querySelector('.drag-handle');
        let isDragging = false, startX, startY, initialX, initialY;
        dragHandle.addEventListener('mousedown', e => {
            isDragging = true; startX = e.clientX; startY = e.clientY;
            const r = panel.getBoundingClientRect(); initialX = r.left; initialY = r.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            panel.style.left = (initialX + e.clientX - startX) + 'px';
            panel.style.top = (initialY + e.clientY - startY) + 'px';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => isDragging = false);
        dragHandle.addEventListener('dragstart', e => e.preventDefault());

        function log(msg) {
            const d = document.getElementById('ixl-log');
            d.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + msg;
            d.scrollTop = d.scrollHeight;
            console.log('[IXL Cheat] ' + msg);
        }

        async function validateLicenseKey(key, showAlert = false) {
            if (!key) { if (showAlert) alert('Please enter a license key.'); return false; }
            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: `${SERVER_URL}/api/validate-key?key=${encodeURIComponent(key)}`,
                        onload: resolve,
                        onerror: reject,
                        timeout: 10000
                    });
                });
                const data = JSON.parse(response.responseText);
                if (!data.valid) {
                    if (showAlert) alert('License invalid: ' + data.reason);
                    else log('License invalid: ' + data.reason);
                    return false;
                }
                licenseKey = key;
                GM_setValue('license_key', key);
                if (showAlert) log('License OK, remaining: ' + Math.round(data.remainingMs / 60000) + ' min');
                return true;
            } catch (e) {
                console.error(e);
                if (showAlert) alert('Cannot reach server.');
                else log('Cannot reach server.');
                return false;
            }
        }

        // Activation button
        document.getElementById('ixl-activate').addEventListener('click', async function() {
            const key = document.getElementById('ixl-license-input').value.trim();
            if (await validateLicenseKey(key, true)) {
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.style.display = 'none';
                    panel.classList.add('show');
                    log('Panel activated. Welcome!');
                    checkForUpdates();
                }, 500);
            }
        });

        // Update check
        function showUpdateOverlay() {
            if (document.getElementById('update-overlay')) return;
            const overlay = document.createElement('div');
            overlay.id = 'update-overlay';
            overlay.innerHTML = `
                <div class="box">
                    <h2>Update Required</h2>
                    <p>A new version of the IXL Auto Answerer is available. You must update to continue.</p>
                    <button id="update-now-btn">Update Now</button>
                    <button id="reload-after-update-btn">I've Updated – Reload</button>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('update-now-btn').addEventListener('click', function() {
                window.open(`${SERVER_URL}/script.user.js`, '_blank');
                setTimeout(() => location.reload(), 10000);
            });
            document.getElementById('reload-after-update-btn').addEventListener('click', function() {
                location.reload();
            });
        }

        async function checkForUpdates() {
            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: `${SERVER_URL}/script.user.js?nocache=${Date.now()}`,
                        onload: resolve,
                        onerror: reject,
                        timeout: 5000
                    });
                });
                const versionMatch = response.responseText.match(/@version\s+([\d.]+)/);
                if (versionMatch && versionMatch[1] !== CURRENT_VERSION) {
                    updateRequired = true;
                    document.getElementById('ixl-toggle').disabled = true;
                    showUpdateOverlay();
                }
            } catch (e) { console.log('Update check failed:', e); }
        }
        setInterval(checkForUpdates, 5 * 60 * 1000);

        // ========== STRICT ARITHMETIC SOLVER ==========
        function solveBasicMath(questionText) {
            const trimmed = questionText.trim();
            // Only handle if question starts with an operation keyword
            const opMatch = trimmed.match(/^(Add|Subtract|Multiply|Divide|Evaluate)\.?\s+/i);
            if (!opMatch) return null;

            const rest = trimmed.slice(opMatch[0].length).replace(/,/g, '');
            const match = rest.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)/);
            if (!match) return null;

            const num1 = parseFloat(match[1]);
            const op = match[2];
            const num2 = parseFloat(match[3]);
            let result;
            switch (op) {
                case '+': result = num1 + num2; break;
                case '-': result = num1 - num2; break;
                case '*': result = num1 * num2; break;
                case '/': result = num1 / num2; break;
                default: return null;
            }
            return result % 1 === 0 ? result.toString() : result.toFixed(2).replace(/\.?0+$/, '');
        }

        // Question extraction
        function getQuestionTextFromEl(el) {
            let text = el.innerText || el.textContent || '';
            text = text.replace(/\s+/g, ' ').trim();
            text = text.replace(/(\d)\s+(?=\d)/g, '$1');
            text = text.replace(/\s*,\s*(?=\d{3}(\D|$))/g, ',');
            return text;
        }

        function extractQuestionFromDOM() {
            const selectors = [
                '.question-component .question-text',
                '.question-component',
                '.crisp-question',
                '.skill-practice-question',
                '.question-text',
                '.question',
                '.crisp-question-text',
                '.question-container .question'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim()) {
                    const text = getQuestionTextFromEl(el);
                    if (text.length > 10 && text.length < 2000 && !/Play|Seek|video|Created with Snap|Learn with an example|Incomplete answer|You did not finish|SmartScore|Questions answered|Work it out|Not feeling ready|Company|Blog|Help center|User guides|Tell us what you think|Testimonia/i.test(text)) return text;
                }
            }
            const candidates = document.querySelectorAll('div, section, article, p, span, li');
            let best = null, bestScore = 0;
            for (const el of candidates) {
                if (el.closest('#ixl-cheat-panel')) continue;
                const text = getQuestionTextFromEl(el);
                if (text.length < 20 || text.length > 5000) continue;
                if (/Play|Seek|video|Created with Snap|Learn with an example|Incomplete answer|You did not finish|SmartScore|Questions answered|Work it out|Not feeling ready|Company|Blog|Help center|User guides|Tell us what you think|Testimonia/i.test(text)) continue;
                let score = 0;
                if (/[?=+\-*/^%]/.test(text)) score += 50;
                if (/\d/.test(text)) score += 30;
                if (/what|which|solve|find|calculate|simplify|evaluate|add|subtract|multiply|divide|domain|range/i.test(text)) score += 20;
                if (text.length < 500) score += 20;
                if (/question|skill|crisp|problem/i.test(el.className)) score += 100;
                if (score > bestScore) { bestScore = score; best = el; }
            }
            return best ? getQuestionTextFromEl(best) : '';
        }

        function getQuestion() {
            if (manualQuestionEl) {
                const text = getQuestionTextFromEl(manualQuestionEl);
                if (text) { log('Manual question: ' + text.substring(0, 100)); return text; }
            }
            const text = extractQuestionFromDOM();
            if (text) { log('Detected: ' + text.substring(0, 100)); return text; }
            log('No question found.');
            return '';
        }

        // Clean AI answer
        function cleanAIAnswer(raw) {
            let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (!cleaned) {
                const numbers = raw.match(/-?\d[\d,]*(\.\d+)?/g);
                if (numbers) return numbers[numbers.length - 1].replace(/,/g, '');
                return 'SKIP';
            }
            if (/^[\[{].*[\]}]$/.test(cleaned) || cleaned.includes('{')) {
                return cleaned.replace(/\s+/g, ' ').trim();
            }
            if (/^-?\d[\d,]*(\.\d+)?$/.test(cleaned)) return cleaned;
            const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l);
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (/^(=|\b(answer|result|solution)\b)\s*[-+]?\d[\d,]*(\.\d+)?$/i.test(line)) {
                    const m = line.match(/-?\d[\d,]*(\.\d+)?/);
                    if (m) return m[0].replace(/,/g, '');
                }
                if (/^-?\d[\d,]*(\.\d+)?$/.test(line)) return line;
            }
            const nums = cleaned.match(/-?\d[\d,]*(\.\d+)?/g);
            if (nums) return nums[nums.length - 1].replace(/,/g, '');
            return cleaned;
        }

        // Input answer (set matching)
        function inputAnswer(answer) {
            if (!answer) return false;
            answer = String(answer).trim();

            const mcSelectors = ['.multiple-choice-option','.answer-choice','.choice','.option','label','li[role="radio"]','button[role="radio"]'];
            let answerNumbers = null;
            if (answer.startsWith('{')) {
                answerNumbers = answer.match(/-?\d+/g).map(Number).sort((a,b)=>a-b);
            }

            for (const sel of mcSelectors) {
                const options = document.querySelectorAll(sel);
                for (const opt of options) {
                    if (opt.offsetParent === null) continue;
                    const optText = (opt.innerText || opt.textContent || '').trim();
                    const normalizedOpt = optText.replace(/\s+/g, '').toLowerCase();
                    const normalizedAns = answer.replace(/\s+/g, '').toLowerCase();
                    if (normalizedOpt === normalizedAns) {
                        log(`Exact match option: ${optText}`);
                        opt.click();
                        setTimeout(() => clickSubmitButton(null), 200);
                        return true;
                    }
                    if (answerNumbers && optText.includes('{')) {
                        const optNumbers = optText.match(/-?\d+/g).map(Number).sort((a,b)=>a-b);
                        if (answerNumbers.length === optNumbers.length && answerNumbers.every((v,i)=>v===optNumbers[i])) {
                            log(`Set match option: ${optText}`);
                            opt.click();
                            setTimeout(() => clickSubmitButton(null), 200);
                            return true;
                        }
                    }
                }
            }

            const allInputs = [...document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')]
                .filter(inp => inp.offsetParent !== null && !inp.closest('#ixl-cheat-panel'));
            const digitBoxes = allInputs.filter(inp => {
                const maxLen = inp.getAttribute('maxlength');
                return maxLen === '1' || inp.closest('.question-component, .crisp-question, .skill-practice-question');
            });
            log(`Found ${digitBoxes.length} digit box(es)`);
            if (digitBoxes.length === 0) return false;

            const isNegative = answer.startsWith('-');
            const absAnswer = isNegative ? answer.slice(1) : answer;

            if (digitBoxes.length === 1) {
                let valueToSet = answer.replace(/,/g, '');
                digitBoxes[0].value = valueToSet;
                digitBoxes[0].dispatchEvent(new Event('input', { bubbles: true }));
                digitBoxes[0].dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => clickSubmitButton(digitBoxes), 700);
                return true;
            }

            const digits = absAnswer.replace(/,/g, '').replace(/[^0-9]/g, '');
            if (!digits) return false;
            const boxCount = digitBoxes.length;
            let digitStr = digits;
            if (digits.length > boxCount) digitStr = digits.slice(-boxCount);
            else if (digits.length < boxCount) digitStr = ' '.repeat(boxCount - digits.length) + digits;
            for (let i = 0; i < boxCount; i++) {
                digitBoxes[i].value = digitStr[i] === ' ' ? '' : digitStr[i];
                digitBoxes[i].dispatchEvent(new Event('input', { bubbles: true }));
                digitBoxes[i].dispatchEvent(new Event('change', { bubbles: true }));
            }
            setTimeout(() => clickSubmitButton(digitBoxes), 700);
            return true;
        }

        function clickSubmitButton(boxes) {
            const submitSelectors = ['.submit-button','.check-answer-button','button[type="submit"]','input[type="submit"]','button[aria-label="Submit"]','button[aria-label="Check answer"]','.crisp-button','.button-primary','button'];
            for (const sel of submitSelectors) {
                const candidates = document.querySelectorAll(sel);
                for (const btn of candidates) {
                    if (btn.offsetParent) {
                        const text = (btn.textContent || btn.value || '').trim().toLowerCase();
                        if (sel === 'button' && !(text.includes('submit') || text.includes('check') || text.includes('ok') || btn.type === 'submit')) continue;
                        log('Clicking submit: ' + text);
                        btn.click();
                        return true;
                    }
                }
            }
            if (boxes && boxes.length > 0) {
                log('No submit button, pressing Enter on last box.');
                const lastBox = boxes[boxes.length - 1];
                const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
                lastBox.dispatchEvent(event);
                return true;
            }
            log('Submit failed.');
            return false;
        }

        function clickNext() {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.offsetParent) {
                    const text = (btn.textContent || btn.value || '').trim().toLowerCase();
                    if (/next|continue|ok|close/.test(text)) {
                        log('Clicking next: ' + text);
                        btn.click();
                        return true;
                    }
                }
            }
            log('No next button.');
            return false;
        }

        function isComplete() {
            return document.querySelector('.skill-complete, .congratulations, .mastery-achieved, .practice-complete');
        }

        function getAIAnswer(question) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: GROQ_URL,
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
                    data: JSON.stringify({
                        model: DEFAULT_MODEL,
                        messages: [
                            { role: 'system', content: 'You are a math problem solver. Answer the following question with ONLY the final answer, no reasoning. If multiple choice, output the exact text of the correct choice. If the question involves fractions, output the answer as a simplified fraction or whole number. Do not write any steps.' },
                            { role: 'user', content: question }
                        ],
                        temperature: 0.1,
                        max_tokens: 150,
                        stop: ["<think>"]
                    }),
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            if (data.error) { log('API Error: ' + data.error.message); reject(new Error(data.error.message)); return; }
                            const raw = data.choices[0].message.content.trim();
                            const clean = cleanAIAnswer(raw);
                            log('Raw AI: ' + raw.substring(0, 100));
                            log('Cleaned: ' + clean);
                            resolve(clean || 'SKIP');
                        } catch (e) {
                            log('Parse error: ' + e.message);
                            reject(new Error('Failed to parse AI response'));
                        }
                    },
                    onerror: function() { log('Network error'); reject(new Error('Network error')); }
                });
            });
        }

        let questionCount = 0, errorCount = 0;
        const MAX_ERRORS = 5;

        async function runLoop() {
            while (autoAnswer && questionCount < 100 && errorCount < MAX_ERRORS) {
                if (questionCount % 30 === 0) {
                    const valid = await validateLicenseKey(licenseKey, false);
                    if (!valid) { log('License no longer valid. Stopping.'); autoAnswer = false; updateUI(); break; }
                }
                if (isComplete()) { log('Skill complete!'); break; }
                const currentUrl = window.location.href;
                const q = getQuestion();
                if (!q) { log('No question found. Waiting...'); await sleep(2000); continue; }

                const normalizedQ = q.replace(/[,\s]+/g, '').toLowerCase();
                if (normalizedQ === lastQuestionTextNormalized) {
                    log('Same question, trying next.');
                    if (clickNext()) { await sleep(2000); continue; }
                    else { await sleep(3000); continue; }
                }
                lastQuestionTextNormalized = normalizedQ;

                try {
                    const basicAnswer = solveBasicMath(q);
                    let answer = basicAnswer;
                    if (!answer) {
                        answer = await getAIAnswer(q);
                    } else {
                        log('Basic solver: ' + answer);
                    }
                    if (answer && answer !== 'SKIP') {
                        const answered = inputAnswer(answer);
                        if (answered) {
                            questionCount++; log('Answered ' + questionCount); errorCount = 0;
                            await sleep(2500);
                            if (!clickNext()) {
                                await sleep(2000);
                                clickNext();
                            }
                        } else { log('Could not input answer. Skipping next.'); await sleep(2000); clickNext(); }
                    } else { log('AI empty/SKIP. Skipping next.'); await sleep(2000); clickNext(); }
                } catch (err) {
                    errorCount++;
                    log('Error: ' + err.message);
                    if (err.message.includes('Rate limit')) { log('Rate limit, wait 10s.'); await sleep(10000); }
                    else await sleep(2000);
                    if (errorCount >= MAX_ERRORS) { log('Too many errors, stopping.'); break; }
                }
                if (window.location.href !== currentUrl) {
                    log('Page navigated.');
                    autoAnswer = false; updateUI(); break;
                }
                manualQuestionEl = null;
            }
            autoAnswer = false; updateUI(); log('Stopped.');
        }

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
        function updateUI() {
            const toggleBtn = document.getElementById('ixl-toggle');
            const statusDiv = document.getElementById('ixl-status');
            toggleBtn.textContent = autoAnswer ? 'Stop' : 'Start';
            toggleBtn.className = 'ixl-btn' + (autoAnswer ? ' stop' : '');
            statusDiv.textContent = 'Status: ' + (autoAnswer ? 'ON' : 'OFF');
            statusDiv.className = autoAnswer ? 'on' : '';
        }

        document.getElementById('ixl-toggle').addEventListener('click', async function() {
            if (!licenseKey) { alert('License key not set.'); return; }
            if (updateRequired) { alert('Please update first.'); return; }
            if (!await validateLicenseKey(licenseKey, true)) return;
            autoAnswer = !autoAnswer;
            updateUI();
            if (autoAnswer) {
                errorCount = 0;
                lastQuestionTextNormalized = '';
                log('Started with model: ' + DEFAULT_MODEL);
                runLoop();
            } else log('Stopped.');
        });

        updateUI();
        log('Panel ready.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
