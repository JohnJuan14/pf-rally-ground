/**
 * P&F Rally Ground V2 — Architectural Editorial UI & Motion Engine
 * Powered by Framer Motion (motion.dev), anime.js, Kokonut UI & Bklit UI patterns
 * Aesthetic: "Bicol Heritage Court Club" (Warm Alabaster Daylight + Deep Cypress Forest)
 */
(function () {
  'use strict';

  var THEME_STORAGE_KEY = 'pf_v3_theme_night_default';

  /**
   * 1. Instant Theme Hydration (Default: 'light' Editorial Warm Daylight)
   */
  function getInitialTheme() {
    try {
      var saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return 'dark';
  }

  function applyTheme(theme, animateTransition) {
    var root = document.documentElement;
    var body = document.body;
    root.setAttribute('data-theme', theme);
    if (body) {
      body.setAttribute('data-theme', theme);
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem('pf_client_theme', theme);
    } catch (e) {}

    var btn = document.getElementById('pf-theme-toggle-btn');
    if (btn) {
      var isLight = theme === 'light';
      btn.setAttribute('aria-label', isLight ? 'Switch to Night Court Mode' : 'Switch to Editorial Daylight Mode');
      btn.setAttribute('title', isLight ? 'Switch to Night Court Mode (Dark)' : 'Switch to Editorial Daylight Mode (Light)');
      var iconEl = btn.querySelector('[data-theme-icon]') || document.getElementById('pf-theme-toggle-icon');
      var labelEl = btn.querySelector('[data-theme-label]') || document.getElementById('pf-theme-toggle-label');
      if (iconEl) {
        if (iconEl.id === 'pf-theme-toggle-icon') {
          iconEl.textContent = isLight ? '☀️' : '🌙';
        } else {
          iconEl.innerHTML = isLight
            ? '<svg class="w-3.5 h-3.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/></svg>'
            : '<svg class="w-3.5 h-3.5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>';
        }
      }
      if (labelEl) {
        labelEl.textContent = isLight ? 'Daylight' : 'Night Court';
      }
      if (animateTransition && window.anime) {
        window.anime({
          targets: btn,
          scale: [0.92, 1],
          duration: 380,
          easing: 'easeOutElastic(1, .6)'
        });
      }
    }
  }

  // Apply immediately on script load to avoid any flicker
  applyTheme(getInitialTheme(), false);

  window.pfToggleEditorialTheme = function () {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'light' ? 'dark' : 'light';
    applyTheme(next, true);
  };
  window.pfToggleClientTheme = window.pfToggleEditorialTheme;

  /**
   * 2. Inject Organic Film Grain Overlay (Creative Director Standard)
   */
  function injectOrganicGrainOverlay() {
    if (document.getElementById('pf-editorial-grain')) return;
    var grain = document.createElement('div');
    grain.id = 'pf-editorial-grain';
    grain.setAttribute('aria-hidden', 'true');
    document.body.appendChild(grain);
  }

  /**
   * 3. Inject Bklit UI Segmented Theme Switcher in Header
   */
  function injectHeaderThemeToggle() {
    if (document.getElementById('pf-theme-toggle-btn')) {
      applyTheme(getInitialTheme(), false);
      return;
    }
    var headerRight = document.querySelector('header .flex.items-center.gap-1\\.5.sm\\:gap-2\\.5.flex-shrink-0');
    if (!headerRight) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pf-theme-toggle-btn';
    btn.onclick = window.pfToggleEditorialTheme;
    btn.className = 'pf-bklit-theme-pill whitespace-nowrap h-9 sm:h-10 px-2.5 sm:px-3 rounded-full flex items-center gap-1.5 text-[11px] font-bold tracking-tight transition-all active:scale-95 flex-shrink-0';
    btn.innerHTML =
      '<span data-theme-icon class="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15"></span>' +
      '<span data-theme-label class="hidden xl:inline font-mono text-[10px] uppercase tracking-wider">Daylight</span>';

    headerRight.insertBefore(btn, headerRight.firstChild);
    applyTheme(getInitialTheme(), false);
  }

  /**
   * 4. Framer Motion & anime.js Spring Dropdown Physics
   */
  function initSpringDropdowns() {
    var dropdowns = document.querySelectorAll('.pf-nav-dropdown');
    dropdowns.forEach(function (dd) {
      var menu = dd.querySelector('.pf-nav-dropdown-menu');
      var items = dd.querySelectorAll('.pf-nav-dropdown-item');
      if (!menu) return;

      dd.addEventListener('mouseenter', function () {
        if (window.Motion && typeof window.Motion.animate === 'function') {
          window.Motion.animate(
            menu,
            { opacity: [0, 1], transform: ['translateY(8px) scale(0.97)', 'translateY(0px) scale(1)'] },
            { duration: 0.22, easing: [0.22, 1, 0.36, 1] }
          );
        }
        if (window.anime && items.length) {
          window.anime.remove(items);
          window.anime({
            targets: items,
            translateX: [-6, 0],
            opacity: [0.4, 1],
            delay: window.anime.stagger(28),
            duration: 260,
            easing: 'easeOutQuad'
          });
        }
      });
    });
  }

  /**
   * 5. Kokonut UI Radial Spotlight & Magnetic Surface Micro-Interactions
   */
  function initKokonutSpotlightCards() {
    var cards = document.querySelectorAll('.card-glow, .card-lift, .bg-brand-card');
    cards.forEach(function (card) {
      card.classList.add('pf-kokonut-card');
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        card.style.setProperty('--pf-mouse-x', x + 'px');
        card.style.setProperty('--pf-mouse-y', y + 'px');
      });
    });

    // Tactile Spring Press on interactive buttons
    var buttons = document.querySelectorAll('.hero-cta-btn, button[onclick*="openBookingDrawer"], button[onclick*="handleDrawerProceed"]');
    buttons.forEach(function (btn) {
      btn.addEventListener('mouseenter', function () {
        if (window.Motion && typeof window.Motion.animate === 'function') {
          window.Motion.animate(btn, { scale: 1.025 }, { duration: 0.2, easing: [0.22, 1, 0.36, 1] });
        }
      });
      btn.addEventListener('mouseleave', function () {
        if (window.Motion && typeof window.Motion.animate === 'function') {
          window.Motion.animate(btn, { scale: 1 }, { duration: 0.22, easing: [0.22, 1, 0.36, 1] });
        }
      });
    });
  }

  /**
   * 6. Staggered Scroll & Section Entrance Choreography (Framer Motion + anime.js)
   */
  function initEntranceChoreography() {
    // Hero headline & CTA entrance
    var heroTitle = document.getElementById('site-hero-title');
    var heroSub = document.getElementById('site-hero-subtitle');
    var heroCtas = document.querySelectorAll('.hero-cta-btn');

    if (window.anime && heroTitle) {
      window.anime({
        targets: [heroTitle, heroSub].filter(Boolean),
        translateY: [18, 0],
        opacity: [0.15, 1],
        delay: window.anime.stagger(110),
        duration: 720,
        easing: 'easeOutExpo'
      });
    }
    if (window.anime && heroCtas.length) {
      window.anime({
        targets: heroCtas,
        translateY: [14, 0],
        opacity: [0.2, 1],
        delay: window.anime.stagger(85, { start: 180 }),
        duration: 640,
        easing: 'easeOutCubic'
      });
    }

    // Scroll-triggered section & card reveals (non-blocking: always visible fallback)
    if (!('IntersectionObserver' in window)) return;

    var revealTargets = document.querySelectorAll(
      '#courts .grid > div, #court-rates .grid > div, #gear-rentals .grid > div, #schedule > div, main section > div'
    );

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          obs.unobserve(el);
          if (window.Motion && typeof window.Motion.animate === 'function') {
            window.Motion.animate(
              el,
              { opacity: [0.35, 1], transform: ['translateY(14px)', 'translateY(0px)'] },
              { duration: 0.46, easing: [0.22, 1, 0.36, 1] }
            );
          } else if (window.anime) {
            window.anime({
              targets: el,
              translateY: [14, 0],
              opacity: [0.35, 1],
              duration: 460,
              easing: 'easeOutCubic'
            });
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
    );

    revealTargets.forEach(function (el) {
      observer.observe(el);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(getInitialTheme(), false);
    injectOrganicGrainOverlay();
    injectHeaderThemeToggle();
    initSpringDropdowns();
    initKokonutSpotlightCards();
    initEntranceChoreography();
  });
})();
