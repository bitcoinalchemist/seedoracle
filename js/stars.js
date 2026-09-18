/* Fixed northern sky: latitude 52 N, local sidereal time 0 h; not live.
 * Stereographic projection towards the north celestial pole, zenith upwards.
 * Requires window.MC_STARS (stardata.js); exports no public APIs.
 * Static canvas: draw only on load and viewport resize.
 * Positions are catalogue J2000; brightness and colour suit a quiet backdrop.
 */
(function () {
  'use strict';
  function initStars() {
    var canvas = document.querySelector('.stars-bg');
    if (!canvas || !canvas.getContext || !window.MC_STARS) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var stars = [], W, H;
    var rad = Math.PI / 180, latitude = 52 * rad;
    function build() {
      W = window.innerWidth; H = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var scale = Math.min(W, H) * 0.9;
      stars = [];
      window.MC_STARS.forEach(function (s, i) {
        var ha = -s[0] * 15 * rad, dec = s[1] * rad;
        var cd = Math.cos(dec), sd = Math.sin(dec);
        var altitude = Math.asin(Math.sin(latitude) * sd + Math.cos(latitude) * cd * Math.cos(ha));
        if (altitude <= 0) return;
        // Facing north, east is right. Equal axis scales preserve star patterns.
        var x = W * 0.5 - scale * cd * Math.sin(ha) / (1 + sd);
        var y = H * 0.42 - scale * cd * Math.cos(ha) / (1 + sd);
        if (x < -5 || x > W + 5 || y < -5 || y > H + 5) return;
        var strength = Math.pow(10, -0.2 * (s[2] + 1));
        var ci = s[3] === null ? 0.5 : s[3];
        stars.push({ x: x, y: y, r: 0.4 + 1.5 * strength,
          alpha: Math.min(0.92, 0.17 + 1.0 * strength) * Math.min(1, altitude / (12 * rad)),
          color: ci < 0.15 ? '205,220,255' : ci > 1.1 ? '255,219,180' : '239,239,245',
          bright: s[2] < 2.5 });
      });
    }
    function paint() {
      ctx.clearRect(0, 0, W, H);
      stars.forEach(function (s) {
        var a = s.alpha;
        if (s.bright) {
          var glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
          glow.addColorStop(0, 'rgba(' + s.color + ',' + a * 0.18 + ')');
          glow.addColorStop(1, 'rgba(' + s.color + ',0)');
          ctx.fillStyle = glow;
          ctx.fillRect(s.x - s.r * 4, s.y - s.r * 4, s.r * 8, s.r * 8);
        }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + s.color + ',' + a + ')'; ctx.fill();
      });
    }
    build(); paint();
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { build(); paint(); }, 150);
    }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStars);
  else initStars();
})();
