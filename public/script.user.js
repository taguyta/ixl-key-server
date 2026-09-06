// ==UserScript==
// @name         IXL Auto Answerer
// @namespace    http://tampermonkey.net/
// @version      16.12
// @description  Auto answer IXL with server-validated license key, loader GUI, groq/compound model, mandatory updates, basic math solver, includes answer options
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
    const DEFAULT_MODEL = "groq/compound";
    const SERVER_URL = "https://ixl-key-server.onrender.com";
    const SECRET = "IXL_CHEAT_SECRET_2024";
    const CURRENT_VERSION = "16.12";

    let autoAnswer = false;
    let licenseKey = GM_getValue('license_key', '');
    let manualQuestionEl = null;
    let lastQuestionTextNormalized = '';
    let updateRequired = false;

    const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

    // Styles (same as before, abbreviated for space)
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
        #ixl-loader input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px; font-size: 14px; }
        #ixl-loader button { padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
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
        #ixl-cheat-panel.show { opacity: 1; transform: scale(1); pointer-events: auto; }
        #ixl-cheat-panel .drag-handle { background: #1a252f; padding: 8px 15px; cursor: move; user-select: none; display: flex; align-items: center; justify-content: space-between; }
        #ixl-cheat-panel .drag-handle h3 { margin: 0; color: #3498db; }
        #ixl-cheat-panel .panel-content { padding: 15px; }
        .ixl-btn { background: #3498db; color: white; border: none; padding: 8px 12px; margin: 3px; cursor: pointer; border-radius: 5px; font-weight: bold; }
        .ixl-btn.stop { background: #e74c3c; }
        #ixl-log { background: #34495e; padding: 8px; height: 180px; overflow-y: auto; font-size: 12px; margin-top: 10px; border-radius: 5px; white-space: pre-wrap; }
        #ixl-status { text-align: center; padding: 5px; border-radius: 3px; background: #c0392b; font-weight: bold; }
        #ixl-status.on { background: #27ae60; }
        #update-banner { background: #e67e22; color: #fff; padding: 8px; text-align: center; font-size: 13px; display: none; cursor: pointer; }
        #update-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000000; display: flex; justify-content: center; align-items: center; font-family: Arial; }
        #update-overlay .box { background: #fff; color: #000; padding: 30px; border-radius: 10px; text-align: center; max-width: 400px; }
        #update-overlay button { margin: 10px; padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
    `);

    function init() {
        // Loader and panel creation (same as before)
        // ... (omitted for brevity, refer to previous script for full DOM building)
        // Note: The full loader/panel creation code is identical; I'll include the essential parts that changed.

        function log(msg) {
            const d = document.getElementById('ixl-log');
            d.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + msg;
            d.scrollTop = d.scrollHeight;
            console.log('[IXL Cheat] ' + msg);
        }

        // ... (license validation, update check, etc. unchanged)

        // ========== IMPROVED QUESTION EXTRACTION WITH ANSWER OPTIONS ==========
        function getQuestionTextFromEl(el) {
            let text = el.innerText || el.textContent || '';
            text = text.replace(/\s+/g, ' ').trim();
            text = text.replace(/(\d)\s+(?=\d)/g, '$1');
            text = text.replace(/\s*,\s*(?=\d{3}(\D|$))/g, ',');
            return text;
        }

        function extractQuestionWithOptions() {
            // Get the main question text (existing logic)
            const questionText = extractQuestionFromDOM();
            if (!questionText) return '';

            // Find all possible answer choices
            const optionSelectors = [
                '.multiple-choice-option',
                '.answer-choice',
                '.choice',
                '.option',
                'label',
                'li[role="radio"]',
                'button[role="radio"]',
                '[data-testid="answer-choice"]',
                '[class*="answer"]',
                '[class*="choice"]',
                '[class*="option"]'
            ];
            let optionsText = [];
            for (const sel of optionSelectors) {
                const nodes = document.querySelectorAll(sel);
                for (const node of nodes) {
                    if (node.offsetParent === null) continue;
                    const text = (node.innerText || node.textContent || '').trim();
                    if (text && !optionsText.includes(text)) {
                        optionsText.push(text);
                    }
                }
            }

            // Also try to catch set choices like { ... } in any visible element near question
            if (optionsText.length === 0) {
                const allEls = document.querySelectorAll('div, span, li, p');
                for (const el of allEls) {
                    if (el.offsetParent === null || el.closest('#ixl-cheat-panel')) continue;
                    const text = (el.innerText || el.textContent || '').trim();
                    if (text.includes('{') && text.length < 200) {
                        optionsText.push(text);
                    }
                }
            }

            let fullPrompt = questionText;
            if (optionsText.length > 0) {
                fullPrompt += '\nAnswer choices:\n' + optionsText.map((opt, i) => `${i+1}. ${opt}`).join('\n');
                fullPrompt += '\nOutput the exact text of the correct choice (or the set as shown).';
            }
            return fullPrompt;
        }

        // The old extractQuestionFromDOM remains, but we'll use the new function in getQuestion.
        function extractQuestionFromDOM() {
            // ... same as before
            // (Include the selectors and scoring logic)
        }

        // Update getQuestion to return the combined text
        function getQuestion() {
            if (manualQuestionEl) {
                const text = getQuestionTextFromEl(manualQuestionEl);
                if (text) { log('Manual question: ' + text.substring(0,100)); return text; }
            }
            const text = extractQuestionWithOptions();
            if (text) { log('Detected with options: ' + text.substring(0,100)); return text; }
            log('No question found.');
            return '';
        }

        // ========== AI REQUEST (prompt adjusted) ==========
        function getAIAnswer(question) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: GROQ_URL,
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
                    data: JSON.stringify({
                        model: DEFAULT_MODEL,
                        messages: [
                            { role: 'system', content: 'You are a math problem solver. The question may include answer choices. If choices are provided, output the exact text of the correct choice, including any set notation. Do not explain. If no choices, output the numerical answer.' },
                            { role: 'user', content: question }
                        ],
                        temperature: 0.1,
                        max_tokens: 200,
                        stop: ["<think>"]
                    }),
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            if (data.error) { log('API Error: ' + data.error.message); reject(new Error(data.error.message)); return; }
                            const raw = data.choices[0].message.content.trim();
                            const clean = cleanAIAnswer(raw);
                            log('Raw AI: ' + raw.substring(0,100));
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

        // ========== INPUT ANSWER (with robust set matching) ==========
        function inputAnswer(answer) {
            if (!answer) return false;
            answer = String(answer).trim();
            log('Attempting to input: ' + answer);

            // Extract numbers if set
            let answerNumbers = null;
            if (answer.includes('{')) {
                answerNumbers = answer.match(/-?\d+/g).map(Number).sort((a,b)=>a-b);
            }

            // Try many selectors
            const selectors = [
                '.multiple-choice-option', '.answer-choice', '.choice', '.option',
                'label', 'li[role="radio"]', 'button[role="radio"]',
                '[class*="answer"]', '[class*="choice"]', '[class*="option"]'
            ];

            // Exact text match
            for (const sel of selectors) {
                const opts = document.querySelectorAll(sel);
                for (const opt of opts) {
                    if (opt.offsetParent === null) continue;
                    const optText = (opt.innerText || opt.textContent || '').trim();
                    if (!optText) continue;
                    if (optText.replace(/\s+/g,'').toLowerCase() === answer.replace(/\s+/g,'').toLowerCase()) {
                        log(`Exact match: ${optText}`);
                        opt.click();
                        setTimeout(() => clickSubmitButton(null), 200);
                        return true;
                    }
                }
            }

            // Set match
            if (answerNumbers) {
                for (const sel of selectors) {
                    const opts = document.querySelectorAll(sel);
                    for (const opt of opts) {
                        if (opt.offsetParent === null) continue;
                        const optText = (opt.innerText || opt.textContent || '').trim();
                        if (!optText || !optText.includes('{')) continue;
                        const optNums = optText.match(/-?\d+/g).map(Number).sort((a,b)=>a-b);
                        if (answerNumbers.length === optNums.length && answerNumbers.every((v,i)=>v===optNums[i])) {
                            log(`Set match: ${optText}`);
                            opt.click();
                            setTimeout(() => clickSubmitButton(null), 200);
                            return true;
                        }
                    }
                }
                // Fallback: any clickable element with those numbers
                const all = document.querySelectorAll('button, label, li, div, span');
                for (const el of all) {
                    if (el.offsetParent === null || el.closest('#ixl-cheat-panel')) continue;
                    const text = (el.innerText || el.textContent || '').trim();
                    if (!text || !text.includes('{')) continue;
                    const nums = text.match(/-?\d+/g).map(Number).sort((a,b)=>a-b);
                    if (answerNumbers.length === nums.length && answerNumbers.every((v,i)=>v===nums[i])) {
                        log(`Fallback set match: ${text}`);
                        el.click();
                        setTimeout(() => clickSubmitButton(null), 200);
                        return true;
                    }
                }
            }

            // Digit boxes fallback (same as before)
            // ...
            return false;
        }

        // ... (rest of functions unchanged)
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
