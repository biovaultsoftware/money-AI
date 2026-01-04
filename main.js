/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MONEY AI — The Council of 10
 * Rush → Rich PWA with Real Gemini AI
 * 
 * 10 CHARACTERS:
 * 1. Kareem (Laziness) - Work less, earn more
 * 2. Turbo (Speed) - Results by Friday
 * 3. Wolf (Greed) - Leverage & ROI
 * 4. Luna (Satisfaction) - Quality of life
 * 5. Captain (Security) - Build the fortress
 * 6. Tempo (Time) - The Time Auditor
 * 7. Hakim (Wisdom) - The Storyteller
 * 8. Wheat (Necessity) - Boring billionaire
 * 9. Tommy (Added Value) - Hype man (often wrong)
 * 10. Architect (System) - The Final Logic
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  const CONFIG = {
    DB_NAME: 'moneyai_council_v1',
    DB_VERSION: 1,
    SESSION_LIMIT: 12,
    TYPING_DELAY_MIN: 600,
    TYPING_DELAY_MAX: 1500,
    TOAST_DURATION: 2500,
    REEL_DURATION: 8000,
    
    // API - Set to true when worker is ready
    USE_REAL_API: true,
    WORKER_URL: 'https://human1stai.rr-rshemodel.workers.dev',
    API_TIMEOUT: 15000
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // THE 10 COUNCIL MEMBERS
  // ═══════════════════════════════════════════════════════════════════════════
  const COUNCIL = [
    {
      id: 'kareem',
      name: 'Kareem',
      role: 'Laziness',
      status: 'Work less, earn more.',
      emoji: '😴',
      accent: '#f59e0b',
      philosophy: 'Maximum income for minimum effort',
      style: 'Chill, sarcastic, hates hard work'
    },
    {
      id: 'turbo',
      name: 'Turbo',
      role: 'Speed',
      status: 'Results by Friday.',
      emoji: '⚡',
      accent: '#22c55e',
      philosophy: 'Launch today, fix later',
      style: 'Short sentences. Aggressive. Impatient.'
    },
    {
      id: 'wolf',
      name: 'Wolf',
      role: 'Greed',
      status: 'Leverage & ROI.',
      emoji: '🐺',
      accent: '#ef4444',
      philosophy: 'Scale it. Multiply it. 10x everything.',
      style: 'Talks in multipliers. Cold. Calculated.'
    },
    {
      id: 'luna',
      name: 'Luna',
      role: 'Satisfaction',
      status: 'Quality of life matters.',
      emoji: '🌙',
      accent: '#ec4899',
      philosophy: 'Joy, aesthetics, meaningful work',
      style: 'Warm. Focuses on fulfillment over pure profit.'
    },
    {
      id: 'captain',
      name: 'Captain',
      role: 'Security',
      status: 'Build the fortress first.',
      emoji: '🛡️',
      accent: '#3b82f6',
      philosophy: 'Safety nets before risks',
      style: 'Risk-averse. Protective. Paranoiac.'
    },
    {
      id: 'tempo',
      name: 'Tempo',
      role: 'Time Auditor',
      status: 'You are dying. Calculate.',
      emoji: '⏱️',
      accent: '#6366f1',
      philosophy: 'Every hour has a cost. Track it.',
      style: 'Mathematical. Cold. Calculates death cost.'
    },
    {
      id: 'hakim',
      name: 'Hakim',
      role: 'Wisdom',
      status: 'Stories hide truth.',
      emoji: '📖',
      accent: '#8b5cf6',
      philosophy: 'Teach through parables',
      style: 'Calm. Speaks in stories. Never preaches.'
    },
    {
      id: 'wheat',
      name: 'Uncle Wheat',
      role: 'Necessity',
      status: 'Sell what they need.',
      emoji: '🌾',
      accent: '#a3a3a3',
      philosophy: 'Boring businesses that print money',
      style: 'Boring. Hates trends. Loves utilities.'
    },
    {
      id: 'tommy',
      name: 'Tommy Tomato',
      role: 'Added Value',
      status: 'Brand it! Hype it!',
      emoji: '🍅',
      accent: '#f43f5e',
      philosophy: 'Luxury, branding, premium positioning',
      style: 'Hype man. Exciting but often wrong.'
    },
    {
      id: 'architect',
      name: 'The Architect',
      role: 'System',
      status: 'Work ON the system.',
      emoji: '🏛️',
      accent: '#fbbf24',
      philosophy: 'Synthesize. Judge. Build the machine.',
      style: 'Final word. Sees all perspectives.'
    }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // STARTER MESSAGES
  // ═══════════════════════════════════════════════════════════════════════════
  const STARTERS = {
    kareem: ["Why are you working so hard?\nThere's always a lazier way.", "What task do you repeat that you hate?\nLet's delete it."],
    turbo: ["Stop planning.\nWhat can you ship in 48 hours?", "Speed beats perfection.\nName ONE thing to launch today."],
    wolf: ["What's your current ROI on time?\nI bet it's pathetic.", "You're thinking too small.\nHow do we 10x this?"],
    luna: ["Before we talk money…\nAre you actually enjoying any of this?", "What would make you excited to wake up?\nLet's build that."],
    captain: ["Before any risk…\nHow many months of runway do you have?", "What's your emergency fund?\n3 months? 6? None?"],
    tempo: ["You just spent 5 minutes reading this.\nThat cost you $2.50 of life.\nWant the full audit?", "How many hours did you waste today?\nBe honest."],
    hakim: ["Five farmers. Same land. Same sun.\nOnly one slept well.\nWant to know why?", "Two hunters caught sheep daily.\nOne ate. One tied.\nDifferent futures."],
    wheat: ["Forget passion.\nWhat do people NEED?\nFood. Transport. Shelter.\nThat's where money hides.", "Tommy's fancy tomatoes fail.\nMy boring wheat wins.\nEvery. Single. Time."],
    tommy: ["STOP being boring!\nYou need a BRAND!\nPremium! Experience! Luxury!", "Wheat is for peasants.\nI package sun-dried tomatoes in gold foil.\n$50/jar. That's how you win!"],
    architect: ["Everyone's given their opinion.\nNow let me synthesize.\nHere's the actual play.", "Stop working IN the business.\nStart working ON the system."]
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY REELS CONTENT
  // ═══════════════════════════════════════════════════════════════════════════
  const REELS_LIBRARY = {
    kareem: [
      { title: "Being lazy made me rich.", lines: ["I just hated repeating work.", "So I built systems instead."], hook: "LAZY" },
      { title: "Work once. Repeat forever.", lines: ["Your problem isn't effort.", "It's low leverage."], hook: "SCALE" },
      { title: "I automate everything.", lines: ["Manual work is for people who don't think.", "Let machines sweat."], hook: "AUTO" }
    ],
    turbo: [
      { title: "Speed beats perfection.", lines: ["Money hates hesitation.", "Move today."], hook: "NOW" },
      { title: "Done > Perfect", lines: ["Ship it ugly.", "Fix it later.", "Just. Ship. It."], hook: "SHIP" },
      { title: "48 hours or nothing.", lines: ["If it takes longer than 2 days to test,", "your idea is too complicated."], hook: "FAST" }
    ],
    wolf: [
      { title: "10x or nothing.", lines: ["Small thinking is expensive.", "What's the multiplier?"], hook: "10X" },
      { title: "ROI is the only metric.", lines: ["Feelings don't compound.", "Returns do."], hook: "ROI" },
      { title: "Leverage everything.", lines: ["Other people's time.", "Other people's money.", "Other people's skills."], hook: "LEVER" }
    ],
    luna: [
      { title: "Money without joy is prison.", lines: ["What's the point of wealth", "if you hate Mondays?"], hook: "JOY" },
      { title: "Build what excites you.", lines: ["Passion isn't naive.", "It's sustainable."], hook: "LOVE" },
      { title: "Quality > Quantity", lines: ["One great thing", "beats ten mediocre ones."], hook: "QUALITY" }
    ],
    captain: [
      { title: "Build the fortress first.", lines: ["Before any risk,", "secure the base."], hook: "SAFE" },
      { title: "6 months runway. Minimum.", lines: ["Without a safety net,", "every decision is desperate."], hook: "BUFFER" },
      { title: "Insurance is not optional.", lines: ["The best time to prepare", "is before the storm."], hook: "PROTECT" }
    ],
    tempo: [
      { title: "You are dying.", lines: ["Every wasted hour", "is gone forever.", "Calculate."], hook: "AUDIT" },
      { title: "45 seconds. Gone.", lines: ["You just scrolled past 3 videos.", "That cost you $1.50 of life."], hook: "TIME" },
      { title: "The Death Cost", lines: ["8 years of your life", "will be spent scrolling.", "Worth it?"], hook: "COST" }
    ],
    hakim: [
      { title: "The Wheat Farmer", lines: ["Same land. Same sun.", "Only one slept well."], hook: "STORY" },
      { title: "Two Hunters", lines: ["One killed daily. One tied.", "Different tomorrows."], hook: "TALE" },
      { title: "The Canal Builder", lines: ["He carried water once.", "Then built a canal.", "Now water carries itself."], hook: "WISDOM" }
    ],
    wheat: [
      { title: "Boring is profitable.", lines: ["Nobody dreams of selling rice.", "But everyone buys rice."], hook: "WHEAT" },
      { title: "Needs > Wants", lines: ["Fancy coffee fails in recession.", "Cheap bread survives."], hook: "NEED" },
      { title: "I sleep 12 hours.", lines: ["My boring business runs itself.", "Tommy works 18 hours on his 'brand'."], hook: "BORING" }
    ],
    tommy: [
      { title: "BRAND is everything!", lines: ["Stop being boring!", "Add VALUE! Add HYPE!"], hook: "HYPE" },
      { title: "Premium positioning.", lines: ["Same tomato.", "Gold foil.", "$50."], hook: "LUXURY" },
      { title: "Experience sells.", lines: ["People don't buy products.", "They buy stories."], hook: "STORY" }
    ],
    architect: [
      { title: "Systems > Goals", lines: ["Goals are for amateurs.", "Systems are for professionals."], hook: "SYSTEM" },
      { title: "Work ON, not IN.", lines: ["Stop being an employee", "of your own business."], hook: "META" },
      { title: "The Council has spoken.", lines: ["All perspectives heard.", "Here's the synthesis."], hook: "COUNCIL" }
    ]
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // APPLICATION STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const state = {
    isLocked: true,
    route: 'home',
    activeChatId: null,
    council: [],
    threads: new Map(),
    messages: new Map(),
    reels: new Map(),
    prefs: { theme: 'ember', richScore: 25, onboarded: false },
    reads: { reelsRead: {}, threadLastReadTs: {} },
    currentReel: null,
    isSending: false,
    reelTimer: null
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);
  const DOM = {};

  function bindDOM() {
    DOM.lockScreen = $('#lockScreen');
    DOM.btnUnlock = $('#btnUnlock');
    DOM.btnUnlockDemo = $('#btnUnlockDemo');
    DOM.app = $('#app');
    DOM.body = document.body;
    DOM.sidebar = $('#sidebar');
    DOM.storiesStrip = $('#storiesStrip');
    DOM.searchInput = $('#searchInput');
    DOM.chatList = $('#chatList');
    DOM.mainArea = $('#mainArea');
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
    DOM.btnInsights = $('#btnInsights');
    DOM.thread = $('#thread');
    DOM.quickActions = $('#quickActions');
    DOM.msgInput = $('#msgInput');
    DOM.btnSend = $('#btnSend');
    DOM.insightsPanel = $('#insightsPanel');
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
      if (DB.db) return DB.db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          ['council', 'messages', 'threads', 'reels', 'prefs', 'reads'].forEach(name => {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
          });
        };
        req.onsuccess = () => { DB.db = req.result; resolve(DB.db); };
        req.onerror = () => reject(req.error);
      });
    },
    tx(store, mode = 'readonly') { return DB.db.transaction(store, mode).objectStore(store); },
    async get(store, key) {
      await DB.open();
      return new Promise((res, rej) => {
        const r = DB.tx(store).get(key);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      });
    },
    async put(store, val) {
      await DB.open();
      return new Promise((res, rej) => {
        const r = DB.tx(store, 'readwrite').put(val);
        r.onsuccess = () => res(true);
        r.onerror = () => rej(r.error);
      });
    },
    async all(store) {
      await DB.open();
      return new Promise((res, rej) => {
        const r = DB.tx(store).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PWA SETUP
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
      icons: [{ src: generateIcon(512), sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    $('#manifestLink').setAttribute('href', URL.createObjectURL(blob));
  }

  function generateIcon(size) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#fbbf24"/></linearGradient></defs>
      <rect width="512" height="512" rx="128" fill="#0a0c10"/>
      <text x="256" y="300" text-anchor="middle" font-family="system-ui" font-size="200" font-weight="900" fill="url(#g)">M</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BIOMETRIC AUTH
  // ═══════════════════════════════════════════════════════════════════════════
  async function attemptBiometricUnlock() {
    if (!window.PublicKeyCredential) { unlockApp(); return; }
    try {
      const challenge = new TextEncoder().encode('money-ai-' + Date.now());
      await navigator.credentials.get({ publicKey: { challenge, timeout: 60000, userVerification: 'required' } });
      unlockApp();
    } catch (e) { unlockApp(); }
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
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════
  async function loadPrefs() {
    const rows = await DB.all('prefs');
    rows.forEach(r => { state.prefs[r.id] = r.value; });
    if (typeof state.prefs.richScore !== 'number') state.prefs.richScore = 25;
    updateTheme();
  }

  async function savePref(id, value) {
    state.prefs[id] = value;
    await DB.put('prefs', { id, value });
  }

  async function loadReads() {
    const rows = await DB.all('reads');
    rows.forEach(r => { state.reads[r.id] = r.value; });
    if (!state.reads.reelsRead) state.reads.reelsRead = {};
  }

  async function saveReads() {
    await DB.put('reads', { id: 'reelsRead', value: state.reads.reelsRead });
  }

  async function ensureSeed() {
    const existing = await DB.all('council');
    if (existing.length) { state.council = existing; return; }

    // Seed all 10 council members
    for (const m of COUNCIL) {
      await DB.put('council', m);
      state.council.push(m);
    }

    // Create threads
    for (const m of state.council) {
      const starter = STARTERS[m.id]?.[0] || 'Ready to talk.';
      const meta = {
        id: m.id,
        pinned: ['kareem', 'wheat', 'architect'].includes(m.id),
        unread: 1,
        lastTs: Date.now() - Math.random() * 3600000,
        lastPreview: starter.split('\n')[0],
        rushScore: 70,
        richScore: 30,
        userMessageCount: 0,
        richActions: 0,
        createdAt: Date.now()
      };
      await DB.put('threads', meta);
      state.threads.set(m.id, meta);
    }

    // Seed starter messages
    for (const m of state.council) {
      const msgs = [];
      const starters = STARTERS[m.id] || [];
      for (let i = 0; i < Math.min(starters.length, 2); i++) {
        msgs.push({
          id: `${m.id}:${Date.now() - (2 - i) * 60000}:${Math.random().toString(36).slice(2, 6)}`,
          chatId: m.id,
          dir: 'in',
          text: starters[i],
          ts: Date.now() - (2 - i) * 60000,
          tag: m.name
        });
      }
      for (const msg of msgs) await DB.put('messages', msg);
      state.messages.set(m.id, msgs);
    }

    generateDailyReels();
  }

  function generateDailyReels() {
    const today = getDayKey();
    state.reels.clear();

    for (const m of state.council) {
      // Hakim only on Tue/Fri
      if (m.id === 'hakim') {
        const dow = new Date().getDay();
        if (dow !== 2 && dow !== 5) continue;
      }

      const library = REELS_LIBRARY[m.id] || [];
      if (!library.length) continue;

      // Pick random reel for today (seeded by day)
      const dayNum = parseInt(today.replace(/-/g, ''), 10);
      const idx = dayNum % library.length;
      const content = library[idx];

      const reel = {
        id: `${today}:${m.id}`,
        day: today,
        contactId: m.id,
        ...content
      };
      state.reels.set(reel.id, reel);
    }
  }

  async function loadAll() {
    const threads = await DB.all('threads');
    threads.forEach(t => state.threads.set(t.id, t));

    const messages = await DB.all('messages');
    messages.forEach(m => {
      if (!state.messages.has(m.chatId)) state.messages.set(m.chatId, []);
      state.messages.get(m.chatId).push(m);
    });

    for (const [id, msgs] of state.messages) msgs.sort((a, b) => a.ts - b.ts);

    if (!state.council.length) state.council = await DB.all('council');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStoriesStrip() {
    const today = getDayKey();
    const todayReels = Array.from(state.reels.values()).filter(r => r.day === today);

    DOM.storiesStrip.innerHTML = todayReels.map(reel => {
      const member = state.council.find(m => m.id === reel.contactId);
      if (!member) return '';
      const isRead = state.reads.reelsRead[today]?.[reel.contactId];

      return `
        <div class="story-item" data-reel="${reel.id}">
          <div class="story-ring ${isRead ? 'read' : ''}">
            <div class="story-avatar" style="background:linear-gradient(135deg,${member.accent},${member.accent}88)">${member.emoji}</div>
          </div>
          <span class="story-name">${member.name}</span>
        </div>
      `;
    }).join('');

    DOM.storiesStrip.querySelectorAll('.story-item').forEach(el => {
      el.addEventListener('click', () => openReel(el.dataset.reel));
    });
  }

  function renderChatList() {
    const search = (DOM.searchInput.value || '').toLowerCase();
    const sorted = [...state.council]
      .filter(m => m.name.toLowerCase().includes(search) || m.role.toLowerCase().includes(search))
      .sort((a, b) => {
        const ta = state.threads.get(a.id);
        const tb = state.threads.get(b.id);
        if (ta?.pinned && !tb?.pinned) return -1;
        if (!ta?.pinned && tb?.pinned) return 1;
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
            <div class="chat-preview">${truncate(thread?.lastPreview || m.status, 35)}</div>
          </div>
          <div class="chat-badge">${thread?.unread || 0}</div>
        </div>
      `;
    }).join('');

    DOM.chatList.querySelectorAll('.chat-item').forEach(el => {
      el.addEventListener('click', () => openChat(el.dataset.chat));
    });
  }

  function renderThread() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const msgs = state.messages.get(chatId) || [];
    const member = state.council.find(m => m.id === chatId);

    DOM.thread.innerHTML = msgs.map(msg => {
      const isIn = msg.dir === 'in';
      const tagColor = member?.accent || '#f59e0b';

      return `
        <div class="message-row ${isIn ? 'in' : 'out'}">
          ${isIn ? `<div class="msg-avatar" style="background:linear-gradient(135deg,${tagColor},${tagColor}66)">${member?.emoji || '🤖'}</div>` : ''}
          <div class="bubble">
            ${msg.tag ? `<div class="bubble-tag" style="background:${tagColor}22;color:${tagColor}">${msg.tag}</div>` : ''}
            <div class="bubble-content">${escapeHtml(msg.text)}</div>
            <div class="bubble-meta"><span>${formatTime(msg.ts)}</span></div>
            ${msg.chips ? `<div class="bubble-actions">${msg.chips.map(c => `<button class="chip-btn" data-chip="${c.action}">${c.label}</button>`).join('')}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    DOM.thread.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => handleChip(btn.dataset.chip));
    });

    scrollToBottom();
  }

  function renderInsights() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const thread = state.threads.get(chatId);
    if (!thread) return;

    const msgs = state.messages.get(chatId) || [];
    const userMsgs = msgs.filter(m => m.dir === 'out');
    const aiMsgs = msgs.filter(m => m.dir === 'in');

    const rush = thread.rushScore || 70;
    const rich = thread.richScore || 30;

    DOM.rushBar.style.width = `${rush}%`;
    DOM.richBar.style.width = `${rich}%`;
    DOM.rushValue.textContent = rush;
    DOM.richValue.textContent = rich;

    const isRichMode = rich > rush;
    DOM.modePill.className = `mode-pill ${isRichMode ? 'rich' : 'rush'}`;
    DOM.modeLabel.textContent = isRichMode ? 'Rich' : 'Rush';

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
      general: { icon: '🗺️', label: 'General', desc: 'Share your situation for focused advice.' },
      debts: { icon: '💳', label: 'Debts', desc: 'Damage control mode. Stabilize first.' },
      business: { icon: '💡', label: 'Business', desc: 'Testing Wheat vs Tomato viability.' },
      jobs: { icon: '💼', label: 'Employment', desc: 'Mapping time-for-money exchange.' },
      time: { icon: '⏱️', label: 'Time Audit', desc: 'Finding your wasted hours.' },
      wheat: { icon: '🌾', label: 'Necessity', desc: 'Testing survival-level value.' }
    };
    const d = data[focus] || data.general;
    DOM.focusLabel.textContent = d.label;
    DOM.focusDesc.textContent = d.desc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSIFIERS
  // ═══════════════════════════════════════════════════════════════════════════
  function classifyFocus(msgs) {
    if (!msgs.length) return 'general';
    const text = msgs.map(m => m.text).join(' ').toLowerCase();
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
  // API MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  const API = {
    async chat(chatId, userText, history = []) {
      if (!CONFIG.USE_REAL_API) return { reply: generateMockReply(chatId, userText), focus: classifyFocus([{ text: userText }]), scoreDelta: calculateDelta(userText) };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

      try {
        const response = await fetch(CONFIG.WORKER_URL, {
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
        if (!response.ok) throw new Error(`API ${response.status}`);

        const data = await response.json();
        return {
          reply: data.reply || generateMockReply(chatId, userText),
          focus: data.focus || 'general',
          scoreDelta: data.scoreDelta || 0
        };
      } catch (e) {
        clearTimeout(timeout);
        console.warn('API fallback:', e);
        return { reply: generateMockReply(chatId, userText), focus: classifyFocus([{ text: userText }]), scoreDelta: calculateDelta(userText) };
      }
    }
  };

  function generateMockReply(chatId, userText) {
    const member = state.council.find(m => m.id === chatId);
    const responses = {
      kareem: "That sounds like too much work.\nWhat's the laziest way to solve this?\nDelete one step. Make it automatic.",
      turbo: "Stop overthinking.\nWhat can you do RIGHT NOW?\nGive me ONE action for the next 2 hours.",
      wolf: "What's the ROI here?\nHow do we multiply this?\nThink bigger. 10x the outcome.",
      luna: "Before we optimize...\nDoes this actually make you happy?\nWhat's the point if you hate the process?",
      captain: "Hold on.\nWhat's your safety net?\nBefore any risk, secure your runway.",
      tempo: "You just spent 3 minutes reading this.\nThat cost you ~$1.50.\nHow many hours are you losing daily to distractions?",
      hakim: "Let me tell you a story.\nTwo farmers planted the same land.\nOne grew what people wanted. One grew what they needed.\nGuess who slept better.",
      wheat: "Forget the fancy stuff.\nWhat do people NEED?\nFood. Transport. Shelter.\nThat's where real money hides.",
      tommy: "This needs more HYPE!\nAdd value! Add experience!\nPremium positioning! Brand it better!",
      architect: "I've heard all perspectives.\nHere's the synthesis:\nBuild a system, not a job.\nAutomate one thing this week."
    };
    return responses[chatId] || "Tell me more about your situation.\nWhat's the ONE thing blocking you right now?";
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
      showToast('⚠️ Session limit reached');
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

    showTypingIndicator();

    const history = state.messages.get(chatId) || [];
    const apiResponse = await API.chat(chatId, text, history);

    const delay = CONFIG.USE_REAL_API ? 100 : CONFIG.TYPING_DELAY_MIN + Math.random() * (CONFIG.TYPING_DELAY_MAX - CONFIG.TYPING_DELAY_MIN);

    setTimeout(async () => {
      hideTypingIndicator();

      const member = state.council.find(m => m.id === chatId);
      await addMessage(chatId, 'in', apiResponse.reply, { tag: member?.name, chips: generateChips(chatId) });

      if (apiResponse.scoreDelta !== 0) {
        thread.richScore = Math.max(0, Math.min(100, (thread.richScore || 30) + apiResponse.scoreDelta));
        thread.rushScore = 100 - thread.richScore;
        state.prefs.richScore = Math.max(state.prefs.richScore, thread.richScore);
        updateTheme();
      }

      if (thread.richScore > 50) thread.richActions = (thread.richActions || 0) + 1;
      thread.lastPreview = truncate(apiResponse.reply, 35);
      await DB.put('threads', thread);

      state.isSending = false;
      DOM.btnSend.disabled = false;

      renderThread();
      renderChatList();
      renderInsights();
    }, delay);
  }

  async function addMessage(chatId, dir, text, opts = {}) {
    const msg = {
      id: `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
      chatId, dir, text,
      ts: Date.now(),
      ...opts
    };
    await DB.put('messages', msg);
    if (!state.messages.has(chatId)) state.messages.set(chatId, []);
    state.messages.get(chatId).push(msg);
    return msg;
  }

  function generateChips(chatId) {
    return [
      { action: 'audit', label: '⏱️ Time Audit' },
      { action: 'wheat', label: '🌾 Wheat Test' },
      { action: 'next', label: '→ Next Step' }
    ];
  }

  function handleChip(action) {
    const prompts = {
      audit: "Do a time audit on my typical day. Where am I losing hours?",
      wheat: "Is my idea wheat or tomatoes? Help me test its necessity level.",
      map: "Help me build my Money Map — from Hunt to Canal.",
      council: "I want the full Council to weigh in on my situation.",
      next: "What's my very next concrete action?"
    };
    if (prompts[action]) {
      DOM.msgInput.value = prompts[action];
      sendMessage();
    }
  }

  function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div><span style="color:var(--text-secondary);font-size:12px">Thinking...</span>';
    DOM.thread.appendChild(indicator);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COUNCIL FEATURE
  // ═══════════════════════════════════════════════════════════════════════════
  async function summonCouncil() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const response = `🏛️ **THE COUNCIL SPEAKS** (30-second takes):

**Kareem:** Too much work. Automate or delete.
**Turbo:** Stop planning. Ship something TODAY.
**Wolf:** What's the 10x play here?
**Luna:** Make sure you actually enjoy this.
**Captain:** Build safety first.
**Tempo:** You're burning 3 hours/day. Fix that.
**Wheat:** Is this a NEED or a WANT?
**Tommy:** Add more hype! Brand it better!
**Architect:** Stop working IN it. Work ON the system.

**Hakim:** "The shepherd who counts sheep all day... never grows the flock."

→ Pick ONE voice to follow this week.`;

    await addMessage(chatId, 'in', response, {
      tag: 'Council',
      chips: [{ action: 'next', label: '→ Choose my path' }]
    });

    renderThread();
    showToast('🏛️ Council assembled');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REELS
  // ═══════════════════════════════════════════════════════════════════════════
  function openReel(reelId) {
    const reel = state.reels.get(reelId);
    if (!reel) return;

    const member = state.council.find(m => m.id === reel.contactId);
    if (!member) return;

    state.currentReel = reel;

    DOM.reelAvatar.textContent = member.emoji;
    DOM.reelAvatar.style.background = `linear-gradient(135deg,${member.accent},${member.accent}88)`;
    DOM.reelAuthor.textContent = member.name;
    DOM.reelRole.textContent = member.role;
    DOM.reelTitle.textContent = reel.title;
    DOM.reelLines.innerHTML = reel.lines.map(l => `<p>${l}</p>`).join('');
    DOM.reelCta.textContent = `DM me "${reel.hook}"`;
    DOM.reelReplyInput.value = '';
    DOM.reelReplyInput.placeholder = `Reply "${reel.hook}"...`;

    DOM.reelViewer.classList.add('open');

    // Progress bar animation
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
    }, 300);
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

  function openChat(chatId) {
    state.activeChatId = chatId;
    const member = state.council.find(m => m.id === chatId);
    const thread = state.threads.get(chatId);

    if (member) {
      DOM.headerAvatar.textContent = member.emoji;
      DOM.headerAvatar.style.background = `linear-gradient(135deg,${member.accent},${member.accent}88)`;
      DOM.headerName.textContent = member.name;
      DOM.headerStatus.textContent = member.status;
    }

    if (thread) {
      thread.unread = 0;
      DB.put('threads', thread);
    }

    setRoute('chat');
    renderThread();
    renderChatList();
    renderInsights();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  function getDayKey() { return new Date().toISOString().slice(0, 10); }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(120, el.scrollHeight) + 'px';
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { DOM.thread.scrollTop = DOM.thread.scrollHeight; });
  }

  function showToast(msg) {
    DOM.toastText.textContent = msg;
    DOM.toast.classList.add('visible');
    setTimeout(() => DOM.toast.classList.remove('visible'), CONFIG.TOAST_DURATION);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════════
  function bindEvents() {
    DOM.btnUnlock.addEventListener('click', attemptBiometricUnlock);
    DOM.btnUnlockDemo.addEventListener('click', unlockApp);
    DOM.btnBack.addEventListener('click', () => setRoute('home'));
    DOM.btnStartChat.addEventListener('click', () => {
      const firstReel = state.reels.values().next().value;
      if (firstReel) openReel(firstReel.id);
      else if (state.council.length) openChat(state.council[0].id);
    });

    DOM.searchInput.addEventListener('input', renderChatList);

    DOM.msgInput.addEventListener('input', () => {
      autoGrow(DOM.msgInput);
      DOM.btnSend.disabled = !DOM.msgInput.value.trim();
    });
    DOM.msgInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    DOM.btnSend.addEventListener('click', sendMessage);

    DOM.quickActions.addEventListener('click', e => {
      const btn = e.target.closest('.quick-btn');
      if (btn) handleChip(btn.dataset.action);
    });

    DOM.btnCouncil.addEventListener('click', summonCouncil);

    DOM.btnCloseReel.addEventListener('click', closeReel);
    DOM.reelViewer.addEventListener('click', e => { if (e.target === DOM.reelViewer) closeReel(); });
    DOM.btnReelSend.addEventListener('click', sendReelReply);
    DOM.reelReplyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendReelReply(); } });

    window.addEventListener('keydown', e => { if (e.key === 'Escape') closeReel(); });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { generateDailyReels(); renderStoriesStrip(); }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  async function init() {
    try {
      bindDOM();
      setupPWA();
      await DB.open();
      await loadPrefs();
      await loadReads();
      await ensureSeed();
      await loadAll();
      generateDailyReels();
      bindEvents();
      renderStoriesStrip();
      renderChatList();
      setRoute('home');
      console.log('🏛️ Money AI Council initialized — 10 voices ready');
    } catch (e) {
      console.error('Init failed:', e);
      showToast('⚠️ Failed to start');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
