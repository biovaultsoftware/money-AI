/**
 * Money AI – The Council of 10
 * Production-Ready PWA v2.0
 * - WhatsApp-style auto-advancing reels
 * - Light/Dark mode toggle
 * - Improved responsiveness
 */
(function() {
  'use strict';

  const CONFIG = {
    DB_NAME: 'moneyai_v3',
    DB_VERSION: 1,
    SESSION_LIMIT: 12,
    TYPING_DELAY: 600,
    TOAST_DURATION: 2500,
    REEL_DURATION: 6000, // 6 seconds per reel
    USE_REAL_API: true,
    WORKER_URL: 'https://human1stai.rr-rshemodel.workers.dev',
    API_TIMEOUT: 15000
  };

  // The 10 Council Members
  const COUNCIL = [
    { id: 'kareem', name: 'Kareem', role: 'Laziness', status: 'Work less, earn more.', emoji: '😴', accent: '#f59e0b' },
    { id: 'turbo', name: 'Turbo', role: 'Speed', status: 'Results by Friday.', emoji: '⚡', accent: '#22c55e' },
    { id: 'wolf', name: 'Wolf', role: 'Greed', status: 'Leverage & ROI.', emoji: '🺺', accent: '#ef4444' },
    { id: 'luna', name: 'Luna', role: 'Satisfaction', status: 'Quality of life matters.', emoji: '🌙', accent: '#ec4899' },
    { id: 'captain', name: 'Captain', role: 'Security', status: 'Build the fortress first.', emoji: '🛡️', accent: '#3b82f6' },
    { id: 'tempo', name: 'Tempo', role: 'Time Auditor', status: 'You are dying. Calculate.', emoji: '⏱️', accent: '#6366f1' },
    { id: 'hakim', name: 'Hakim', role: 'Wisdom', status: 'Stories hide truth.', emoji: '📖', accent: '#8b5cf6' },
    { id: 'wheat', name: 'Uncle Wheat', role: 'Necessity', status: 'Sell what they need.', emoji: '🌾', accent: '#a3a3a3' },
    { id: 'tommy', name: 'Tommy', role: 'Added Value', status: 'Brand it! Hype it!', emoji: '🍅', accent: '#f43f5e' },
    { id: 'architect', name: 'Architect', role: 'System', status: 'Work ON the system.', emoji: '🏛️', accent: '#fbbf24' }
  ];

  // Single opener per mentor
  const OPENER = {
    kareem: "What's draining your energy that we can automate or delete?",
    turbo: "What can you ship in the next 48 hours?",
    wolf: "What's your current ROI on time?",
    luna: "Are you building something that excites you?",
    captain: "How many months of runway do you have?",
    tempo: "How many hours did you waste today?",
    hakim: "Tell me your situation. I have a story for you.",
    wheat: "What are you selling – a need or a want?",
    tommy: "How can we make your offer more exciting?",
    architect: "What system are you trying to build?"
  };

  // Reels Library - Multiple reels per mentor
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

  // State
  const state = {
    isLocked: true,
    route: 'home',
    activeChatId: null,
    threads: new Map(),
    messages: new Map(),
    reels: new Map(),
    todayReelsList: [], // Flat array of today's reels for WhatsApp-style navigation
    currentReelIndex: 0,
    prefs: { theme: 'ember', richScore: 25, mode: 'dark' },
    reads: { reelsRead: {} },
    isSending: false,
    reelTimer: null,
    reelProgress: 0,
    reelAnimationFrame: null,
    insightsOpen: false
  };

  // DOM Cache
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
    DOM.chatHeader = $('#chatHeader');
    DOM.thread = $('#thread');
    DOM.composer = $('#composer');
    DOM.btnStartChat = $('#btnStartChat');
    DOM.btnBack = $('#btnBack');
    DOM.headerAvatar = $('#headerAvatar');
    DOM.headerName = $('#headerName');
    DOM.headerStatus = $('#headerStatus');
    DOM.sessionLimit = $('#sessionLimit');
    DOM.msgCount = $('#msgCount');
    DOM.btnCouncil = $('#btnCouncil');
    DOM.btnInsights = $('#btnInsights');
    DOM.quickActions = $('#quickActions');
    DOM.msgInput = $('#msgInput');
    DOM.btnSend = $('#btnSend');
    DOM.insightsPanel = $('#insightsPanel');
    DOM.insightsOverlay = $('#insightsOverlay');
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
    DOM.reelProgressContainer = $('#reelProgressContainer');
    DOM.reelAvatar = $('#reelAvatar');
    DOM.reelAuthor = $('#reelAuthor');
    DOM.reelRole = $('#reelRole');
    DOM.reelTitle = $('#reelTitle');
    DOM.reelLines = $('#reelLines');
    DOM.reelCta = $('#reelCta');
    DOM.reelReplyInput = $('#reelReplyInput');
    DOM.btnCloseReel = $('#btnCloseReel');
    DOM.btnReelSend = $('#btnReelSend');
    DOM.reelTapPrev = $('#reelTapPrev');
    DOM.reelTapNext = $('#reelTapNext');
    DOM.themeToggle = $('#themeToggle');
    DOM.toast = $('#toast');
    DOM.toastText = $('#toastText');
  }

  // IndexedDB
  const DB = {
    db: null,
    async open() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          ['messages', 'threads', 'prefs', 'reads'].forEach(name => {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
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
    }
  };

  // Biometrics
  async function attemptBiometricUnlock() {
    if (!window.PublicKeyCredential) { unlockApp(); return; }
    try {
      const challenge = new TextEncoder().encode('moneyai-' + Date.now());
      await navigator.credentials.get({ publicKey: { challenge, timeout: 60000, userVerification: 'required' } });
      unlockApp();
    } catch { unlockApp(); }
  }

  function unlockApp() {
    state.isLocked = false;
    DOM.lockScreen.classList.add('hidden');
    DOM.app.classList.remove('locked');
    showToast('🔓 Council unlocked');
  }

  // Theme Management
  function updateProgressionTheme() {
    const score = state.prefs.richScore;
    let theme = 'coal';
    if (score >= 80) theme = 'gold';
    else if (score >= 50) theme = 'bronze';
    else if (score >= 25) theme = 'ember';
    DOM.body.setAttribute('data-theme', theme);
  }

  function toggleLightDarkMode() {
    const currentMode = DOM.body.getAttribute('data-mode') || 'dark';
    const newMode = currentMode === 'dark' ? 'light' : 'dark';
    DOM.body.setAttribute('data-mode', newMode);
    state.prefs.mode = newMode;
    DB.put('prefs', { id: 'mode', value: newMode });
    
    // Update meta theme color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', newMode === 'dark' ? '#0f1117' : '#f8fafc');
    }
  }

  // Data
  async function loadData() {
    const prefsRows = await DB.all('prefs');
    prefsRows.forEach(r => { state.prefs[r.id] = r.value; });
    if (typeof state.prefs.richScore !== 'number') state.prefs.richScore = 25;
    if (!state.prefs.mode) state.prefs.mode = 'dark';
    
    // Apply saved mode
    DOM.body.setAttribute('data-mode', state.prefs.mode);
    if (DOM.themeToggle) {
      DOM.themeToggle.checked = state.prefs.mode === 'light';
    }
    
    const readsRows = await DB.all('reads');
    readsRows.forEach(r => { state.reads[r.id] = r.value; });
    if (!state.reads.reelsRead) state.reads.reelsRead = {};
    
    const threads = await DB.all('threads');
    threads.forEach(t => state.threads.set(t.id, t));
    
    const messages = await DB.all('messages');
    messages.forEach(m => {
      if (!state.messages.has(m.chatId)) state.messages.set(m.chatId, []);
      state.messages.get(m.chatId).push(m);
    });
    
    for (const [, msgs] of state.messages) msgs.sort((a, b) => a.ts - b.ts);
    
    for (const m of COUNCIL) {
      if (!state.threads.has(m.id)) {
        const thread = { id: m.id, unread: 0, lastTs: 0, lastPreview: m.status, rushScore: 70, richScore: 30, userMessageCount: 0, richActions: 0 };
        state.threads.set(m.id, thread);
        await DB.put('threads', thread);
      }
      if (!state.messages.has(m.id)) state.messages.set(m.id, []);
    }
    
    updateProgressionTheme();
    generateReels();
  }

  async function saveReads() {
    await DB.put('reads', { id: 'reelsRead', value: state.reads.reelsRead });
  }

  // Reels - Generate flat list for WhatsApp-style navigation
  function generateReels() {
    const today = getDayKey();
    state.reels.clear();
    state.todayReelsList = [];
    
    let reelIndex = 0;
    for (const m of COUNCIL) {
      // Hakim only appears on Tue/Fri
      if (m.id === 'hakim') {
        const dow = new Date().getDay();
        if (dow !== 2 && dow !== 5) continue;
      }
      
      const lib = REELS[m.id];
      if (!lib?.length) continue;
      
      // Add all reels from this mentor
      lib.forEach((content, idx) => {
        const reelId = `${today}:${m.id}:${idx}`;
        const reel = {
          id: reelId,
          day: today,
          contactId: m.id,
          index: reelIndex,
          ...content
        };
        state.reels.set(reelId, reel);
        state.todayReelsList.push(reel);
        reelIndex++;
      });
    }
  }

  // Render Stories Strip
  function renderStoriesStrip() {
    const today = getDayKey();
    
    // Group reels by mentor for the strip display
    const mentorsWithReels = [];
    const seenMentors = new Set();
    
    state.todayReelsList.forEach(reel => {
      if (!seenMentors.has(reel.contactId)) {
        seenMentors.add(reel.contactId);
        const m = COUNCIL.find(c => c.id === reel.contactId);
        if (m) {
          // Check if all reels from this mentor are read
          const mentorReels = state.todayReelsList.filter(r => r.contactId === m.id);
          const allRead = mentorReels.every(r => state.reads.reelsRead[today]?.[r.id]);
          mentorsWithReels.push({ mentor: m, firstReelIndex: reel.index, allRead });
        }
      }
    });
    
    DOM.storiesStrip.innerHTML = mentorsWithReels.map(({ mentor, firstReelIndex, allRead }) => {
      return `
        <div class="story-item" data-reel-index="${firstReelIndex}">
          <div class="story-ring ${allRead ? 'read' : ''}">
            <div class="story-avatar" style="background:linear-gradient(135deg,${mentor.accent},${mentor.accent}88)">${mentor.emoji}</div>
          </div>
          <span class="story-name">${mentor.name}</span>
        </div>
      `;
    }).join('');
    
    DOM.storiesStrip.querySelectorAll('.story-item').forEach(el => {
      el.onclick = () => openReelAtIndex(parseInt(el.dataset.reelIndex, 10));
    });
  }

  // Render Chat List
  function renderChatList() {
    const search = (DOM.searchInput?.value || '').toLowerCase();
    const sorted = [...COUNCIL]
      .filter(m => m.name.toLowerCase().includes(search) || m.role.toLowerCase().includes(search))
      .sort((a, b) => (state.threads.get(b.id)?.lastTs || 0) - (state.threads.get(a.id)?.lastTs || 0));

    DOM.chatList.innerHTML = sorted.map(m => {
      const thread = state.threads.get(m.id);
      const isActive = state.activeChatId === m.id;
      return `
        <div class="chat-item ${isActive ? 'active' : ''}" data-chat="${m.id}">
          <div class="chat-avatar" style="background:linear-gradient(135deg,${m.accent},${m.accent}66)">${m.emoji}</div>
          <div class="chat-meta">
            <div class="chat-header">
              <span class="chat-name">${m.name}</span>
              <span class="chat-time">${formatTime(thread?.lastTs)}</span>
            </div>
            <div class="chat-role">${m.role}</div>
            <div class="chat-preview">${truncate(thread?.lastPreview || m.status, 32)}</div>
          </div>
        </div>
      `;
    }).join('');
    
    DOM.chatList.querySelectorAll('.chat-item').forEach(el => {
      el.onclick = () => openChat(el.dataset.chat);
    });
  }

  // Render Thread
  function renderThread() {
    const chatId = state.activeChatId;
    if (!chatId) return;
    const msgs = state.messages.get(chatId) || [];
    const m = COUNCIL.find(c => c.id === chatId);

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

  // SCROLL TO BOTTOM
  function scrollToBottom() {
    if (!DOM.thread) return;
    requestAnimationFrame(() => {
      DOM.thread.scrollTop = DOM.thread.scrollHeight + 1000;
      requestAnimationFrame(() => {
        DOM.thread.scrollTop = DOM.thread.scrollHeight + 1000;
      });
    });
  }

  // Render Insights
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
    DOM.sessionLimit.classList.toggle('warning', (thread.userMessageCount || 0) >= CONFIG.SESSION_LIMIT - 2);
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

  // Classifiers
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

  // Character name mapping
  const CHAR_MAP = {
    'KAREEM': 'kareem', 'TURBO': 'turbo', 'WOLF': 'wolf', 'LUNA': 'luna',
    'THE_CAPTAIN': 'captain', 'TEMPO': 'tempo', 'HAKIM': 'hakim',
    'UNCLE_WHEAT': 'wheat', 'TOMMY_TOMATO': 'tommy', 'THE_ARCHITECT': 'architect'
  };

  // API
  async function callAPI(chatId, userText, history = []) {
    if (!CONFIG.USE_REAL_API) {
      return { reply: getMockReply(chatId, userText), focus: 'general', scoreDelta: calculateDelta(userText), mode: 'reply' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
    try {
      const res = await fetch(CONFIG.WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      
      console.log('API Response:', JSON.stringify(data, null, 2));
      
      if (data.bubbles && data.bubbles.length > 0) {
        const reply = data.bubbles.map(b => {
          let text = b.text;
          if (typeof text === 'object' && text !== null) {
            text = text.content || text.message || text.response || JSON.stringify(text);
          }
          text = String(text || '');
          
          const name = CHAR_MAP[b.speaker] ? COUNCIL.find(c => c.id === CHAR_MAP[b.speaker])?.name : b.speaker;
          return data.mode === 'council_debate' ? `${name}: ${text}` : text;
        }).join('\n\n');
        
        let nextAction = data.final?.next_action;
        if (typeof nextAction === 'object' && nextAction !== null) {
          nextAction = nextAction.content || nextAction.text || JSON.stringify(nextAction);
        }
        
        const fullReply = nextAction 
          ? `${reply}\n\n→ Action: ${nextAction}`
          : reply;
        
        return {
          reply: fullReply,
          focus: classifyFocus([{ text: userText }]),
          scoreDelta: data.final?.decision === 'ACCEPT' ? 5 : -2,
          mode: data.mode || 'reply',
          character: CHAR_MAP[data.selected_character] || chatId
        };
      }
      
      let fallbackReply = data.reply || data.response || data.text || data.message;
      if (typeof fallbackReply === 'object' && fallbackReply !== null) {
        fallbackReply = fallbackReply.content || fallbackReply.text || JSON.stringify(fallbackReply);
      }
      return { reply: fallbackReply || getMockReply(chatId, userText), focus: 'general', scoreDelta: 0, mode: 'reply' };
    } catch (err) {
      clearTimeout(timeout);
      console.warn('API fallback:', err.message);
      return { reply: getMockReply(chatId, userText), focus: 'general', scoreDelta: calculateDelta(userText), mode: 'reply' };
    }
  }

  function getMockReply(chatId, userText) {
    const replies = {
      kareem: "That sounds like too much work.\nWhat's the laziest solution?\n\n→ Action: Delete one step from your process.",
      turbo: "Stop thinking.\nWhat can you do RIGHT NOW?\n\n→ Action: Pick one thing and do it in the next 30 minutes.",
      wolf: "What's the ROI?\nHow do we 10x this?\n\n→ Action: Find the multiplier in your idea.",
      luna: "But do you actually enjoy this?\nWhat's the point if you hate it?\n\n→ Question: What would make this exciting?",
      captain: "Hold on.\nWhat's your runway?\n\n→ Action: Calculate your emergency fund in months.",
      tempo: "That just cost you 2 minutes.\nAbout $0.75 of life.\n\n→ Action: Track your hours tomorrow.",
      hakim: "Two farmers. Same field.\nOne grew what people wanted.\nOne grew what they needed.\n\n→ Question: What are you growing?",
      wheat: "Is this a NEED or a WANT?\nBoring wins.\n\n→ Action: Find the survival-level version.",
      tommy: "This needs more HYPE!\nBrand it better!\n\n→ Action: Add one premium element.",
      architect: "Stop working IN it.\nWork ON the system.\n\n→ Action: Document one process this week."
    };
    return replies[chatId] || "Tell me more.\n\n→ Question: What's the ONE thing blocking you?";
  }

  // Messaging
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

    await addMessage(chatId, 'out', text);
    thread.userMessageCount = (thread.userMessageCount || 0) + 1;
    thread.lastTs = Date.now();
    thread.lastPreview = text;
    await DB.put('threads', thread);

    renderThread();
    renderChatList();
    renderInsights();

    showTyping();

    const history = state.messages.get(chatId) || [];
    const response = await callAPI(chatId, text, history);
    const delay = CONFIG.USE_REAL_API ? 100 : CONFIG.TYPING_DELAY;
    await new Promise(r => setTimeout(r, delay));
    hideTyping();

    const responderId = response.character || chatId;
    const member = COUNCIL.find(c => c.id === responderId) || COUNCIL.find(c => c.id === chatId);
    const tag = response.mode === 'council_debate' ? '🏛️ Council' : member?.name;

    await addMessage(chatId, 'in', response.reply, {
      tag: tag,
      chips: [{ action: 'next', label: '→ Next step' }, { action: 'audit', label: '⏱️ Time Audit' }]
    });

    if (response.scoreDelta !== 0) {
      thread.richScore = Math.max(0, Math.min(100, (thread.richScore || 30) + response.scoreDelta));
      thread.rushScore = 100 - thread.richScore;
      state.prefs.richScore = Math.max(state.prefs.richScore, thread.richScore);
      updateProgressionTheme();
    }
    if (thread.richScore > 50) thread.richActions = (thread.richActions || 0) + 1;
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
      chatId, dir, text, ts: Date.now(), ...opts
    };
    await DB.put('messages', msg);
    if (!state.messages.has(chatId)) state.messages.set(chatId, []);
    state.messages.get(chatId).push(msg);
    return msg;
  }

  function handleChip(action) {
    const prompts = {
      audit: "I need a time audit on my typical day.",
      wheat: "Is my idea wheat or tomatoes? Test the necessity.",
      map: "Help me plan my Money Map system.",
      council: "I want a debate from the full Council.",
      next: "What's my next concrete action to scale?"
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
    el.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div><span style="color:var(--text-secondary);font-size:12px;margin-left:6px">Thinking...</span>';
    DOM.thread.appendChild(el);
    scrollToBottom();
  }

  function hideTyping() {
    document.getElementById('typing')?.remove();
  }

  // Council
  async function summonCouncil() {
    const chatId = state.activeChatId;
    if (!chatId) return;
    
    const msgs = state.messages.get(chatId) || [];
    const lastUserMsg = [...msgs].reverse().find(m => m.dir === 'out');
    const context = lastUserMsg?.text || "What should I do with my money?";
    
    showTyping();
    const response = await callAPI(chatId, `debate: ${context}`, msgs);
    hideTyping();
    
    const fallbackResponse = `🏛️ THE COUNCIL SPEAKS:

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

    await addMessage(chatId, 'in', response.reply || fallbackResponse, { tag: '🏛️ Council' });
    renderThread();
    showToast('🏛️ Council assembled');
  }

  // ═══════════════════════════════════════════════════════════
  // REELS - WhatsApp Style with Auto-Advance
  // ═══════════════════════════════════════════════════════════
  
  function openReelAtIndex(index) {
    if (index < 0 || index >= state.todayReelsList.length) return;
    
    state.currentReelIndex = index;
    renderReelProgressSegments();
    showCurrentReel();
    DOM.reelViewer.classList.add('open');
    startReelTimer();
  }

  function renderReelProgressSegments() {
    const total = state.todayReelsList.length;
    DOM.reelProgressContainer.innerHTML = state.todayReelsList.map((_, i) => {
      let className = 'reel-progress-segment';
      if (i < state.currentReelIndex) className += ' completed';
      else if (i === state.currentReelIndex) className += ' active';
      return `<div class="${className}"><div class="reel-progress-fill"></div></div>`;
    }).join('');
  }

  function showCurrentReel() {
    const reel = state.todayReelsList[state.currentReelIndex];
    if (!reel) return;
    
    const m = COUNCIL.find(c => c.id === reel.contactId);
    if (!m) return;

    DOM.reelAvatar.textContent = m.emoji;
    DOM.reelAvatar.style.background = `linear-gradient(135deg,${m.accent},${m.accent}88)`;
    DOM.reelAuthor.textContent = m.name;
    DOM.reelRole.textContent = m.role;
    DOM.reelTitle.textContent = reel.title;
    DOM.reelLines.innerHTML = reel.lines.map(l => `<p>${l}</p>`).join('');
    DOM.reelCta.innerHTML = `<span class="reel-cta-text">DM me "${reel.hook}"</span>`;
    DOM.reelReplyInput.value = '';
    DOM.reelReplyInput.placeholder = `Reply "${reel.hook}"...`;

    // Mark as read
    markReelRead(reel);
    
    // Update progress segments
    renderReelProgressSegments();
  }

  function startReelTimer() {
    stopReelTimer();
    
    const startTime = Date.now();
    const duration = CONFIG.REEL_DURATION;
    
    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update current segment progress
      const activeSegment = DOM.reelProgressContainer.querySelector('.reel-progress-segment.active .reel-progress-fill');
      if (activeSegment) {
        activeSegment.style.width = `${progress * 100}%`;
      }
      
      if (progress < 1) {
        state.reelAnimationFrame = requestAnimationFrame(animate);
      } else {
        // Auto advance to next reel
        goToNextReel();
      }
    }
    
    state.reelAnimationFrame = requestAnimationFrame(animate);
  }

  function stopReelTimer() {
    if (state.reelAnimationFrame) {
      cancelAnimationFrame(state.reelAnimationFrame);
      state.reelAnimationFrame = null;
    }
  }

  function goToNextReel() {
    if (state.currentReelIndex < state.todayReelsList.length - 1) {
      state.currentReelIndex++;
      showCurrentReel();
      startReelTimer();
    } else {
      // End of all reels
      closeReel();
    }
  }

  function goToPrevReel() {
    if (state.currentReelIndex > 0) {
      state.currentReelIndex--;
      showCurrentReel();
      startReelTimer();
    } else {
      // Restart current reel
      startReelTimer();
    }
  }

  function closeReel() {
    stopReelTimer();
    DOM.reelViewer.classList.remove('open');
    renderStoriesStrip();
  }

  async function sendReelReply() {
    const reel = state.todayReelsList[state.currentReelIndex];
    const text = DOM.reelReplyInput.value.trim() || reel?.hook || '';
    if (!text || !reel) return;
    
    const chatId = reel.contactId;
    closeReel();
    openChat(chatId);
    
    setTimeout(() => {
      DOM.msgInput.value = text;
      sendMessage();
    }, 200);
  }

  function markReelRead(reel) {
    const today = getDayKey();
    if (!state.reads.reelsRead[today]) state.reads.reelsRead[today] = {};
    state.reads.reelsRead[today][reel.id] = true;
    saveReads();
  }

  // Insights Drawer
  function toggleInsights() {
    state.insightsOpen = !state.insightsOpen;
    DOM.insightsPanel.classList.toggle('open', state.insightsOpen);
    DOM.insightsOverlay.classList.toggle('open', state.insightsOpen);
  }

  function closeInsights() {
    state.insightsOpen = false;
    DOM.insightsPanel.classList.remove('open');
    DOM.insightsOverlay.classList.remove('open');
  }

  // Navigation
  function setRoute(route) {
    state.route = route;
    DOM.body.setAttribute('data-route', route);

    if (route === 'home') {
      DOM.emptyState.classList.remove('hidden');
      DOM.chatHeader.classList.add('hidden');
      DOM.thread.classList.add('hidden');
      DOM.composer.classList.add('hidden');
      state.activeChatId = null;
    } else {
      DOM.emptyState.classList.add('hidden');
      DOM.chatHeader.classList.remove('hidden');
      DOM.thread.classList.remove('hidden');
      DOM.composer.classList.remove('hidden');
    }
  }

  async function openChat(chatId) {
    state.activeChatId = chatId;
    const m = COUNCIL.find(c => c.id === chatId);
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
    
    setTimeout(() => DOM.msgInput.focus(), 100);
  }

  // Utilities
  function getDayKey() { return new Date().toISOString().slice(0, 10); }
  
  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function truncate(str, len) { return str?.length > len ? str.slice(0, len) + '…' : (str || ''); }

  function escapeHtml(text) {
    const el = document.createElement('div');
    el.textContent = text || '';
    return el.innerHTML.replace(/\n/g, '<br>');
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(120, el.scrollHeight) + 'px';
  }

  function showToast(msg) {
    DOM.toastText.textContent = msg;
    DOM.toast.classList.add('visible');
    setTimeout(() => DOM.toast.classList.remove('visible'), CONFIG.TOAST_DURATION);
  }

  // Events
  function bindEvents() {
    // Lock screen
    DOM.btnUnlock.onclick = attemptBiometricUnlock;
    DOM.btnUnlockDemo.onclick = unlockApp;
    
    // Navigation
    DOM.btnBack.onclick = () => setRoute('home');
    DOM.btnStartChat.onclick = () => {
      if (state.todayReelsList.length > 0) {
        openReelAtIndex(0);
      } else if (COUNCIL.length) {
        openChat(COUNCIL[0].id);
      }
    };
    
    // Search
    DOM.searchInput.oninput = renderChatList;
    
    // Message input
    DOM.msgInput.oninput = () => {
      autoGrow(DOM.msgInput);
      DOM.btnSend.disabled = !DOM.msgInput.value.trim();
    };
    DOM.msgInput.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };
    DOM.btnSend.onclick = sendMessage;
    
    // Quick actions
    DOM.quickActions.onclick = e => {
      const btn = e.target.closest('.quick-btn');
      if (btn) handleChip(btn.dataset.action);
    };
    
    // Council & Insights
    DOM.btnCouncil.onclick = summonCouncil;
    DOM.btnInsights.onclick = toggleInsights;
    DOM.insightsOverlay.onclick = closeInsights;
    
    // Theme toggle
    DOM.themeToggle.onchange = toggleLightDarkMode;
    
    // Reel controls
    DOM.btnCloseReel.onclick = closeReel;
    DOM.reelViewer.onclick = e => { 
      if (e.target === DOM.reelViewer) closeReel(); 
    };
    DOM.btnReelSend.onclick = sendReelReply;
    DOM.reelReplyInput.onkeydown = e => { 
      if (e.key === 'Enter') { e.preventDefault(); sendReelReply(); } 
    };
    
    // Reel tap zones for prev/next
    DOM.reelTapPrev.onclick = (e) => {
      e.stopPropagation();
      goToPrevReel();
    };
    DOM.reelTapNext.onclick = (e) => {
      e.stopPropagation();
      goToNextReel();
    };
    
    // Pause/resume on reel tap
    let reelPaused = false;
    DOM.reelViewer.onmousedown = (e) => {
      if (e.target.closest('.reel-reply') || e.target.closest('.reel-header') || 
          e.target.closest('.reel-tap-prev') || e.target.closest('.reel-tap-next')) return;
      reelPaused = true;
      stopReelTimer();
    };
    DOM.reelViewer.onmouseup = (e) => {
      if (reelPaused) {
        reelPaused = false;
        startReelTimer();
      }
    };
    DOM.reelViewer.onmouseleave = () => {
      if (reelPaused) {
        reelPaused = false;
        startReelTimer();
      }
    };
    
    // Touch events for mobile
    DOM.reelViewer.ontouchstart = (e) => {
      if (e.target.closest('.reel-reply') || e.target.closest('.reel-header') ||
          e.target.closest('.reel-tap-prev') || e.target.closest('.reel-tap-next')) return;
      reelPaused = true;
      stopReelTimer();
    };
    DOM.reelViewer.ontouchend = () => {
      if (reelPaused) {
        reelPaused = false;
        startReelTimer();
      }
    };
    
    // Keyboard
    window.onkeydown = e => { 
      if (e.key === 'Escape') {
        closeReel();
        closeInsights();
      }
      // Arrow keys for reels
      if (DOM.reelViewer.classList.contains('open')) {
        if (e.key === 'ArrowLeft') goToPrevReel();
        if (e.key === 'ArrowRight') goToNextReel();
      }
    };
    
    // Visibility change
    document.onvisibilitychange = () => { 
      if (!document.hidden) { 
        generateReels(); 
        renderStoriesStrip(); 
      } else {
        // Pause reel when tab is hidden
        if (DOM.reelViewer.classList.contains('open')) {
          stopReelTimer();
        }
      }
    };
    
    // Handle resize
    let resizeTimeout;
    window.onresize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Close insights on mobile when resizing
        if (window.innerWidth <= 900) {
          closeInsights();
        }
      }, 200);
    };
  }

  // Init
  async function init() {
    try {
      cacheDom();
      await DB.open();
      await loadData();
      bindEvents();
      renderStoriesStrip();
      renderChatList();
      setRoute('home');
      console.log('🏛️ Money AI v2.0 ready');
    } catch (err) {
      console.error('Init failed:', err);
      showToast('⚠️ Failed to initialize');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
