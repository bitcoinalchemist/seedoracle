(function () {
  'use strict';

  // Keep the static site installable without making service-worker support a
  // requirement for the oracle itself.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
    });
  }

  // Chromium can reject an in-progress native document view transition when
  // another navigation interrupts it. It is harmless, but otherwise appears
  // as an unhandled rejection during rapid navigation.
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    if (reason && reason.name === 'AbortError' && /transition was skipped/i.test(String(reason.message || ''))) {
      e.preventDefault();
    }
  });

  // Shared two-or-more-option segmented rail (the Modern/Olney voice rails in
  // About + Card Elements, and any future one). Operates on the buttons inside
  // `rail` that carry [data-seg-tab]; `onSelect(value, button)` fires on every
  // selection. Manages roving tabindex + arrow/Home/End keys and the is-active
  // class; sets aria-selected on role="tab" buttons and aria-pressed otherwise,
  // so the same helper serves a real tablist (About, with two panels) and a
  // toggle group (Elements, one re-rendered panel). Returns { select(value) }.
  window.bindSegmentedRail = function (rail, onSelect) {
    if (!rail) return { select: function () {} };
    var tabs = Array.prototype.slice.call(rail.querySelectorAll('[data-seg-tab]'));
    if (!tabs.length) return { select: function () {} };
    var isTab = tabs[0].getAttribute('role') === 'tab';
    function set(tab, focus, fire) {
      if (!tab || tab.disabled) return;
      tabs.forEach(function (b) {
        var on = b === tab;
        b.classList.toggle('is-active', on);
        b.setAttribute(isTab ? 'aria-selected' : 'aria-pressed', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      if (focus) tab.focus();
      if (fire && typeof onSelect === 'function') onSelect(tab.dataset.segTab, tab);
    }
    tabs.forEach(function (t) {
      if (t.getAttribute(isTab ? 'aria-selected' : 'aria-pressed') !== 'true') t.tabIndex = -1;
    });
    rail.addEventListener('click', function (e) {
      set(e.target.closest('[data-seg-tab]'), false, true);
    });
    rail.addEventListener('keydown', function (e) {
      var t = e.target.closest('[data-seg-tab]');
      if (!t) return;
      var usable = tabs.filter(function (x) { return !x.disabled; });
      var i = usable.indexOf(t);
      if (i < 0) return;
      var last = usable.length - 1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); set(usable[(i + 1) % usable.length], true, true); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); set(usable[(i + last) % usable.length], true, true); }
      if (e.key === 'Home') { e.preventDefault(); set(usable[0], true, true); }
      if (e.key === 'End') { e.preventDefault(); set(usable[last], true, true); }
    });
    // Programmatic select without re-firing onSelect (used to sync markup to
    // state); pass fire=false so callers don't loop.
    return { select: function (value) { set(rail.querySelector('[data-seg-tab="' + value + '"]'), false, false); } };
  };

  var headerHtml =
    '<header class="site-header" id="siteHeader">' +
      '<div class="sh-inner">' +
        '<a href="index.html" class="sh-logo" aria-label="Seed Oracle home">' +
          '<img class="sh-logo-mark" src="assets/logo-mark.svg" alt="" width="34" height="34">' +
          '<span class="sh-logo-type">seed<span class="accent">oracle</span></span>' +
        '</a>' +
      '</div>' +
    '</header>';

  var skipHtml = '<a href="#main" class="skip-link">Skip to content</a>';
  document.currentScript.insertAdjacentHTML('beforebegin', skipHtml + headerHtml);

  var header = document.getElementById('siteHeader');
  if (header && !document.getElementById('main')) {
    header.insertAdjacentHTML('afterend', '<div id="main" tabindex="-1" class="main-anchor"></div>');
  }

  window.addEventListener('scroll', function () {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  window.toggleSection = function (id) {
    var section = document.getElementById(id);
    if (!section) return;
    // Rail sections don't collapse — see _restoreSections below.
    if (section.closest('[data-section-rail]')) return;
    var open = section.classList.toggle('section-open');
    var b = section.querySelector(':scope > .section-heading > .section-toggle, :scope > .section-toggle');
    var body = section.querySelector(':scope > .section-bodywrap > .section-bodymin');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (body) body.inert = !open;
    try { localStorage.setItem('mc-section-' + id, open ? '1' : '0'); } catch (e) {}
  };
  document.addEventListener('click', function (e) {
    var toggle = e.target && e.target.closest && e.target.closest('.section-toggle[data-section]');
    if (toggle) window.toggleSection(toggle.getAttribute('data-section'));
  });
  function _restoreSections() {
    document.querySelectorAll('.page-section').forEach(function (section) {
      // Sections inside a section rail ([data-section-rail], see
      // js/home-sections.js / js/iching-sections.js) are driven by tabs, not
      // by collapse toggles. Their toggles are hidden, so a restored closed
      // state would be unrecoverable — force them open and drop any key left
      // over from before the rail landed.
      if (section.closest('[data-section-rail]')) {
        section.classList.add('section-open');
        var railToggle = section.querySelector(':scope > .section-heading > .section-toggle, :scope > .section-toggle');
        if (railToggle) railToggle.setAttribute('aria-expanded', 'true');
        var railBody = section.querySelector(':scope > .section-bodywrap > .section-bodymin');
        if (railBody) railBody.inert = false;
        try { localStorage.removeItem('mc-section-' + section.id); } catch (e) {}
        return;
      }
      var b = section.querySelector(':scope > .section-heading > .section-toggle, :scope > .section-toggle');
      if (!b) return;
      var saved = null;
      try { saved = localStorage.getItem('mc-section-' + section.id); } catch (e) {}
      var startClosed = section.classList.contains('section-start-closed');
      var open = saved !== null ? (saved !== '0') : !startClosed;
      section.classList.toggle('section-open', open);
      if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
      var body = section.querySelector(':scope > .section-bodywrap > .section-bodymin');
      if (body) body.inert = !open;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _restoreSections);
  else _restoreSections();
})();

(function () {
  'use strict';
  var mm = window.matchMedia;
  var reduce = mm && mm('(prefers-reduced-motion: reduce)').matches;
  var nativeVT = ('onpagereveal' in window);

  function external(a) {
    if (!a) return true;
    if (a.target && a.target !== '_self') return true;
    if (a.hasAttribute('download')) return true;
    var raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#') return true;
    if (/^(mailto:|tel:|sms:|javascript:|data:)/i.test(raw)) return true;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return true; }
    if (url.origin !== location.origin) return true;
    if (url.href.split('#')[0] === location.href.split('#')[0]) return true;
    return false;
  }

  var seen = {};
  function prefetch(a) {
    if (external(a) || seen[a.href]) return;
    seen[a.href] = true;
    var l = document.createElement('link'); l.rel = 'prefetch'; l.href = a.href;
    document.head.appendChild(l);
  }
  ['pointerover', 'focusin'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a) prefetch(a);
    }, { passive: true });
  });

  if (reduce || nativeVT) return;

  var veil;
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (external(a)) return;
    var href = a.href;
    e.preventDefault();
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'pg-veil'; veil.setAttribute('aria-hidden', 'true');
      (document.body || document.documentElement).appendChild(veil);
    }
    requestAnimationFrame(function () { veil.classList.add('show'); });
    var done = false;
    function go() { if (done) return; done = true; location.href = href; }
    veil.addEventListener('transitionend', go, { once: true });
    setTimeout(go, 480);
  });
  window.addEventListener('pageshow', function () { if (veil) veil.classList.remove('show'); });
})();
