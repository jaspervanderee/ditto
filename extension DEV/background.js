// Background service worker - manages dynamic icon switching based on system theme
// and orchestrates channel transcript batch extraction
//
// NOTE: host_permissions (in manifest.json) triggers a Chrome permission re-prompt
// for existing users. Address this in the Web Store changelog when shipping to production.

importScripts('jszip.min.js');

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Track offscreen document state
let creatingOffscreen = null;

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  return contexts.length > 0;
}

async function setupOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['MATCH_MEDIA'],
    justification: 'Detect system dark/light theme for icon switching'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

async function checkTheme() {
  await setupOffscreenDocument();
  chrome.runtime.sendMessage({ type: 'GET_THEME' });
}

function updateIcon(isDark) {
  const suffix = isDark ? 'dark' : 'light';
  
  chrome.action.setIcon({
    path: {
      16: `icons/icon16-${suffix}.png`,
      32: `icons/icon32-${suffix}.png`,
      48: `icons/icon48-${suffix}.png`,
      128: `icons/icon128-${suffix}.png`
    }
  });
}


// === CHANNEL EXTRACTION STATE ===

let channelExtraction = {
  active: false,
  phase: 'idle', // 'collecting' | 'waiting_confirm' | 'extracting' | 'done'
  videos: [],
  results: [],
  current: 0,
  total: 0,
  currentTitle: '',
  channelName: '',
  channelTabId: null,
  extractionWindowId: null,
  extractionTabId: null,
  cancelled: false
};

function resetChannelExtraction() {
  channelExtraction = {
    active: false,
    phase: 'idle',
    videos: [],
    results: [],
    current: 0,
    total: 0,
    currentTitle: '',
    channelName: '',
    channelTabId: null,
    extractionWindowId: null,
    extractionTabId: null,
    cancelled: false
  };
}

// Send message to popup (ignore errors if popup is closed)
function sendToPopup(message) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch (e) {
    // Popup not open — that's fine
  }
}


// === SERVICE WORKER KEEPALIVE & ICON BADGE ===

const KEEPALIVE_ALARM = 'channel-keepalive';
let badgePulseState = false;

function startKeepalive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // Every 24s
}

function stopKeepalive() {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

function showExtractionBadge() {
  chrome.action.setBadgeText({ text: '●' });
  chrome.action.setBadgeBackgroundColor({ color: '#ffff78' });
  badgePulseState = false;
}

function clearExtractionBadge() {
  chrome.action.setBadgeText({ text: '' });
}

function pulseBadge() {
  // Alternate between brand yellow and a dimmed state for a pulse effect
  badgePulseState = !badgePulseState;
  chrome.action.setBadgeBackgroundColor({
    color: badgePulseState ? '#c8c860' : '#ffff78'
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Pulse the badge + keep service worker alive
    if (channelExtraction.active) {
      pulseBadge();
    }
  }
});


// === CHANNEL VIDEO COLLECTION ===

async function collectChannelVideos(tabId, count) {
  channelExtraction.phase = 'collecting';
  channelExtraction.channelTabId = tabId;

  // Set the requested count as a global before injecting the collector
  // Infinity can't be passed through — use -1 as 'all' sentinel
  const passCount = count === Infinity ? -1 : count;
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (c) => { window.__dittoCollectCount = c; },
    args: [passCount]
  });

  // Inject the collection script
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['channel-collect.js']
  });

  const result = results?.[0]?.result;

  if (!result || !result.videos || result.videos.length === 0) {
    sendToPopup({ type: 'CHANNEL_ERROR', error: 'No videos found on this channel page.' });
    resetChannelExtraction();
    return null;
  }

  return result;
}


// === TRANSCRIPT EXTRACTION (MINIMIZED WINDOW APPROACH) ===

// Wait for a tab to finish loading a specific URL.
// Includes immediate status check and URL verification to prevent
// resolving against stale SPA state from a previous navigation.
function waitForTabLoad(tabId, expectedUrl) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, 30000);

    function checkTab() {
      chrome.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete' && (!expectedUrl || tab.url?.includes(expectedUrl))) {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve();
        }
      }).catch(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        reject(new Error('Tab no longer exists'));
      });
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        // Verify URL matches expected before resolving
        checkTab();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);

    // Immediate check — tab may already be loaded
    checkTab();
  });
}

// Inject content.js into a tab and return the transcript result.
// No tab creation/destruction — caller manages the tab lifecycle.
async function injectAndExtract(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    const result = results?.[0]?.result;
    if (result && result.transcript) {
      return { transcript: result.transcript };
    }
    return { transcript: null, error: result?.error || 'No transcript found' };
  } catch (err) {
    return { transcript: null, error: err.message };
  }
}


// === EXTRACTION LOOP (MINIMIZED WINDOW) ===

