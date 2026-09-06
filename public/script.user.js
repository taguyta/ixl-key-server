// ==UserScript==
// @name         IXL Auto Answerer
// @namespace    http://tampermonkey.net/
// @version      16.23
// @description  Auto answer IXL, skip visual questions, restrict to question area
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

    // ... (config same as v16.22)

    // ========== QUESTION AREA SELECTORS ==========
    const QUESTION_AREA_SELECTORS = [
        '.question-component',
        '.crisp-question',
        '.skill-practice-question',
        '.question-view',
        '.practice-item-root'
    ];

    function getQuestionArea() {
        // Find the element that contains the question and answer choices
        for (const sel of QUESTION_AREA_SELECTORS) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) return el;
        }
        return document.body; // fallback (bad)
    }

    // Modify getAnswerChoices to only search within question area
    function getAnswerChoices() {
        const area = getQuestionArea();
        const choices = new Set();
        // Only look inside area, not entire page
        const all = area.querySelectorAll('div, span, p, li, button, label, [role="radio"], input[type="radio"]');
        for (const el of all) {
            if (el.offsetParent === null || el.closest('#ixl-panel') || el.closest('#ixl-loader')) continue;
            let text = normalizeMinus((el.innerText || el.textContent || '').trim());
            if (el.tagName === 'INPUT' && el.type === 'radio') text = normalizeMinus(el.value || el.getAttribute('aria-label') || '');
            if (!text || text.length > 200) continue;
            // Split concatenated sets
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

    // Modify clickByAnswerText to only search within area
    function clickByAnswerText(ans) {
        const area = getQuestionArea();
        ans = normalizeMinus(String(ans).trim());
        const ansNums = extractNumbers(ans);
        const all = area.querySelectorAll('div, span, p, li, button, label, [role="radio"], input[type="radio"]');
        for (const el of all) {
            if (el.offsetParent === null || el.closest('#ixl-panel') || el.closest('#ixl-loader')) continue;
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

    // Add visual question detection and skip
    function isVisualQuestion(questionText) {
        return /shown|cube|picture|graph|figure|tens|ones|base[- ]ten|count the/i.test(questionText);
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

            // Skip visual questions to avoid wrong clicks
            if (isVisualQuestion(q)) {
                log('Visual question detected, skipping.');
                await sleep(2000);
                clickNext();
                continue;
            }

            // ... rest of existing logic (same as v16.22)
        }
    }

    // ... (all other functions unchanged)
})();
