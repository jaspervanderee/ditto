// Background service worker - manages dynamic icon switching based on system theme

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

// Listen for theme change messages from offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'THEME_CHANGE') {
    updateIcon(message.isDark);
  }
  
  if (message.type === 'CHECK_THEME') {
    checkTheme();
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
chrome.runtime.onInstalled.addListener(() => {
  checkTheme();
});

// Initialize on service worker startup
checkTheme();
