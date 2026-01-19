// Content script - extracts transcript from page
// Uses MutationObserver for efficient DOM monitoring
// Only runs on-demand when user clicks extension icon

(function() {
  'use strict';

  const TIMESTAMP_REGEX = /\b\d{0,2}:?\d{1,2}:\d{2}\b/g;
  const OBSERVER_TIMEOUT = 10000;
  const GENERIC_WAIT_AFTER_CLICK = 1000;

  // Transcript button text patterns (case-insensitive)
  const TRANSCRIPT_BUTTON_PATTERNS = [
    'show transcript',
    'view transcript',
    'open transcript',
    'transcript'
  ];

  function removeTimestamps(text) {
    return text.replace(TIMESTAMP_REGEX, '').trim();
  }

  function cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function formatIntoParagraphs(text, sentencesPerParagraph = 5) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    if (sentences.length === 0) return text;

    const paragraphs = [];
    let current = [];

    for (const sentence of sentences) {
      current.push(sentence);
      if (current.length >= sentencesPerParagraph) {
        paragraphs.push(current.join(' '));
        current = [];
      }
    }

    if (current.length > 0) {
      paragraphs.push(current.join(' '));
    }

    return paragraphs.join('\n\n');
  }

  // Deep click: find actual <button> or <a> inside custom elements
  function deepClick(element) {
    if (!element) return false;
    
    const innerButton = element.querySelector('button, a, [role="button"]');
    const target = innerButton || element;
    
    target.click();
    return true;
  }

  // Process extracted text
  function processText(rawText) {
    const cleaned = cleanText(removeTimestamps(rawText));
    const formatted = formatIntoParagraphs(cleaned);
    
    if (!formatted || formatted.length < 50) {
      return null;
    }
    
    return formatted;
  }


  // === YOUTUBE SCRAPER ===

  function clickShowTranscript() {
    // Method 1: Button in description panel
    const descriptionButtons = document.querySelectorAll('ytd-video-description-transcript-section-renderer ytd-button-renderer');
    for (const btn of descriptionButtons) {
      if (btn.textContent.toLowerCase().includes('transcript')) {
        return deepClick(btn);
      }
    }

    // Method 2: Expand description first if collapsed
    const expandButton = document.querySelector('#expand, tp-yt-paper-button#expand');
    if (expandButton && expandButton.offsetParent !== null) {
      deepClick(expandButton);
    }

    // Method 3: "More actions" menu
    const moreActionsBtn = document.querySelector('ytd-menu-renderer button[aria-label="More actions"], #button-shape button[aria-label="More actions"]');
    if (moreActionsBtn) {
      deepClick(moreActionsBtn);
      
      setTimeout(() => {
        const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
        for (const item of menuItems) {
          if (item.textContent.toLowerCase().includes('transcript')) {
            deepClick(item);
            break;
          }
        }
      }, 200);
      return true;
    }

    // Method 4: Direct transcript button anywhere
    const allButtons = document.querySelectorAll('button, ytd-button-renderer, tp-yt-paper-button');
    for (const btn of allButtons) {
      const text = btn.textContent.toLowerCase();
      if (text.includes('show transcript') || text === 'transcript') {
        return deepClick(btn);
      }
    }

    return false;
  }

  function getYouTubeTranscript() {
    const panel = document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"], ' +
      'ytd-transcript-renderer'
    );
    
    if (!panel) return null;

    const segments = panel.querySelectorAll('ytd-transcript-segment-renderer');
    if (segments.length === 0) return null;

    const lines = [];
    for (const segment of segments) {
      const textEl = segment.querySelector('.segment-text, yt-formatted-string:not(.segment-timestamp)');
      if (textEl) {
        lines.push(textEl.textContent.trim());
      }
    }

    return lines.length > 0 ? lines.join(' ') : null;
  }

  function observeYouTubeTranscript() {
    return new Promise(resolve => {
      // Check if transcript already exists
      const existing = getYouTubeTranscript();
      if (existing) {
        const processed = processText(existing);
        if (processed) return resolve({ transcript: processed });
      }

      // Trigger transcript panel
      clickShowTranscript();

      // Set up observer
      const observer = new MutationObserver(() => {
        const transcript = getYouTubeTranscript();
        if (transcript) {
          observer.disconnect();
          clearTimeout(timeout);
          const processed = processText(transcript);
          resolve(processed ? { transcript: processed } : { error: 'No transcript found' });
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Fail-safe timeout
      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve({ error: 'No transcript found' });
      }, OBSERVER_TIMEOUT);
    });
  }


  // === GENERIC SCRAPER (Circle.so, Kajabi, Teachable, etc.) ===

  // Find transcript container by scanning for timestamp patterns
  function findTranscriptContainer() {
    const selectors = [
      '[class*="transcript"]',
      '[class*="caption"]',
      '[class*="subtitle"]',
      '[data-transcript]',
      '.lesson-content',
      '.video-transcript',
      '.course-content',
      'article',
      '.content',
      'main'
    ];

    let bestMatch = null;
    let bestCount = 0;

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.innerText || el.textContent;
        const count = (text.match(TIMESTAMP_REGEX) || []).length;
        if (count > bestCount) {
          bestCount = count;
          bestMatch = text;
        }
      }
    }

    // Fallback: scan divs
    if (bestCount < 5) {
      const divs = document.querySelectorAll('div, section');
      for (const div of divs) {
        const text = div.innerText;
        const count = (text.match(TIMESTAMP_REGEX) || []).length;
        if (count > bestCount) {
          bestCount = count;
          bestMatch = text;
        }
      }
    }

    return bestCount >= 3 ? bestMatch : null;
  }

  // Heuristic clicker: find and click transcript toggle buttons
  function findTranscriptButton() {
    const clickables = document.querySelectorAll('a, button, [role="button"], [class*="btn"], [class*="button"]');
    
    for (const el of clickables) {
      const text = (el.textContent || el.innerText || '').toLowerCase().trim();
      
      // Check against patterns
      for (const pattern of TRANSCRIPT_BUTTON_PATTERNS) {
        if (text.includes(pattern) || text === pattern) {
          // Make sure it's visible and clickable
          if (el.offsetParent !== null && !el.disabled) {
            return el;
          }
        }
      }

      // Also check aria-label and title attributes
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      
      for (const pattern of TRANSCRIPT_BUTTON_PATTERNS) {
        if (ariaLabel.includes(pattern) || title.includes(pattern)) {
          if (el.offsetParent !== null && !el.disabled) {
            return el;
          }
        }
      }
    }

    return null;
  }

  // Generic extraction with heuristic clicking
  function scrapeGeneric() {
    return new Promise(resolve => {
      // First, check if transcript is already visible
      const existingTranscript = findTranscriptContainer();
      
      if (existingTranscript) {
        const processed = processText(existingTranscript);
        if (processed) {
          resolve({ transcript: processed });
          return;
        }
      }

      // Transcript not visible - try to find and click a toggle button
      const transcriptButton = findTranscriptButton();
      
      if (transcriptButton) {
        // Click the button
        deepClick(transcriptButton);
        
        // Wait for content to appear, then re-scan
        setTimeout(() => {
          const newTranscript = findTranscriptContainer();
          
          if (newTranscript) {
            const processed = processText(newTranscript);
            if (processed) {
              resolve({ transcript: processed });
              return;
            }
          }
          
          resolve({ error: 'No transcript found' });
        }, GENERIC_WAIT_AFTER_CLICK);
      } else {
        // No button found, no transcript visible
        resolve({ error: 'No transcript found' });
      }
    });
  }


  // === MAIN EXTRACTION ===

  function extract() {
    const hostname = window.location.hostname;

    if (hostname.includes('youtube.com')) {
      return observeYouTubeTranscript();
    } else {
      return scrapeGeneric();
    }
  }

  return extract();

})();
