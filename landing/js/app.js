import translations from './translations.js';

const MARKET_URL = 'https://marketplace.visualstudio.com/items?itemName=Uginy.telecode-ai';

document.addEventListener('DOMContentLoaded', () => {
  const btnEn  = document.getElementById('lang-en');
  const btnRu  = document.getElementById('lang-ru');
  const i18nEls = document.querySelectorAll('[data-i18n]');

  let lang = navigator.language?.startsWith('ru') ? 'ru' : 'en';

  function applyLang(newLang) {
    lang = newLang;
    document.documentElement.lang = lang;
    btnEn.classList.toggle('active', lang === 'en');
    btnRu.classList.toggle('active', lang === 'ru');

    const t = translations[lang];
    for (const el of i18nEls) {
      const key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    }
  }

  btnEn.addEventListener('click', () => applyLang('en'));
  btnRu.addEventListener('click', () => applyLang('ru'));
  applyLang(lang); // apply on load

  // --- Animated dots in terminal mockup ---
  // Runs an animated "test passing" sequence
  const dotEl = document.querySelector('.dot-anim');
  const typingTarget = document.getElementById('typing-target');

  if (typingTarget && dotEl) {
    const sequence = [
      { text: 'Running tests', delay: 0 },
      { text: 'Running tests — 8/8 passed ✅', delay: 2400 },
      { text: 'Running tests — 8/8 passed ✅\nDone! All checks green.', delay: 4000 },
    ];

    for (const step of sequence) {
      setTimeout(() => {
        typingTarget.textContent = step.text;
      }, step.delay);
    }
  }

  // --- Navbar shrink on scroll ---
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    navbar.style.padding = window.scrollY > 40 ? '12px 0' : '18px 0';
  }, { passive: true });

  // --- Intersection observer for fade-in ---
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });

  for (const el of document.querySelectorAll('.feature-card, .step')) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity .5s ease, transform .5s ease';
    observer.observe(el);
  }
});

// The IntersectionObserver toggles .visible, so we need to handle it via JS directly
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = '.visible { opacity: 1 !important; transform: none !important; }';
  document.head.appendChild(style);
});
