// index.js - Redesigned All COD Executions script
// Handles dynamic JSON loading, tab transitions, backgrounds, search, video modals,
// Discord authentication, inventory management, and Turso DB sync.

document.addEventListener('DOMContentLoaded', () => {
  let executionsData = {};
  let currentActiveTab = 'mw'; // default
  let ownedItems = new Set(); // Stores item_key strings e.g. "MW:Point Blank"
  let currentInventoryFilter = 'all'; // 'all', 'owned', 'unowned'
  let currentUser = null; // { id, username, avatar }

  // Credentials
  const TURSO_URL = 'https://inventory-adrianowo.aws-eu-west-1.turso.io/v2/pipeline';
  const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODU5NDk1MDEsImlkIjoiMDE5ZmQyZTEtNWIwMS03NDJjLWI1ZjUtMTQ0NmY3ZjRlODUyIiwia2lkIjoiVlVBcG40eHk2eTR2d0lVT1RSTng2MDd5SUFoWmcwNG1vTFFrN0x5b3BQOCIsInJpZCI6IjAzYzA0N2I5LWY5ZjUtNDBlNi04NDdmLWNhYTYzYjkzODI1YiJ9.UaXwCWM4NZQ0lPd8_QQ1tpZ_I_SMyiQ2M1ljWe8C5RO_e2iSeBIO5wmjVSH55RuoMmZuBnG84O6szEyRKLNNCw';
  const DISCORD_CLIENT_ID = '1522200189006516304';
  const DISCORD_BOT_TOKEN = atob('TVRVeU1qSXdNREU0T1RBd05qVXhOak13TkEuR1VSOHFaLnhiUFZtdTUzWnA5eE1FN2o0b1hyNE1PTFVmeTlQajNQZF9FV0Rj');

  // DOM Elements
  const tabs = Array.from(document.querySelectorAll('.nav-item'));
  const sections = Array.from(document.querySelectorAll('.game-section'));
  const bgContainer = document.getElementById('bg-container');
  const searchInput = document.getElementById('search-input');

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

  // Filter Buttons & Stats
  const filterBtns = Array.from(document.querySelectorAll('.filter-btn'));
  const statsCount = document.getElementById('stats-count');
  const statsPct = document.getElementById('stats-pct');

  // Background maps
  const bgMap = {
    mw: { full: 'images/backgrounds/mw2019.jpg', tiny: 'images/backgrounds/mw_lh.jpg' },
    cw: { full: 'images/backgrounds/bocw.jpg', tiny: 'images/backgrounds/bocw_lh.jpg' },
    vg: { full: 'images/backgrounds/vanguard.jpg', tiny: 'images/backgrounds/vg_lh.jpg' },
    mwii: { full: 'images/backgrounds/mwii.jpg', tiny: 'images/backgrounds/mwii_lh.jpg' },
    mwiii: { full: 'images/backgrounds/mwiii.jpg', tiny: 'images/backgrounds/mwiii_lh.jpg' },
    bo6: { full: 'images/backgrounds/bo6.jpg', tiny: 'images/backgrounds/bo6_lh.jpg' },
    bo7: { full: 'images/backgrounds/other.jpg', tiny: 'images/backgrounds/other_lh.jpg' }
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

  async function loadInventoryFromTurso(userId) {
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
    updateInventoryStats();
    renderAllBuilds();
    filterBuilds();
  }

  async function syncOwnedItemToTurso(userId, itemKey, isAdd) {
    if (!userId) return;
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
    await tursoExecute(
      'INSERT OR REPLACE INTO users (user_id, username, avatar) VALUES (?, ?, ?);',
      [userId, username, avatar]
    );
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
                : 'images/site/siteicon.jpg';
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
    const guestData = localStorage.getItem('guest_inventory');
    if (guestData) {
      try {
        const arr = JSON.parse(guestData);
        arr.forEach(k => ownedItems.add(k));
      } catch (e) {}
    }
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
    if (currentUser) {
      btnDiscordLogin.classList.add('hidden');
      userProfileBar.classList.remove('hidden');
      userAvatar.src = currentUser.avatar || 'images/site/siteicon.jpg';
      userName.textContent = currentUser.username;
    } else {
      btnDiscordLogin.classList.remove('hidden');
      userProfileBar.classList.add('hidden');
    }
  }

  // Discord Login Modal handlers
  btnDiscordLogin.addEventListener('click', () => {
    loginModalOverlay.classList.remove('hidden');
  });

  modalCloseBtn.addEventListener('click', () => {
    loginModalOverlay.classList.add('hidden');
  });

  loginModalOverlay.addEventListener('click', (e) => {
    if (e.target === loginModalOverlay) {
      loginModalOverlay.classList.add('hidden');
    }
  });

  btnOauthLogin.addEventListener('click', () => {
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=token&scope=identify&redirect_uri=${redirectUri}`;
    window.location.href = oauthUrl;
  });

  async function handleIdLogin() {
    const inputVal = discordUserIdInput.value.trim();
    if (!inputVal) return;

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
          : 'images/site/siteicon.jpg';
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
          avatar: 'images/site/siteicon.jpg'
        });
        loginModalOverlay.classList.add('hidden');
        discordUserIdInput.value = '';
      }
    } catch (err) {
      console.warn('Bot API call error, falling back:', err);
      loginUser({
        id: inputVal,
        username: `User ${inputVal.substring(0, 8)}`,
        avatar: 'images/site/siteicon.jpg'
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

  btnLogout.addEventListener('click', logoutUser);

  // ==========================================
  // INVENTORY MANAGEMENT LOGIC
  // ==========================================
  function toggleOwned(gameKey, buildName) {
    const itemKey = `${gameKey.toUpperCase()}:${buildName}`;
    const isNowOwned = !ownedItems.has(itemKey);

    if (isNowOwned) {
      ownedItems.add(itemKey);
    } else {
      ownedItems.delete(itemKey);
    }

    if (currentUser) {
      syncOwnedItemToTurso(currentUser.id, itemKey, isNowOwned);
    } else {
      localStorage.setItem('guest_inventory', JSON.stringify(Array.from(ownedItems)));
    }

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

    const ownedCount = ownedItems.size;
    const pct = total > 0 ? ((ownedCount / total) * 100).toFixed(1) : '0';

    if (statsCount) statsCount.textContent = `${ownedCount}/${total}`;
    if (statsPct) statsPct.textContent = `${pct}%`;
    if (userStats) userStats.textContent = `${ownedCount} Owned`;
  }

  // Filter Group Listener
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentInventoryFilter = btn.dataset.filter;
      filterBuilds();
      animateCards();
    });
  });

  // ==========================================
  // MAIN APP INITIALIZATION & RENDER
  // ==========================================
  function init() {
    // 1. Load active tab from localStorage
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) {
      const tabToActivate = tabs.find(t => t.dataset.target === savedTab);
      if (tabToActivate) {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        tabToActivate.classList.add('active');
        const targetSection = document.getElementById(savedTab);
        if (targetSection) targetSection.classList.add('active');
        currentActiveTab = savedTab;
      }
    } else {
      const activeTab = document.querySelector('.nav-item.active');
      if (activeTab) {
        currentActiveTab = activeTab.dataset.target;
      }
    }

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

    // 5. Fetch executions data and render
    const gistUrl = 'https://gist.githubusercontent.com/Adrianoowo/5b62766be1512643010d701851ac4788/raw/data.json';
    
    fetch(`${gistUrl}?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);
        return res.json();
      })
      .then(json => {
        executionsData = json;
        renderAllBuilds();
        updateInventoryStats();
        animateCards();
      })
      .catch(err => {
        console.warn('Failed to load executions from Gist, falling back to local data.json:', err);
        fetch('data.json')
          .then(res => res.json())
          .then(json => {
            executionsData = json;
            renderAllBuilds();
            updateInventoryStats();
            animateCards();
          })
          .catch(localErr => {
            console.error('Failed to load local executions data:', localErr);
          });
      });

    // 6. Search Input listener
    searchInput.addEventListener('input', () => {
      filterBuilds();
    });

    // 7. Security listeners
    document.onselectstart = function () { return false; };
    document.oncontextmenu = function () { return false; };
    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
      }
    });
  }

  function createBgDiv(url) {
    const div = document.createElement('div');
    div.className = 'bg-slide';
    div.style.backgroundImage = `url('${url}')`;
    return div;
  }

  // Game Tab Transitions
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('active')) return;

      const currentTab = document.querySelector('.nav-item.active');
      const currentIndex = tabs.indexOf(currentTab);
      const newIndex = index;
      const direction = newIndex > currentIndex ? 'down' : 'up';

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.dataset.target;
      document.body.dataset.theme = targetId;
      currentActiveTab = targetId;

      localStorage.setItem('activeTab', targetId);

      sections.forEach(s => s.classList.remove('active'));
      const targetSection = document.getElementById(targetId);
      targetSection.classList.add('active');
      targetSection.scrollTop = 0;

      searchInput.value = '';
      
      renderBuilds(targetId);
      animateCards();

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
    const builds = executionsData[jsonKey] || [];

    const container = document.querySelector(`#${gameKey} .build-grid`);
    if (!container) return;

    if (builds.length === 0) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);font-family:'HTR',sans-serif;">No executions found for this game.</div>`;
      return;
    }

    container.innerHTML = builds.map((build, idx) => {
      const iconSrc = build.icon ? build.icon : 'assets/missing_preview.jpg';

      const FPS = 60;
      const animFrames = typeof build.anim_time === 'number' ? build.anim_time : 0;
      const ttkFrames = typeof build.ttk === 'number' ? build.ttk : 0;
      
      const animTimeStr = animFrames > 0 ? (animFrames / FPS).toFixed(2) + 's' : '-';
      const ttkStr = ttkFrames > 0 ? (ttkFrames / FPS).toFixed(2) + 's' : '-';
      const priceStr = build.price ? `${build.price} CP` : '';

      const tags = [];
      if (animTimeStr !== '-') tags.push(`Anim: ${animTimeStr}`);
      if (ttkStr !== '-') tags.push(`TTK: ${ttkStr}`);
      if (priceStr) tags.push(priceStr);
      if (build.bundle) tags.push(build.bundle);

      const tagsHtml = tags
        .map(t => `<div class="build-tag">${t}</div>`)
        .join('');

      const itemKey = `${jsonKey}:${build.name}`;
      const isOwned = ownedItems.has(itemKey);
      const ownedClass = isOwned ? 'is-owned' : '';
      const checkIcon = isOwned ? '✓' : '+';

      return `
        <div class="build ${ownedClass}" data-name="${build.name.toLowerCase()}" data-bundle="${(build.bundle || '').toLowerCase()}" data-item-key="${itemKey}" data-idx="${idx}">
          <button class="owned-badge" title="${isOwned ? 'Mark as Unowned' : 'Mark as Owned'}" data-item-key="${itemKey}">
            ${checkIcon}
          </button>
          <div class="build-img-wrapper">
            <img src="${iconSrc}" alt="${build.name}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/missing_preview.jpg';" />
          </div>
          <div class="build-body">
            <h3>${build.name}</h3>
            <span>${tagsHtml}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    Array.from(container.querySelectorAll('.build')).forEach(card => {
      // Toggle owned badge
      const badge = card.querySelector('.owned-badge');
      if (badge) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = card.getAttribute('data-idx');
          const jsonKey = gameKey.toUpperCase();
          const build = executionsData[jsonKey][idx];
          toggleOwned(gameKey, build.name);
        });
      }

      // Card click opens modal
      card.addEventListener('click', () => {
        const idx = card.getAttribute('data-idx');
        const jsonKey = gameKey.toUpperCase();
        const build = executionsData[jsonKey][idx];
        showVideoModal(gameKey, build.name, build);
      });
    });

    filterBuilds();
  }

  function filterBuilds() {
    const query = searchInput.value.toLowerCase().trim();
    const activeSection = document.querySelector('.game-section.active');
    if (!activeSection) return;

    const cards = activeSection.querySelectorAll('.build');
    cards.forEach(card => {
      const name = card.getAttribute('data-name');
      const bundle = card.getAttribute('data-bundle');
      const itemKey = card.getAttribute('data-item-key');
      const isOwned = ownedItems.has(itemKey);

      const matchesQuery = name.includes(query) || bundle.includes(query);
      let matchesFilter = true;
      if (currentInventoryFilter === 'owned') matchesFilter = isOwned;
      else if (currentInventoryFilter === 'unowned') matchesFilter = !isOwned;

      if (matchesQuery && matchesFilter) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
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
    const priceStr = build.price ? `${build.price} CP` : 'Free';
    const bundleMarkup = build.bundle 
      ? `<span class="popup-bundle"><b>Bundle:</b> ${build.bundle}</span>` 
      : '';

    const itemKey = `${gameKey.toUpperCase()}:${name}`;
    const isOwned = ownedItems.has(itemKey);

    const hasGif = typeof build.preview === 'string' && build.preview.toLowerCase().endsWith('.gif');
    const previewMediaMarkup = hasGif 
      ? `<div class="popup-gif-preview-container">
           <img class="popup-gif-preview" src="${build.preview}" alt="${name} Preview">
         </div>`
      : `<div class="popup-img-wrapper">
           <img class="popup-img" src="${build.icon || 'assets/missing_preview.jpg'}" alt="${name}" onerror="this.onerror=null;this.src='assets/missing_preview.jpg';">
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
        <button class="btn-toggle-owned ${isOwned ? 'active' : ''}" id="modal-owned-btn">
          ${isOwned ? '✓ Owned' : '+ Add to Inventory'}
        </button>
      </div>

      <div class="popup-info">
        <span><b>Anim Time:</b> ${animTime}</span>
        <span><b>TTK:</b> ${ttk}</span>
      </div>

      <div class="popup-details">
        <span><b>Cost:</b> ${priceStr}</span>
        ${bundleMarkup}
      </div>

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

  init();
});
