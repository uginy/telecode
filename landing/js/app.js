import translations from './translations.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnEn = document.getElementById('lang-en');
  const btnRu = document.getElementById('lang-ru');
  const elements = document.querySelectorAll('[data-i18n]');
  
  // Set default language
  let currentLang = 'en';

  function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;

    // Update active class on buttons
    btnEn.classList.toggle('active', lang === 'en');
    btnRu.classList.toggle('active', lang === 'ru');

    // Update text
    for (const el of elements) {
      const key = el.getAttribute('data-i18n');
      if (translations[lang][key]) {
        el.textContent = translations[lang][key];
      }
    }
    
    // Add a very subtle transition effect
    document.body.style.opacity = 0;
    setTimeout(() => {
      document.body.style.opacity = 1;
      document.body.style.transition = 'opacity 0.2s';
    }, 10);
  }

  btnEn.addEventListener('click', () => setLanguage('en'));
  btnRu.addEventListener('click', () => setLanguage('ru'));

  // Typing animation for the terminal
  const strings = [
    "Waiting for the next command... ",
    "Scanning workspace...",
    "Running tests...",
    "Committing changes..."
  ];
  let stringIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  const typingElement = document.querySelector('.typing');
  
  function typeEffect() {
    const currentString = strings[stringIndex];
    
    if (isDeleting) {
      charIndex--;
    } else {
      charIndex++;
    }
    
    // Ensure the cursor stays at the end
    typingElement.innerHTML = `${currentString.substring(0, charIndex)}<span class="cursor"></span>`;
    
    let speed = isDeleting ? 30 : 80;
    
    if (!isDeleting && charIndex === currentString.length) {
      speed = 2000; // Pause at end
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      stringIndex = (stringIndex + 1) % strings.length;
      speed = 500; // Pause before new word
    }
    
    setTimeout(typeEffect, speed);
  }
  
  // Start the typing animation after a small delay
  setTimeout(() => {
    typingElement.textContent = "";
    typeEffect();
  }, 1000);
});