async function runExtraction() {
  channelExtraction.phase = 'extracting';
  channelExtraction.active = true;
  startKeepalive();
  showExtractionBadge();

  const videos = channelExtraction.videos;
  const total = videos.length;
  channelExtraction.total = total;

  let extractionWindowId = null;
  let extractionTabId = null;

  try {
    // Create an unfocused window — must be 'normal' (not 'minimized') because
    // minimized windows don't render YouTube's transcript panel on macOS.
    // Tucked into the corner at a smaller size to reduce visual intrusion.
    const win = await chrome.windows.create({
      focused: false,
      state: 'normal',
      url: 'about:blank',
      left: 0,
      top: 0,
      width: 1000,
      height: 700
    });
    extractionWindowId = win.id;
    extractionTabId = win.tabs[0].id;
    channelExtraction.extractionWindowId = extractionWindowId;
    channelExtraction.extractionTabId = extractionTabId;

    // Pre-mute the tab before any YouTube navigation
    await chrome.tabs.update(extractionTabId, { muted: true });

    for (let i = 0; i < total; i++) {
      if (channelExtraction.cancelled) break;

      const video = videos[i];
      channelExtraction.current = i + 1;
      channelExtraction.currentTitle = video.title;

      sendToPopup({
        type: 'CHANNEL_PROGRESS',
        current: i + 1,
        total: total,
        title: video.title
      });

      // Re-apply mute before each navigation — YouTube's SPA may reset it
      await chrome.tabs.update(extractionTabId, { muted: true });

      // Navigate the existing tab to the next video URL
      await chrome.tabs.update(extractionTabId, { url: video.url });

      // Small pre-wait before polling — gives SPA time to start the navigation
      await new Promise(r => setTimeout(r, 200));

      // Extract the video ID from the URL for waitForTabLoad URL matching
      const videoId = new URL(video.url).searchParams.get('v');

      // Wait for tab to finish loading the correct video
      await waitForTabLoad(extractionTabId, videoId);

      // Buffer for YouTube SPA hydration — content.js polls up to 10s internally
      await new Promise(r => setTimeout(r, 2500));

      // Inject content.js and extract
      let result = await injectAndExtract(extractionTabId);

      // Retry once if transcript came back empty — hard reload to un-stick YouTube's SPA
      if (!result.transcript && !channelExtraction.cancelled) {
        await chrome.tabs.reload(extractionTabId, { bypassCache: true });
        await waitForTabLoad(extractionTabId, videoId);
        await new Promise(r => setTimeout(r, 2500));
        result = await injectAndExtract(extractionTabId);
      }

      channelExtraction.results.push({
        title: video.title,
        url: video.url,
        transcript: result.transcript || null,
        error: result.error || null
      });

      // Rate-limiting delay between videos (unless last or cancelled)
      if (i < total - 1 && !channelExtraction.cancelled) {
        await new Promise(r => setTimeout(r, 2500));
      }
    }

    // Build and download zip
    await buildAndDownload();

    channelExtraction.phase = 'done';
    const completedCount = channelExtraction.results.filter(r => r.transcript).length;

    sendToPopup({
      type: 'CHANNEL_DONE',
      count: completedCount,
      total: channelExtraction.results.length
    });

  } finally {
    // ALWAYS clean up — even on error or cancellation
    if (extractionWindowId) {
      // Clear our reference first so onRemoved doesn't double-cancel
      channelExtraction.extractionWindowId = null;
      channelExtraction.extractionTabId = null;
      try {
        await chrome.windows.remove(extractionWindowId);
      } catch (e) {
        // Window may already be closed (user closed it, triggering onRemoved)
      }
    }
    stopKeepalive();
    clearExtractionBadge();
  }
}

// Handle user manually closing the extraction window mid-run
chrome.windows.onRemoved.addListener((windowId) => {
  if (channelExtraction.active && windowId === channelExtraction.extractionWindowId) {
    // User closed the extraction window — treat as cancellation
    channelExtraction.cancelled = true;
    channelExtraction.extractionWindowId = null;
    channelExtraction.extractionTabId = null;
    // The extraction loop will check the cancelled flag, zip partials, and clean up
  }
});


// === FILE BUILDING & DOWNLOAD ===

