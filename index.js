document.addEventListener('DOMContentLoaded', function() {
  window.goToGame = function(game) {
    window.location.href = `game.html?game=${game}`;
  };
});
