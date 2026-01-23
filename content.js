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


  // === UDEMY SCRAPER ===

  const UDEMY_SELECTORS = {
    toggleButton: 'button[data-purpose="transcript-toggle"]',
    transcriptPanel: '[data-purpose="transcript-panel"]',
    cueText: '[data-purpose="cue-text"]'
  };

  const UDEMY_RENDER_WAIT = 400;
  const UDEMY_RETRY_WAIT = 500;

  function getUdemyTranscriptText() {
    const cues = document.querySelectorAll(UDEMY_SELECTORS.cueText);
    if (cues.length === 0) return null;

    const lines = [];
    for (const cue of cues) {
      const text = cue.innerText.trim();
      if (text) {
        lines.push(text);
      }
    }

    return lines.length > 0 ? lines.join(' ') : null;
  }

  function isUdemyPanelOpen() {
    const toggleBtn = document.querySelector(UDEMY_SELECTORS.toggleButton);
    if (!toggleBtn) return false;
    return toggleBtn.getAttribute('aria-expanded') === 'true';
  }

  function clickUdemyTranscriptToggle() {
    const toggleBtn = document.querySelector(UDEMY_SELECTORS.toggleButton);
    if (toggleBtn) {
      toggleBtn.click();
      return true;
    }
    return false;
  }

  function scrapeUdemy() {
    return new Promise(resolve => {
      const toggleBtn = document.querySelector(UDEMY_SELECTORS.toggleButton);

      // No toggle button found - transcript not available for this video
      if (!toggleBtn) {
        resolve({ error: 'Udemy transcript not found. Please ensure captions are available for this video.' });
        return;
      }

      // Check if panel is already open
      const panelAlreadyOpen = isUdemyPanelOpen();

      // Open the panel if needed
      if (!panelAlreadyOpen) {
        clickUdemyTranscriptToggle();
      }

      // Wait for DOM to render transcript segments
      setTimeout(() => {
        const transcript = getUdemyTranscriptText();

        if (transcript) {
          const processed = processText(transcript);
          if (processed) {
            resolve({ transcript: processed });
            return;
          }
        }

        // First attempt failed - retry once if we had to click
        if (!panelAlreadyOpen) {
          setTimeout(() => {
            const retryTranscript = getUdemyTranscriptText();

            if (retryTranscript) {
              const processed = processText(retryTranscript);
              if (processed) {
                resolve({ transcript: processed });
                return;
              }
            }

            // Still no transcript after retry
            resolve({ error: 'No transcript found. Please ensure captions are enabled on the video player.' });
          }, UDEMY_RETRY_WAIT);
        } else {
          // Panel was already open but no content found
          resolve({ error: 'No transcript found. Please ensure captions are enabled on the video player.' });
        }
      }, UDEMY_RENDER_WAIT);
    });
  }


  // === COURSERA SCRAPER (VTT Track Extraction) ===

  // Parse VTT content: strip headers and timestamps, return clean text
  function parseVTT(vttContent) {
    const lines = vttContent.split('\n');
    const textLines = [];
    
    // VTT timestamp pattern: 00:00:10.000 --> 00:00:15.000
    const vttTimestampRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/;
    // Cue identifier pattern (numeric or alphanumeric)
    const cueIdRegex = /^[\d\w-]+$/;
    
    let skipNext = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) {
        skipNext = false;
        continue;
      }
      
      // Skip WEBVTT header and metadata
      if (trimmed.startsWith('WEBVTT') || 
          trimmed.startsWith('NOTE') || 
          trimmed.startsWith('STYLE') ||
          trimmed.startsWith('REGION')) {
        skipNext = true;
        continue;
      }
      
      // Skip timestamp lines
      if (vttTimestampRegex.test(trimmed)) {
        continue;
      }
      
      // Skip cue identifiers (usually numbers before timestamps)
      if (cueIdRegex.test(trimmed) && trimmed.length < 20) {
        continue;
      }
      
      // Skip lines after headers
      if (skipNext) {
        continue;
      }
      
      // Strip VTT formatting tags like <c>, </c>, <v Speaker>, etc.
      const cleanLine = trimmed
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      
      if (cleanLine) {
        textLines.push(cleanLine);
      }
    }
    
    return textLines.join(' ');
  }

  // Find caption track element, prefer en-US
  function findCaptionTrack() {
    // Look for track elements with kind="captions"
    const tracks = document.querySelectorAll('track[kind="captions"], track[kind="subtitles"]');
    
    if (tracks.length === 0) return null;
    
    // Prefer en-US
    for (const track of tracks) {
      const srclang = track.getAttribute('srclang') || '';
      if (srclang.toLowerCase() === 'en-us' || srclang.toLowerCase() === 'en') {
        return track;
      }
    }
    
    // Check for default or labeled track
    for (const track of tracks) {
      if (track.hasAttribute('default') || track.getAttribute('label')) {
        return track;
      }
    }
    
    // Fallback to first available track
    return tracks[0];
  }

  // Get transcript from Coursera sidebar (fallback method)
  function getCourseraSidebarTranscript() {
    const selectors = [
      '.rc-Transcript',
      '[data-testid="transcript-panel"]',
      '[class*="transcript"]',
      '.video-transcript'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.innerText || el.textContent;
        if (text && text.length > 50) {
          return text;
        }
      }
    }
    
    return null;
  }

  // Send status update to popup
  function sendStatus(status) {
    try {
      chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: status });
    } catch (e) {
      // Ignore if extension context is invalid
    }
  }

  function scrapeCoursera() {
    return new Promise(async (resolve) => {
      // Method 1: VTT Track extraction
      const track = findCaptionTrack();
      
      if (track) {
        const src = track.getAttribute('src');
        
        if (src) {
          try {
            // Resolve relative URLs
            const vttUrl = new URL(src, window.location.origin).href;
            
            // Notify popup that we're fetching subtitles
            sendStatus('Fetching Subtitles...');
            
            // Fetch the VTT file
            const response = await fetch(vttUrl);
            
            if (response.ok) {
              const vttContent = await response.text();
              const rawText = parseVTT(vttContent);
              
              if (rawText && rawText.length > 50) {
                const processed = processText(rawText);
                if (processed) {
                  resolve({ transcript: processed });
                  return;
                }
              }
            }
          } catch (err) {
            // VTT fetch failed, fall through to sidebar method
          }
        }
      }
      
      // Method 2: Fallback to visual transcript sidebar
      const sidebarTranscript = getCourseraSidebarTranscript();
      
      if (sidebarTranscript) {
        const processed = processText(sidebarTranscript);
        if (processed) {
          resolve({ transcript: processed });
          return;
        }
      }
      
      // No transcript found
      resolve({ error: 'No Coursera transcript found. Ensure captions are available for this video.' });
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


  // === WISTIA SCRAPER (Viewport-Aware Global Extractor) ===

  // Extract Wistia hashed ID (10-character alphanumeric code) from various sources
  function extractWistiaId(source) {
    if (!source) return null;
    
    // Match ID from URLs: wistia.com/embed/iframe/ID, wistia.net/medias/ID, etc.
    const urlMatch = source.match(/wistia\.(?:com|net)\/(?:embed\/iframe\/|medias\/)?([a-z0-9]{10})/i);
    if (urlMatch) return urlMatch[1];
    
    // Match ID from class names: wistia_embed wistia_async_ID
    const classMatch = source.match(/wistia_async_([a-z0-9]{10})/i);
    if (classMatch) return classMatch[1];
    
    // Match standalone 10-char alphanumeric (last resort)
    const standaloneMatch = source.match(/\b([a-z0-9]{10})\b/i);
    if (standaloneMatch) return standaloneMatch[1];
    
    return null;
  }

  // Calculate visibility score with center-of-viewport preference
  function getVisibilityScore(element) {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const viewportCenterY = viewportHeight / 2;
    const viewportCenterX = viewportWidth / 2;
    
    // Element not in viewport at all
    if (rect.bottom < 0 || rect.top > viewportHeight || 
        rect.right < 0 || rect.left > viewportWidth) {
      return 0;
    }
    
    // Calculate visible area ratio
    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(viewportHeight, rect.bottom);
    const visibleLeft = Math.max(0, rect.left);
    const visibleRight = Math.min(viewportWidth, rect.right);
    
    const visibleArea = (visibleBottom - visibleTop) * (visibleRight - visibleLeft);
    const totalArea = rect.width * rect.height;
    const areaRatio = totalArea > 0 ? visibleArea / totalArea : 0;
    
    // Calculate distance from viewport center (closer = better)
    const elementCenterY = rect.top + rect.height / 2;
    const elementCenterX = rect.left + rect.width / 2;
    const distanceFromCenter = Math.sqrt(
      Math.pow(elementCenterX - viewportCenterX, 2) + 
      Math.pow(elementCenterY - viewportCenterY, 2)
    );
    const maxDistance = Math.sqrt(Math.pow(viewportWidth, 2) + Math.pow(viewportHeight, 2)) / 2;
    const centerBonus = 1 - (distanceFromCenter / maxDistance);
    
    // Combined score: area visibility + center proximity
    return (areaRatio * 0.6) + (centerBonus * 0.4);
  }

  // Find the active (most visible) Wistia video and return its hashed ID
  function getActiveWistiaId() {
    const candidates = [];
    
    // Collect all Wistia iframes
    const iframes = document.querySelectorAll('iframe[src*="wistia"]');
    for (const iframe of iframes) {
      const id = extractWistiaId(iframe.src);
      if (id) {
        candidates.push({ element: iframe, id: id, score: getVisibilityScore(iframe) });
      }
    }
    
    // Collect all Wistia embed containers (for async embeds)
    const containers = document.querySelectorAll('.wistia_embed, [class*="wistia_async_"]');
    for (const container of containers) {
      const id = extractWistiaId(container.className);
      if (id) {
        candidates.push({ element: container, id: id, score: getVisibilityScore(container) });
      }
    }
    
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].id;
    
    // Sort by visibility score (highest first)
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].id;
  }

  // Recursively search for transcript field in nested JSON-LD structures
  function findTranscriptInObject(obj, targetId) {
    if (!obj || typeof obj !== 'object') return null;
    
    // Check if this object matches our target video
    const embedUrl = obj.embedUrl || obj.contentUrl || '';
    const atId = obj['@id'] || '';
    const objId = extractWistiaId(embedUrl) || extractWistiaId(atId);
    
    // If we have a target and this object has an ID, check for match
    const isMatch = !targetId || !objId || objId === targetId || 
                    embedUrl.includes(targetId) || atId.includes(targetId);
    
    if (isMatch) {
      // Check transcript field
      if (obj.transcript && typeof obj.transcript === 'string' && obj.transcript.length > 100) {
        return obj.transcript;
      }
      // Check description as fallback (Wistia sometimes swaps them)
      if (obj.description && typeof obj.description === 'string' && obj.description.length > 200) {
        return obj.description;
      }
    }
    
    // Recurse into @graph arrays
    if (Array.isArray(obj['@graph'])) {
      for (const item of obj['@graph']) {
        const result = findTranscriptInObject(item, targetId);
        if (result) return result;
      }
    }
    
    // Recurse into video objects
    if (obj.video) {
      const videos = Array.isArray(obj.video) ? obj.video : [obj.video];
      for (const video of videos) {
        const result = findTranscriptInObject(video, targetId);
        if (result) return result;
      }
    }
    
    // Recurse into arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = findTranscriptInObject(item, targetId);
        if (result) return result;
      }
    }
    
    return null;
  }

  // Fetch VTT captions directly from Wistia's public caption server
  async function fetchWistiaVTT(videoId) {
    const vttUrl = `https://fast.wistia.com/embed/captions/${videoId}.vtt`;
    
    try {
      const response = await fetch(vttUrl);
      if (!response.ok) return null;
      
      const vttContent = await response.text();
      
      // Use existing VTT parser
      const rawText = parseVTT(vttContent);
      return rawText && rawText.length > 50 ? rawText : null;
    } catch (e) {
      return null;
    }
  }

  // Extract transcript from Shadow DOM elements
  function extractFromShadowDOM(root) {
    const lines = [];
    
    function walkShadow(node) {
      if (!node) return;
      
      if (node.shadowRoot) {
        walkShadow(node.shadowRoot);
      }
      
      const selectors = [
        '.w-transcript-line',
        '.w-transcript-cue',
        '.w-search-ui-results-wrapper',
        '[class*="transcript-line"]',
        '[class*="caption-cue"]'
      ];
      
      for (const selector of selectors) {
        const elements = node.querySelectorAll ? node.querySelectorAll(selector) : [];
        for (const el of elements) {
          const text = (el.innerText || el.textContent || '').trim();
          if (text) lines.push(text);
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          walkShadow(child);
        }
      }
    }
    
    walkShadow(root);
    return lines;
  }

  function scrapeWistia() {
    return new Promise(async (resolve) => {
      sendStatus('Targeting active video transcript...');

      // Step 1: Identify the active video in viewport
      const activeVideoId = getActiveWistiaId();

      // Step 2: Scan ALL JSON-LD blocks and match to active video
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          const transcript = findTranscriptInObject(data, activeVideoId);
          
          if (transcript) {
            if (transcript.length < 100) {
              sendStatus('Transcript found but appears empty or restricted.');
              continue;
            }
            const processed = processText(transcript);
            if (processed) {
              resolve({ transcript: processed });
              return;
            }
          }
        } catch (e) {
          // JSON parse failed, continue to next script
        }
      }

      // Step 3: Direct VTT fetch fallback if we have an ID
      if (activeVideoId) {
        sendStatus('Fetching captions from Wistia...');
        const vttText = await fetchWistiaVTT(activeVideoId);
        
        if (vttText) {
          if (vttText.length < 100) {
            sendStatus('Transcript found but appears empty or restricted.');
          } else {
            const processed = processText(vttText);
            if (processed) {
              resolve({ transcript: processed });
              return;
            }
          }
        }
      }

      // Step 4: DOM fallback - Wistia transcript overlays
      const transcriptSelectors = [
        '.w-transcript-line',
        '.w-transcript-cue',
        '.w-search-ui-results-wrapper [class*="line"]',
        '[class*="wistia"] [class*="transcript"]'
      ];
      
      for (const selector of transcriptSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const lines = [];
          for (const el of elements) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text) lines.push(text);
          }
          
          if (lines.length > 0) {
            const rawText = lines.join(' ');
            if (rawText.length < 100) {
              sendStatus('Transcript found but appears empty or restricted.');
              continue;
            }
            const processed = processText(rawText);
            if (processed) {
              resolve({ transcript: processed });
              return;
            }
          }
        }
      }

      // Step 5: Shadow DOM fallback
      const wistiaContainers = document.querySelectorAll(
        '[class*="wistia"], .wistia_embed, .wistia_responsive_padding, [id*="wistia"]'
      );
      
      for (const container of wistiaContainers) {
        const shadowLines = extractFromShadowDOM(container);
        
        if (shadowLines.length > 0) {
          const rawText = shadowLines.join(' ');
          if (rawText.length < 100) {
            sendStatus('Transcript found but appears empty or restricted.');
            continue;
          }
          const processed = processText(rawText);
          if (processed) {
            resolve({ transcript: processed });
            return;
          }
        }
      }

      // No transcript found
      resolve({ error: 'No Wistia transcript found. Ensure the video has captions enabled.' });
    });
  }


  // === MAIN EXTRACTION ===

  function extract() {
    const hostname = window.location.hostname;

    if (hostname.includes('youtube.com')) {
      return observeYouTubeTranscript();
    } else if (hostname.includes('udemy.com')) {
      return scrapeUdemy();
    } else if (hostname.includes('coursera.org')) {
      return scrapeCoursera();
    } else if (document.querySelector('iframe[src*="wistia"]') || 
               document.querySelector('.wistia_embed') ||
               document.querySelector('[class*="wistia_async_"]')) {
      // Any page with Wistia video (Kajabi, Teachable, custom sites, etc.)
      return scrapeWistia();
    } else {
      return scrapeGeneric();
    }
  }

  return extract();

})();
