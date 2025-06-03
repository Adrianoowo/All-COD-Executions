// game.js - All COD Executions
// Handles UI rendering and interactivity for game.html

// Get game from query param
const params = new URLSearchParams(window.location.search);
const game = params.get('game') || 'MWII';
document.addEventListener('DOMContentLoaded', () => {
  // Set body class for game color
  const body = document.getElementById('gameBody');
  if (body) {
    body.classList.remove('mw', 'cw', 'vg', 'mwii', 'mwiii', 'bo6');
    body.classList.add(game.toLowerCase());
  }
  document.getElementById('game-title').textContent = `${game} Executions`;

  let data = {};
  let currentLayout = 'list';

  fetch('data.json')
    .then(res => res.json())
    .then(json => {
      data = json[game] || [];
      renderList();
    });

  function renderList() {
    currentLayout = 'list';
    document.getElementById('listBtn').classList.add('active');
    document.getElementById('gridBtn').classList.remove('active');
    const container = document.getElementById('movesContainer');
    container.innerHTML = data.map((move, idx) => {
      // FPS for frame-to-seconds conversion
      const FPS = 60;
      // Defensive: ensure all fields are present or defaulted
      const price = typeof move.price === 'number' ? move.price : 0;
      const bundle = move.bundle || '';
      // Convert anim_time and ttk from frames to seconds for display
      const animFrames = typeof move.anim_time === 'number' ? move.anim_time : 0;
      const ttkFrames = typeof move.ttk === 'number' ? move.ttk : 0;
      const animTime = animFrames > 0 ? (animFrames / FPS).toFixed(2) + 's' : '-';
      const ttk = ttkFrames > 0 ? (ttkFrames / FPS).toFixed(2) + 's' : '-';
      // Use missing_preview.jpg if icon is null, undefined, or empty string
      const iconSrc = move.icon ? move.icon : 'assets/missing_preview.jpg';
      return `
        <div class="move-entry" data-idx="${idx}">
          <div class="move-title" style="display:flex;align-items:center;gap:1.2rem;">
            <img class="icon-img" src="${iconSrc}" alt="${move.name}" onerror="this.onerror=null;this.src='assets/missing_preview.jpg';" style="width:34px;height:34px;">
            <span>${move.name}</span>
            <span style="margin-left:2.2em;font-size:0.98em;color:#bbb;"><b>Anim Time:</b> ${animTime}</span>
            <span style="margin-left:1.2em;font-size:0.98em;color:#bbb;"><b>TTK:</b> ${ttk}</span>
            <span style="margin-left:auto;font-size:0.98em;color:#bbb;font-weight:400;">${price}CP</span>
          </div>
          <div class="move-videos"></div>
        </div>
      `;
    }).join('');
    // Add expand/collapse logic
    Array.from(document.querySelectorAll('.move-entry')).forEach(entry => {
      entry.onclick = function(e) {
        // Only toggle if not clicking a video/iframe
        if (e.target.tagName === 'IFRAME' || e.target.tagName === 'VIDEO') return;
        const idx = this.getAttribute('data-idx');
        const videos = this.querySelector('.move-videos');
        const isExpanded = this.classList.contains('expanded');
        if (isExpanded) {
          this.classList.remove('expanded');
          // Animate collapse
          videos.style.maxHeight = '0';
          setTimeout(() => { videos.innerHTML = ''; }, 350);
        } else {
          this.classList.add('expanded');
          const move = data[idx];
          const isVideo = url => typeof url === 'string' && url.startsWith('http');
          const bundle = move.bundle || '';
          videos.innerHTML = `
            <div style="display:flex;gap:2rem;justify-content:center;align-items:flex-start;flex-wrap:wrap;">
              <div style='flex-basis:100%;text-align:center;margin-bottom:0.7em;'>
                ${bundle ? `<span style='background:#222;padding:0.3em 0.9em;border-radius:6px;font-size:1em;color:#f7c873;box-shadow:0 1px 4px #0002;'><b>Bundle:</b> ${bundle}</span>` : ''}
              </div>
              <div><div style='text-align:center;font-weight:bold;margin-bottom:0.5rem;'>Standing</div>${isVideo(move.standing) ? `<iframe src="${move.standing.replace('view?usp=drive_link','preview')}" width="320" height="240" allow="autoplay"></iframe>` : '<span style="color:#aaa;">No video</span>'}</div>
              <div><div style='text-align:center;font-weight:bold;margin-bottom:0.5rem;'>Prone</div>${isVideo(move.prone) ? `<iframe src="${move.prone.replace('view?usp=drive_link','preview')}" width="320" height="240" allow="autoplay"></iframe>` : '<span style="color:#aaa;">No video</span>'}</div>
              <div><div style='text-align:center;font-weight:bold;margin-bottom:0.5rem;'>Downed</div>${isVideo(move.downed) ? `<iframe src="${move.downed.replace('view?usp=drive_link','preview')}" width="320" height="240" allow="autoplay"></iframe>` : '<span style="color:#aaa;">No video</span>'}</div>
            </div>
          `;
          // Animate expand
          videos.style.maxHeight = '500px';
        }
      };
    });
  }

  function renderGrid() {
    currentLayout = 'grid';
    document.getElementById('listBtn').classList.remove('active');
    document.getElementById('gridBtn').classList.add('active');
    const container = document.getElementById('movesContainer');
    container.innerHTML = `<div class="grid-view">
      ${data.map((move, idx) => {
        const price = typeof move.price === 'number' ? move.price : 0;
        const iconSrc = move.icon ? move.icon : 'assets/missing_preview.jpg';
        return `
          <div class="grid-card" data-idx="${idx}">
            <img src="${iconSrc}" alt="${move.name}" onerror="this.onerror=null;this.src='assets/missing_preview.jpg';">
            <div class="move-title">${move.name}</div>
            <div class="move-price">${price}CP</div>
          </div>
        `;
      }).join('')}
    </div>`;

    // Add popup logic
    Array.from(document.querySelectorAll('.grid-card')).forEach(card => {
      card.onclick = function(e) {
        const idx = this.getAttribute('data-idx');
        const move = data[idx];
        const FPS = 60;
        const animFrames = typeof move.anim_time === 'number' ? move.anim_time : 0;
        const ttkFrames = typeof move.ttk === 'number' ? move.ttk : 0;
        const animTime = animFrames > 0 ? (animFrames / FPS).toFixed(2) + 's' : '-';
        const ttk = ttkFrames > 0 ? (ttkFrames / FPS).toFixed(2) + 's' : '-';
        const price = typeof move.price === 'number' ? move.price : 0;
        const bundle = move.bundle || '';
        const isVideo = url => typeof url === 'string' && url.startsWith('http');

        // Remove any existing popup
        document.querySelectorAll('.move-popup, .move-popup-overlay').forEach(el => el.remove());

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'move-popup-overlay';
        overlay.onclick = () => {
          popup.remove();
          overlay.remove();
          document.body.classList.remove('popup-active'); // Remove class on close
        };
        document.body.appendChild(overlay);
        document.body.classList.add('popup-active'); // Add class on open

        // Popup
        const popup = document.createElement('div');
        popup.className = 'move-popup';
        const iconSrc = move.icon ? move.icon : 'assets/missing_preview.jpg';
        popup.innerHTML = `
          <button class="popup-close" title="Close">&times;</button>
          <img class="popup-img" src="${iconSrc}" alt="${move.name}" onerror="this.onerror=null;this.src='assets/missing_preview.jpg';">
          <div class="popup-title">${move.name}</div>
          <div class="popup-info">
            <b>Anim Time:</b> ${animTime} &nbsp; <b>TTK:</b> ${ttk}
          </div>
          <div class="popup-details">
            <b>Price:</b> ${price}CP
            ${bundle ? `<span class="popup-bundle"><b>Bundle:</b> ${bundle}</span>` : ''}
          </div>
          <div class="popup-videos">
            <div><div style='font-weight:bold;margin-bottom:0.3em;'>Standing</div>${isVideo(move.standing) ? `<iframe src="${move.standing.replace('view?usp=drive_link','preview')}" allow="autoplay; allowfullscreen"></iframe>` : '<span>No video</span>'}</div>
            <div><div style='font-weight:bold;margin-bottom:0.3em;'>Prone</div>${isVideo(move.prone) ? `<iframe src="${move.prone.replace('view?usp=drive_link','preview')}" allow="autoplay"></iframe>` : '<span>No video</span>'}</div>
            <div><div style='font-weight:bold;margin-bottom:0.3em;'>Downed</div>${isVideo(move.downed) ? `<iframe src="${move.downed.replace('view?usp=drive_link','preview')}" allow="autoplay"></iframe>` : '<span>No video</span>'}</div>
          </div>
        `;
        popup.querySelector('.popup-close').onclick = () => {
          popup.remove();
          overlay.remove();
          document.body.classList.remove('popup-active'); // Remove class on close
        };
        document.body.appendChild(popup);
      };
    });
  }

  document.getElementById('listBtn').onclick = renderList;
  document.getElementById('gridBtn').onclick = renderGrid;
});