async function buildAndDownload() {
  const results = channelExtraction.results;
  if (results.length === 0) return;

  // Build a zip file with one .txt per video
  const zip = new JSZip();
  const usedNames = new Set();

  for (const r of results) {
    // Sanitize video title for filesystem safety
    let safeName = r.title
      .replace(/[<>:"/\\|?*]/g, '')  // Remove illegal filename chars
      .replace(/[\x00-\x1f]/g, '')   // Remove control characters
      .replace(/\s+/g, ' ')          // Collapse whitespace
      .trim()
      .substring(0, 100)             // Limit length
      || 'Untitled';

    // Deduplicate filenames
    let finalName = safeName;
    let counter = 2;
    while (usedNames.has(finalName.toLowerCase())) {
      finalName = `${safeName} (${counter})`;
      counter++;
    }
    usedNames.add(finalName.toLowerCase());

    // Build file content for this video
    const header = `## ${r.title}\nURL: ${r.url}\n`;
    const body = r.transcript
      ? `\n${r.transcript}`
      : `\nNo transcript available`;
    const fileContent = header + body + '\n';

    zip.file(`${finalName}.txt`, fileContent);
  }

  // Build channel-level filename
  const channelSafeName = channelExtraction.channelName
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    || 'channel';
  const zipFilename = `${channelSafeName}-transcripts.zip`;

  try {
    // Generate zip as base64
    const base64 = await zip.generateAsync({ type: 'base64' });
    const dataUrl = `data:application/zip;base64,${base64}`;

    await chrome.downloads.download({
      url: dataUrl,
      filename: zipFilename,
      saveAs: true
    });
  } catch (err) {
    sendToPopup({ type: 'CHANNEL_ERROR', error: 'Download failed: ' + err.message });
  }
}


// === MESSAGE HANDLING ===

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Theme messages
  if (message.type === 'THEME_CHANGE') {
    updateIcon(message.isDark);
  }
  
  if (message.type === 'CHECK_THEME') {
    checkTheme();
  }

  // Status updates from content scripts (forward to popup)
  if (message.type === 'STATUS_UPDATE') {
    sendToPopup(message);
  }

  // === Channel extraction messages ===

  // Popup opened — check if extraction is in progress
  if (message.type === 'CHECK_CHANNEL_STATUS') {
    if (channelExtraction.active) {
      sendResponse({
        active: true,
        phase: channelExtraction.phase,
        current: channelExtraction.current,
        total: channelExtraction.total,
        title: channelExtraction.currentTitle,
        channelName: channelExtraction.channelName
      });
    } else {
      sendResponse({ active: false });
    }
    return true; // Keep message channel open for async response
  }

  // Collect video URLs from channel page (All button — scroll + confirm)
  if (message.type === 'CHANNEL_COLLECT') {
    channelExtraction.active = true;
    const count = Infinity; // Always 'all' for this path
    const tabId = message.tabId;

    collectChannelVideos(tabId, count).then(result => {
      if (result) {
        channelExtraction.videos = result.videos;
        channelExtraction.channelName = result.channelName;
        channelExtraction.total = result.videos.length;
        channelExtraction.phase = 'waiting_confirm';

        sendToPopup({
          type: 'CHANNEL_COLLECTED',
          total: result.videos.length,
          channelName: result.channelName
        });
      }
    }).catch(err => {
      sendToPopup({ type: 'CHANNEL_ERROR', error: 'Failed to collect videos: ' + err.message });
      resetChannelExtraction();
    });
  }

  // Direct start with specific number (scroll to target count, then straight to extraction)
  if (message.type === 'CHANNEL_START_DIRECT') {
    channelExtraction.active = true;
    const count = parseInt(message.count, 10);
    const tabId = message.tabId;

    collectChannelVideos(tabId, count).then(async result => {
      if (result) {
        channelExtraction.videos = result.videos;
        channelExtraction.channelName = result.channelName;
        channelExtraction.total = result.videos.length;

        // If channel had fewer videos than requested, notify the user
        // and pause briefly so the message is visible before progress updates begin
        if (!result.reachedRequestedCount) {
          sendToPopup({
            type: 'CHANNEL_COUNT_SHORT',
            requested: count,
            found: result.videos.length
          });
          await new Promise(r => setTimeout(r, 2000));
        }

        // Skip confirmation — go straight to extraction
        runExtraction().catch(err => {
          sendToPopup({ type: 'CHANNEL_ERROR', error: 'Extraction failed: ' + err.message });
          stopKeepalive();
          clearExtractionBadge();
          resetChannelExtraction();
        });
      }
    }).catch(err => {
      sendToPopup({ type: 'CHANNEL_ERROR', error: 'Failed to collect videos: ' + err.message });
      resetChannelExtraction();
    });
  }

  // User confirmed — start extraction
  if (message.type === 'CHANNEL_CONFIRM') {
    if (channelExtraction.phase === 'waiting_confirm' && channelExtraction.videos.length > 0) {
      runExtraction().catch(err => {
        sendToPopup({ type: 'CHANNEL_ERROR', error: 'Extraction failed: ' + err.message });
        stopKeepalive();
        clearExtractionBadge();
        resetChannelExtraction();
      });
    }
  }

  // User cancelled
  if (message.type === 'CHANNEL_CANCEL') {
    if (channelExtraction.active) {
      channelExtraction.cancelled = true;
      // If currently extracting, the loop will check this flag
      // If in waiting_confirm, just reset
      if (channelExtraction.phase === 'waiting_confirm' || channelExtraction.phase === 'collecting') {
        stopKeepalive();
        clearExtractionBadge();
        resetChannelExtraction();
      }
      // If extracting, the loop handles it — partial results will still download
    }
  }
});


// Check theme on browser interaction events
chrome.tabs.onActivated.addListener(() => {
  checkTheme();
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  // windowId -1 means all windows lost focus (user switched away from Chrome)
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    checkTheme();
  }
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener((details) => {
  checkTheme();
  
  // Show onboarding page on first install only
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html')
    });
  }
});

// Initialize on service worker startup
checkTheme();
