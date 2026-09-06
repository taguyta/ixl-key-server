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

    // Prevent duplicate instances
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

    // ========== STYLES (same as before, abbreviated) ==========
    GM_addStyle(`...`); // Include full style block from previous answer

    function init() {
        // ... (loader, panel, dragging, etc. – same as v16.9)

        // ========== STRICTER BASIC MATH SOLVER ==========
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

        // ========== IMPROVED MULTIPLE CHOICE MATCHING (for sets) ==========
        function inputAnswer(answer) {
            // ... (same as v16.9, including set matching)
        }

        // ... (rest of code exactly as v16.9, but with solveBasicMath replaced by the above)
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
