// index.js - Redesigned All COD Executions script
// Handles dynamic JSON loading, tab transitions, backgrounds, search, and video modals.

document.addEventListener('DOMContentLoaded', () => {
  let executionsData = {};
  let currentActiveTab = 'mw'; // default

  const tabs = Array.from(document.querySelectorAll('.nav-item'));
  const sections = Array.from(document.querySelectorAll('.game-section'));
  const bgContainer = document.getElementById('bg-container');
  const searchInput = document.getElementById('search-input');

  // Background maps matching index.css themes and cloned image folder structure
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

  // Initialize the website
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

    // 2. Set up the initial background image
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

    // 3. Preload tiny background placeholders for instant transitions
    Object.values(bgMap).forEach(data => {
      const img = new Image();
      img.src = data.tiny;
      preloadedImages.push(img);
    });

    // 4. Fetch executions data and render
    const gistUrl = 'https://gist.githubusercontent.com/Adrianoowo/5b62766be1512643010d701851ac4788/raw/data.json';
    
    // Fetch from Gist with a timestamp to prevent caching, falling back to local data.json
    fetch(`${gistUrl}?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error(`Gist fetch failed with status: ${res.status}`);
        return res.json();
      })
      .then(json => {
        console.log('Successfully loaded executions data from Gist.');
        executionsData = json;
        renderAllBuilds();
        animateCards();
      })
      .catch(err => {
        console.warn('Failed to load executions from Gist, falling back to local data.json:', err);
        fetch('data.json')
          .then(res => res.json())
          .then(json => {
            executionsData = json;
            renderAllBuilds();
            animateCards();
          })
          .catch(localErr => {
            console.error('Failed to load local executions data:', localErr);
          });
      });

    // 5. Search Input logic
    searchInput.addEventListener('input', () => {
      filterBuilds();
    });

    // 6. Prevent copy/right-click just like original site
    document.onselectstart = function () { return false; };
    document.oncontextmenu = function () { return false; };
    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
      }
    });
  }

  // Create background slider div
  function createBgDiv(url) {
    const div = document.createElement('div');
    div.className = 'bg-slide';
    div.style.backgroundImage = `url('${url}')`;
    return div;
  }

  // Handle active game tab transitions
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', (e) => {
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

      // Reset search on tab switch
      searchInput.value = '';
      
      // Render and animate cards for this game
      renderBuilds(targetId);
      animateCards();

      // Transition background image
      const bgData = bgMap[targetId];
      if (bgData) {
        slideBackground(bgData, direction);
      }
    });
  });

  // Background sliding animation
  function slideBackground(bgData, direction) {
    const newDiv = createBgDiv(bgData.tiny);
    newDiv.style.transform = direction === 'down' ? 'translateY(100%)' : 'translateY(-100%)';
    newDiv.style.filter = 'blur(20px)';
    newDiv.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), filter 0.8s ease';

    bgContainer.appendChild(newDiv);

    void newDiv.offsetWidth; // Force layout
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

  // Animate grid cards loading in sequential order
  function animateCards() {
    const activeSection = document.querySelector('.game-section.active');
    if (!activeSection) return;

    const cards = activeSection.querySelectorAll('.build');
    cards.forEach(card => card.classList.remove('visible'));

    void activeSection.offsetWidth; // Force reflow

    cards.forEach((card, index) => {
      const delay = Math.pow(index, 0.75) * 60;
      setTimeout(() => {
        card.classList.add('visible');
      }, delay);
    });
  }

  // Render cards for all games loaded in data
  function renderAllBuilds() {
    Object.keys(bgMap).forEach(gameKey => {
      renderBuilds(gameKey);
    });
  }

  // Render a specific game section's builds
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

      // 60 FPS frame-to-second converter
      const FPS = 60;
      const animFrames = typeof build.anim_time === 'number' ? build.anim_time : 0;
      const ttkFrames = typeof build.ttk === 'number' ? build.ttk : 0;
      
      const animTimeStr = animFrames > 0 ? (animFrames / FPS).toFixed(2) + 's' : '-';
      const ttkStr = ttkFrames > 0 ? (ttkFrames / FPS).toFixed(2) + 's' : '-';
      const priceStr = build.price ? `${build.price} CP` : '';

      // Construct tags array
      const tags = [];
      if (animTimeStr !== '-') tags.push(`Anim: ${animTimeStr}`);
      if (ttkStr !== '-') tags.push(`TTK: ${ttkStr}`);
      if (priceStr) tags.push(priceStr);
      if (build.bundle) tags.push(build.bundle);

      const tagsHtml = tags
        .map(t => `<div class="build-tag">${t}</div>`)
        .join('');

      return `
        <div class="build" data-name="${build.name.toLowerCase()}" data-bundle="${(build.bundle || '').toLowerCase()}" data-idx="${idx}">
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

    // Attach card click event listeners to open the modal
    Array.from(container.querySelectorAll('.build')).forEach(card => {
      card.addEventListener('click', () => {
        const idx = card.getAttribute('data-idx');
        const jsonKey = gameKey.toUpperCase();
        const build = executionsData[jsonKey][idx];
        showVideoModal(build.name, build);
      });
    });
  }

  // Filter grid cards using query input
  function filterBuilds() {
    const query = searchInput.value.toLowerCase().trim();
    const activeSection = document.querySelector('.game-section.active');
    if (!activeSection) return;

    const cards = activeSection.querySelectorAll('.build');
    cards.forEach(card => {
      const name = card.getAttribute('data-name');
      const bundle = card.getAttribute('data-bundle');
      
      if (name.includes(query) || bundle.includes(query)) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Display the video and preview GIF popup modal
  function showVideoModal(name, build) {
    // Remove existing popups
    document.querySelectorAll('.move-popup, .move-popup-overlay').forEach(el => el.remove());

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'move-popup-overlay';
    overlay.onclick = () => {
      popup.remove();
      overlay.remove();
      document.body.classList.remove('popup-active');
    };
    document.body.appendChild(overlay);
    document.body.classList.add('popup-active');

    // Stats converters
    const FPS = 60;
    const animFrames = typeof build.anim_time === 'number' ? build.anim_time : 0;
    const ttkFrames = typeof build.ttk === 'number' ? build.ttk : 0;
    
    const animTime = animFrames > 0 ? (animFrames / FPS).toFixed(2) + 's' : '-';
    const ttk = ttkFrames > 0 ? (ttkFrames / FPS).toFixed(2) + 's' : '-';
    const priceStr = build.price ? `${build.price} CP` : 'Free';
    const bundleMarkup = build.bundle 
      ? `<span class="popup-bundle"><b>Bundle:</b> ${build.bundle}</span>` 
      : '';

    // Check if preview GIF is available
    const hasGif = typeof build.preview === 'string' && build.preview.toLowerCase().endsWith('.gif');
    const previewMediaMarkup = hasGif 
      ? `<div class="popup-gif-preview-container">
           <img class="popup-gif-preview" src="${build.preview}" alt="${name} Preview">
         </div>`
      : `<div class="popup-img-wrapper">
           <img class="popup-img" src="${build.icon || 'assets/missing_preview.jpg'}" alt="${name}" onerror="this.onerror=null;this.src='assets/missing_preview.jpg';">
         </div>`;

    // Process available videos
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

    // Create modal
    const popup = document.createElement('div');
    popup.className = 'move-popup';
    popup.innerHTML = `
      <button class="popup-close" title="Close">&times;</button>
      <div class="popup-title">${name}</div>
      
      ${previewMediaMarkup}

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

    document.body.appendChild(popup);
  }

  // Run initial loading functions
  init();
});
