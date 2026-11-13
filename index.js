// index.js - Redesigned All COD Executions script
// Handles dynamic JSON loading, tab transitions, backgrounds, search, video modals,
// Discord authentication, inventory management, and Turso DB sync.

document.addEventListener('DOMContentLoaded', () => {
  let executionsData = {};
  let currentActiveTab = 'mw'; // default
  let ownedItems = new Set(); // Stores item_key strings e.g. "MW:Point Blank"
  let currentInventoryFilter = 'all'; // 'all', 'owned', 'unowned'
  let currentViewMode = localStorage.getItem('userViewMode') || 'grid'; // 'grid', 'compact', 'list'
  let currentSortOrder = localStorage.getItem('userSortOrder') || 'default'; // 'default', 'name-asc', etc.
  let currentUser = null; // { id, username, avatar }
  
  // Live Item Shop State (itemshop.gg API)
  let itemShopClient = null;
  let liveShopData = null;
  let liveFinishersByName = new Map();
  let liveFinishersByBundle = new Map();
  let liveFinishersList = [];
  let liveShopAttribution = {
    text: 'Data from itemshop.gg',
    url: 'https://itemshop.gg/call-of-duty',
    termsUrl: 'https://itemshop.gg/terms#api'
  };

  // Credentials & CDN
  const CDN_BASE_URL = 'https://pub-21d091e8cc674a2c9f1f8a59eac107b6.r2.dev';

  function resolveAssetUrl(path) {
    if (!path || typeof path !== 'string') return '';
    const trimmed = path.trim();
    if (!trimmed || trimmed === 'Icon' || trimmed === 'Preview') return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;

    // Only execution move assets (assets/<game>/... and assets/previews/...) go to Cloudflare CDN.
    // Root website UI assets (assets/favicon.svg, assets/missing_preview.jpg, images/...) stay local!
    if (/^assets\/(previews|[A-Za-z0-9]+)\/.+/i.test(cleanPath)) {
      return `${CDN_BASE_URL}/${cleanPath}`;
    }
    if (/^previews\/[A-Za-z0-9]+\/.+/i.test(cleanPath)) {
      return `${CDN_BASE_URL}/assets/${cleanPath}`;
    }
    if (/^[A-Za-z0-9]+\/[^/]+\.(png|gif|webp|jpg|jpeg)$/i.test(cleanPath) && !cleanPath.toLowerCase().startsWith('images/')) {
      return `${CDN_BASE_URL}/assets/${cleanPath}`;
    }
    return cleanPath;
  }

  function resolveDatasetUrls(data) {
    if (!data) return {};
    const res = {};
    for (const [k, list] of Object.entries(data)) {
      if (Array.isArray(list)) {
        res[k] = list.map(item => ({
          ...item,
          icon: resolveAssetUrl(item.icon),
          preview: resolveAssetUrl(item.preview)
        }));
      } else {
        res[k] = list;
      }
    }
    return res;
  }
  const TURSO_URL = 'https://inventory-adrianowo.aws-eu-west-1.turso.io/v2/pipeline';
  const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODU5NDk1MDEsImlkIjoiMDE5ZmQyZTEtNWIwMS03NDJjLWI1ZjUtMTQ0NmY3ZjRlODUyIiwia2lkIjoiVlVBcG40eHk2eTR2d0lVT1RSTng2MDd5SUFoWmcwNG1vTFFrN0x5b3BQOCIsInJpZCI6IjAzYzA0N2I5LWY5ZjUtNDBlNi04NDdmLWNhYTYzYjkzODI1YiJ9.UaXwCWM4NZQ0lPd8_QQ1tpZ_I_SMyiQ2M1ljWe8C5RO_e2iSeBIO5wmjVSH55RuoMmZuBnG84O6szEyRKLNNCw';
  const DISCORD_CLIENT_ID = '1522200189006516304';
  const DISCORD_BOT_TOKEN = atob('TVRVeU1qSXdNREU0T1RBd05qVXhOak13TkEuR1VSOHFaLnhiUFZtdTUzWnA5eE1FN2o0b1hyNE1PTFVmeTlQajNQZF9FV0Rj');

  // DOM Elements
  const tabs = Array.from(document.querySelectorAll('.nav-item'));
  const sections = Array.from(document.querySelectorAll('.game-section'));
  const bgContainer = document.getElementById('bg-container');
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const viewBtns = Array.from(document.querySelectorAll('#view-mode-group .view-btn'));

  // Auth DOM Elements
  const btnDiscordLogin = document.getElementById('btn-discord-login');
  const userProfileBar = document.getElementById('user-profile-bar');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userStats = document.getElementById('user-stats');
  const btnLogout = document.getElementById('btn-logout');

  // Modal DOM Elements
  const loginModalOverlay = document.getElementById('login-modal-overlay');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const btnOauthLogin = document.getElementById('btn-oauth-login');
  const btnIdLogin = document.getElementById('btn-id-login');
  const discordUserIdInput = document.getElementById('discord-user-id-input');
  const idInputError = document.getElementById('id-input-error');

  // Filter Buttons & Stats
  const filterBtns = Array.from(document.querySelectorAll('.filter-btn'));
  const statsCount = document.getElementById('stats-count');
  const statsPct = document.getElementById('stats-pct');

  // Shop DOM Elements (itemshop.gg)
  const btnLiveShop = document.getElementById('btn-live-shop');
  const liveShopBtnBadge = document.getElementById('live-shop-btn-badge');
  const shopFilterBtn = document.getElementById('filter-in-shop');
  const shopFilterCount = document.getElementById('shop-filter-count');
  const shopModalOverlay = document.getElementById('shop-modal-overlay');
  const shopModalCloseBtn = document.getElementById('shop-modal-close-btn');
  const shopModalDate = document.getElementById('shop-modal-date');
  const shopModalAttrHeader = document.getElementById('shop-modal-attribution-header');
  const shopModalAttrFooter = document.getElementById('shop-modal-attribution-footer');
  const shopModalUpdatedTime = document.getElementById('shop-modal-updated-time');
  const shopTabBtns = Array.from(document.querySelectorAll('.shop-tab-btn'));
  const shopTabContents = Array.from(document.querySelectorAll('.shop-tab-content'));
  const shopFinishersGrid = document.getElementById('shop-finishers-grid');
  const shopSectionsContainer = document.getElementById('shop-sections-container');
  const shopOverviewContainer = document.getElementById('shop-overview-container');
  const shopTabFinishersCount = document.getElementById('shop-tab-finishers-count');
  const shopTabItemsCount = document.getElementById('shop-tab-items-count');

  // Background maps
  const bgMap = {
    mw: { full: 'images/backgrounds/mw2019.jpg', tiny: 'images/backgrounds/mw_lh.jpg' },
    cw: { full: 'images/backgrounds/bocw.jpg', tiny: 'images/backgrounds/bocw_lh.jpg' },
    vg: { full: 'images/backgrounds/vanguard.jpg', tiny: 'images/backgrounds/vg_lh.jpg' },
    mwii: { full: 'images/backgrounds/mwii.jpg', tiny: 'images/backgrounds/mwii_lh.jpg' },
    mwiii: { full: 'images/backgrounds/mwiii.jpg', tiny: 'images/backgrounds/mwiii_lh.jpg' },
    bo6: { full: 'images/backgrounds/bo6.jpg', tiny: 'images/backgrounds/bo6_lh.jpg' },
    bo7: { full: 'images/backgrounds/bo7.jpg', tiny: 'images/backgrounds/bo7_lh.jpg' },
    mw4: { full: 'images/backgrounds/mw4.jpg', tiny: 'images/backgrounds/mw4_lh.jpg' }
  };

  const preloadedImages = [];

  // ==========================================
  // TURSO DATABASE ENGINE
  // ==========================================
  async function tursoExecute(sql, args = []) {
    try {
      const formattedArgs = args.map(arg => ({ type: 'text', value: String(arg) }));
      const stmt = { sql };
      if (formattedArgs.length > 0) stmt.args = formattedArgs;

      const res = await fetch(TURSO_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TURSO_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests: [{ type: 'execute', stmt }] })
      });

      if (!res.ok) throw new Error(`Turso HTTP Error ${res.status}`);
      const data = await res.json();
      return data?.results?.[0]?.response?.result;
    } catch (err) {
      console.error('Turso DB Query Failed:', err);
      return null;
    }
  }

  const TURSO_CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache for DB reads

  async function loadInventoryFromTurso(userId) {
    if (!userId) return;

    const cacheKey = `turso_inv_${userId}`;
    const timeKey = `turso_inv_time_${userId}`;

    const cachedInv = localStorage.getItem(cacheKey);
    const cachedTime = parseInt(localStorage.getItem(timeKey) || '0', 10);

    // 1. Load from local cache if valid (0 read queries to Turso DB)
    if (cachedInv && cachedTime && (Date.now() - cachedTime < TURSO_CACHE_TTL)) {
      try {
        const items = JSON.parse(cachedInv);
        ownedItems.clear();
        items.forEach(k => ownedItems.add(k));
        updateInventoryStats();
        renderAllBuilds();
        filterBuilds();
        return;
      } catch (e) {}
    }

    // 2. Fetch from Turso DB only when cache is missing/expired
    const result = await tursoExecute(
      'SELECT item_key FROM user_inventories WHERE user_id = ?;',
      [userId]
    );
    ownedItems.clear();
    if (result && result.rows) {
      result.rows.forEach(row => {
        if (row[0] && row[0].value) {
          ownedItems.add(row[0].value);
        }
      });
    }

    const invArray = Array.from(ownedItems);
    localStorage.setItem(cacheKey, JSON.stringify(invArray));
    localStorage.setItem(timeKey, Date.now().toString());

    updateInventoryStats();
    renderAllBuilds();
    filterBuilds();
  }

  async function syncOwnedItemToTurso(userId, itemKey, isAdd) {
    if (!userId) return;

    // Immediately sync local cache so no DB read query is needed
    const cacheKey = `turso_inv_${userId}`;
    const timeKey = `turso_inv_time_${userId}`;
    const invArray = Array.from(ownedItems);
    localStorage.setItem(cacheKey, JSON.stringify(invArray));
    localStorage.setItem(timeKey, Date.now().toString());

    if (isAdd) {
      await tursoExecute(
        'INSERT OR REPLACE INTO user_inventories (user_id, item_key) VALUES (?, ?);',
        [userId, itemKey]
      );
    } else {
      await tursoExecute(
        'DELETE FROM user_inventories WHERE user_id = ? AND item_key = ?;',
        [userId, itemKey]
      );
    }
  }

  async function saveUserProfileToTurso(userId, username, avatar) {
    const profileKey = `turso_prof_${userId}`;
    const profileStr = `${username}|${avatar}`;

    if (localStorage.getItem(profileKey) === profileStr) {
      return; // Skip duplicate DB write if profile unchanged
    }

    const res = await tursoExecute(
      'INSERT OR REPLACE INTO users (user_id, username, avatar) VALUES (?, ?, ?);',
      [userId, username, avatar]
    );
    if (res !== null) {
      localStorage.setItem(profileKey, profileStr);
    }
  }

  // ==========================================
  // DISCORD AUTHENTICATION
  // ==========================================
  function initAuth() {
    // 1. Check for OAuth hash fragment in URL
    const hash = window.location.hash;
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
        fetch('https://discord.com/api/v10/users/@me', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(user => {
            if (user && user.id) {
              const avatarUrl = user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                : resolveAssetUrl('assets/favicon.svg');
              loginUser({
                id: String(user.id),
                username: user.global_name || user.username || 'Discord User',
                avatar: avatarUrl
              });
            }
          })
          .catch(err => console.error('OAuth user fetch failed:', err));
        return;
      }
    }

    // 2. Check saved session in localStorage
    const savedUser = localStorage.getItem('discord_user');
    if (savedUser) {
      try {
        const userObj = JSON.parse(savedUser);
        loginUser(userObj, false);
      } catch (e) {
        localStorage.removeItem('discord_user');
        loadGuestInventory();
      }
    } else {
      loadGuestInventory();
    }
  }

  function loadGuestInventory() {
    ownedItems.clear();
    updateAuthUI();
    updateInventoryStats();
  }

  async function loginUser(userProfile, isNewLogin = true) {
    currentUser = userProfile;
    localStorage.setItem('discord_user', JSON.stringify(userProfile));

    // Save profile to Turso
    saveUserProfileToTurso(userProfile.id, userProfile.username, userProfile.avatar);

    // Check for guest items to merge into Turso
    if (isNewLogin) {
      const guestData = localStorage.getItem('guest_inventory');
      if (guestData) {
        try {
          const arr = JSON.parse(guestData);
          for (const itemKey of arr) {
            await syncOwnedItemToTurso(userProfile.id, itemKey, true);
          }
          localStorage.removeItem('guest_inventory');
        } catch (e) {}
      }
    }

    updateAuthUI();
    await loadInventoryFromTurso(userProfile.id);
  }

  function logoutUser() {
    currentUser = null;
    localStorage.removeItem('discord_user');
    loadGuestInventory();
    renderAllBuilds();
    filterBuilds();
  }

  function updateAuthUI() {
    const viewOnlyBadge = document.getElementById('view-only-badge');
    if (currentUser) {
      btnDiscordLogin.classList.add('hidden');
      if (viewOnlyBadge) viewOnlyBadge.classList.add('hidden');
      userProfileBar.classList.remove('hidden');
      userAvatar.src = currentUser.avatar || resolveAssetUrl('assets/favicon.svg');
      userName.textContent = currentUser.username;
    } else {
      btnDiscordLogin.classList.remove('hidden');
      if (viewOnlyBadge) viewOnlyBadge.classList.remove('hidden');
      userProfileBar.classList.add('hidden');
    }
  }

  function showIdError(msg) {
    if (idInputError) {
      idInputError.textContent = msg;
      idInputError.classList.remove('hidden');
    }
    if (discordUserIdInput) {
      discordUserIdInput.classList.add('error');
    }
  }

  function clearIdError() {
    if (idInputError) {
      idInputError.textContent = '';
      idInputError.classList.add('hidden');
    }
    if (discordUserIdInput) {
      discordUserIdInput.classList.remove('error');
    }
  }

  function openLoginModalWithNotice(msg) {
    const noticeBanner = document.getElementById('login-notice-banner');
    const noticeText = document.getElementById('login-notice-text');
    if (noticeBanner && noticeText) {
      noticeText.textContent = msg || 'Authentication Required: Please connect your Discord account or enter your User ID to mark executions as owned.';
      noticeBanner.classList.remove('hidden');
    }
    clearIdError();
    loginModalOverlay.classList.remove('hidden');
  }

  function hideLoginNotice() {
    const noticeBanner = document.getElementById('login-notice-banner');
    if (noticeBanner) noticeBanner.classList.add('hidden');
  }

  // Discord Login Modal handlers
  btnDiscordLogin.addEventListener('click', () => {
    hideLoginNotice();
    clearIdError();
    loginModalOverlay.classList.remove('hidden');
  });

  modalCloseBtn.addEventListener('click', () => {
    hideLoginNotice();
    clearIdError();
    loginModalOverlay.classList.add('hidden');
  });

  loginModalOverlay.addEventListener('click', (e) => {
    if (e.target === loginModalOverlay) {
      hideLoginNotice();
      clearIdError();
      loginModalOverlay.classList.add('hidden');
    }
  });

  btnOauthLogin.addEventListener('click', () => {
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=token&scope=identify&redirect_uri=${redirectUri}`;
    window.location.href = oauthUrl;
  });

  async function handleIdLogin() {
    clearIdError();
    const inputVal = discordUserIdInput.value.trim();

    if (!inputVal) {
      showIdError('Please enter a Discord User ID.');
      discordUserIdInput.focus();
      return;
    }

    if (!/^\d+$/.test(inputVal)) {
      showIdError('Usernames are not allowed. Please enter your numerical Discord User ID (e.g. 1522200189006516304).');
      discordUserIdInput.focus();
      return;
    }

    if (!/^\d{17,20}$/.test(inputVal)) {
      showIdError('Invalid Discord User ID format. Discord User IDs must be between 17 and 20 digits long.');
      discordUserIdInput.focus();
      return;
    }

    btnIdLogin.disabled = true;
    btnIdLogin.textContent = '...';

    try {
      const res = await fetch(`https://discord.com/api/v10/users/${inputVal}`, {
        headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
      });
      if (res.ok) {
        const user = await res.json();
        const avatarUrl = user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : resolveAssetUrl('assets/favicon.svg');
        loginUser({
          id: String(user.id),
          username: user.global_name || user.username || 'Discord User',
          avatar: avatarUrl
        });
        loginModalOverlay.classList.add('hidden');
        discordUserIdInput.value = '';
      } else {
        // Direct fallback ID
        loginUser({
          id: inputVal,
          username: `User ${inputVal.substring(0, 8)}`,
          avatar: resolveAssetUrl('assets/favicon.svg')
        });
        loginModalOverlay.classList.add('hidden');
        discordUserIdInput.value = '';
      }
    } catch (err) {
      console.warn('Bot API call error, falling back:', err);
      loginUser({
        id: inputVal,
        username: `User ${inputVal.substring(0, 8)}`,
        avatar: resolveAssetUrl('assets/favicon.svg')
      });
      loginModalOverlay.classList.add('hidden');
      discordUserIdInput.value = '';
    } finally {
      btnIdLogin.disabled = false;
      btnIdLogin.textContent = 'Connect';
    }
  }

  btnIdLogin.addEventListener('click', handleIdLogin);
  discordUserIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleIdLogin();
  });
  discordUserIdInput.addEventListener('input', clearIdError);

  btnLogout.addEventListener('click', logoutUser);

  // ==========================================
  // INVENTORY MANAGEMENT LOGIC
  // ==========================================
  function toggleOwned(gameKey, buildName) {
    if (!currentUser) {
      openLoginModalWithNotice('Authentication Required: Connect your Discord account or enter your User ID to mark executions as owned.');
      return;
    }

    const itemKey = `${gameKey.toUpperCase()}:${buildName}`;
    const isNowOwned = !ownedItems.has(itemKey);

    if (isNowOwned) {
      ownedItems.add(itemKey);
    } else {
      ownedItems.delete(itemKey);
    }

    syncOwnedItemToTurso(currentUser.id, itemKey, isNowOwned);

    updateInventoryStats();
    updateCardOwnedState(itemKey, isNowOwned);
    filterBuilds();
  }

  function updateCardOwnedState(itemKey, isOwned) {
    const card = document.querySelector(`.build[data-item-key="${CSS.escape(itemKey)}"]`);
    if (card) {
      if (isOwned) {
        card.classList.add('is-owned');
      } else {
        card.classList.remove('is-owned');
      }
      const badge = card.querySelector('.owned-badge');
      if (badge) {
        badge.innerHTML = isOwned ? '✓' : '+';
        badge.title = isOwned ? 'Mark as Unowned' : 'Mark as Owned';
      }
    }
  }

  function updateInventoryStats() {
    let total = 0;
    Object.values(executionsData).forEach(list => {
      if (Array.isArray(list)) total += list.length;
    });

    if (!currentUser) {
      if (statsCount) statsCount.textContent = `--/${total}`;
      if (statsPct) statsPct.textContent = `View-Only`;
      if (userStats) userStats.textContent = `0 Owned`;
      return;
    }

    const ownedCount = ownedItems.size;
    const pct = total > 0 ? ((ownedCount / total) * 100).toFixed(1) : '0';

    if (statsCount) statsCount.textContent = `${ownedCount}/${total}`;
    if (statsPct) statsPct.textContent = `${pct}%`;
    if (userStats) userStats.textContent = `${ownedCount} Owned`;
  }

  // Filter Group Listener
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!currentUser && (btn.dataset.filter === 'owned' || btn.dataset.filter === 'unowned')) {
        openLoginModalWithNotice('Authentication Required: Please connect your Discord account or enter your User ID to view owned/unowned inventory.');
        return;
      }
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentInventoryFilter = btn.dataset.filter;
      filterBuilds();
      animateCards();
    });
  });

  // ==========================================
  // GOOGLE SHEETS CSV DATA LOADER
  // ==========================================
  const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9EOMdiacUjhgNkMA8tQze2PqKXThqPX4MxCUZNnS-3GNuGapsATPrYJKLWggNaJjcaLz89JL23ovP/pub?gid=1458453375&single=true&output=csv';

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return [];

    function parseLine(line) {
      const result = [];
      let start = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
          inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
          let field = line.substring(start, i).trim();
          if (field.startsWith('"') && field.endsWith('"')) {
            field = field.slice(1, -1).replace(/""/g, '"');
          }
          result.push(field);
          start = i + 1;
        }
      }
      let field = line.substring(start).trim();
      if (field.startsWith('"') && field.endsWith('"')) {
        field = field.slice(1, -1).replace(/""/g, '"');
      }
      result.push(field);
      return result;
    }

    const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parsed = parseLine(lines[i]);
      if (parsed.length === 0) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = parsed[idx] ? parsed[idx].trim() : '';
      });
      rows.push(obj);
    }
    return rows;
  }

  function formatPrice(price, style = 'full') {
    if (price === null || price === undefined || price === '') {
      if (style === 'card') return '<span class="price-text-card">N/A</span><span class="price-text-list">UNKNOWN</span>';
      if (style === 'compact') return 'N/A';
      if (style === 'upper' || style === 'list') return 'UNKNOWN';
      return 'Unknown';
    }
    const num = typeof price === 'number' ? price : parseFloat(String(price).replace(/,/g, '').replace(/CP/i, '').trim());
    if (isNaN(num) || num < 0) {
      if (style === 'card') return '<span class="price-text-card">N/A</span><span class="price-text-list">UNKNOWN</span>';
      if (style === 'compact') return 'N/A';
      if (style === 'upper' || style === 'list') return 'UNKNOWN';
      return 'Unknown';
    }
    if (num === 0) {
      return (style === 'card' || style === 'upper' || style === 'list') ? 'FREE' : 'Free';
    }
    return `${Math.round(num)} CP`;
  }

  const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache to prevent rate limiting

  async function loadAllExecutionData() {
    let csvText = '';
    const cachedText = localStorage.getItem('sheet_csv_cache');
    const cachedTime = parseInt(localStorage.getItem('sheet_csv_time') || '0', 10);

    // 1. Use valid local cache if within 15 minutes (0 requests to Google API)
    if (cachedText && cachedTime && (Date.now() - cachedTime < CACHE_TTL_MS)) {
      csvText = cachedText;
    } else {
      // 2. Fetch live data with CORS proxy fallback
      try {
        const res = await fetch(GOOGLE_SHEET_CSV_URL);
        if (res.ok) {
          csvText = await res.text();
        }
      } catch (err) {
        console.warn('Direct Google Sheets fetch failed/blocked, trying CORS proxy:', err);
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(GOOGLE_SHEET_CSV_URL)}`;
          const proxyRes = await fetch(proxyUrl);
          if (proxyRes.ok) {
            csvText = await proxyRes.text();
          }
        } catch (proxyErr) {
          console.warn('CORS proxy fetch failed:', proxyErr);
        }
      }

      if (csvText && csvText.includes('game,name')) {
        localStorage.setItem('sheet_csv_cache', csvText);
        localStorage.setItem('sheet_csv_time', Date.now().toString());
      }
    }

    // 3. Fallback to cached CSV text if network fetch failed
    if (!csvText && cachedText) {
      csvText = cachedText;
    }

    if (csvText && csvText.includes('game,name')) {
      try {
        const rows = parseCSV(csvText);
        const compiled = {};

        // Build lookup map by lowercase stripped name: game:normName -> fallback item
        const normalizeName = s => (s || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const fallbackMap = new Map();
        if (typeof FALLBACK_EXECUTIONS_DATA !== 'undefined') {
          for (const [gKey, items] of Object.entries(FALLBACK_EXECUTIONS_DATA)) {
            if (Array.isArray(items)) {
              for (const it of items) {
                if (it && it.name) {
                  fallbackMap.set(`${gKey.toUpperCase()}:${normalizeName(it.name)}`, it);
                }
              }
            }
          }
        }

        rows.forEach(row => {
          const game = (row.game || '').trim().toUpperCase();
          const rawName = (row.name || '').trim();
          if (!game || !rawName) return;

          const cleanName = rawName.replace(/[^a-zA-Z0-9]/g, '');
          const normKey = `${game}:${normalizeName(rawName)}`;
          const fallbackItem = fallbackMap.get(normKey);

          const rawPrice = (row.price !== undefined && row.price !== null) ? String(row.price).trim() : '';
          let price = null;
          if (rawPrice !== '') {
            const parsedPrice = parseInt(rawPrice.replace(/,/g, '').replace(/CP/i, '').trim(), 10);
            if (!isNaN(parsedPrice)) {
              price = parsedPrice;
            }
          }

          const aliases = row.aliases
            ? row.aliases.split(',').map(a => a.trim()).filter(Boolean)
            : [];

          const animTimeVal = parseFloat(row.anim_time);
          const ttkVal = parseFloat(row.ttk);

          const iconVal = (row.icon || '').trim();
          const previewVal = (row.preview || '').trim();

          let resolvedIcon = (iconVal && iconVal !== 'Icon') ? iconVal : '';
          if (!resolvedIcon && fallbackItem && fallbackItem.icon && fallbackItem.icon !== 'Icon') {
            resolvedIcon = fallbackItem.icon;
          }
          if (!resolvedIcon) {
            resolvedIcon = `assets/${game}/${cleanName}.png`;
          }

          let resolvedPreview = (previewVal && previewVal !== 'Preview') ? previewVal : '';
          if (!resolvedPreview && fallbackItem && fallbackItem.preview && fallbackItem.preview !== 'Preview') {
            resolvedPreview = fallbackItem.preview;
          }
          if (!resolvedPreview) {
            resolvedPreview = `assets/previews/${game}/${cleanName}.gif`;
          }

          const item = {
            name: rawName,
            clean_name: fallbackItem && fallbackItem.clean_name ? fallbackItem.clean_name : cleanName,
            game: game,
            price: price,
            bundle: (row.bundle || '').trim(),
            bundle_url: (row.bundle_url || '').trim(),
            aliases: aliases,
            icon: resolveAssetUrl(resolvedIcon),
            preview: resolveAssetUrl(resolvedPreview),
            standing: row.standing || '',
            prone: row.prone || '',
            downed: row.downed || '',
            anim_time: !isNaN(animTimeVal) ? animTimeVal : 0,
            ttk: !isNaN(ttkVal) ? ttkVal : 0
          };

          if (!compiled[game]) compiled[game] = [];
          compiled[game].push(item);
        });

        executionsData = resolveDatasetUrls(compiled);
      } catch (parseErr) {
        console.error('Google Sheet CSV parse error, using embedded fallback:', parseErr);
        if (typeof FALLBACK_EXECUTIONS_DATA !== 'undefined') {
          executionsData = resolveDatasetUrls(FALLBACK_EXECUTIONS_DATA);
        }
      }
    } else if (typeof FALLBACK_EXECUTIONS_DATA !== 'undefined') {
      executionsData = resolveDatasetUrls(FALLBACK_EXECUTIONS_DATA);
    }

    renderAllBuilds();
    updateInventoryStats();
    animateCards();
  }

  // ==========================================
  // MAIN APP INITIALIZATION & RENDER
  // ==========================================
  function init() {
    // 1. Load active tab from localStorage with robust fallback
    const savedTab = localStorage.getItem('activeTab');
    const defaultTab = 'mw';
    const targetTabId = savedTab && document.getElementById(savedTab) ? savedTab : defaultTab;

    tabs.forEach(t => t.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    const tabToActivate = tabs.find(t => t.dataset.target === targetTabId) || tabs[0];
    if (tabToActivate) tabToActivate.classList.add('active');

    const targetSection = document.getElementById(targetTabId) || sections[0];
    if (targetSection) targetSection.classList.add('active');

    currentActiveTab = targetTabId;

    const contentWrapper = document.querySelector('.content-wrapper');
    if (contentWrapper) contentWrapper.scrollTop = 0;
    window.scrollTo(0, 0);

    // 2. Set up initial background image
    document.body.dataset.theme = currentActiveTab;
    const bgData = bgMap[currentActiveTab];
    if (bgData) {
      const div = createBgDiv(bgData.tiny);
      div.style.filter = 'blur(20px)';
      bgContainer.appendChild(div);

      const fullImg = new Image();
      fullImg.src = bgData.full;
      fullImg.onload = () => {
        div.style.backgroundImage = `url('${bgData.full}')`;
        div.style.filter = 'blur(0px)';
      };
    }

    // 3. Preload background placeholders
    Object.values(bgMap).forEach(data => {
      const img = new Image();
      img.src = data.tiny;
      preloadedImages.push(img);
    });

    // 4. Initialize Auth session & inventory
    initAuth();

    // 5. Fetch executions data from Google Sheets CSV URL (with proxy & embedded fallbacks)
    loadAllExecutionData();

    // 6. Search Input listener
    searchInput.addEventListener('input', () => {
      filterBuilds();
    });

    // 7. Sort Select listener
    if (sortSelect) {
      sortSelect.value = currentSortOrder;
      sortSelect.addEventListener('change', (e) => {
        currentSortOrder = e.target.value;
        localStorage.setItem('userSortOrder', currentSortOrder);
        renderAllBuilds();
        animateCards();
      });
    }

    // 8. View Mode buttons listener
    if (viewBtns.length > 0) {
      viewBtns.forEach(btn => {
        if (btn.dataset.view === currentViewMode) btn.classList.add('active');
        else btn.classList.remove('active');

        btn.addEventListener('click', () => {
          viewBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentViewMode = btn.dataset.view;
          localStorage.setItem('userViewMode', currentViewMode);
          applyViewModeToGrids();
          animateCards();
        });
      });
    }

    // 9. Initialize Live COD Item Shop (itemshop.gg)
    initItemShop();
  }

  function createBgDiv(url) {
    const div = document.createElement('div');
    div.className = 'bg-slide';
    div.style.backgroundImage = `url('${url}')`;
    return div;
  }

  function applyViewModeToGrids() {
    const grids = document.querySelectorAll('.build-grid');
    grids.forEach(grid => {
      grid.classList.remove('view-compact', 'view-list');
      if (currentViewMode === 'compact') grid.classList.add('view-compact');
      else if (currentViewMode === 'list') grid.classList.add('view-list');
    });
  }

  function sortBuildList(list) {
    const sorted = [...list];
    switch (currentSortOrder) {
      case 'name-asc':
        return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name-desc':
        return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'price-desc':
        return sorted.sort((a, b) => {
          const priceA = (typeof a.price === 'number' && !isNaN(a.price)) ? a.price : -1;
          const priceB = (typeof b.price === 'number' && !isNaN(b.price)) ? b.price : -1;
          return priceB - priceA;
        });
      default:
        return sorted;
    }
  }

  // Game Tab Transitions
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.target;
      const targetSection = document.getElementById(targetId);
      const contentWrapper = document.querySelector('.content-wrapper');
      
      if (tab.classList.contains('active') && targetSection && targetSection.classList.contains('active')) {
        if (contentWrapper) contentWrapper.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const currentTab = document.querySelector('.nav-item.active');
      const currentIndex = tabs.indexOf(currentTab);
      const newIndex = index;
      const direction = newIndex > currentIndex ? 'down' : 'up';

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.body.dataset.theme = targetId;
      currentActiveTab = targetId;
      localStorage.setItem('activeTab', targetId);

      sections.forEach(s => s.classList.remove('active'));
      if (targetSection) {
        targetSection.classList.add('active');
        targetSection.scrollTop = 0;
      }

      if (contentWrapper) contentWrapper.scrollTop = 0;
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      searchInput.value = '';
      
      renderBuilds(targetId);
      animateCards();
      updateShopFilterCount();

      const bgData = bgMap[targetId];
      if (bgData) {
        slideBackground(bgData, direction);
      }
    });
  });

  function slideBackground(bgData, direction) {
    const newDiv = createBgDiv(bgData.tiny);
    newDiv.style.transform = direction === 'down' ? 'translateY(100%)' : 'translateY(-100%)';
    newDiv.style.filter = 'blur(20px)';
    newDiv.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), filter 0.8s ease';

    bgContainer.appendChild(newDiv);

    void newDiv.offsetWidth;
    newDiv.style.transform = 'translateY(0)';

    const fullImg = new Image();
    fullImg.src = bgData.full;
    fullImg.onload = () => {
      newDiv.style.backgroundImage = `url('${bgData.full}')`;
      newDiv.style.filter = 'blur(0px)';
    };

    const oldSlides = Array.from(bgContainer.querySelectorAll('.bg-slide'));
    const toRemove = oldSlides.filter(s => s !== newDiv);

    toRemove.forEach(slide => {
      slide.style.transform = direction === 'down' ? 'translateY(-100%)' : 'translateY(100%)';
      slide.style.filter = 'blur(20px)';
      setTimeout(() => {
        slide.remove();
      }, 800);
    });
  }

  function animateCards() {
    const activeSection = document.querySelector('.game-section.active');
    if (!activeSection) return;

    const cards = activeSection.querySelectorAll('.build');
    cards.forEach(card => card.classList.remove('visible'));

    void activeSection.offsetWidth;

    cards.forEach((card, index) => {
      const delay = Math.pow(index, 0.75) * 60;
      setTimeout(() => {
        card.classList.add('visible');
      }, delay);
    });
  }

  function renderAllBuilds() {
    Object.keys(bgMap).forEach(gameKey => {
      renderBuilds(gameKey);
    });
  }

  function renderBuilds(gameKey) {
    const jsonKey = gameKey.toUpperCase();
    const rawBuilds = executionsData[jsonKey] || [];
    const builds = sortBuildList(rawBuilds);

    const container = document.querySelector(`#${gameKey} .build-grid`);
    if (!container) return;

    applyViewModeToGrids();

    if (builds.length === 0) {
      if (gameKey === 'mw4') {
        container.innerHTML = `
          <div class="coming-soon-container">
            <div class="coming-soon-card">
              <div class="coming-soon-icon-wrapper">
                <img src="images/mw4/mw4icon.png" alt="MW4" />
              </div>
              <h2 class="coming-soon-title">MODERN WARFARE 4</h2>
              <div class="coming-soon-pill">COMING SOON...</div>
              <p class="coming-soon-text">Executions for Modern Warfare 4 will automatically appear here as soon as they are added to the database.</p>
            </div>
          </div>
        `;
      } else {
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);font-family:'HTR',sans-serif;">No executions found for this game.</div>`;
      }
      return;
    }

    const isVideo = url => typeof url === 'string' && url.startsWith('http');

    container.innerHTML = builds.map((build) => {
      const iconSrc = resolveAssetUrl(build.icon) || resolveAssetUrl('assets/missing_preview.jpg');

      const FPS = 60;
      const animFrames = typeof build.anim_time === 'number' ? build.anim_time : 0;
      const ttkFrames = typeof build.ttk === 'number' ? build.ttk : 0;
      
      const animTimeStr = animFrames > 0 ? (animFrames / FPS).toFixed(2) + 's' : '-';
      const ttkStr = ttkFrames > 0 ? (ttkFrames / FPS).toFixed(2) + 's' : '-';
      const priceStr = formatPrice(build.price, 'upper');

      const tags = [];
      if (animTimeStr !== '-') tags.push(`Anim: ${animTimeStr}`);
      if (ttkStr !== '-') tags.push(`TTK: ${ttkStr}`);
      if (priceStr) tags.push(priceStr);
      if (build.bundle) tags.push(build.bundle);

      const tagsHtml = tags
        .map(t => `<div class="build-tag">${t}</div>`)
        .join('');

      const itemKey = `${jsonKey}:${build.name}`;
      const isOwned = currentUser ? ownedItems.has(itemKey) : false;
      const ownedClass = isOwned ? 'is-owned' : '';
      
      let checkIcon = isOwned ? '✓' : '+';
      let badgeTitle = isOwned ? 'Mark as Unowned' : 'Mark as Owned';
      if (!currentUser) {
        checkIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
        badgeTitle = 'Login required to mark as owned';
      }

      const aliasesStr = Array.isArray(build.aliases) ? build.aliases.join(' ').toLowerCase() : '';

      const cardPriceDisplay = formatPrice(build.price, 'card');
      const bundleStr = build.bundle || '';

      const shopEntry = (itemShopClient && liveFinishersByName)
        ? itemShopClient.findFinisherInShop(build, liveFinishersByName, liveFinishersByBundle)
        : null;
      const inShopClass = shopEntry ? 'is-in-shop' : '';
      const inShopBadge = shopEntry ? `
        <div class="in-shop-badge" title="Available in Call of Duty Store today! ${shopEntry.bundleName} (${ItemShopClient.formatPrice(shopEntry.price)})">
          <span class="in-shop-badge-pulse"></span> IN SHOP
        </div>
      ` : '';

      return `
        <div class="build ${ownedClass} ${inShopClass} ${!currentUser ? 'view-only-card' : ''}" data-name="${build.name.toLowerCase()}" data-bundle="${bundleStr.toLowerCase()}" data-aliases="${aliasesStr}" data-item-key="${itemKey}" data-in-shop="${shopEntry ? 'true' : 'false'}">
          <button class="owned-badge ${!currentUser ? 'is-view-only' : ''}" title="${badgeTitle}" data-item-key="${itemKey}">
            ${checkIcon}
          </button>
          ${inShopBadge}
          <div class="build-img-wrapper">
            <img src="${iconSrc}" alt="${build.name}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='' + resolveAssetUrl('assets/missing_preview.jpg') + '';" />
          </div>
          <div class="build-body">
            <h3>${build.name}</h3>
            <div class="card-meta-row">
              <span class="price-pill">${cardPriceDisplay}</span>
              ${bundleStr ? `<span class="bundle-name-tag" title="${bundleStr}">${bundleStr}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    Array.from(container.querySelectorAll('.build')).forEach((card, idx) => {
      const build = builds[idx];
      // Toggle owned badge
      const badge = card.querySelector('.owned-badge');
      if (badge) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleOwned(gameKey, build.name);
        });
      }

      // Card click opens modal
      card.addEventListener('click', () => {
        showVideoModal(gameKey, build.name, build);
      });
    });

    filterBuilds();
    updateShopFilterCount();
  }

  function filterBuilds() {
    const query = searchInput.value.toLowerCase().trim();
    const activeSection = document.querySelector('.game-section.active');
    if (!activeSection) return;

    const cards = activeSection.querySelectorAll('.build');
    let visibleCount = 0;

    cards.forEach(card => {
      const name = card.getAttribute('data-name') || '';
      const bundle = card.getAttribute('data-bundle') || '';
      const aliases = card.getAttribute('data-aliases') || '';
      const itemKey = card.getAttribute('data-item-key');
      const isOwned = ownedItems.has(itemKey);
      const isInShop = card.getAttribute('data-in-shop') === 'true';

      const matchesQuery = name.includes(query) || bundle.includes(query) || aliases.includes(query);
      let matchesFilter = true;
      if (currentInventoryFilter === 'owned') matchesFilter = isOwned;
      else if (currentInventoryFilter === 'unowned') matchesFilter = !isOwned;
      else if (currentInventoryFilter === 'in-shop') matchesFilter = isInShop;

      if (matchesQuery && matchesFilter) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    // Empty notice handling
    let emptyNotice = activeSection.querySelector('.filter-empty-notice');
    if (visibleCount === 0 && cards.length > 0) {
      if (!emptyNotice) {
        emptyNotice = document.createElement('div');
        emptyNotice.className = 'filter-empty-notice';
        emptyNotice.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--muted); font-size: 14px;';
        const grid = activeSection.querySelector('.build-grid');
        if (grid) grid.appendChild(emptyNotice);
      }
      if (currentInventoryFilter === 'in-shop') {
        emptyNotice.innerHTML = `No executions for <b>${currentActiveTab.toUpperCase()}</b> are in today's store rotation.<br><a href="#" class="empty-shop-link" style="color: #34d399; font-weight: 700; text-decoration: underline; margin-top: 10px; display: inline-block;">View all ${liveFinishersList.length} finishing moves in Live COD Shop ↗</a>`;
        const link = emptyNotice.querySelector('.empty-shop-link');
        if (link) {
          link.onclick = (e) => {
            e.preventDefault();
            openLiveShopModal();
          };
        }
      } else {
        emptyNotice.textContent = 'No executions match your current filter and search.';
      }
      emptyNotice.style.display = 'block';
    } else if (emptyNotice) {
      emptyNotice.style.display = 'none';
    }
  }

  function showVideoModal(gameKey, name, build) {
    document.querySelectorAll('.move-popup, .move-popup-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'move-popup-overlay';
    overlay.onclick = () => {
      popup.remove();
      overlay.remove();
      document.body.classList.remove('popup-active');
    };
    document.body.appendChild(overlay);
    document.body.classList.add('popup-active');

    const FPS = 60;
    const animFrames = typeof build.anim_time === 'number' ? build.anim_time : 0;
    const ttkFrames = typeof build.ttk === 'number' ? build.ttk : 0;
    
    const animTime = animFrames > 0 ? (animFrames / FPS).toFixed(2) + 's' : '-';
    const ttk = ttkFrames > 0 ? (ttkFrames / FPS).toFixed(2) + 's' : '-';
    const priceStr = formatPrice(build.price, 'full');
    const bundleMarkup = build.bundle 
      ? `<span class="popup-bundle"><b>Bundle:</b> ${build.bundle}</span>` 
      : '';

    const itemKey = `${gameKey.toUpperCase()}:${name}`;
    const isOwned = ownedItems.has(itemKey);

    const iconSrc = resolveAssetUrl(build.icon) || resolveAssetUrl('assets/missing_preview.jpg');
    const previewSrc = resolveAssetUrl(build.preview);
    const hasGif = typeof previewSrc === 'string' && previewSrc.toLowerCase().includes('.gif');
    const previewMediaMarkup = hasGif 
      ? `<div class="popup-gif-preview-container">
           <img class="popup-gif-preview" src="${previewSrc}" alt="${name} Preview" onerror="this.onerror=null;this.src='' + iconSrc + '';">
         </div>`
      : `<div class="popup-img-wrapper">
           <img class="popup-img" src="${iconSrc}" alt="${name}" onerror="this.onerror=null;this.src='' + resolveAssetUrl('assets/missing_preview.jpg') + '';">
         </div>`;

    const isVideo = url => typeof url === 'string' && url.startsWith('http');
    const videosHtml = [];

    if (isVideo(build.standing)) {
      const standingEmbed = build.standing.replace('view?usp=drive_link', 'preview');
      videosHtml.push(`
        <div class="popup-video-container">
          <h4>Standing View</h4>
          <iframe src="${standingEmbed}" allow="autoplay" allowfullscreen></iframe>
        </div>
      `);
    }

    if (isVideo(build.prone)) {
      const proneEmbed = build.prone.replace('view?usp=drive_link', 'preview');
      videosHtml.push(`
        <div class="popup-video-container">
          <h4>Prone View</h4>
          <iframe src="${proneEmbed}" allow="autoplay" allowfullscreen></iframe>
        </div>
      `);
    }

    if (isVideo(build.downed)) {
      const downedEmbed = build.downed.replace('view?usp=drive_link', 'preview');
      videosHtml.push(`
        <div class="popup-video-container">
          <h4>Downed View</h4>
          <iframe src="${downedEmbed}" allow="autoplay" allowfullscreen></iframe>
        </div>
      `);
    }

    const shopEntry = (itemShopClient && liveFinishersByName)
      ? itemShopClient.findFinisherInShop(build, liveFinishersByName, liveFinishersByBundle)
      : null;

    const shopBannerMarkup = shopEntry ? `
      <div class="popup-live-store-card">
        <div class="store-card-header">
          <div class="store-card-tag"><span class="store-live-dot"></span> AVAILABLE IN STORE TODAY</div>
          <div class="store-card-price">${ItemShopClient.formatPrice(shopEntry.price)}</div>
        </div>
        <div class="store-card-body">
          ${shopEntry.bundleCardImage ? `<img src="${shopEntry.bundleCardImage}" class="store-card-thumb" alt="${shopEntry.bundleName}" onerror="this.style.display='none';" />` : ''}
          <div class="store-card-info">
            <div class="store-bundle-title">Bundle: <b>${shopEntry.bundleName}</b></div>
            <div class="store-section-label">Store Section: ${shopEntry.sectionTitle}</div>
            ${shopEntry.sourceUrl ? `<a href="${shopEntry.sourceUrl}" target="_blank" rel="noopener noreferrer" class="store-official-link">View in Activision Store ↗</a>` : ''}
          </div>
        </div>
        <div class="store-card-footer">
          <a href="${liveShopAttribution.url}" target="_blank" rel="noopener noreferrer" class="itemshop-attr-link">
            ${liveShopAttribution.text} ↗
          </a>
        </div>
      </div>
    ` : '';

    const popupVideosContainer = videosHtml.length > 0
      ? `<div class="popup-videos">${videosHtml.join('')}</div>`
      : '';

    const popup = document.createElement('div');
    popup.className = 'move-popup';
    popup.innerHTML = `
      <button class="popup-close" title="Close">&times;</button>
      <div class="popup-title">${name}</div>
      
      ${previewMediaMarkup}

      <div class="popup-owned-toggle">
        <label>Inventory Status:</label>
        ${currentUser 
          ? `<button class="btn-toggle-owned ${isOwned ? 'active' : ''}" id="modal-owned-btn">
               ${isOwned ? '✓ Owned' : '+ Add to Inventory'}
             </button>`
          : `<button class="btn-toggle-owned view-only-modal-btn" id="modal-owned-btn" title="Login to track inventory">
               <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
               <span>Login to Track</span>
             </button>`
        }
      </div>

      <div class="popup-info">
        <span><b>Anim Time:</b> ${animTime}</span>
        <span><b>TTK:</b> ${ttk}</span>
      </div>

      <div class="popup-details">
        <span><b>Cost:</b> ${priceStr}</span>
        ${bundleMarkup}
      </div>

      ${shopBannerMarkup}

      ${popupVideosContainer}
    `;

    popup.querySelector('.popup-close').onclick = () => {
      popup.remove();
      overlay.remove();
      document.body.classList.remove('popup-active');
    };

    const modalOwnedBtn = popup.querySelector('#modal-owned-btn');
    if (modalOwnedBtn) {
      modalOwnedBtn.addEventListener('click', () => {
        toggleOwned(gameKey, name);
        const currentlyOwned = ownedItems.has(itemKey);
        modalOwnedBtn.className = `btn-toggle-owned ${currentlyOwned ? 'active' : ''}`;
        modalOwnedBtn.innerHTML = currentlyOwned ? '✓ Owned' : '+ Add to Inventory';
      });
    }

    document.body.appendChild(popup);
  }

  // ==========================================
  // LIVE COD ITEM SHOP (itemshop.gg API Integration)
  // ==========================================
  function updateShopFilterCount() {
    const activeSection = document.querySelector('.game-section.active');
    if (!activeSection) return;
    const cards = activeSection.querySelectorAll('.build');
    let inShopCount = 0;
    cards.forEach(c => {
      if (c.getAttribute('data-in-shop') === 'true') inShopCount++;
    });

    if (shopFilterCount) {
      shopFilterCount.textContent = inShopCount;
    }
    if (liveShopBtnBadge) {
      liveShopBtnBadge.textContent = liveFinishersList.length;
    }
  }

  async function initItemShop() {
    try {
      itemShopClient = new (window.ItemShopClient || ItemShopClient)({
        game: 'call-of-duty'
      });

      // 1. Fetch live COD shop
      const shopResponse = await itemShopClient.getShop();
      liveShopData = shopResponse.data || shopResponse;
      liveShopAttribution = ItemShopClient.getAttribution(shopResponse.meta);

      // 2. Parse all Finishing Moves
      const parsed = itemShopClient.parseFinishingMoves(liveShopData);
      liveFinishersList = parsed.finishers;
      liveFinishersByName = parsed.byName;
      liveFinishersByBundle = parsed.byBundle;

      // 3. Update header indicators
      if (liveShopBtnBadge) {
        liveShopBtnBadge.textContent = liveFinishersList.length;
      }

      // 4. Update attribution links
      if (shopModalAttrHeader) {
        shopModalAttrHeader.href = liveShopAttribution.url;
        shopModalAttrHeader.textContent = `${liveShopAttribution.text} ↗`;
      }
      if (shopModalAttrFooter) {
        shopModalAttrFooter.href = liveShopAttribution.url;
        shopModalAttrFooter.textContent = liveShopAttribution.text;
      }

      // 5. Update cards with live shop badges & counts
      renderAllBuilds();
      updateShopFilterCount();

      // 6. Setup Modal Listeners
      setupShopModalEvents();

      // 7. Polling for shop rotations (every 2.5 minutes)
      setInterval(async () => {
        try {
          const rots = await itemShopClient.getRotations();
          const codRotation = rots && rots.data && rots.data['call-of-duty'];
          if (codRotation && liveShopData) {
            const currentFingerprint = localStorage.getItem('last_cod_fingerprint');
            if (currentFingerprint && currentFingerprint !== codRotation.fingerprint) {
              localStorage.setItem('last_cod_fingerprint', codRotation.fingerprint);
              const freshShop = await itemShopClient.getShop('call-of-duty', { forceRefresh: true });
              liveShopData = freshShop.data || freshShop;
              const freshParsed = itemShopClient.parseFinishingMoves(liveShopData);
              liveFinishersList = freshParsed.finishers;
              liveFinishersByName = freshParsed.byName;
              liveFinishersByBundle = freshParsed.byBundle;
              renderAllBuilds();
              updateShopFilterCount();
            } else if (!currentFingerprint) {
              localStorage.setItem('last_cod_fingerprint', codRotation.fingerprint);
            }
          }
        } catch (_) {}
      }, 150000);

    } catch (err) {
      console.warn('[itemshop.gg] Failed to load live store:', err);
    }
  }

  function setupShopModalEvents() {
    if (btnLiveShop) {
      btnLiveShop.addEventListener('click', openLiveShopModal);
    }

    if (shopModalCloseBtn) {
      shopModalCloseBtn.addEventListener('click', closeLiveShopModal);
    }

    if (shopModalOverlay) {
      shopModalOverlay.addEventListener('click', (e) => {
        if (e.target === shopModalOverlay) {
          closeLiveShopModal();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && shopModalOverlay && !shopModalOverlay.classList.contains('hidden')) {
        closeLiveShopModal();
      }
    });

    // Tab buttons
    shopTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        switchShopTab(targetTab);
      });
    });
  }

  function openLiveShopModal() {
    if (!shopModalOverlay) return;
    shopModalOverlay.classList.remove('hidden');
    document.body.classList.add('popup-active');

    // Populate header info
    if (liveShopData) {
      if (shopModalDate) {
        const formattedDate = liveShopData.shopDate || 'Today';
        shopModalDate.textContent = `Shop Date: ${formattedDate} (UTC) • ${liveShopData.itemCount} items`;
      }
      if (shopModalUpdatedTime && liveShopData.updatedAt) {
        const d = new Date(liveShopData.updatedAt);
        shopModalUpdatedTime.textContent = `Updated: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (shopTabFinishersCount) {
        shopTabFinishersCount.textContent = liveFinishersList.length;
      }
      if (shopTabItemsCount) {
        shopTabItemsCount.textContent = liveShopData.itemCount;
      }

      // Render default tab
      renderShopFinishersTab();
      renderShopSectionsTab();
      renderShopOverviewTab();
    }
  }

  function closeLiveShopModal() {
    if (!shopModalOverlay) return;
    shopModalOverlay.classList.add('hidden');
    document.body.classList.remove('popup-active');
  }

  function switchShopTab(tabKey) {
    shopTabBtns.forEach(b => {
      if (b.dataset.tab === tabKey) b.classList.add('active');
      else b.classList.remove('active');
    });

    shopTabContents.forEach(c => {
      if (c.id === `shop-tab-${tabKey}`) c.classList.add('active');
      else c.classList.remove('active');
    });
  }

  function renderShopFinishersTab() {
    if (!shopFinishersGrid) return;

    if (!liveFinishersList || liveFinishersList.length === 0) {
      shopFinishersGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">
          No finishing moves detected in today's active store rotation.
        </div>
      `;
      return;
    }

    shopFinishersGrid.innerHTML = liveFinishersList.map((entry, idx) => {
      const priceStr = ItemShopClient.formatPrice(entry.price);
      const cardImg = entry.bundleCardImage || 'images/mw4/mw4icon.png';
      const finisherImg = entry.finisherImage || entry.bundleCardImage || 'assets/favicon.svg';
      const rarityColor = (entry.rarity && entry.rarity.color) ? entry.rarity.color : '#ffcf00';
      const rarityName = (entry.rarity && entry.rarity.name) ? entry.rarity.name : 'Bundle';

      return `
        <div class="shop-bundle-card">
          <div class="shop-bundle-img-wrapper">
            <img class="shop-bundle-img" src="${cardImg}" alt="${entry.bundleName}" loading="lazy" onerror="this.onerror=null;this.src='images/mw4/mw4icon.png';" />
            <div class="shop-bundle-price-badge">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/></svg>
              ${priceStr}
            </div>
            <div class="shop-bundle-badge-tag">${entry.sectionTitle}</div>
          </div>
          <div class="shop-bundle-body">
            <h4 class="shop-bundle-title" title="${entry.bundleName}">${entry.bundleName}</h4>
            <div class="shop-finisher-highlight-box">
              <img class="shop-finisher-icon" src="${finisherImg}" alt="${entry.finisherName}" onerror="this.onerror=null;this.src='assets/favicon.svg';" />
              <div class="shop-finisher-info">
                <div class="shop-finisher-name">${entry.finisherName}</div>
                <div class="shop-finisher-type-rarity">
                  <span class="shop-rarity-pill" style="color: ${rarityColor};">${rarityName}</span>
                  <span style="color: var(--muted);">• Finishing Move</span>
                </div>
              </div>
            </div>
            <div class="shop-bundle-card-actions">
              <button class="btn-shop-preview" data-idx="${idx}">Preview Move</button>
              <button class="btn-shop-jump" data-idx="${idx}" title="Jump to card in collection">Find in Grid</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach button listeners
    shopFinishersGrid.querySelectorAll('.btn-shop-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const entry = liveFinishersList[idx];
        if (!entry) return;

        // Find execution in executionsData
        let foundExecution = null;
        const inferredGame = ItemShopClient.inferGameFromSection ? ItemShopClient.inferGameFromSection(entry.sectionTitle) : null;
        let foundGame = inferredGame ? inferredGame.toLowerCase() : 'bo7';

        const normFinisher = ItemShopClient.normalizeKey(entry.finisherName);
        const searchEntries = inferredGame && executionsData[inferredGame.toUpperCase()]
          ? [[inferredGame.toUpperCase(), executionsData[inferredGame.toUpperCase()]], ...Object.entries(executionsData).filter(([k]) => k !== inferredGame.toUpperCase())]
          : Object.entries(executionsData);

        for (const [gKey, list] of searchEntries) {
          if (Array.isArray(list)) {
            for (const item of list) {
              if (ItemShopClient.normalizeKey(item.name) === normFinisher ||
                  ItemShopClient.normalizeKey(item.clean_name) === normFinisher) {
                foundExecution = item;
                foundGame = gKey.toLowerCase();
                break;
              }
            }
          }
          if (foundExecution) break;
        }

        if (foundExecution) {
          closeLiveShopModal();
          showVideoModal(foundGame, foundExecution.name, foundExecution);
        } else {
          // Synthetic preview modal for newly released finisher
          closeLiveShopModal();
          showVideoModal(foundGame, entry.finisherName, {
            name: entry.finisherName,
            clean_name: entry.finisherName,
            bundle: entry.bundleName,
            price: entry.price.amount,
            icon: entry.finisherImage || entry.bundleCardImage,
            preview: '',
            standing: '',
            prone: '',
            downed: '',
            anim_time: 0,
            ttk: 0
          });
        }
      });
    });

    shopFinishersGrid.querySelectorAll('.btn-shop-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const entry = liveFinishersList[idx];
        if (!entry) return;

        const inferredGame = ItemShopClient.inferGameFromSection ? ItemShopClient.inferGameFromSection(entry.sectionTitle) : null;
        let targetGame = inferredGame ? inferredGame.toLowerCase() : 'bo7';
        let targetName = entry.finisherName;
        const normFinisher = ItemShopClient.normalizeKey(entry.finisherName);

        const searchEntries = inferredGame && executionsData[inferredGame.toUpperCase()]
          ? [[inferredGame.toUpperCase(), executionsData[inferredGame.toUpperCase()]], ...Object.entries(executionsData).filter(([k]) => k !== inferredGame.toUpperCase())]
          : Object.entries(executionsData);

        for (const [gKey, list] of searchEntries) {
          if (Array.isArray(list)) {
            for (const item of list) {
              if (ItemShopClient.normalizeKey(item.name) === normFinisher ||
                  ItemShopClient.normalizeKey(item.clean_name) === normFinisher) {
                targetGame = gKey.toLowerCase();
                targetName = item.name;
                break;
              }
            }
          }
        }

        closeLiveShopModal();

        // Switch to game tab
        const tabToActivate = tabs.find(t => t.dataset.target === targetGame);
        if (tabToActivate) {
          tabToActivate.click();
        }

        // Scroll to card and highlight
        setTimeout(() => {
          const itemKey = `${targetGame.toUpperCase()}:${targetName}`;
          const card = document.querySelector(`.build[data-item-key="${CSS.escape(itemKey)}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.outline = '2px solid #10b981';
            card.style.boxShadow = '0 0 30px rgba(16, 185, 129, 0.8)';
            setTimeout(() => {
              card.style.outline = '';
              card.style.boxShadow = '';
            }, 3000);
          }
        }, 400);
      });
    });
  }

  function renderShopSectionsTab() {
    if (!shopSectionsContainer) return;
    if (!liveShopData || !liveShopData.sections || liveShopData.sections.length === 0) {
      shopSectionsContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">No sections available.</div>';
      return;
    }

    shopSectionsContainer.innerHTML = liveShopData.sections.map(sec => {
      const itemsMarkup = (sec.items || []).map(item => {
        const priceStr = ItemShopClient.formatPrice(item.price);
        const cardImg = (item.images && item.images.card) || 'images/mw4/mw4icon.png';
        const hasFinisher = (item.contents || []).some(c => /finishing move|execution|finisher/i.test(c.type || '') || /finishing move|execution/i.test(c.name || ''));

        return `
          <div class="shop-bundle-card ${hasFinisher ? 'is-in-shop' : ''}">
            <div class="shop-bundle-img-wrapper">
              <img class="shop-bundle-img" src="${cardImg}" alt="${item.name}" loading="lazy" onerror="this.onerror=null;this.src='images/mw4/mw4icon.png';" />
              <div class="shop-bundle-price-badge">${priceStr}</div>
              ${hasFinisher ? '<div class="shop-bundle-badge-tag" style="background:#10b981;color:#064e3b;">Has Finisher</div>' : ''}
            </div>
            <div class="shop-bundle-body">
              <h4 class="shop-bundle-title" title="${item.name}">${item.name}</h4>
              <div style="font-size:12px;color:var(--text-secondary);">${item.type || 'Bundle'}</div>
              <div style="font-size:11.5px;color:var(--muted);margin-top:4px;">
                ${(item.contents || []).length} items included
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="shop-section-block">
          <div class="shop-section-heading">
            <span>${sec.title}</span>
            <span class="shop-section-badge">${(sec.items || []).length} items</span>
          </div>
          <div class="shop-finishers-grid">
            ${itemsMarkup}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderShopOverviewTab() {
    if (!shopOverviewContainer) return;
    const images = (liveShopData && liveShopData.images) || [];
    if (images.length === 0) {
      shopOverviewContainer.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--muted);">
          No composite store image is currently available for this shop rotation.
        </div>
      `;
      return;
    }

    const imgUrl = images[0];
    shopOverviewContainer.innerHTML = `
      <div class="shop-overview-img-wrapper">
        <img class="shop-overview-img" src="${imgUrl}" alt="Call of Duty Daily Item Shop Image" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'padding:40px;color:var(--muted);text-align:center;\\'>Store image is currently rendering. Check back in a few minutes.<br><button id=\\'btn-retry-shop-img\\' style=\\'margin-top:12px;padding:6px 14px;background:#10b981;border:none;border-radius:6px;color:#000;font-weight:700;cursor:pointer;\\'>Retry</button></div>';document.getElementById('btn-retry-shop-img')?.addEventListener('click',()=>renderShopOverviewTab());" />
      </div>
      <div class="shop-overview-caption">
        Complete Call of Duty Store composite sheet. Click image to zoom. Provided by <a href="${liveShopAttribution.url}" target="_blank" rel="noopener noreferrer" style="color:#34d399;text-decoration:underline;">itemshop.gg</a>.
      </div>
    `;

    const img = shopOverviewContainer.querySelector('.shop-overview-img');
    if (img) {
      let isZoomed = false;
      img.addEventListener('click', () => {
        isZoomed = !isZoomed;
        if (isZoomed) {
          img.style.maxHeight = 'none';
          img.style.cursor = 'zoom-out';
        } else {
          img.style.maxHeight = '70vh';
          img.style.cursor = 'zoom-in';
        }
      });
    }
  }

  init();
});
