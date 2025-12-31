/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MONEY AI — Rush → Rich PWA
 * Main Application Logic
 * 
 * Features:
 * - Biometric Lock Screen (WebAuthn)
 * - Multi-Persona Chat System (6 Mentors)
 * - Daily Reels with DM Hooks
 * - Rush → Rich Insights Panel
 * - 12-Message Session Limit
 * - Wheat vs Tomatoes Classifier
 * - Time Audit System
 * - Coal → Gold Dynamic Theming
 * - IndexedDB Local Persistence
 * - PWA with Offline Support
 * - Cloudflare + Gemini API Integration
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    DB_NAME: 'moneyai_pwa_v2',
    DB_VERSION: 1,
    SESSION_LIMIT: 12,
    TYPING_DELAY_MIN: 800,
    TYPING_DELAY_MAX: 2000,
    TOAST_DURATION: 2500,
    
    // ═══════════════════════════════════════════════════════════════════════
    // API CONFIGURATION
    // Set USE_REAL_API to true and configure WORKER_URL to use Gemini
    // ═══════════════════════════════════════════════════════════════════════
    USE_REAL_API: true,
    WORKER_URL: 'https://human1stai.rr-rshemodel.workers.dev/',
    API_TIMEOUT: 15000
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MENTOR DATA
  // ═══════════════════════════════════════════════════════════════════════════

  const MENTORS = [
    { 
      id: 'omar', 
      name: 'Omar', 
      role: 'simplifier',
      status: 'Make it easy.',
      emoji: '🧠',
      accent: '#f59e0b',
      description: 'Eliminates decision fatigue'
    },
    { 
      id: 'zaid', 
      name: 'Zaid', 
      role: 'mover',
      status: 'Fast wins only.',
      emoji: '⚡',
      accent: '#22c55e',
      description: 'Gets you moving today'
    },
    { 
      id: 'kareem', 
      name: 'Kareem', 
      role: 'builder',
      status: 'More. But smarter.',
      emoji: '🏗️',
      accent: '#3b82f6',
      description: 'Builds leverage & systems'
    },
    { 
      id: 'maya', 
      name: 'Maya', 
      role: 'architect',
      status: 'Discipline is freedom.',
      emoji: '📐',
      accent: '#8b5cf6',
      description: 'Creates structure & plans'
    },
    { 
      id: 'salma', 
      name: 'Salma', 
      role: 'stabilizer',
      status: 'Breathe. Then move.',
      emoji: '🌊',
      accent: '#06b6d4',
      description: 'Reduces panic, finds calm'
    },
    { 
      id: 'hakim', 
      name: 'Hakim', 
      role: 'storyteller',
      status: 'Stories hide truth better than facts.',
      emoji: '📖',
      accent: '#f97316',
      description: 'Weekly wisdom through parables'
    }
  ];

  // Mentor starter messages
  const STARTERS = {
    omar: [
      "Yo 😄 quick check. You tired… or stuck?",
      "Don't answer deep. Just real.",
      "What wastes your time the most lately?"
    ],
    zaid: [
      "We're getting a win in 48 hours.",
      "What do you need: money today, or time today?",
      "Name one thing you waste hours on daily."
    ],
    kareem: [
      "I don't care about motivation. I care about leverage.",
      "What do you do that you keep repeating?",
      "That repetition is a system waiting to exist."
    ],
    maya: [
      "Okay. No chaos. We'll build structure.",
      "How many hours can you honestly control per week? 3? 5? 10?",
      "Your map has 3 lanes: cash / growth / assets."
    ],
    salma: [
      "Breathe. You're not late. You're overloaded.",
      "Tell me what's scaring you most: bills, future, or failure?",
      "Today: 10 minutes. We list what you control."
    ],
    hakim: [
      "Five farmers shared the same land. Same water. Same sun.",
      "One planted wheat. One tomatoes. One rice. One corn. One potatoes.",
      "Every season, people came asking only one question: 'Do you have bread?'"
    ]
  };

  // Daily reels content
  const REELS_CONTENT = {
    omar: {
      title: "Being lazy made me rich.",
      lines: [
        "I just hated repeating the same work.",
        "So I built systems instead."
      ],
      hook: "HOW"
    },
    zaid: {
      title: "Speed beats perfection.",
      lines: [
        "Money hates hesitation.",
        "Move today."
      ],
      hook: "NOW"
    },
    kareem: {
      title: "Work once. Repeat.",
      lines: [
        "Your problem isn't effort.",
        "It's low leverage."
      ],
      hook: "SCALE"
    },
    maya: {
      title: "Discipline is relief.",
      lines: [
        "Chaos is expensive.",
        "Structure buys freedom."
      ],
      hook: "PLAN"
    },
    salma: {
      title: "Calm makes money.",
      lines: [
        "Panic feels urgent.",
        "Calm makes better decisions."
      ],
      hook: "BREATHE"
    },
    hakim: {
      title: "The wheat farmer sleeps well.",
      lines: [
        "Same land. Same sun.",
        "Different peace."
      ],
      hook: "STORY"
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // APPLICATION STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const state = {
    isLocked: true,
    route: 'home',
    activeChatId: null,
    mentors: [],
    threads: new Map(),
    messages: new Map(),
    reels: new Map(),
    prefs: {
      theme: 'coal',
      richScore: 0,
      richUnlocked: false,
      onboarded: false,
      typingDots: true
    },
    reads: {
      reelsRead: {},
      threadLastReadTs: {}
    },
    currentReel: null,
    isSending: false,
    installPrompt: null
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM REFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const DOM = {};

  function bindDOM() {
    // Lock Screen
    DOM.lockScreen = $('#lockScreen');
    DOM.btnUnlock = $('#btnUnlock');
    DOM.btnUnlockDemo = $('#btnUnlockDemo');
    DOM.lockWarning = $('#lockWarning');
    DOM.lockLogo = $('#lockLogo');

    // App Shell
    DOM.app = $('#app');
    DOM.body = document.body;

    // Sidebar
    DOM.sidebar = $('#sidebar');
    DOM.storiesStrip = $('#storiesStrip');
    DOM.searchInput = $('#searchInput');
    DOM.chatList = $('#chatList');

    // Main Area
    DOM.mainArea = $('#mainArea');
    DOM.emptyState = $('#emptyState');
    DOM.chatView = $('#chatView');
    DOM.btnStartChat = $('#btnStartChat');
    DOM.btnBack = $('#btnBack');

    // Chat Header
    DOM.headerAvatar = $('#headerAvatar');
    DOM.headerName = $('#headerName');
    DOM.headerStatus = $('#headerStatus');
    DOM.sessionLimit = $('#sessionLimit');
    DOM.msgCount = $('#msgCount');
    DOM.btnCouncil = $('#btnCouncil');
    DOM.btnInsights = $('#btnInsights');

    // Thread
    DOM.thread = $('#thread');
    DOM.quickActions = $('#quickActions');
    DOM.msgInput = $('#msgInput');
    DOM.btnSend = $('#btnSend');

    // Insights Panel
    DOM.insightsPanel = $('#insightsPanel');
    DOM.modePill = $('#modePill');
    DOM.modeLabel = $('#modeLabel');
    DOM.rushBar = $('#rushBar');
    DOM.richBar = $('#richBar');
    DOM.rushValue = $('#rushValue');
    DOM.richValue = $('#richValue');
    DOM.focusTag = $('#focusTag');
    DOM.focusLabel = $('#focusLabel');
    DOM.focusDesc = $('#focusDesc');
    DOM.statUserMsgs = $('#statUserMsgs');
    DOM.statAiMsgs = $('#statAiMsgs');
    DOM.statAge = $('#statAge');
    DOM.statActions = $('#statActions');
    DOM.nextStep = $('#nextStep');

    // Drawer (Mobile)
    DOM.drawer = $('#drawer');
    DOM.drawerOverlay = $('#drawerOverlay');

    // Reel Viewer
    DOM.reelViewer = $('#reelViewer');
    DOM.reelAvatar = $('#reelAvatar');
    DOM.reelAuthor = $('#reelAuthor');
    DOM.reelTitle = $('#reelTitle');
    DOM.reelLines = $('#reelLines');
    DOM.reelCta = $('#reelCta');
    DOM.reelReplyInput = $('#reelReplyInput');
    DOM.btnCloseReel = $('#btnCloseReel');
    DOM.btnReelSend = $('#btnReelSend');

    // Toast
    DOM.toast = $('#toast');
    DOM.toastText = $('#toastText');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXEDDB WRAPPER
  // ═══════════════════════════════════════════════════════════════════════════

  const DB = {
    db: null,

    async open() {
      if (DB.db) return DB.db;
      
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
        
        req.onupgradeneeded = (e) => {
          const db = req.result;
          const stores = ['mentors', 'messages', 'threads', 'reels', 'prefs', 'reads'];
          stores.forEach(name => {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: 'id' });
            }
          });
        };
        
        req.onsuccess = () => {
          DB.db = req.result;
          resolve(DB.db);
        };
        
        req.onerror = () => reject(req.error);
      });
    },

    tx(store, mode = 'readonly') {
      return DB.db.transaction(store, mode).objectStore(store);
    },

    async get(store, key) {
      await DB.open();
      return new Promise((resolve, reject) => {
        const req = DB.tx(store).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    async put(store, val) {
      await DB.open();
      return new Promise((resolve, reject) => {
        const req = DB.tx(store, 'readwrite').put(val);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    },

    async del(store, key) {
      await DB.open();
      return new Promise((resolve, reject) => {
        const req = DB.tx(store, 'readwrite').delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    },

    async all(store) {
      await DB.open();
      return new Promise((resolve, reject) => {
        const req = DB.tx(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async clearAll() {
      await DB.open();
      const stores = ['mentors', 'messages', 'threads', 'reels', 'prefs', 'reads'];
      for (const s of stores) {
        await new Promise((resolve, reject) => {
          const req = DB.tx(s, 'readwrite').clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        });
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PWA SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  function setupPWA() {
    // Generate manifest
    const manifest = {
      name: 'Money AI',
      short_name: 'Money AI',
      description: 'Rush → Rich mindset engine',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#0a0c10',
      theme_color: '#0a0c10',
      icons: [
        {
          src: generateIcon(192),
          sizes: '192x192',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        },
        {
          src: generateIcon(512),
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        }
      ]
    };

    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const url = URL.createObjectURL(blob);
    $('#manifestLink').setAttribute('href', url);

    // Register service worker
    registerServiceWorker();
  }

  function generateIcon(size) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
        <defs>
          <radialGradient id="g" cx="30%" cy="20%" r="80%">
            <stop offset="0%" stop-color="#f97316"/>
            <stop offset="100%" stop-color="#0a0c10"/>
          </radialGradient>
          <linearGradient id="h" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f59e0b"/>
            <stop offset="1" stop-color="#fbbf24"/>
          </linearGradient>
        </defs>
        <rect x="24" y="24" width="464" height="464" rx="120" fill="url(#g)"/>
        <text x="256" y="300" text-anchor="middle" font-family="system-ui" font-size="180" font-weight="900" fill="url(#h)">M</text>
      </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const swCode = `
      const CACHE = 'moneyai-v2';
      
      self.addEventListener('install', (e) => {
        e.waitUntil((async () => {
          const cache = await caches.open(CACHE);
          try {
            const res = await fetch(self.registration.scope, { cache: 'reload' });
            await cache.put('app-shell', res.clone());
          } catch (e) {}
          self.skipWaiting();
        })());
      });

      self.addEventListener('activate', (e) => {
        e.waitUntil((async () => {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => k === CACHE ? null : caches.delete(k)));
          self.clients.claim();
        })());
      });

      self.addEventListener('fetch', (e) => {
        const url = new URL(e.request.url);
        if (url.origin !== location.origin) return;

        if (e.request.mode === 'navigate') {
          e.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const cached = await cache.match('app-shell');
            try {
              const fresh = await fetch(e.request, { cache: 'no-store' });
              await cache.put('app-shell', fresh.clone());
              return fresh;
            } catch (err) {
              return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' }});
            }
          })());
        }
      });
    `;

    const blob = new Blob([swCode], { type: 'text/javascript' });
    const swUrl = URL.createObjectURL(blob);
    
    try {
      await navigator.serviceWorker.register(swUrl, { scope: './' });
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BIOMETRIC AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════

  async function attemptBiometricUnlock() {
    if (!window.PublicKeyCredential) {
      showLockWarning("This device/browser doesn't support WebAuthn. Use demo mode.");
      DOM.btnUnlockDemo.classList.remove('hidden');
      return;
    }

    try {
      const challenge = new TextEncoder().encode('money-ai-challenge-' + Date.now());
      const publicKey = {
        challenge,
        timeout: 60000,
        userVerification: 'required'
      };

      await navigator.credentials.get({ publicKey });
      unlockApp();
    } catch (err) {
      console.warn('Biometric auth failed:', err);
      showLockWarning("Biometric not available. Use demo mode to continue.");
      DOM.btnUnlockDemo.classList.remove('hidden');
    }
  }

  function showLockWarning(msg) {
    DOM.lockWarning.textContent = msg;
    DOM.lockWarning.classList.add('visible');
  }

  function unlockApp() {
    state.isLocked = false;
    DOM.lockScreen.classList.add('hidden');
    DOM.app.classList.remove('locked');
    showToast('🔓 Vault unlocked');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THEME MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function updateTheme() {
    const score = state.prefs.richScore;
    let theme = 'coal';
    
    if (score >= 80) theme = 'gold';
    else if (score >= 50) theme = 'bronze';
    else if (score >= 25) theme = 'ember';
    
    DOM.body.setAttribute('data-theme', theme);
    state.prefs.theme = theme;
    
    // Update lock logo glow
    if (DOM.lockLogo) {
      DOM.lockLogo.style.boxShadow = `0 0 60px var(--glow-accent)`;
    }
  }

  function updateRichScore(delta) {
    state.prefs.richScore = Math.max(0, Math.min(100, state.prefs.richScore + delta));
    if (state.prefs.richScore > 50) {
      state.prefs.richUnlocked = true;
    }
    updateTheme();
    savePref('richScore', state.prefs.richScore);
    savePref('richUnlocked', state.prefs.richUnlocked);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LOADING & SEEDING
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadPrefs() {
    const prefRows = await DB.all('prefs');
    for (const r of prefRows) {
      state.prefs[r.id] = r.value;
    }
    
    // Defaults
    if (typeof state.prefs.richScore !== 'number') state.prefs.richScore = 0;
    if (typeof state.prefs.typingDots !== 'boolean') state.prefs.typingDots = true;
    if (typeof state.prefs.onboarded !== 'boolean') state.prefs.onboarded = false;
    
    updateTheme();
  }

  async function savePref(id, value) {
    state.prefs[id] = value;
    await DB.put('prefs', { id, value });
  }

  async function loadReads() {
    const rows = await DB.all('reads');
    for (const r of rows) {
      state.reads[r.id] = r.value;
    }
    if (!state.reads.reelsRead) state.reads.reelsRead = {};
    if (!state.reads.threadLastReadTs) state.reads.threadLastReadTs = {};
  }

  async function saveReads() {
    await DB.put('reads', { id: 'reelsRead', value: state.reads.reelsRead });
    await DB.put('reads', { id: 'threadLastReadTs', value: state.reads.threadLastReadTs });
  }

  async function ensureSeed() {
    const existing = await DB.all('mentors');
    if (existing.length) {
      state.mentors = existing;
      return;
    }

    // Seed mentors
    for (const m of MENTORS) {
      const mentor = { ...m };
      await DB.put('mentors', mentor);
      state.mentors.push(mentor);
    }

    // Seed thread metadata
    for (const m of state.mentors) {
      const meta = {
        id: m.id,
        pinned: m.id === 'omar' || m.id === 'hakim',
        muted: false,
        unread: 1,
        lastTs: Date.now() - Math.random() * 3600000,
        lastPreview: STARTERS[m.id]?.[0] || 'Start chatting...',
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
    for (const m of state.mentors) {
      const msgs = [];
      const starters = STARTERS[m.id] || [];
      
      for (let i = 0; i < Math.min(starters.length, 3); i++) {
        msgs.push({
          id: `${m.id}:${Date.now() - (3 - i) * 60000}:${Math.random().toString(36).slice(2, 8)}`,
          chatId: m.id,
          dir: 'in',
          text: starters[i],
          ts: Date.now() - (3 - i) * 60000,
          tag: m.name
        });
      }
      
      for (const msg of msgs) {
        await DB.put('messages', msg);
      }
      state.messages.set(m.id, msgs);
    }

    // Seed today's reels
    seedReels();
  }

  function seedReels() {
    const today = getDayKey();
    
    for (const m of state.mentors) {
      // Hakim only appears Tue/Fri
      if (m.id === 'hakim') {
        const dow = new Date().getDay();
        if (dow !== 2 && dow !== 5) continue;
      }
      
      const content = REELS_CONTENT[m.id];
      if (!content) continue;
      
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
    // Load threads
    const threads = await DB.all('threads');
    for (const t of threads) {
      state.threads.set(t.id, t);
    }

    // Load messages
    const messages = await DB.all('messages');
    for (const m of messages) {
      if (!state.messages.has(m.chatId)) {
        state.messages.set(m.chatId, []);
      }
      state.messages.get(m.chatId).push(m);
    }

    // Sort messages by timestamp
    for (const [id, msgs] of state.messages) {
      msgs.sort((a, b) => a.ts - b.ts);
    }

    // Load mentors if not seeded
    if (!state.mentors.length) {
      state.mentors = await DB.all('mentors');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  function renderStoriesStrip() {
    const today = getDayKey();
    const reelsToday = Array.from(state.reels.values()).filter(r => r.day === today);
    
    DOM.storiesStrip.innerHTML = reelsToday.map(reel => {
      const mentor = state.mentors.find(m => m.id === reel.contactId);
      if (!mentor) return '';
      
      const isRead = state.reads.reelsRead[today]?.[reel.contactId];
      
      return `
        <div class="story-item" data-reel="${reel.id}">
          <div class="story-ring ${isRead ? 'read' : ''}">
            <div class="story-avatar">${mentor.emoji}</div>
          </div>
          <span class="story-name">${mentor.name}</span>
        </div>
      `;
    }).join('');

    // Bind click events
    DOM.storiesStrip.querySelectorAll('.story-item').forEach(el => {
      el.addEventListener('click', () => openReel(el.dataset.reel));
    });
  }

  function renderChatList() {
    const search = (DOM.searchInput.value || '').toLowerCase();
    
    // Sort: pinned first, then by lastTs
    const sorted = [...state.mentors]
      .filter(m => m.name.toLowerCase().includes(search))
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
      const isPinned = thread?.pinned;
      const isUnread = (thread?.unread || 0) > 0;
      
      return `
        <div class="chat-item ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''} ${isUnread ? 'unread' : ''}"
             data-chat="${m.id}">
          <div class="chat-avatar" style="background: linear-gradient(135deg, ${m.accent}, ${m.accent}88)">
            ${m.emoji}
          </div>
          <div class="chat-meta">
            <div class="chat-header">
              <span class="chat-name">${m.name}</span>
              <span class="chat-time">${formatTime(thread?.lastTs)}</span>
            </div>
            <div class="chat-preview">${truncate(thread?.lastPreview || m.status, 40)}</div>
          </div>
          <div class="chat-badge">${thread?.unread || 0}</div>
        </div>
      `;
    }).join('');

    // Bind click events
    DOM.chatList.querySelectorAll('.chat-item').forEach(el => {
      el.addEventListener('click', () => openChat(el.dataset.chat));
    });
  }

  function renderThread() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const msgs = state.messages.get(chatId) || [];
    const mentor = state.mentors.find(m => m.id === chatId);

    DOM.thread.innerHTML = msgs.map(msg => {
      const isIn = msg.dir === 'in';
      
      return `
        <div class="message-row ${isIn ? 'in' : 'out'}">
          ${isIn ? `<div class="msg-avatar">${mentor?.emoji || '🤖'}</div>` : ''}
          <div class="bubble">
            ${msg.tag ? `<div class="bubble-tag"><span class="dot"></span>${msg.tag}</div>` : ''}
            <div class="bubble-content">${escapeHtml(msg.text)}</div>
            <div class="bubble-meta">
              <span>${formatTime(msg.ts)}</span>
            </div>
            ${msg.chips ? `
              <div class="bubble-actions">
                ${msg.chips.map(c => `<button class="chip-btn" data-chip="${c.action}">${c.label}</button>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind chip buttons
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

    // Update gauges
    const rush = thread.rushScore || 70;
    const rich = thread.richScore || 30;
    
    DOM.rushBar.style.width = `${rush}%`;
    DOM.richBar.style.width = `${rich}%`;
    DOM.rushValue.textContent = rush;
    DOM.richValue.textContent = rich;

    // Update mode pill
    const isRichMode = rich > rush;
    DOM.modePill.classList.toggle('rich', isRichMode);
    DOM.modeLabel.textContent = isRichMode ? 'Rich Mode' : 'Rush Mode';

    // Update focus
    const focus = classifyFocus(userMsgs);
    updateFocusDisplay(focus);

    // Update stats
    DOM.statUserMsgs.textContent = userMsgs.length;
    DOM.statAiMsgs.textContent = aiMsgs.length;
    DOM.statActions.textContent = thread.richActions || 0;
    
    const age = Date.now() - (thread.createdAt || Date.now());
    const mins = Math.floor(age / 60000);
    DOM.statAge.textContent = mins < 1 ? 'Just started' : `${mins} min`;

    // Update session limit
    DOM.msgCount.textContent = thread.userMessageCount || 0;
    DOM.sessionLimit.classList.toggle('warning', (thread.userMessageCount || 0) >= CONFIG.SESSION_LIMIT - 2);
  }

  function updateFocusDisplay(focus) {
    const focusData = {
      general: { icon: '🗺️', label: 'General Money Map', desc: "The clearer you describe the pain, the sharper your Money Map becomes.", next: 'Describe your main pain: debts, no job, or weak business.' },
      debts: { icon: '💳', label: 'Debts & Bills', desc: "We're in 'calm the fire' mode. Avoid damage, buy time for building.", next: 'List your top 3 bills with amounts and due dates.' },
      business: { icon: '💡', label: 'Business Idea', desc: "Testing if your idea is Wheat (always needed) or Tomatoes (optional).", next: 'Describe your idea + who needs it.' },
      jobs: { icon: '💼', label: 'Job & Income', desc: "Mapping how your hours are sold, where you give time for free.", next: 'Share daily hours for work vs waste.' },
      wheat: { icon: '🌾', label: 'Wheat vs Tomatoes', desc: "You're thinking in value hierarchy. Pushing your offer up the survival ladder.", next: 'Tell me your product, buyer, and necessity level.' },
      time: { icon: '⏱️', label: 'Time Audit', desc: "We'll turn wasted hours into a small income engine.", next: 'Break down your day: sleep, work, scroll hours.' }
    };

    const data = focusData[focus] || focusData.general;
    DOM.focusTag.innerHTML = `<span class="icon">${data.icon}</span><span>${data.label}</span>`;
    DOM.focusLabel.textContent = data.label;
    DOM.focusDesc.textContent = data.desc;
    DOM.nextStep.textContent = data.next;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSIFIERS
  // ═══════════════════════════════════════════════════════════════════════════

  function classifyFocus(userMsgs) {
    if (!userMsgs.length) return 'general';
    
    const text = userMsgs.map(m => m.text).join(' ').toLowerCase();
    
    if (/debt|bill|loan|owe|rent|payment|mortgage/i.test(text)) return 'debts';
    if (/business|startup|sell|product|service|customer|client/i.test(text)) return 'business';
    if (/job|work|salary|boss|employee|hire|career/i.test(text)) return 'jobs';
    if (/wheat|tomato|need|want|essential|luxury/i.test(text)) return 'wheat';
    if (/time|hour|waste|scroll|watch|sleep|schedule/i.test(text)) return 'time';
    
    return 'general';
  }

  function classifyWheatTomato(text) {
    const wheatKeywords = ['need', 'essential', 'daily', 'survive', 'food', 'transport', 'health', 'shelter', 'safety'];
    const tomatoKeywords = ['want', 'luxury', 'premium', 'brand', 'experience', 'entertainment', 'optional'];
    
    const lower = text.toLowerCase();
    let wheatScore = 0;
    let tomatoScore = 0;
    
    wheatKeywords.forEach(k => { if (lower.includes(k)) wheatScore++; });
    tomatoKeywords.forEach(k => { if (lower.includes(k)) tomatoScore++; });
    
    if (wheatScore > tomatoScore + 1) return 'wheat';
    if (tomatoScore > wheatScore + 1) return 'tomato';
    return 'semi-wheat';
  }

  function calculateRushRichDelta(text) {
    const rushPatterns = /worry|scared|panic|stress|anxious|stuck|broke|can't|hate|tired|frustrated/i;
    const richPatterns = /plan|action|build|sell|offer|create|system|automate|delegate|test/i;
    
    let delta = 0;
    if (rushPatterns.test(text)) delta -= 3;
    if (richPatterns.test(text)) delta += 5;
    
    return delta;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOCK AI RESPONSE ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  function generateReply(chatId, userText) {
    const mentor = state.mentors.find(m => m.id === chatId);
    if (!mentor) return "I'm here to help.";

    const focus = classifyFocus([{ text: userText }]);
    const wheatStatus = classifyWheatTomato(userText);
    
    // Mentor-specific response styles
    const responses = {
      omar: {
        general: "Let's simplify this. What's the ONE thing making your day harder than it needs to be?",
        debts: "Okay, bills. Don't panic. First: list them. Second: we cut one stupid expense today. Third: we find 3 hours you're wasting.",
        time: "Your time is leaking. Every scroll = $5 gone. Let's plug ONE hole today. What's your biggest time thief?",
        business: "Before we build anything — does this solve a NEED or add VALUE? Needs sell themselves. Values compete with millions."
      },
      zaid: {
        general: "No theory. One action. 48 hours. What can you sell, fix, or offer to 3 people TODAY?",
        debts: "Debt = past decisions. Can't change. What CAN change: the next 48 hours. One quick win. One payment. Go.",
        time: "Stop tracking. Start acting. Send 3 messages in the next hour. I'll write them for you.",
        business: "Skip the logo. Skip the name. Test it NOW. Message 3 people: 'Would you pay for X?'"
      },
      kareem: {
        general: "You're hunting sheep every day. Time to build a pen. What's one task you repeat weekly that you could systematize?",
        debts: "Debt isn't your enemy. Low leverage is. What skill do you have that could 10x its output with a simple system?",
        time: "Every repeated task is a system waiting to happen. Document it once. Automate or delegate.",
        business: `Your idea is ${wheatStatus}. ${wheatStatus === 'wheat' ? 'Good. Now double down on necessity.' : 'Needs work. How can we make this more essential?'}`
      },
      maya: {
        general: "Let's build your week: 3 lanes. Cash (pays you now). Growth (raises your value). Assets (works without you). Pick one.",
        debts: "Structure beats panic. Here's your 30-day debt map: Week 1 = list. Week 2 = cut. Week 3 = earn. Week 4 = pay.",
        time: "Your week has 168 hours. How many do YOU control? Let's protect those like money.",
        business: "Don't launch. Architect. What's the smallest version you can test this week?"
      },
      salma: {
        general: "Breathe. You're not behind. You're overloaded. What's the ONE thing you can control right now?",
        debts: "Bills feel like a tidal wave. But you only need to stop ONE leak today. Which expense can you pause?",
        time: "Scrolling is panic in disguise. When you reach for your phone, what are you really running from?",
        business: "Your nervous system is too activated to build. First: 10 slow breaths. Then: one controllable step."
      },
      hakim: {
        general: "Two men walked the same desert. One collected sand. One found the oasis. What are you collecting?",
        debts: "The farmer with one field and no debt sleeps deeper than the king with ten fields and ten lenders.",
        time: "The river doesn't rush. It carves canyons. What would patient persistence create in your life?",
        business: "The wheat farmer never advertised. He never competed. People came to him because bread is bread."
      }
    };

    const mentorResponses = responses[chatId] || responses.omar;
    return mentorResponses[focus] || mentorResponses.general;
  }

  function generateChips(chatId) {
    return [
      { action: 'mission', label: '🎯 Define my mission' },
      { action: 'audit', label: '⏱️ Time audit' },
      { action: 'map', label: '🗺️ Build my Money Map' }
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL API MODULE (Cloudflare Worker + Gemini)
  // ═══════════════════════════════════════════════════════════════════════════

  const API = {
    async chat(chatId, userText, history = []) {
      if (!CONFIG.USE_REAL_API) {
        // Fallback to mock responses
        return {
          reply: generateReply(chatId, userText),
          focus: classifyFocus([{ text: userText }]),
          scoreDelta: calculateRushRichDelta(userText)
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

      try {
        const response = await fetch(CONFIG.WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mentor: chatId,
            message: userText,
            history: history.slice(-6).map(m => ({
              role: m.dir === 'out' ? 'user' : 'assistant',
              text: m.text
            })),
            sessionId: `${chatId}:${Date.now()}`
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          
          if (response.status === 429) {
            showToast('⚠️ Rate limit reached. Try again later.');
          }
          
          throw new Error(error.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        
        return {
          reply: data.reply || generateReply(chatId, userText),
          focus: data.focus || 'general',
          scoreDelta: data.scoreDelta || 0,
          rateLimitRemaining: data.rateLimitRemaining
        };

      } catch (err) {
        clearTimeout(timeout);
        
        if (err.name === 'AbortError') {
          console.warn('API timeout, using fallback');
          showToast('⏳ Slow connection, using offline mode');
        } else {
          console.error('API error:', err);
        }

        // Fallback to mock
        return {
          reply: generateReply(chatId, userText),
          focus: classifyFocus([{ text: userText }]),
          scoreDelta: calculateRushRichDelta(userText)
        };
      }
    }
  };

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
    
    // Check session limit
    if ((thread?.userMessageCount || 0) >= CONFIG.SESSION_LIMIT) {
      showToast('⚠️ Session limit reached. Start a new chat.');
      return;
    }

    state.isSending = true;
    DOM.btnSend.disabled = true;
    DOM.msgInput.value = '';
    autoGrow(DOM.msgInput);

    // Add user message
    const userMsg = await addMessage(chatId, 'out', text);
    
    // Update thread
    thread.userMessageCount = (thread.userMessageCount || 0) + 1;
    thread.lastTs = Date.now();
    thread.lastPreview = text;
    
    // Analyze and adjust scores
    const delta = calculateRushRichDelta(text);
    if (delta !== 0) {
      thread.richScore = Math.max(0, Math.min(100, (thread.richScore || 30) + delta));
      thread.rushScore = 100 - thread.richScore;
      updateRichScore(delta > 0 ? 1 : 0); // Global score
    }
    
    await DB.put('threads', thread);
    renderThread();
    renderChatList();
    renderInsights();

    // Show typing indicator
    showTypingIndicator();

    // Get conversation history
    const history = state.messages.get(chatId) || [];

    // Call API (real or mock based on config)
    const apiResponse = await API.chat(chatId, text, history);

    // Calculate delay based on response length for natural feel
    const baseDelay = CONFIG.TYPING_DELAY_MIN;
    const lengthDelay = Math.min(apiResponse.reply.length * 10, 1500);
    const delay = CONFIG.USE_REAL_API ? 100 : baseDelay + Math.random() * lengthDelay;
    
    setTimeout(async () => {
      hideTypingIndicator();
      
      const mentor = state.mentors.find(m => m.id === chatId);
      
      await addMessage(chatId, 'in', apiResponse.reply, {
        tag: mentor?.name,
        chips: generateChips(chatId)
      });

      // Update scores based on API response
      if (apiResponse.scoreDelta !== 0) {
        thread.richScore = Math.max(0, Math.min(100, (thread.richScore || 30) + apiResponse.scoreDelta));
        thread.rushScore = 100 - thread.richScore;
      }

      // Update rich actions if rich-oriented response
      if (thread.richScore > 50) {
        thread.richActions = (thread.richActions || 0) + 1;
      }

      thread.lastPreview = truncate(apiResponse.reply, 40);
      await DB.put('threads', thread);

      state.isSending = false;
      DOM.btnSend.disabled = false;
      
      renderThread();
      renderChatList();
      renderInsights();
      
      // Show rate limit warning if low
      if (apiResponse.rateLimitRemaining !== undefined && apiResponse.rateLimitRemaining < 5) {
        showToast(`⚠️ ${apiResponse.rateLimitRemaining} API calls remaining`);
      }
    }, delay);
  }

  async function addMessage(chatId, dir, text, opts = {}) {
    const msg = {
      id: `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
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

  function showTypingIndicator() {
    if (!state.prefs.typingDots) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span style="color: var(--text-secondary); font-size: 12px;">Thinking...</span>
    `;
    DOM.thread.appendChild(indicator);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
  }

  function handleChip(action) {
    const prompts = {
      mission: "I want to define my personal mission. Help me find my 'why'.",
      audit: "Let's do a time audit. I want to track where my hours go.",
      map: "Help me build my Money Map — I need a clear path forward.",
      wheat: "Is my idea wheat or tomatoes? Help me test its necessity level."
    };

    if (prompts[action]) {
      DOM.msgInput.value = prompts[action];
      sendMessage();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COUNCIL FEATURE
  // ═══════════════════════════════════════════════════════════════════════════

  async function summonCouncil() {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const councilResponse = `🏛️ **ABUNDANCE COUNCIL** (30-second takes):

**Omar:** Make it easier. Delete one decision.
**Zaid:** Move today. One message to 3 people.  
**Kareem:** Build leverage. Create a repeatable offer.
**Maya:** Structure your week. 3 lanes, 3 priorities.
**Salma:** Reduce panic. One controllable step.

**Moderator:** Pick ONE action now. What do you choose?`;

    await addMessage(chatId, 'in', councilResponse, {
      tag: 'Council',
      chips: [
        { action: 'mission', label: '🎯 Choose mission' },
        { action: 'audit', label: '⏱️ Choose audit' },
        { action: 'map', label: '🗺️ Choose map' }
      ]
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

    const mentor = state.mentors.find(m => m.id === reel.contactId);
    if (!mentor) return;

    state.currentReel = reel;

    DOM.reelAvatar.textContent = mentor.emoji;
    DOM.reelAuthor.textContent = mentor.name;
    DOM.reelTitle.textContent = reel.title;
    DOM.reelLines.innerHTML = reel.lines.map(l => `<p>${l}</p>`).join('');
    DOM.reelCta.textContent = `DM me "${reel.hook}"`;
    DOM.reelReplyInput.placeholder = `Reply with "${reel.hook}"...`;
    DOM.reelReplyInput.value = '';

    DOM.reelViewer.classList.add('open');

    // Mark as read
    markReelRead(reel.day, reel.contactId);
  }

  function closeReel() {
    DOM.reelViewer.classList.remove('open');
    state.currentReel = null;
  }

  async function sendReelReply() {
    const text = DOM.reelReplyInput.value.trim();
    if (!text || !state.currentReel) return;

    const chatId = state.currentReel.contactId;
    closeReel();

    // Open the chat and send the message
    openChat(chatId);
    
    setTimeout(() => {
      DOM.msgInput.value = text;
      sendMessage();
    }, 300);
  }

  function markReelRead(day, contactId) {
    if (!state.reads.reelsRead[day]) {
      state.reads.reelsRead[day] = {};
    }
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
    } else if (route === 'chat') {
      DOM.emptyState.classList.add('hidden');
      DOM.chatView.classList.remove('hidden');
    }
  }

  function openChat(chatId) {
    state.activeChatId = chatId;
    
    const mentor = state.mentors.find(m => m.id === chatId);
    const thread = state.threads.get(chatId);
    
    if (mentor) {
      DOM.headerAvatar.textContent = mentor.emoji;
      DOM.headerAvatar.style.background = `linear-gradient(135deg, ${mentor.accent}, ${mentor.accent}88)`;
      DOM.headerName.textContent = mentor.name;
      DOM.headerStatus.textContent = mentor.status;
    }

    // Mark as read
    if (thread) {
      thread.unread = 0;
      DB.put('threads', thread);
    }

    setRoute('chat');
    renderThread();
    renderChatList();
    renderInsights();
  }

  function toggleDrawer(open) {
    DOM.drawer.classList.toggle('open', open);
    DOM.drawerOverlay.classList.toggle('visible', open);
    
    if (open) {
      // Clone insights content to drawer
      DOM.drawer.innerHTML = DOM.insightsPanel.innerHTML;
    }
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
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(120, el.scrollHeight) + 'px';
  }

// Optimized scrollToBottom
function scrollToBottom() {
  requestAnimationFrame(() => {
    // We use the ID 'thread' as defined in your HTML
    const threadEl = document.getElementById('thread');
    if (threadEl) {
      threadEl.scrollTop = threadEl.scrollHeight;
    }
  });
}

// Update the message adding logic to trigger the scroll
async function addMessage(chatId, dir, text, opts = {}) {
  const msg = {
    id: `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
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

  // TRIGGER SCROLL IMMEDIATELY AFTER ADDING
  scrollToBottom();

  return msg;
}

  function showToast(message) {
    DOM.toastText.textContent = message;
    DOM.toast.classList.add('visible');
    
    setTimeout(() => {
      DOM.toast.classList.remove('visible');
    }, CONFIG.TOAST_DURATION);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════════

  function bindEvents() {
    // Lock screen
    DOM.btnUnlock.addEventListener('click', attemptBiometricUnlock);
    DOM.btnUnlockDemo.addEventListener('click', unlockApp);

    // Navigation
    DOM.btnBack.addEventListener('click', () => setRoute('home'));
    DOM.btnStartChat.addEventListener('click', () => {
      if (state.reels.size > 0) {
        const firstReel = state.reels.values().next().value;
        if (firstReel) openReel(firstReel.id);
      }
    });

    // Search
    DOM.searchInput.addEventListener('input', renderChatList);

    // Message input
    DOM.msgInput.addEventListener('input', () => {
      autoGrow(DOM.msgInput);
      DOM.btnSend.disabled = !DOM.msgInput.value.trim();
    });

    DOM.msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    DOM.btnSend.addEventListener('click', sendMessage);

    // Quick actions
    DOM.quickActions.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-btn');
      if (btn) handleChip(btn.dataset.action);
    });

    // Council
    DOM.btnCouncil.addEventListener('click', summonCouncil);

    // Add this inside bindEvents() in main.js
    const scrollObserver = new MutationObserver(() => {
      scrollToBottom();
    });
    
    scrollObserver.observe(DOM.thread, { 
      childList: true, 
      subtree: true 
    });

    // Insights drawer (mobile)
    DOM.btnInsights.addEventListener('click', () => toggleDrawer(true));
    DOM.drawerOverlay.addEventListener('click', () => toggleDrawer(false));

    // Reel viewer
    DOM.btnCloseReel.addEventListener('click', closeReel);
    DOM.reelViewer.addEventListener('click', (e) => {
      if (e.target === DOM.reelViewer) closeReel();
    });
    DOM.btnReelSend.addEventListener('click', sendReelReply);
    DOM.reelReplyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendReelReply();
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeReel();
        toggleDrawer(false);
      }
    });

    // PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.installPrompt = e;
    });

    // Visibility change (refresh data)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        seedReels();
        renderStoriesStrip();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
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

      bindEvents();
      
      renderStoriesStrip();
      renderChatList();
      
      setRoute('home');
      
      // Check if should skip lock screen (for returning users in same session)
      // For demo purposes, we'll always show lock screen
      
      console.log('💰 Money AI initialized successfully');
    } catch (err) {
      console.error('Failed to initialize Money AI:', err);
      showToast('⚠️ Failed to start app');
    }
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
