/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MONEY AI — The Council of 10
 * Production-Ready PWA with Gemini AI
 * 
 * @version 2.0.0
 * @author Money AI Team
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  const CONFIG = {
    DB_NAME: 'moneyai_council_v2',
    DB_VERSION: 1,
    SESSION_LIMIT: 12,
    TYPING_DELAY: 800,
    TOAST_DURATION: 2500,
    REEL_DURATION: 8000,
    SCROLL_DELAY: 50,
    
    // API Settings
    USE_REAL_API: true,
    WORKER_URL: 'https://human1stai.rr-rshemodel.workers.dev',
    API_TIMEOUT: 15000
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // THE 10 COUNCIL MEMBERS
  // ═══════════════════════════════════════════════════════════════════════════
  const COUNCIL = [
    { id: 'kareem', name: 'Kareem', role: 'Laziness', status: 'Work less, earn more.', emoji: '😴', accent: '#f59e0b' },
    { id: 'turbo', name: 'Turbo', role: 'Speed', status: 'Results by Friday.', emoji: '⚡', accent: '#22c55e' },
    { id: 'wolf', name: 'Wolf', role: 'Greed', status: 'Leverage & ROI.', emoji: '🐺', accent: '#ef4444' },
    { id: 'luna', name: 'Luna', role: 'Satisfaction', status: 'Quality of life matters.', emoji: '🌙', accent: '#ec4899' },
    { id: 'captain', name: 'Captain', role: 'Security', status: 'Build the fortress first.', emoji: '🛡️', accent: '#3b82f6' },
    { id: 'tempo', name: 'Tempo', role: 'Time Auditor', status: 'You are dying. Calculate.', emoji: '⏱️', accent: '#6366f1' },
    { id: 'hakim', name: 'Hakim', role: 'Wisdom', status: 'Stories hide truth.', emoji: '📖', accent: '#8b5cf6' },
    { id: 'wheat', name: 'Uncle Wheat', role: 'Necessity', status: 'Sell what they need.', emoji: '🌾', accent: '#a3a3a3' },
    { id: 'tommy', name: 'Tommy', role: 'Added Value', status: 'Brand it! Hype it!', emoji: '🍅', accent: '#f43f5e' },
    { id: 'architect', name: 'Architect', role: 'System', status: 'Work ON the system.', emoji: '🏛️', accent: '#fbbf24' }
  ];

  // Single opening line per mentor (no preloaded conversations)
  const OPENER = {
    kareem: "What's draining your energy that we can automate or delete?",
    turbo: "What can you ship in the next 48 hours?",
    wolf: "What's your current ROI on time?",
    luna: "Are you building something that excites you?",
    captain: "How many months of runway do you have?",
    tempo: "How many hours did you waste today?",
    hakim: "Tell me your situation. I have a story for you.",
    wheat: "What are you selling — a need or a want?",
    tommy: "How can we make your offer more exciting?",
    architect: "What system are you trying to build?"
  };

  // Reels Library
  const REELS = {
    kareem: [
      { title: "Being lazy made me rich.", lines: ["I hated repeating work.", "So I built systems."], hook: "LAZY" },
      { title: "Work once. Repeat.", lines: ["Low leverage is expensive.", "High leverage is freedom."], hook: "SCALE" }
    ],
    turbo: [
      { title: "Speed beats perfection.", lines: ["Ship it ugly.", "Fix it later."], hook: "SHIP" },
      { title: "48 hours or nothing.", lines: ["If it takes longer to test,", "your idea is too complex."], hook: "FAST" }
    ],
    wolf: [
      { title: "10x or nothing.", lines: ["Small thinking is expensive.", "Multiply everything."], hook: "10X" },
      { title: "ROI is the only metric.", lines: ["Feelings don't compound.", "Returns do."], hook: "ROI" }
    ],
    luna: [
      { title: "Money without joy is prison.", lines: ["What's the point", "if you hate Mondays?"], hook: "JOY" },
      { title: "Build what excites you.", lines: ["Passion isn't naive.", "It's sustainable."], hook: "LOVE" }
    ],
    captain: [
      { title: "Fortress first.", lines: ["Before any risk,", "secure the base."], hook: "SAFE" },
      { title: "6 months runway.", lines: ["Without safety,", "every decision is desperate."], hook: "BUFFER" }
    ],
    tempo: [
      { title: "You are dying.", lines: ["Every wasted hour", "is gone forever."], hook: "AUDIT" },
      { title: "The Death Cost", lines: ["8 years scrolling.", "Worth it?"], hook: "COST" }
    ],
    hakim: [
      { title: "The Wheat Farmer", lines: ["Same land. Same sun.", "Only one slept well."], hook: "STORY" },
      { title: "Two Hunters", lines: ["One killed. One tied.", "Different futures."], hook: "TALE" }
    ],
    wheat: [
      { title: "Boring is profitable.", lines: ["Nobody dreams of rice.", "Everyone buys rice."], hook: "WHEAT" },
      { title: "Needs > Wants", lines: ["Fancy fails in recession.", "Bread survives."], hook: "NEED" }
    ],
    tommy: [
      { title: "BRAND is everything!", lines: ["Stop being boring!", "Add VALUE!"], hook: "HYPE" },
      { title: "Premium positioning.", lines: ["Same product.", "Gold foil. $50."], hook: "LUXURY" }
    ],
    architect: [
      { title: "Systems > Goals", lines: ["Goals are amateur.", "Systems are pro."], hook: "SYSTEM" },
      { title: "Work ON, not IN.", lines: ["Stop being an employee", "of your own business."], hook: "META" }
    ]
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const state = {
    isLocked: true,
    route: 'home',
    activeChatId: null,
    council: [...COUNCIL],
    threads: new Map(),
    messages: new Map(),
    reels: new Map(),
    prefs: { theme: 'ember', richScore: 25 },
    reads: { reelsRead: {} },
    isSending: false,
    reelTimer: null
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM CACHE
  // ═══════════════════════════════════════════════════════════════════════════
  const $ = sel => document.querySelector(sel);
  const DOM = {};

  function cacheDom() {
    DOM.body = document.body;
    DOM.lockScreen = $('#lockScreen');
    DOM.btnUnlock = $('#btnUnlock');
    DOM.btnUnlockDemo = $('#btnUnlockDemo');
    DOM.app = $('#app');
    DOM.sidebar = $('#sidebar');
    DOM.storiesStrip = $('#storiesStrip');
    DOM.searchInput = $('#searchInput');
    DOM.chatList = $('#chatList');
    DOM.emptyState = $('#emptyState');
    DOM.chatView = $('#chatView');
    DOM.btnStartChat = $('#btnStartChat');
    DOM.btnBack = $('#btnBack');
    DOM.headerAvatar = $('#headerAvatar');
    DOM.headerName = $('#headerName');
    DOM.headerStatus = $('#headerStatus');
    DOM.sessionLimit = $('#sessionLimit');
    DOM.msgCount = $('#msgCount');
    DOM.btnCouncil = $('#btnCouncil');
    DOM.thread = $('#thread');
    DOM.quickActions = $('#quickActions');
    DOM.msgInput = $('#msgInput');
    DOM.btnSend = $('#btnSend');
    DOM.modePill = $('#modePill');
    DOM.modeLabel = $('#modeLabel');
    DOM.rushBar = $('#rushBar');
    DOM.richBar = $('#richBar');
    DOM.rushValue = $('#rushValue');
    DOM.richValue = $('#richValue');
    DOM.focusLabel = $('#focusLabel');
    DOM.focusDesc = $('#focusDesc');
    DOM.statUserMsgs = $('#statUserMsgs');
    DOM.statAiMsgs = $('#statAiMsgs');
    DOM.statActions = $('#statActions');
    DOM.reelViewer = $('#reelViewer');
    DOM.reelProgressBar = $('#reelProgressBar');
    DOM.reelAvatar = $('#reelAvatar');
    DOM.reelAuthor = $('#reelAuthor');
    DOM.reelRole = $('#reelRole');
    DOM.reelTitle = $('#reelTitle');
    DOM.reelLines = $('#reelLines');
    DOM.reelCta = $('#reelCta');
    DOM.reelReplyInput = $('#reelReplyInput');
    DOM.btnCloseReel = $('#btnCloseReel');
    DOM.btnReelSend = $('#btnReelSend');
    DOM.toast = $('#toast');
    DOM.toastText = $('#toastText');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXEDDB
  // ═══════════════════════════════════════════════════════════════════════════
  const DB = {
    db: null,
    
    async open() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          ['messages', 'threads', 'prefs', 'reads'].forEach(name => {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: 'id' });
            }
          });
        };
        req.onsuccess = () => { this.db = req.result; resolve(this.db); };
        req.onerror = () => reject(req.error);
      });
    },
    
    async get(store, key) {
      await this.open();
      return new Promise((res, rej) => {
        const tx = this.db.transaction(store, 'readonly');
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      });
    },
    
    async put(store, val) {
      await this.open();
      return new Promise((res, rej) => {
        const tx = this.db.transaction(store, 'readwrite');
        const r = tx.objectStore(store).put(val);
        r.onsuccess = () => res(true);
        r.onerror = () => rej(r.error);
      });
    },
    
    async all(store) {
      await this.open();
      return new Promise((res, rej) => {
        const tx = this.db.transaction(store, 'readonly');
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
    },
    
    async clear(store) {
      await this.open();
      return new Promise((res, rej) => {
        const tx = this.db.transaction(store, 'readwrite');
        const r = tx.objectStore(store).clear();
        r.onsuccess = () => res(true);
        r.onerror = () => rej(r.error);
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PWA
  // ═══════════════════════════════════════════════════════════════════════════
  function setupPWA() {
    const manifest = {
      name: 'Money AI — The Council',
      short_name: 'Money AI',
      description: 'Rush → Rich coaching with 10 AI mentors',
      start_url: './',
      display: 'standalone',
      background_color: '#0a0c10',
      theme_color: '#0a0c10',
      icons: [{ src: generateIcon(), sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    document.querySelector('#manifestLink')?.setAttribute('href', URL.createObjectURL(blob));
  }

  function generateIcon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#fbbf24"/></linearGradient></defs>
      <rect width="512" height="512" rx="128" fill="#0a0c10"/>
      <text x="256" y="300" text-anchor="middle" font-family="system-ui" font-size="200" font-weight="900" fill="url(#g)">M</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BIOMETRICS
  // ═══════════════════════════════════════════════════════════════════════════
  async function attemptBiometricUnlock() {
    if (!window.PublicKeyCredential) {
      unlockApp();
      return;
    }
    try {
      const challenge = new TextEncoder().encode('moneyai-' + Date.now());
      await navigator.credentials.get({
        publicKey: { challenge, timeout: 60000, userVerification: 'required' }
      });
      unlockApp();
    } catch {
      unlockApp();
    }
  }

  function unlockApp() {
    state.isLocked = false;
    DOM.lockScreen.classList.add('hidden');
    DOM.app.classList.remove('locked');
    showToast('🔓 Council unlocked');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THEME
  // ═══════════════════════════════════════════════════════════════════════════
  function updateTheme() {
    const score = state.prefs.richScore;
    let theme = 'coal';
    if (score >= 80) theme = 'gold';
    else if (score >= 50) theme = 'bronze';
    else if (score >= 25) theme = 'ember';
    DOM.body.setAttribute('data-theme', theme);
    state.prefs.theme = theme;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LAYER
  // ═══════════════════════════════════════════════════════════════════════════
  async function loadData() {
    // Load prefs
    const prefsRows = await DB.all('prefs');
    prefsRows.forEach(r => { state.prefs[r.id] = r.value; });
    if (typeof state.prefs.richScore !== 'number') state.prefs.richScore = 25;
    
    // Load reads
    const readsRows = await DB.all('reads');
    readsRows.forEach(r => { state.reads[r.id] = r.value; });
    if (!state.reads.reelsRead) state.reads.reelsRead = {};
    
    // Load threads
    const threads = await DB.all('threads');
    threads.forEach(t => state.threads.set(t.id, t));
    
    // Load messages
    const messages = await DB.all('messages');
    messages.forEach(m => {
      if (!state.messages.has(m.chatId)) state.messages.set(m.chatId, []);
      state.messages.get(m.chatId).push(m);
    });
    
    // Sort messages
    for (const [, msgs] of state.messages) {
      msgs.sort((a, b) => a.ts - b.ts);
    }
    
    // Initialize threads for new members
    for (const m of state.council) {
      if (!state.threads.has(m.id)) {
        const thread = {
          id: m.id,
          unread: 0,
          lastTs: 0,
          lastPreview: m.status,
          rushScore: 70,
          richScore: 30,
          userMessageCount: 0,
          richActions: 0
        };
        state.threads.set(m.id, thread);
        await DB.put('threads', thread);
      }
      if (!state.messages.has(m.id)) {
        state.messages.set(m.id, []);
      }
    }
    
    updateTheme();
    generateReels();
  }

  async function savePref(id, value) {
    state.prefs[id] = value;
    await DB.put('prefs', { id, value });
  }

  async function saveReads() {
    await DB.put('reads', { id: 'reelsRead', value: state.reads.reelsRead });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REELS
  // ═══════════════════════════════════════════════════════════════════════════
  function generateReels() {
    const today = getDayKey();
    state.reels.clear();

    for (const m of state.council) {
      // Hakim only Tue/Fri
      if (m.id === 'hakim') {
        const dow = new Date().getDay();
        if (dow !== 2 && dow !== 5) continue;
      }

      const lib = REELS[m.id];
      if (!lib?.length) continue;

      const dayNum = parseInt(today.replace(/-/g, ''), 10);
      const content = lib[dayNum % lib.length];

      state.reels.set(`${today}:${m.id}`, {
        id: `${today}:${m.id}`,
        day: today,
        contactId: m.id,
        ...content
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStoriesStrip() {
    const today = getDayKey();
    const todayReels = Array.from(state.reels.values()).filter(r => r.day === today);

    DOM.storiesStrip.innerHTML = todayReels.map(reel => {
      const m = state.council.find(c => c.id === reel.contactId);
      if (!m) return '';
      const isRead = state.reads.reelsRead[today]?.[reel.contactId];

      return `
        <div class="story-item" data-reel="${reel.id}">
          <div class="story-ring ${isRead ? 'read' : ''}">
            <div class="story-avatar" style="background:linear-gradient(135deg,${m.accent},${m.accent}88)">${m.emoji}</div>
          </div>
          <span class="story-name">${m.name}</span>
        </div>
      `;
    }).join('');

    DOM.storiesStrip.querySelectorAll('.story-item').forEach(el => {
      el.onclick = () => openReel(el.dataset.reel);
    });
  }

  function renderChatList() {
    const search = (DOM.searchInput?.value || '').toLowerCase();
    const sorted = [...state.council]
      .filter(m => m.name.toLowerCase().includes(search) || m.role.toLowerCase().includes(search))
      .sort((a, b) => {
        const ta = state.threads.get(a.id);
        const tb = state.threads.get(b.id);
        return (tb?.lastTs || 0) - (ta?.lastTs || 0);
      });

    DOM.chatList.innerHTML = sorted.map(m => {
      const thread = state.threads.get(m.id);
      const isActive = state.activeChatId === m.id;
      const isUnread = (thread?.unread || 0) > 0;

      return `
        <div class="chat-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}" data-chat="${m.id}">
          <div class="chat-avatar" style="background:linear-gradient(135deg,${m.accent},${m.accent}66)">${m.emoji}</div>
          <div class="chat-meta">
            <div class="chat-header">
              <span class="chat-name">${m.name}</span>
              <span class="chat-time">${formatTime(thread?.lastTs)}</span>
            </div>
            <div class="chat-role">${m.role}</div>
            <div class="chat-preview">${truncate(thread?.lastPreview || m.status, 32)}</div>
          </div>
          <div class="chat-badge">${thread?.unread || 0}</div>
        </div>
      `;
    }).join('');

    DOM.chatList.querySelectorAll('.chat-item').forEach(el => {
      el.onclick = () => openChat(el.dataset.chat);
    });
  }

  function renderThread() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const msgs = state.messages.get(chatId) || [];
    const m = state.council.find(c => c.id === chatId);

    DOM.thread.innerHTML = msgs.map(msg => {
      const isIn = msg.dir === 'in';
      const color = m?.accent || '#f59e0b';

      return `
        <div class="message-row ${isIn ? 'in' : 'out'}">
          ${isIn ? `<div class="msg-avatar" style="background:linear-gradient(135deg,${color},${color}66)">${m?.emoji || '🤖'}</div>` : ''}
          <div class="bubble">
            ${msg.tag ? `<div class="bubble-tag" style="background:${color}22;color:${color}">${msg.tag}</div>` : ''}
            <div class="bubble-content">${escapeHtml(msg.text)}</div>
            <div class="bubble-meta">${formatTime(msg.ts)}</div>
            ${msg.chips ? `<div class="bubble-actions">${msg.chips.map(c => `<button class="chip-btn" data-chip="${c.action}">${c.label}</button>`).join('')}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    DOM.thread.querySelectorAll('.chip-btn').forEach(btn => {
      btn.onclick = () => handleChip(btn.dataset.chip);
    });

    scrollToBottom();
  }

  function renderInsights() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const thread = state.threads.get(chatId);
    if (!thread) return;

    const msgs = state.messages.get(chatId) || [];
    const userMsgs = msgs.filter(x => x.dir === 'out');
    const aiMsgs = msgs.filter(x => x.dir === 'in');

    const rush = thread.rushScore || 70;
    const rich = thread.richScore || 30;

    DOM.rushBar.style.width = `${rush}%`;
    DOM.richBar.style.width = `${rich}%`;
    DOM.rushValue.textContent = rush;
    DOM.richValue.textContent = rich;

    const isRich = rich > rush;
    DOM.modePill.className = `mode-pill ${isRich ? 'rich' : 'rush'}`;
    DOM.modeLabel.textContent = isRich ? 'Rich' : 'Rush';

    const focus = classifyFocus(userMsgs);
    updateFocusDisplay(focus);

    DOM.statUserMsgs.textContent = userMsgs.length;
    DOM.statAiMsgs.textContent = aiMsgs.length;
    DOM.statActions.textContent = thread.richActions || 0;

    DOM.msgCount.textContent = thread.userMessageCount || 0;
    const isWarning = (thread.userMessageCount || 0) >= CONFIG.SESSION_LIMIT - 2;
    DOM.sessionLimit.classList.toggle('warning', isWarning);
  }

  function updateFocusDisplay(focus) {
    const data = {
      general: { label: 'General', desc: 'Share your situation for focused advice.' },
      debts: { label: 'Debts', desc: 'Damage control mode activated.' },
      business: { label: 'Business', desc: 'Testing Wheat vs Tomato viability.' },
      jobs: { label: 'Employment', desc: 'Mapping time-for-money exchange.' },
      time: { label: 'Time Audit', desc: 'Finding your wasted hours.' },
      wheat: { label: 'Necessity', desc: 'Testing survival-level value.' }
    };
    const d = data[focus] || data.general;
    DOM.focusLabel.textContent = d.label;
    DOM.focusDesc.textContent = d.desc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL — FIXED
  // ═══════════════════════════════════════════════════════════════════════════
  function scrollToBottom() {
    if (!DOM.thread) return;
    
    // Use requestAnimationFrame for smooth scroll after DOM paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        DOM.thread.scrollTop = DOM.thread.scrollHeight;
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSIFIERS
  // ═══════════════════════════════════════════════════════════════════════════
  function classifyFocus(msgs) {
    if (!msgs.length) return 'general';
    const text = msgs.map(x => x.text).join(' ').toLowerCase();
    if (/debt|bill|loan|owe|rent|payment/i.test(text)) return 'debts';
    if (/business|startup|sell|product|service|customer/i.test(text)) return 'business';
    if (/job|work|salary|boss|career/i.test(text)) return 'jobs';
    if (/time|hour|waste|scroll|schedule/i.test(text)) return 'time';
    if (/wheat|tomato|need|want|essential/i.test(text)) return 'wheat';
    return 'general';
  }

  function calculateDelta(text) {
    let delta = 0;
    if (/worry|panic|stress|stuck|broke|hate|tired/i.test(text)) delta -= 3;
    if (/plan|action|build|sell|create|system|automate/i.test(text)) delta += 5;
    return delta;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API
  // ═══════════════════════════════════════════════════════════════════════════
  async function callAPI(chatId, userText, history = []) {
    if (!CONFIG.USE_REAL_API) {
      return { reply: getMockReply(chatId, userText), focus: 'general', scoreDelta: calculateDelta(userText) };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

    try {
      const res = await fetch(CONFIG.WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentor: chatId,
          message: userText,
          history: history.slice(-6).map(m => ({ role: m.dir === 'out' ? 'user' : 'assistant', text: m.text }))
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`API ${res.status}`);
      }

      const data = await res.json();
      return {
        reply: data.reply || getMockReply(chatId, userText),
        focus: data.focus || 'general',
        scoreDelta: data.scoreDelta || 0
      };
    } catch (err) {
      clearTimeout(timeout);
      console.warn('API fallback:', err.message);
      return { reply: getMockReply(chatId, userText), focus: 'general', scoreDelta: calculateDelta(userText) };
    }
  }

  function getMockReply(chatId, userText) {
    const replies = {
      kareem: "That sounds like too much work.\nWhat's the laziest solution?\n\nAction: Delete one step from your process.",
      turbo: "Stop thinking.\nWhat can you do RIGHT NOW?\n\nAction: Pick one thing and do it in the next 30 minutes.",
      wolf: "What's the ROI?\nHow do we 10x this?\n\nAction: Find the multiplier in your idea.",
      luna: "But do you actually enjoy this?\nWhat's the point if you hate it?\n\nQuestion: What would make this exciting?",
      captain: "Hold on.\nWhat's your runway?\n\nAction: Calculate your emergency fund in months.",
      tempo: "That just cost you 2 minutes.\nAbout $0.75 of life.\n\nAction: Track your hours tomorrow.",
      hakim: "Two farmers. Same field.\nOne grew what people wanted.\nOne grew what they needed.\n\nQuestion: What are you growing?",
      wheat: "Is this a NEED or a WANT?\nBoring wins.\n\nAction: Find the survival-level version.",
      tommy: "This needs more HYPE!\nBrand it better!\n\nAction: Add one premium element.",
      architect: "Stop working IN it.\nWork ON the system.\n\nAction: Document one process this week."
    };
    return replies[chatId] || "Tell me more.\n\nQuestion: What's the ONE thing blocking you?";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGING
  // ═══════════════════════════════════════════════════════════════════════════
  async function sendMessage() {
    if (state.isSending) return;

    const chatId = state.activeChatId;
    if (!chatId) return;

    const text = DOM.msgInput.value.trim();
    if (!text) return;

    const thread = state.threads.get(chatId);
    if ((thread?.userMessageCount || 0) >= CONFIG.SESSION_LIMIT) {
      showToast('⚠️ Session limit reached. Start fresh tomorrow.');
      return;
    }

    state.isSending = true;
    DOM.btnSend.disabled = true;
    DOM.msgInput.value = '';
    autoGrow(DOM.msgInput);

    // Add user message
    await addMessage(chatId, 'out', text);
    
    thread.userMessageCount = (thread.userMessageCount || 0) + 1;
    thread.lastTs = Date.now();
    thread.lastPreview = text;
    await DB.put('threads', thread);

    renderThread();
    renderChatList();
    renderInsights();

    // Show typing
    showTyping();

    // Get AI response
    const history = state.messages.get(chatId) || [];
    const response = await callAPI(chatId, text, history);

    // Delay for natural feel
    const delay = CONFIG.USE_REAL_API ? 100 : CONFIG.TYPING_DELAY;
    
    await new Promise(r => setTimeout(r, delay));
    
    hideTyping();

    const member = state.council.find(c => c.id === chatId);
    await addMessage(chatId, 'in', response.reply, {
      tag: member?.name,
      chips: [
        { action: 'next', label: '→ Next step' },
        { action: 'audit', label: '⏱️ Time Audit' }
      ]
    });

    // Update scores
    if (response.scoreDelta !== 0) {
      thread.richScore = Math.max(0, Math.min(100, (thread.richScore || 30) + response.scoreDelta));
      thread.rushScore = 100 - thread.richScore;
      state.prefs.richScore = Math.max(state.prefs.richScore, thread.richScore);
      updateTheme();
    }

    if (thread.richScore > 50) {
      thread.richActions = (thread.richActions || 0) + 1;
    }

    thread.lastPreview = truncate(response.reply, 32);
    await DB.put('threads', thread);

    state.isSending = false;
    DOM.btnSend.disabled = false;

    renderThread();
    renderChatList();
    renderInsights();
  }

  async function addMessage(chatId, dir, text, opts = {}) {
    const msg = {
      id: `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
      chatId,
      dir,
      text,
      ts: Date.now(),
      ...opts
    };
    await DB.put('messages', msg);
    
    if (!state.messages.has(chatId)) {
      state.messages.set(chatId, []);
    }
    state.messages.get(chatId).push(msg);
    
    return msg;
  }

  function handleChip(action) {
    const prompts = {
      audit: "Do a time audit on my typical day.",
      wheat: "Is my idea wheat or tomatoes?",
      map: "Help me build my Money Map.",
      council: "I want the full Council's opinion.",
      next: "What's my next concrete action?"
    };
    if (prompts[action]) {
      DOM.msgInput.value = prompts[action];
      sendMessage();
    }
  }

  function showTyping() {
    const el = document.createElement('div');
    el.id = 'typing';
    el.className = 'typing-indicator';
    el.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div><span style="color:var(--text-secondary);font-size:12px;margin-left:4px">Thinking...</span>';
    DOM.thread.appendChild(el);
    scrollToBottom();
  }

  function hideTyping() {
    document.getElementById('typing')?.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COUNCIL FEATURE
  // ═══════════════════════════════════════════════════════════════════════════
  async function summonCouncil() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const response = `🏛️ THE COUNCIL SPEAKS:

Kareem: "Too much work. Automate it."
Turbo: "Ship TODAY. Fix later."
Wolf: "What's the 10x play?"
Luna: "Make sure you enjoy it."
Captain: "Build safety first."
Tempo: "Track your death cost."
Wheat: "Is it a NEED?"
Tommy: "Add more hype!"
Architect: "Build the system."

Hakim: "Two farmers. Same field. Only one slept well."

→ Which voice will you follow?`;

    await addMessage(chatId, 'in', response, { tag: 'Council' });
    renderThread();
    showToast('🏛️ Council assembled');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REELS
  // ═══════════════════════════════════════════════════════════════════════════
  function openReel(reelId) {
    const reel = state.reels.get(reelId);
    if (!reel) return;

    const m = state.council.find(c => c.id === reel.contactId);
    if (!m) return;

    state.currentReel = reel;

    DOM.reelAvatar.textContent = m.emoji;
    DOM.reelAvatar.style.background = `linear-gradient(135deg,${m.accent},${m.accent}88)`;
    DOM.reelAuthor.textContent = m.name;
    DOM.reelRole.textContent = m.role;
    DOM.reelTitle.textContent = reel.title;
    DOM.reelLines.innerHTML = reel.lines.map(l => `<p>${l}</p>`).join('');
    DOM.reelCta.textContent = `DM me "${reel.hook}"`;
    DOM.reelReplyInput.value = '';
    DOM.reelReplyInput.placeholder = `Reply "${reel.hook}"...`;

    DOM.reelViewer.classList.add('open');

    // Progress animation
    DOM.reelProgressBar.style.width = '0%';
    clearInterval(state.reelTimer);
    const start = Date.now();
    state.reelTimer = setInterval(() => {
      const p = Math.min((Date.now() - start) / CONFIG.REEL_DURATION, 1);
      DOM.reelProgressBar.style.width = `${p * 100}%`;
      if (p >= 1) clearInterval(state.reelTimer);
    }, 50);

    markReelRead(reel.day, reel.contactId);
  }

  function closeReel() {
    clearInterval(state.reelTimer);
    DOM.reelViewer.classList.remove('open');
    state.currentReel = null;
  }

  async function sendReelReply() {
    const text = DOM.reelReplyInput.value.trim() || state.currentReel?.hook || '';
    if (!text || !state.currentReel) return;

    const chatId = state.currentReel.contactId;
    closeReel();
    openChat(chatId);

    setTimeout(() => {
      DOM.msgInput.value = text;
      sendMessage();
    }, 200);
  }

  function markReelRead(day, contactId) {
    if (!state.reads.reelsRead[day]) state.reads.reelsRead[day] = {};
    state.reads.reelsRead[day][contactId] = true;
    saveReads();
    renderStoriesStrip();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════════
  function setRoute(route) {
    state.route = route;
    DOM.body.setAttribute('data-route', route);

    if (route === 'home') {
      DOM.emptyState.classList.remove('hidden');
      DOM.chatView.classList.add('hidden');
      state.activeChatId = null;
    } else {
      DOM.emptyState.classList.add('hidden');
      DOM.chatView.classList.remove('hidden');
    }
  }

  async function openChat(chatId) {
    state.activeChatId = chatId;
    
    const m = state.council.find(c => c.id === chatId);
    const thread = state.threads.get(chatId);

    if (m) {
      DOM.headerAvatar.textContent = m.emoji;
      DOM.headerAvatar.style.background = `linear-gradient(135deg,${m.accent},${m.accent}88)`;
      DOM.headerName.textContent = m.name;
      DOM.headerStatus.textContent = m.status;
    }

    if (thread) {
      thread.unread = 0;
      await DB.put('threads', thread);
    }

    // If no messages, add the opener
    const msgs = state.messages.get(chatId) || [];
    if (msgs.length === 0 && OPENER[chatId]) {
      await addMessage(chatId, 'in', OPENER[chatId], { tag: m?.name });
      if (thread) {
        thread.lastTs = Date.now();
        thread.lastPreview = OPENER[chatId];
        await DB.put('threads', thread);
      }
    }

    setRoute('chat');
    renderThread();
    renderChatList();
    renderInsights();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  function getDayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  function escapeHtml(text) {
    const el = document.createElement('div');
    el.textContent = text || '';
    return el.innerHTML.replace(/\n/g, '<br>');
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(100, el.scrollHeight) + 'px';
  }

  function showToast(msg) {
    DOM.toastText.textContent = msg;
    DOM.toast.classList.add('visible');
    setTimeout(() => DOM.toast.classList.remove('visible'), CONFIG.TOAST_DURATION);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════════════════════════
  function bindEvents() {
    // Lock screen
    DOM.btnUnlock.onclick = attemptBiometricUnlock;
    DOM.btnUnlockDemo.onclick = unlockApp;

    // Navigation
    DOM.btnBack.onclick = () => setRoute('home');
    DOM.btnStartChat.onclick = () => {
      const firstReel = state.reels.values().next().value;
      if (firstReel) openReel(firstReel.id);
      else if (state.council.length) openChat(state.council[0].id);
    };

    // Search
    DOM.searchInput.oninput = renderChatList;

    // Input
    DOM.msgInput.oninput = () => {
      autoGrow(DOM.msgInput);
      DOM.btnSend.disabled = !DOM.msgInput.value.trim();
    };
    DOM.msgInput.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };
    DOM.btnSend.onclick = sendMessage;

    // Quick actions
    DOM.quickActions.onclick = e => {
      const btn = e.target.closest('.quick-btn');
      if (btn) handleChip(btn.dataset.action);
    };

    // Council
    DOM.btnCouncil.onclick = summonCouncil;

    // Reels
    DOM.btnCloseReel.onclick = closeReel;
    DOM.reelViewer.onclick = e => { if (e.target === DOM.reelViewer) closeReel(); };
    DOM.btnReelSend.onclick = sendReelReply;
    DOM.reelReplyInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); sendReelReply(); } };

    // Keyboard
    window.onkeydown = e => { if (e.key === 'Escape') closeReel(); };

    // Visibility
    document.onvisibilitychange = () => {
      if (!document.hidden) {
        generateReels();
        renderStoriesStrip();
      }
    };

    // Prevent iOS bounce
    document.body.addEventListener('touchmove', e => {
      if (!e.target.closest('.thread, .chat-list, .insights-body, .stories-strip')) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  async function init() {
    try {
      cacheDom();
      setupPWA();
      await DB.open();
      await loadData();
      bindEvents();
      renderStoriesStrip();
      renderChatList();
      setRoute('home');
      console.log('🏛️ Money AI Council v2.0 initialized');
    } catch (err) {
      console.error('Init failed:', err);
      showToast('⚠️ Failed to initialize');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
