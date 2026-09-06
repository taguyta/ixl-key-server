// ==UserScript==
// @name         IXL Auto Answerer (Server Key + Auto Update)
// @namespace    http://tampermonkey.net/
// @version      15.4
// @description  Auto answer IXL with server-validated license key, draggable, auto-update, improved next
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

    const SERVER_URL = "https://ixl-key-server.onrender.com";
    const SECRET = "IXL_CHEAT_SECRET_2024";

    let autoAnswer = false;
    let apiKey = GM_getValue('groq_api_key', '');
    let model = GM_getValue('groq_model', '');
    let licenseKey = GM_getValue('license_key', '');
    let manualQuestionEl = null;
    let lastQuestionText = '';

    const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

    // ... (styling same as before, but I'll include the key changed parts for brevity)

    GM_addStyle(`
        #ixl-cheat-panel {
            position: fixed; top: 10px; right: 10px; z-index: 999999;
            background: #2c3e50; color: #fff; padding: 0;
            border-radius: 10px; font-family: Arial; width: 380px;
            box-shadow: 0 0 20px rgba(0,0,0,0.5); overflow: hidden;
        }
        #ixl-cheat-panel .drag-handle {
            background: #1a252f; padding: 8px 15px; cursor: move;
            user-select: none; display: flex; align-items: center; justify-content: space-between;
        }
        #ixl-cheat-panel .drag-handle h3 { margin: 0; color: #3498db; }
        #ixl-cheat-panel .panel-content { padding: 15px; }
        .ixl-btn { background: #3498db; color: white; border: none; padding: 8px 12px;
            margin: 3px; cursor: pointer; border-radius: 5px; font-weight: bold; }
        .ixl-btn.stop { background: #e74c3c; }
        .ixl-row { margin: 8px 0; }
        .ixl-row label { display: inline-block; width: 110px; font-weight: bold; }
        .ixl-row input, .ixl-row select { padding: 5px; border-radius: 3px; border: 1px solid #ccc; width: 180px; }
        #ixl-log { background: #34495e; padding: 8px; height: 180px; overflow-y: auto;
            font-size: 12px; margin-top: 10px; border-radius: 5px; white-space: pre-wrap; }
        #ixl-status { text-align: center; padding: 5px; border-radius: 3px;
            background: #c0392b; font-weight: bold; }
        #ixl-status.on { background: #27ae60; }
    `);

    const panel = document.createElement('div');
    panel.id = 'ixl-cheat-panel';
    panel.innerHTML = `
        <div class="drag-handle"><h3>IXL Auto Answerer</h3><span style="cursor:move;font-size:18px;">⠿</span></div>
        <div class="panel-content">
            <div id="ixl-status">Status: OFF</div>
            <div class="ixl-row"><button type="button" class="ixl-btn" id="ixl-toggle">Start</button></div>
            <div class="ixl-row"><label>Groq API Key:</label><input type="password" id="ixl-apikey" placeholder="gsk_..."></div>
            <div class="ixl-row"><button type="button" class="ixl-btn" id="ixl-refresh-models">Refresh Models</button></div>
            <div class="ixl-row"><label>Model:</label><select id="ixl-model"><option value="">-- Select Model --</option></select></div>
            <div class="ixl-row"><button type="button" class="ixl-btn" id="ixl-auto-model">Auto-Pick LLM</button></div>
            <div class="ixl-row"><button type="button" class="ixl-btn" id="ixl-pick-question">Pick Question</button></div>
            <div class="ixl-row"><button type="button" class="ixl-btn" id="ixl-test-question">Test Question Detection</button></div>
            <div class="ixl-row"><label>License Key:</label><input type="text" id="ixl-license" placeholder="Paste key here"></div>
            <div class="ixl-row"><button type="button" class="ixl-btn" id="ixl-save">Save Settings</button></div>
            <div id="ixl-log">Ready. Enter license key, Groq key, refresh models, then Start.</div>
        </div>
    `;
    document.body.appendChild(panel);

    if (apiKey) { document.getElementById('ixl-apikey').value = apiKey; log('Loaded Groq key.'); }
    if (model) { document.getElementById('ixl-model').innerHTML = `<option value="${model}">${model}</option>`; }
    if (licenseKey) { document.getElementById('ixl-license').value = licenseKey; log('Loaded license key.'); }

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
                    onerror: reject
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
            if (showAlert) alert('Cannot reach server.');
            else log('Cannot reach server.');
            return false;
        }
    }

    function getQuestionTextFromEl(el) {
        let text = el.innerText || el.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        text = text.replace(/(\d)\s+(?=\d)/g, '$1');
        text = text.replace(/\s*,\s*(?=\d{3}(\D|$))/g, ',');
        return text;
    }

    function extractQuestionFromDOM() {
        const specificSelectors = [
            '.question-component .question-text',
            '.question-component',
            '.crisp-question',
            '.skill-practice-question',
            '.question-text',
            '.question'
        ];
        for (const sel of specificSelectors) {
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
            if (/what|which|solve|find|calculate|simplify|evaluate|add|subtract|multiply|divide/i.test(text)) score += 20;
            if (text.length < 500) score += 20;
            if (/question|skill|crisp|problem/i.test(el.className)) score += 100;
            if (score > bestScore) { bestScore = score; best = el; }
        }
        return best ? getQuestionTextFromEl(best) : '';
    }

    function getQuestion() {
        if (manualQuestionEl) {
            const text = getQuestionTextFromEl(manualQuestionEl);
            if (text) { log('Using manually picked element: ' + text.substring(0, 100)); return text; }
        }
        const text = extractQuestionFromDOM();
        if (text) { log('Auto-detected: ' + text.substring(0, 100)); return text; }
        log('No question found. Use Pick Question or Test Detection.');
        return '';
    }

    function cleanAIAnswer(raw) {
        let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!cleaned) {
            const numbers = raw.match(/-?\d[\d,]*(\.\d+)?/g);
            if (numbers) return numbers[numbers.length - 1].replace(/,/g, '');
            return 'SKIP';
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
        return 'SKIP';
    }

    function inputAnswer(answer) {
        if (!answer) return false;
        answer = String(answer).trim();
        const isNegative = answer.startsWith('-');
        const absAnswer = isNegative ? answer.slice(1) : answer;
        const allInputs = [...document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')]
            .filter(inp => inp.offsetParent !== null && !inp.closest('#ixl-cheat-panel'));
        const digitBoxes = allInputs.filter(inp => {
            const maxLen = inp.getAttribute('maxlength');
            return maxLen === '1' || inp.closest('.question-component, .crisp-question, .skill-practice-question');
        });
        log(`Found ${digitBoxes.length} digit box(es)`);
        if (digitBoxes.length === 0) return false;

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
        else if (digits.length < boxCount) digitStr = digits.padStart(boxCount, '0');
        log(`Filling ${boxCount} boxes with: ${digitStr}`);
        for (let i = 0; i < boxCount; i++) {
            digitBoxes[i].value = digitStr[i];
            digitBoxes[i].dispatchEvent(new Event('input', { bubbles: true }));
            digitBoxes[i].dispatchEvent(new Event('change', { bubbles: true }));
        }
        setTimeout(() => clickSubmitButton(digitBoxes), 700);
        return true;
    }

    function clickSubmitButton(boxes) {
        const submitSelectors = ['.submit-button', '.check-answer-button', 'button[type="submit"]', 'input[type="submit"]',
            'button[aria-label="Submit"]', 'button[aria-label="Check answer"]', '.crisp-button', '.button-primary', 'button'];
        for (const sel of submitSelectors) {
            const candidates = document.querySelectorAll(sel);
            for (const btn of candidates) {
                if (btn.offsetParent) {
                    const text = (btn.textContent || btn.value || '').trim().toLowerCase();
                    if (sel === 'button' && !(text.includes('submit') || text.includes('check') || text.includes('ok') || btn.type === 'submit')) continue;
                    log('Clicking submit: <' + btn.tagName + '> text="' + text + '"');
                    btn.click();
                    return true;
                }
            }
        }
        if (boxes && boxes.length > 0) {
            log('No submit button found, pressing Enter on last box.');
            const lastBox = boxes[boxes.length - 1];
            const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
            lastBox.dispatchEvent(event);
            return true;
        }
        log('Submit failed: no button and no boxes.');
        return false;
    }

    function clickNext() {
        const nextSelectors = [
            '.next-button', '.continue-button', '.btn-next', '.btn-continue',
            'button[aria-label="Next"]', 'button[aria-label="Continue"]',
            'button:contains("Next")', 'button:contains("Continue")'
        ];
        for (const sel of nextSelectors) {
            const btn = document.querySelector(sel);
            if (btn && btn.offsetParent) {
                const text = btn.textContent.trim().toLowerCase();
                if (text.includes('next') || text.includes('continue') || text.includes('ok') || text.includes('close')) {
                    log('Clicking next: ' + text);
                    btn.click();
                    return true;
                }
            }
        }
        // Try to find any visible button that looks like next/continue
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.offsetParent && /next|continue|ok|close/i.test(btn.textContent)) {
                log('Fallback next: ' + btn.textContent);
                btn.click();
                return true;
            }
        }
        log('No next button found.');
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
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                data: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: 'You are a math problem solver. Answer the following question with ONLY the final answer, no reasoning or chain-of-thought. Do not use any think tags. For math, output just the numerical answer (commas allowed). If multiple choice, output the exact choice text. If the question involves fractions, output the answer as a simplified fraction or whole number. Do not write any steps or explanations.' },
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
                const valid = await validateLicenseKey(document.getElementById('ixl-license').value.trim());
                if (!valid) { log('License no longer valid. Stopping.'); autoAnswer = false; updateUI(); break; }
            }
            if (isComplete()) { log('Skill complete!'); break; }
            const currentUrl = window.location.href;
            const q = getQuestion();
            if (!q) { log('No question found. Waiting...'); await sleep(2000); continue; }

            // If same question as last time, try clicking next again
            if (q === lastQuestionText) {
                log('Same question as before, trying next button again.');
                if (clickNext()) {
                    await sleep(1500);
                    continue;
                } else {
                    log('Next button not found, waiting...');
                    await sleep(2000);
                    continue;
                }
            }

            lastQuestionText = q;

            try {
                const answer = await getAIAnswer(q);
                if (answer && answer !== 'SKIP') {
                    const answered = inputAnswer(answer);
                    if (answered) {
                        questionCount++;
                        log('Answered ' + questionCount);
                        errorCount = 0;
                        await sleep(2000);
                        if (!clickNext()) {
                            log('Next button not clicked, will retry after delay.');
                        }
                        await sleep(1500);
                    } else {
                        log('Could not input answer. Skipping next.');
                        await sleep(2000);
                    }
                } else {
                    log('AI returned empty/SKIP. Skipping next.');
                    await sleep(2000);
                }
            } catch (err) {
                errorCount++;
                log('Error: ' + err.message);
                if (errorCount >= MAX_ERRORS) { log('Too many errors, stopping.'); break; }
                await sleep(2000);
            }
            if (window.location.href !== currentUrl) {
                log('WARNING: Page navigated to ' + window.location.href);
                autoAnswer = false; updateUI(); break;
            }

            // Clear manual question element to avoid stale reference
            manualQuestionEl = null;
        }
        autoAnswer = false; updateUI(); log('Stopped.');
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function updateUI() {
        const toggleBtn = document.getElementById('ixl-toggle'); const statusDiv = document.getElementById('ixl-status');
        toggleBtn.textContent = autoAnswer ? 'Stop' : 'Start';
        toggleBtn.className = 'ixl-btn' + (autoAnswer ? ' stop' : '');
        statusDiv.textContent = 'Status: ' + (autoAnswer ? 'ON' : 'OFF');
        statusDiv.className = autoAnswer ? 'on' : '';
    }

    document.getElementById('ixl-toggle').addEventListener('click', async function() {
        const key = document.getElementById('ixl-license').value.trim();
        if (!await validateLicenseKey(key, true)) return;
        apiKey = document.getElementById('ixl-apikey').value.trim() || apiKey;
        model = document.getElementById('ixl-model').value;
        if (!apiKey) { alert('Enter Groq API key first.'); return; }
        if (!model) { alert('Select a model first (use Refresh Models and Auto-Pick).'); return; }
        autoAnswer = !autoAnswer; updateUI();
        if (autoAnswer) { errorCount = 0; lastQuestionText = ''; log('Started with model: ' + model); runLoop(); }
        else log('Stopped.');
    });

    document.getElementById('ixl-refresh-models').addEventListener('click', refreshModels);
    document.getElementById('ixl-auto-model').addEventListener('click', autoPickModel);
    document.getElementById('ixl-pick-question').addEventListener('click', pickQuestion);
    document.getElementById('ixl-test-question').addEventListener('click', function() {
        const q = extractQuestionFromDOM();
        if (q) alert('Detected question:\n\n' + q.substring(0, 200)); else alert('No question detected.');
    });
    document.getElementById('ixl-save').addEventListener('click', function() {
        apiKey = document.getElementById('ixl-apikey').value.trim();
        model = document.getElementById('ixl-model').value;
        licenseKey = document.getElementById('ixl-license').value.trim();
        GM_setValue('groq_api_key', apiKey);
        GM_setValue('groq_model', model);
        GM_setValue('license_key', licenseKey);
        log('Settings saved.');
    });

    function refreshModels() {
        const key = document.getElementById('ixl-apikey').value.trim();
        if (!key) { alert('Enter Groq API key first.'); return; }
        log('Fetching model list...');
        GM_xmlhttpRequest({
            method: 'GET', url: GROQ_MODELS_URL, headers: { 'Authorization': 'Bearer ' + key },
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.error) { log('API Error: ' + data.error.message); return; }
                    const models = data.data.map(m => m.id).sort();
                    const select = document.getElementById('ixl-model');
                    select.innerHTML = '<option value="">-- Select Model --</option>' + models.map(m => `<option value="${m}">${m}</option>`).join('');
                    log(`Loaded ${models.length} models.`);
                    const saved = GM_getValue('groq_model', '');
                    if (saved && models.includes(saved)) select.value = saved;
                } catch (e) { log('Parse error: ' + e.message); }
            },
            onerror: function() { log('Network error fetching model list'); }
        });
    }

    function autoPickModel() {
        const select = document.getElementById('ixl-model');
        const options = [...select.options].filter(o => o.value);
        const goodPattern = /(llama|qwen|deepseek|mixtral|gemma|mistral|instruct|chat|completion)/i;
        const badPattern = /(prompt-guard|compound|allam|canopy|arabic|vision|embed|moderation|whisper|tts|audio|transcription|openai\/gpt-oss|qwen3\.6)/i;
        const preferred = options.find(o => goodPattern.test(o.value) && !badPattern.test(o.value));
        if (preferred) { select.value = preferred.value; log('Auto-picked: ' + preferred.value); }
        else {
            const fallback = options.find(o => !badPattern.test(o.value));
            if (fallback) { select.value = fallback.value; log('Fallback: ' + fallback.value); }
            else if (options.length) { select.value = options[0].value; log('Picked first: ' + options[0].value); }
            else log('No models. Refresh first.');
        }
    }

    let picking = false;
    function pickQuestion() {
        picking = true; log('Pick mode: click directly on the question text (not the panel).'); document.body.style.cursor = 'crosshair';
        document.addEventListener('click', function handler(e) {
            if (!picking) return;
            e.preventDefault(); e.stopPropagation(); picking = false; document.body.style.cursor = '';
            if (e.target.closest('#ixl-cheat-panel')) { log('Clicked on panel, ignored. Try again and click the question text.'); document.removeEventListener('click', handler); return; }
            manualQuestionEl = e.target;
            log('Selected element: ' + e.target.tagName + ' class=' + e.target.className);
            const text = getQuestionTextFromEl(manualQuestionEl);
            log('Extracted: ' + text.substring(0, 100));
            document.removeEventListener('click', handler);
        }, { once: true });
    }

    updateUI();
    log('Panel ready. Enter license key, Groq API key, refresh models, then Start.');
})();
