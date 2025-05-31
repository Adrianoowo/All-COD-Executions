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
      const animTime = (typeof move.anim_time === 'number' && move.anim_time > 0) ? move.anim_time + 's' : '-';
      const ttk = (typeof move.ttk === 'number' && move.ttk > 0) ? move.ttk + 's' : '-';
      return `
        <div class="move-entry" data-idx="${idx}">
          <div class="move-title" style="display:flex;align-items:center;gap:1.2rem;">
            <img class="icon-img" src="${move.icon ? move.icon : 'https://via.placeholder.com/48x34?text=?'}" alt="${move.name}" onerror="this.onerror=null;this.src='https://via.placeholder.com/48x34?text=?';" style="width:48px;height:34px;border-radius:8px;box-shadow:0 1px 4px #0003;">
            <span>${move.name}</span>
            <span style="margin-left:2.2em;font-size:0.98em;color:#bbb;"><b>Anim Time:</b> ${animTime}</span>
            <span style="margin-left:1.2em;font-size:0.98em;color:#bbb;"><b>TTK:</b> ${ttk}</span>
            <span style="margin-left:auto;font-size:0.98em;color:#bbb;font-weight:400;">${move.price}CP</span>
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
          videos.innerHTML = `
            <div style="display:flex;gap:2rem;justify-content:center;align-items:flex-start;flex-wrap:wrap;">
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
      ${data.map(move => `
        <div class="grid-card">
          <img src="${move.icon}" alt="${move.name}">
          <div>${move.name}</div>
        </div>
      `).join('')}
    </div>`;
  }

  document.getElementById('listBtn').onclick = renderList;
  document.getElementById('gridBtn').onclick = renderGrid;
});
