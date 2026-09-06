// ==UserScript==
// @name         IXL Auto Answerer (Loader + Server Key + Auto Update + Arithmetic Solver)
// @namespace    http://tampermonkey.net/
// @version      16.5
// @description  Auto answer IXL with server-validated license key, simplified loader GUI, groq/compound model, mandatory updates, basic math solver
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

    const GROQ_API_KEY = "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";
    const DEFAULT_MODEL = "groq/compound";
    const SERVER_URL = "https://ixl-key-server.onrender.com";
    const SECRET = "IXL_CHEAT_SECRET_2024";
    const CURRENT_VERSION = "16.5";

    let autoAnswer = false;
    let licenseKey = GM_getValue('license_key', '');
    let manualQuestionEl = null;
    let lastQuestionTextNormalized = '';
    let updateRequired = false;

    const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

    // Styles (same as before, plus overlay)
    GM_addStyle(`...`); // (include full style block from previous version 16.4)

    // Loader
    const loader = document.createElement('div');
    loader.id = 'ixl-loader';
    loader.innerHTML = `<input type="text" id="ixl-license-input" placeholder="Enter License Key"><button id="ixl-activate">Activate</button>`;
    document.body.appendChild(loader);

    // Main panel
    const panel = document.createElement('div');
    panel.id = 'ixl-cheat-panel';
    panel.innerHTML = `<div class="drag-handle"><h3>IXL Auto Answerer</h3><span>⠿</span></div><div id="update-banner"></div><div class="panel-content"><div id="ixl-status">Status: OFF</div><button type="button" class="ixl-btn" id="ixl-toggle">Start</button><div id="ixl-log">Ready.</div></div>`;
    document.body.appendChild(panel);

    if (licenseKey) document.getElementById('ixl-license-input').value = licenseKey;

    // Fix activation button: attach event after DOM ready
    document.getElementById('ixl-activate').addEventListener('click', async function() {
        const key = document.getElementById('ixl-license-input').value.trim();
        if (await validateLicenseKey(key, true)) {
            loader.style.opacity = '0';
            setTimeout(() => { loader.style.display = 'none'; panel.classList.add('show'); log('Panel activated. Welcome!'); checkForUpdates(); }, 500);
        }
    });

    // ... (rest of functions: validateLicenseKey, checkForUpdates, getQuestion, inputAnswer, clickSubmit, clickNext, etc.)

    // ========== NEW: Basic arithmetic solver ==========
    function solveBasicMath(questionText) {
        // Remove "Add.", "Subtract.", "Multiply.", "Divide." and commas
        let q = questionText.replace(/\b(Add|Subtract|Multiply|Divide)\.?\s*/gi, '');
        q = q.replace(/,/g, '');
        // Try to match patterns: number operator number
        const match = q.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)/);
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
        // Format nicely: remove trailing .0, keep commas for thousands if needed
        return result % 1 === 0 ? result.toString() : result.toFixed(2).replace(/\.?0+$/, '');
    }

    // Modify getAIAnswer to try basic solver first
    async function getAnswer(question) {
        const basic = solveBasicMath(question);
        if (basic) {
            log('Basic solver result: ' + basic);
            return basic;
        }
        return await getAIAnswer(question); // existing AI call
    }

    // In runLoop, replace getAIAnswer with getAnswer
    // ... existing runLoop uses const answer = await getAnswer(q);

    // ========== Mandatory update overlay (same as v16.4) ==========
    function showUpdateOverlay() { ... }
    async function checkForUpdates() { ... }
    setInterval(checkForUpdates, 5*60*1000);
    // ... all other functions unchanged

    // Start button event
    document.getElementById('ixl-toggle').addEventListener('click', async function() {
        if (!licenseKey) { alert('License key not set.'); return; }
        if (updateRequired) { alert('Please update the script first.'); return; }
        if (!await validateLicenseKey(licenseKey, true)) return;
        autoAnswer = !autoAnswer;
        updateUI();
        if (autoAnswer) { errorCount=0; lastQuestionTextNormalized=''; log('Started'); runLoop(); }
        else log('Stopped.');
    });

    updateUI();
    log('Panel ready.');
})();
