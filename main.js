/**
 * Money AI — The Council of 10
 * Production-Ready PWA with Auto-Fit Responsiveness
 * 
 * FIX: Now includes conversation history in API requests
 */
(function() {
  'use strict';

  const CONFIG = {
    DB_NAME: 'moneyai_v3',
    DB_VERSION: 1,
    SESSION_LIMIT: 12,
    TYPING_DELAY: 600,
    TOAST_DURATION: 2500,
    REEL_DURATION: 6000,
    USE_REAL_API: true,
    WORKER_URL: 'https://human1stai.rr-rshemodel.workers.dev',
    API_TIMEOUT: 15000,
    MAX_HISTORY_MESSAGES: 20  // Limit history to avoid token overflow
  };

  // The 10 Council Members
  const COUNCIL = [
    { id: 'kareem', name: 'Kareem', role: 'Laziness', status: 'Work less, earn more.', emoji: '😴', accent: '#f59e0b' },
    { id: 'turbo', name: 'Turbo', role: 'Speed', status: 'Results by Friday.', emoji: '⚡', accent: '#22c55e' },
    { id: 'wolf', name: 'Wolf', role: 'Greed', status: 'Leverage & ROI.', emoji: '🐺', accent: '#ef4444' },
    { id: 'luna', name: 'Luna', role: 'Satisfaction', status: 'Quality of life matters.', emoji: '🌙', accent: '#ec4899' },
    { id: 'captain', name: 'Captain', role: 'Security', status: 'Build the fortress first.', emoji: '🛡️', accent: '#3b82f6' },
    { id: 'tempo', name: 'Tempo', role: 'Time Auditor', status: 'You are dying. Calculate.', emoji: '⏱️', accent: '#6366f1' },
    { id: 'hakim', name: 'Hakim', role: 'Wisdom', status: 'Stories hide truth.', emoji: '📖', accent: '#8b5cf6' },
    { id: 'wheat', name: 'Uncle Wheat', role: 'Necessity', status: 'Sell what they need.', emoji: '🌾', accent: '#a3a3a3' },
    { id: 'tommy', name: 'Tommy', role: 'Added Value', status: 'Brand it! Hype it!', emoji: '🅰', accent: '#f43f5e' },
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

  // State
  const state = {
    isLocked: true,
    route: 'home',
    activeChatId: null,
    threads: new Map(),
    messages: new Map(),
    reels: new Map(),
    prefs: { theme: 'ember', richScore: 25, mode: 'dark' },
    reads: { reelsRead: {} },
    isSending: false,
    reelTimer: null,
    reelQueue: [],
    currentReelIndex: 0
  };

  // DOM Cache
  const $ = sel => document.querySelector(sel);
  const DOM = {};

  function cacheDom() {
    console.log('🔍 Caching DOM elements...');
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
    DOM.reelProgressSegments = $('#reelProgressSegments');
    DOM.reelAvatar = $('#reelAvatar');
    DOM.reelAuthor = $('#reelAuthor');
    DOM.reelRole = $('#reelRole');
    DOM.reelTitle = $('#reelTitle');
    DOM.reelLines = $('#reelLines');
    DOM.reelCta = $('#reelCta');
    DOM.reelReplyInput = $('#reelReplyInput');
    DOM.btnCloseReel = $('#btnCloseReel');
    DOM.btnReelSend = $('#btnReelSend');
    DOM.reelTouchPrev = $('#reelTouchPrev');
    DOM.reelTouchNext = $('#reelTouchNext');
    DOM.toast = $('#toast');
    DOM.toastText = $('#toastText');
    DOM.themeToggle = $('#themeToggle');
    DOM.insightsOverlay = $('#insightsOverlay');
    DOM.insightsDrawer = $('#insightsDrawer');
    DOM.drawerClose = $('#drawerClose');
    // Drawer elements
    DOM.modePillDrawer = $('#modePillDrawer');
    DOM.modeLabelDrawer = $('#modeLabelDrawer');
    DOM.rushBarDrawer = $('#rushBarDrawer');
    DOM.richBarDrawer = $('#richBarDrawer');
    DOM.rushValueDrawer = $('#rushValueDrawer');
    DOM.richValueDrawer = $('#richValueDrawer');
    DOM.focusLabelDrawer = $('#focusLabelDrawer');
    DOM.focusDescDrawer = $('#focusDescDrawer');
    DOM.statUserMsgsDrawer = $('#statUserMsgsDrawer');
    DOM.statAiMsgsDrawer = $('#statAiMsgsDrawer');
    DOM.statActionsDrawer = $('#statActionsDrawer');
    
    console.log('✅ DOM cached. Key elements:', {
      msgInput: !!DOM.msgInput,
      btnSend: !!DOM.btnSend,
      thread: !!DOM.thread,
      composer: !!DOM.composer
    });
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
    },
    async delete(store, key) {
      await this.open();
      return new Promise((res, rej) => {
        const tx = this.db.transaction(store, 'readwrite');
        const r = tx.objectStore(store).delete(key);
        r.onsuccess = () => res(true);
        r.onerror = () => rej(r.error);
      });
    }
  };
 
  // Theme management
  function updateTheme() {
    const score = state.prefs.richScore;
    let theme;
    if (score < 25) theme = 'coal';
    else if (score < 50) theme = 'ember';
    else if (score < 80) theme = 'bronze';
    else theme = 'gold';
    
    DOM.body.setAttribute('data-theme', theme);
    state.prefs.theme = theme;
    savePrefs();
  }

  function toggleTheme() {
    state.prefs.mode = state.prefs.mode === 'dark' ? 'light' : 'dark';
    DOM.body.setAttribute('data-mode', state.prefs.mode);
    savePrefs();
    showToast(`${state.prefs.mode === 'dark' ? '🌙' : '☀️'} ${state.prefs.mode} mode`);
  }

  // Data persistence
  async function loadData() {
    const threads = await DB.all('threads');
    threads.forEach(t => state.threads.set(t.id, t));
    
    const msgs = await DB.all('messages');
    msgs.forEach(m => {
      if (!state.messages.has(m.chatId)) state.messages.set(m.chatId, []);
      state.messages.get(m.chatId).push(m);
    });
    
    // Sort messages by timestamp
    state.messages.forEach((arr, key) => {
      arr.sort((a, b) => a.ts - b.ts);
    });

    const prefs = await DB.get('prefs', 'main');
    if (prefs) Object.assign(state.prefs, prefs);
    
    const reads = await DB.get('reads', 'main');
    if (reads) Object.assign(state.reads, reads);

    DOM.body.setAttribute('data-mode', state.prefs.mode);
    updateTheme();
    generateReels();
  }

  async function savePrefs() {
    await DB.put('prefs', { id: 'main', ...state.prefs });
  }

  async function saveReads() {
    await DB.put('reads', { id: 'main', ...state.reads });
  }

  // Reels generation
  function generateReels() {
    state.reels.clear();
    const day = getDayKey();
    
    COUNCIL.forEach(member => {
      const memberReels = REELS[member.id];
      if (!memberReels?.length) return;
      
      const dayIndex = parseInt(day.replace(/-/g, '')) % memberReels.length;
      const reel = memberReels[dayIndex];
      
      state.reels.set(member.id, {
        id: member.id,
        contactId: member.id,
        day,
        ...reel,
        emoji: member.emoji,
        name: member.name,
        role: member.role,
        accent: member.accent
      });
    });
  }

  // Render functions
  function renderStoriesStrip() {
    if (!DOM.storiesStrip) return;
    const day = getDayKey();
    
    DOM.storiesStrip.innerHTML = Array.from(state.reels.values()).map(reel => {
      const isRead = state.reads.reelsRead?.[day]?.[reel.contactId];
      return `
        <div class="story-avatar ${isRead ? 'read' : ''}" data-contact="${reel.contactId}" style="--accent:${reel.accent}">
          <div class="story-ring"></div>
          <div class="story-img">${reel.emoji}</div>
          <div class="story-name">${reel.name}</div>
        </div>
      `;
    }).join('');

    DOM.storiesStrip.querySelectorAll('.story-avatar').forEach(el => {
      el.onclick = () => openReelQueue(el.dataset.contact);
    });
  }

  function renderChatList() {
    if (!DOM.chatList) return;
    const query = DOM.searchInput?.value?.toLowerCase() || '';
    
    const threads = COUNCIL.map(member => {
      const thread = state.threads.get(member.id);
      return {
        ...member,
        lastTs: thread?.lastTs || 0,
        lastPreview: thread?.lastPreview || OPENER[member.id] || 'Start chatting...',
        unread: thread?.unread || 0
      };
    }).filter(t => 
      !query || 
      t.name.toLowerCase().includes(query) || 
      t.role.toLowerCase().includes(query)
    ).sort((a, b) => b.lastTs - a.lastTs);

    DOM.chatList.innerHTML = threads.map(t => `
      <div class="chat-item ${state.activeChatId === t.id ? 'active' : ''}" data-chat="${t.id}">
        <div class="chat-avatar" style="background:linear-gradient(135deg,${t.accent},${t.accent}66)">${t.emoji}</div>
        <div class="chat-info">
          <div class="chat-header-row">
            <span class="chat-name">${t.name}</span>
            <span class="chat-time">${formatTime(t.lastTs)}</span>
          </div>
          <div class="chat-preview">${truncate(t.lastPreview, 40)}</div>
        </div>
        ${t.unread ? `<div class="chat-badge">${t.unread}</div>` : ''}
      </div>
    `).join('');

    DOM.chatList.querySelectorAll('.chat-item').forEach(el => {
      el.onclick = () => openChat(el.dataset.chat);
    });
  }

  function renderThread() {
    const chatId = state.activeChatId;
    if (!chatId || !DOM.thread) return;
    
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

  // Scroll to bottom
  function scrollToBottom() {
    if (!DOM.thread) return;
    DOM.thread.scrollTop = DOM.thread.scrollHeight + 1000;
    requestAnimationFrame(() => {
      DOM.thread.scrollTop = DOM.thread.scrollHeight + 1000;
    });
  }

  // Render Insights (both desktop and drawer)
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
    
    // Desktop
    if (DOM.rushBar) DOM.rushBar.style.width = `${rush}%`;
    if (DOM.richBar) DOM.richBar.style.width = `${rich}%`;
    if (DOM.rushValue) DOM.rushValue.textContent = rush;
    if (DOM.richValue) DOM.richValue.textContent = rich;
    
    // Drawer
    if (DOM.rushBarDrawer) DOM.rushBarDrawer.style.width = `${rush}%`;
    if (DOM.richBarDrawer) DOM.richBarDrawer.style.width = `${rich}%`;
    if (DOM.rushValueDrawer) DOM.rushValueDrawer.textContent = rush;
    if (DOM.richValueDrawer) DOM.richValueDrawer.textContent = rich;

    const isRich = rich > rush;
    const modeClass = isRich ? 'rich' : 'rush';
    const modeText = isRich ? 'Rich' : 'Rush';
    
    if (DOM.modePill) {
      DOM.modePill.className = `mode-pill ${modeClass}`;
      DOM.modeLabel.textContent = modeText;
    }
    if (DOM.modePillDrawer) {
      DOM.modePillDrawer.className = `mode-pill ${modeClass}`;
      DOM.modeLabelDrawer.textContent = modeText;
    }

    const focus = classifyFocus(userMsgs);
    updateFocusDisplay(focus);

    // Stats
    if (DOM.statUserMsgs) DOM.statUserMsgs.textContent = userMsgs.length;
    if (DOM.statAiMsgs) DOM.statAiMsgs.textContent = aiMsgs.length;
    if (DOM.statActions) DOM.statActions.textContent = thread.richActions || 0;
    
    if (DOM.statUserMsgsDrawer) DOM.statUserMsgsDrawer.textContent = userMsgs.length;
    if (DOM.statAiMsgsDrawer) DOM.statAiMsgsDrawer.textContent = aiMsgs.length;
    if (DOM.statActionsDrawer) DOM.statActionsDrawer.textContent = thread.richActions || 0;

    if (DOM.msgCount) DOM.msgCount.textContent = thread.userMessageCount || 0;
    if (DOM.sessionLimit) DOM.sessionLimit.classList.toggle('warning', (thread.userMessageCount || 0) >= CONFIG.SESSION_LIMIT - 2);
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
    if (DOM.focusLabel) DOM.focusLabel.textContent = d.label;
    if (DOM.focusDesc) DOM.focusDesc.textContent = d.desc;
    if (DOM.focusLabelDrawer) DOM.focusLabelDrawer.textContent = d.label;
    if (DOM.focusDescDrawer) DOM.focusDescDrawer.textContent = d.desc;
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

  // =====================================================
  // FIX: Format conversation history for API
  // =====================================================
  function formatHistoryForAPI(messages) {
    console.log('🔄 formatHistoryForAPI called');
    console.log('📥 Raw messages count:', messages?.length || 0);
    console.log('📥 Raw messages:', messages);
    
    if (!messages || !messages.length) {
      console.log('⚠️ No messages to format - returning empty array');
      return [];
    }
    
    // Take the last N messages to avoid token overflow
    const recentMessages = messages.slice(-CONFIG.MAX_HISTORY_MESSAGES);
    console.log('📊 Recent messages (last', CONFIG.MAX_HISTORY_MESSAGES, '):', recentMessages);
    
    const formatted = recentMessages.map(msg => ({
      role: msg.dir === 'out' ? 'user' : 'assistant',
      content: msg.text
    }));
    
    console.log('✅ Formatted history:', formatted);
    return formatted;
  }

  // API
  async function callAPI(chatId, userText, history = []) {
    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 callAPI START');
    console.log('📍 Chat ID:', chatId);
    console.log('💬 User text:', userText);
    console.log('📜 History array length:', history?.length || 0);
    console.log('📜 History array:', history);
    
    if (!CONFIG.USE_REAL_API) {
      console.log('⚠️ Using mock API (USE_REAL_API is false)');
      return { reply: getMockReply(chatId, userText), focus: 'general', scoreDelta: calculateDelta(userText), mode: 'reply' };
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
    try {
      // =====================================================
      // FIX: Include formatted history in the request body
      // =====================================================
      const formattedHistory = formatHistoryForAPI(history);
      
      const requestBody = { 
        text: userText,
        history: formattedHistory,  // ✅ NOW INCLUDED!
        chatId: chatId              // Also send chatId for context
      };
      
      console.log('📤 REQUEST BODY:', JSON.stringify(requestBody, null, 2));
      console.log('🌐 Sending to:', CONFIG.WORKER_URL);
      
      const res = await fetch(CONFIG.WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      console.log('📡 Response status:', res.status, res.statusText);
      
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      
      console.log('📥 RESPONSE DATA:', JSON.stringify(data, null, 2));
      console.log('═══════════════════════════════════════════════════');
      
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
        
        const fullReply = nextAction ? `${reply}\n\n→ Action: ${nextAction}` : reply;
        
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

  // Messaging
  async function sendMessage() {
    console.log('🚨 sendMessage() CALLED');
    console.log('📌 state.isSending:', state.isSending);
    
    if (state.isSending) {
      console.log('⚠️ EARLY EXIT: Already sending');
      return;
    }
    
    const chatId = state.activeChatId;
    console.log('📌 activeChatId:', chatId);
    
    if (!chatId) {
      console.log('⚠️ EARLY EXIT: No active chat');
      return;
    }
    
    const text = DOM.msgInput.value.trim();
    console.log('📌 Message text:', text);
    console.log('📌 Message length:', text.length);
    
    if (!text) {
      console.log('⚠️ EARLY EXIT: Empty message');
      return;
    }
    
    console.log('✅ All checks passed, proceeding with message send');

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

    // =====================================================
    // FIX: Get history BEFORE adding the new message
    // so the API gets the full context including the new message
    // =====================================================
    console.log('💾 Getting history for chatId:', chatId);
    console.log('💾 state.messages.has(chatId):', state.messages.has(chatId));
    console.log('💾 state.messages Map keys:', Array.from(state.messages.keys()));
    
    const history = state.messages.get(chatId) || [];
    
    console.log('💾 Retrieved history length:', history.length);
    console.log('💾 Retrieved history:', history);
    
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
      updateTheme();
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
    
    console.log('💾 addMessage called - chatId:', chatId, 'dir:', dir);
    console.log('💾 Message being saved:', msg);
    
    await DB.put('messages', msg);
    
    console.log('✅ Message saved to IndexedDB');
    
    if (!state.messages.has(chatId)) {
      console.log('📝 Creating new messages array for chatId:', chatId);
      state.messages.set(chatId, []);
    }
    
    state.messages.get(chatId).push(msg);
    console.log('✅ Message added to state.messages - total count:', state.messages.get(chatId).length);
    
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
    el.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div><span style="color:var(--text-secondary);font-size:12px;margin-left:4px">Thinking...</span>';
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

→ Action: Pick ONE voice and follow their advice for 48 hours.`;

    const member = COUNCIL.find(c => c.id === chatId);
    await addMessage(chatId, 'in', response.reply || fallbackResponse, {
      tag: '🏛️ Council',
      chips: [{ action: 'next', label: '→ Follow up' }]
    });

    renderThread();
  }

  // Biometric unlock
  async function attemptBiometricUnlock() {
    try {
      if (!window.PublicKeyCredential) {
        showToast('⚠️ Biometrics not supported');
        return;
      }
      
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Money AI' },
          user: { id: new Uint8Array(16), name: 'user', displayName: 'User' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: 'platform' }
        }
      });
      
      if (credential) unlockApp();
    } catch (err) {
      console.log('Biometric failed:', err);
      showToast('⚠️ Try demo mode');
    }
  }

  function unlockApp() {
    state.isLocked = false;
    DOM.lockScreen.classList.add('hidden');
    DOM.app.classList.remove('hidden');
    showToast('👋 Welcome to Money AI');
  }

  // Reels
  function openReelQueue(contactId) {
    const reelsArray = Array.from(state.reels.values());
    const startIndex = reelsArray.findIndex(r => r.contactId === contactId);
    if (startIndex === -1) return;
    
    state.reelQueue = reelsArray;
    state.currentReelIndex = startIndex;
    
    DOM.reelViewer.classList.add('open');
    showCurrentReel();
  }

  function showCurrentReel() {
    const reel = state.reelQueue[state.currentReelIndex];
    if (!reel) { closeReel(); return; }
    
    const day = getDayKey();
    markReelRead(day, reel.contactId);
    
    // Update progress segments
    DOM.reelProgressSegments.innerHTML = state.reelQueue.map((_, i) => 
      `<div class="reel-segment ${i < state.currentReelIndex ? 'viewed' : ''} ${i === state.currentReelIndex ? 'active' : ''}"></div>`
    ).join('');
    
    DOM.reelAvatar.textContent = reel.emoji;
    DOM.reelAvatar.style.background = `linear-gradient(135deg,${reel.accent},${reel.accent}66)`;
    DOM.reelAuthor.textContent = reel.name;
    DOM.reelRole.textContent = reel.role;
    DOM.reelTitle.textContent = reel.title;
    DOM.reelLines.innerHTML = reel.lines.map(l => `<p>${l}</p>`).join('');
    DOM.reelCta.textContent = `Reply with "${reel.hook}"`;
    DOM.reelReplyInput.value = '';
    DOM.reelReplyInput.placeholder = `Reply to ${reel.name}...`;
    
    // Auto-advance timer
    clearInterval(state.reelTimer);
    state.reelTimer = setInterval(nextReel, CONFIG.REEL_DURATION);
  }

  function nextReel() {
    if (state.currentReelIndex < state.reelQueue.length - 1) {
      state.currentReelIndex++;
      showCurrentReel();
    } else {
      closeReel();
    }
  }

  function prevReel() {
    if (state.currentReelIndex > 0) {
      state.currentReelIndex--;
      showCurrentReel();
    }
  }

  function closeReel() {
    clearInterval(state.reelTimer);
    DOM.reelViewer.classList.remove('open');
    state.reelQueue = [];
    state.currentReelIndex = 0;
  }

  async function sendReelReply() {
    const reel = state.reelQueue[state.currentReelIndex];
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

  function markReelRead(day, contactId) {
    if (!state.reads.reelsRead[day]) state.reads.reelsRead[day] = {};
    state.reads.reelsRead[day][contactId] = true;
    saveReads();
    renderStoriesStrip();
  }

  // Insights Drawer
  function openInsightsDrawer() {
    DOM.insightsOverlay.classList.add('open');
    DOM.insightsDrawer.classList.add('open');
  }

  function closeInsightsDrawer() {
    DOM.insightsOverlay.classList.remove('open');
    DOM.insightsDrawer.classList.remove('open');
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
    console.log('💬 Opening chat:', chatId);
    state.activeChatId = chatId;
    console.log('✅ activeChatId set to:', state.activeChatId);
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
    console.log('🔗 Binding events...');
    DOM.btnUnlock.onclick = attemptBiometricUnlock;
    DOM.btnUnlockDemo.onclick = unlockApp;
    DOM.btnBack.onclick = () => setRoute('home');
    DOM.btnStartChat.onclick = () => {
      const firstReel = state.reels.values().next().value;
      if (firstReel) openReelQueue(firstReel.id);
      else if (COUNCIL.length) openChat(COUNCIL[0].id);
    };
    DOM.searchInput.oninput = renderChatList;
    DOM.msgInput.oninput = () => {
      autoGrow(DOM.msgInput);
      DOM.btnSend.disabled = !DOM.msgInput.value.trim();
    };
    DOM.msgInput.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { 
        console.log('⌨️ Enter key pressed, calling sendMessage()');
        e.preventDefault(); 
        sendMessage(); 
      }
    };
    DOM.btnSend.onclick = () => {
      console.log('🖱️ Send button clicked, calling sendMessage()');
      sendMessage();
    };
    console.log('✅ Event handlers attached to:', {
      btnSend: !!DOM.btnSend.onclick,
      msgInput: !!DOM.msgInput.onkeydown
    });
    DOM.quickActions.onclick = e => {
      const btn = e.target.closest('.quick-btn');
      if (btn) handleChip(btn.dataset.action);
    };
    DOM.btnCouncil.onclick = summonCouncil;
    
    // Theme toggle
    if (DOM.themeToggle) DOM.themeToggle.onclick = toggleTheme;
    
    // Insights drawer
    if (DOM.btnInsights) DOM.btnInsights.onclick = openInsightsDrawer;
    if (DOM.insightsOverlay) DOM.insightsOverlay.onclick = closeInsightsDrawer;
    if (DOM.drawerClose) DOM.drawerClose.onclick = closeInsightsDrawer;
    
    // Reel controls
    DOM.btnCloseReel.onclick = closeReel;
    DOM.reelViewer.onclick = e => { if (e.target === DOM.reelViewer) closeReel(); };
    DOM.btnReelSend.onclick = sendReelReply;
    DOM.reelReplyInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); sendReelReply(); } };
    
    // Touch zones for reel navigation
    if (DOM.reelTouchPrev) DOM.reelTouchPrev.onclick = prevReel;
    if (DOM.reelTouchNext) DOM.reelTouchNext.onclick = nextReel;
    
    // Keyboard navigation
    window.onkeydown = e => {
      if (DOM.reelViewer.classList.contains('open')) {
        if (e.key === 'Escape') closeReel();
        else if (e.key === 'ArrowLeft') prevReel();
        else if (e.key === 'ArrowRight') nextReel();
      }
    };
    
    document.onvisibilitychange = () => { if (!document.hidden) { generateReels(); renderStoriesStrip(); } };
    
    // Handle resize for responsive behavior
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Close drawer on desktop
        if (window.innerWidth >= 1200) {
          closeInsightsDrawer();
        }
      }, 100);
    });
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
      console.log('🏛️ Money AI v3 ready (with history support)');
    } catch (err) {
      console.error('Init failed:', err);
      showToast('⚠️ Failed to initialize');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
