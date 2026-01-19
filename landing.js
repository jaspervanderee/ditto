// Landing Page - Minimal Interactivity

// Dynamic Year Update
const yearElement = document.getElementById('currentYear');
if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

// Sats Slot Machine Animation
const satsSlot = document.getElementById('satsSlot');
if (satsSlot) {
  const satAmounts = [21, 100, 210, 500, 1000, 1500, 2100, 5000, 10000, 21000];
  let currentIndex = 0;
  
  setInterval(() => {
    currentIndex = (currentIndex + 1) % satAmounts.length;
    satsSlot.textContent = satAmounts[currentIndex].toLocaleString();
  }, 1500);
}

// Smooth scroll for anchor links (fallback for older browsers)
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// FAQ accordion - allow only one open at a time (optional UX enhancement)
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
  item.addEventListener('toggle', function() {
    if (this.open) {
      faqItems.forEach(other => {
        if (other !== this && other.open) {
          other.open = false;
        }
      });
    }
  });
});

// Add subtle parallax to hero background elements
const heroSection = document.querySelector('.hero');
const sun = document.querySelector('.sun');
const gridFloor = document.querySelector('.grid-floor');

if (heroSection && sun && gridFloor) {
  let ticking = false;
  
  const updateParallax = () => {
    const scrolled = window.scrollY;
    const heroHeight = heroSection.offsetHeight;
    
    if (scrolled < heroHeight) {
      const progress = scrolled / heroHeight;
      sun.style.transform = `translateX(-50%) translateY(${progress * 30}px)`;
      gridFloor.style.opacity = 0.08 - (progress * 0.06);
    }
    ticking = false;
  };
  
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }, { passive: true });
}

// Intersection Observer for fade-in animations on scroll
const observerOptions = {
  root: null,
  rootMargin: '0px 0px -60px 0px',
  threshold: 0.1
};

const fadeInOnScroll = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      fadeInOnScroll.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe key sections for fade-in effect
document.querySelectorAll('.comparison-col, .feature-card, .testimonial, .price-card, .faq-item').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  fadeInOnScroll.observe(el);
});

// Add visible class styles
const style = document.createElement('style');
style.textContent = '.visible { opacity: 1 !important; transform: translateY(0) !important; }';
document.head.appendChild(style);

// Stagger animation for grid items
const staggerElements = (selector, baseDelay = 100) => {
  const elements = document.querySelectorAll(selector);
  elements.forEach((el, index) => {
    el.style.transitionDelay = `${index * baseDelay}ms`;
  });
};

staggerElements('.feature-card', 100);
staggerElements('.testimonial', 80);
staggerElements('.faq-item', 60);

// Lightning Modal Functionality
const v4vCard = document.getElementById('v4vCard');
const lightningModal = document.getElementById('lightningModal');
const modalClose = document.getElementById('modalClose');
const copyBtn = document.getElementById('copyBtn');
const lightningAddress = document.getElementById('lightningAddress');

if (v4vCard && lightningModal) {
  v4vCard.addEventListener('click', () => {
    lightningModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
  
  modalClose.addEventListener('click', () => {
    lightningModal.classList.remove('active');
    document.body.style.overflow = '';
  });
  
  lightningModal.addEventListener('click', (e) => {
    if (e.target === lightningModal) {
      lightningModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
  
  // Copy functionality
  if (copyBtn && lightningAddress) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lightningAddress.textContent);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const range = document.createRange();
        range.selectNode(lightningAddress);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      }
    });
  }
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightningModal.classList.contains('active')) {
      lightningModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}
