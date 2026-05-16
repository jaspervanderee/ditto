// Auto-extract and copy on popup open

// Sync icon with current system theme
chrome.runtime.sendMessage({ type: 'CHECK_THEME' });

const statusEl = document.getElementById('status');
const messageEl = statusEl.querySelector('.message');

// Channel UI elements
const channelUI = document.getElementById('channel-ui');
const channelInput = document.getElementById('channel-input');
const channelCollecting = document.getElementById('channel-collecting');
const channelConfirm = document.getElementById('channel-confirm');
const channelProgress = document.getElementById('channel-progress');
const channelDone = document.getElementById('channel-done');

const videoCountInput = document.getElementById('video-count');
const btnAll = document.getElementById('btn-all');
const btnStart = document.getElementById('btn-start');
const btnConfirm = document.getElementById('btn-confirm');
const btnCancel = document.getElementById('btn-cancel');

const collectingText = document.getElementById('collecting-text');
const confirmText = document.getElementById('confirm-text');
const progressText = document.getElementById('progress-text');
const progressTitle = document.getElementById('progress-title');
const doneText = document.getElementById('done-text');

function setStatus(message, type) {
  messageEl.textContent = message;
  statusEl.className = 'status ' + type;
}

// Show only one channel phase at a time
function showChannelPhase(phaseId) {
  const phases = channelUI.querySelectorAll('.channel-phase');
  phases.forEach(p => p.style.display = 'none');
  const target = document.getElementById(phaseId);
  if (target) target.style.display = 'flex';
}

// Switch from normal status UI to channel UI
function switchToChannelUI() {
  statusEl.style.display = 'none';
  channelUI.style.display = 'flex';
}

// Store active tab ID for channel collection
let activeTabId = null;

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_UPDATE' && message.status) {
    setStatus(message.status, 'loading');
  }

  if (message.type === 'CHANNEL_SCROLL_PROGRESS') {
    collectingText.textContent = `Scanning videos... (${message.found} found)`;
  }

  if (message.type === 'CHANNEL_COLLECTED') {
    showChannelPhase('channel-confirm');
    const count = message.total;
    const name = message.channelName || 'this channel';
    confirmText.textContent = `Found ${count} video${count !== 1 ? 's' : ''} on ${name}. Start extraction?`;
  }

  if (message.type === 'CHANNEL_COUNT_SHORT') {
    // User requested more videos than the channel has — show info before extraction starts
    showChannelPhase('channel-progress');
    progressText.textContent = `Only ${message.found} video${message.found !== 1 ? 's' : ''} found — extracting all of them`;
    progressTitle.textContent = '';
  }

  if (message.type === 'CHANNEL_PROGRESS') {
    showChannelPhase('channel-progress');
    progressText.textContent = `Extracting ${message.current} of ${message.total}...`;
    progressTitle.textContent = message.title || '';
  }

  if (message.type === 'CHANNEL_DONE') {
    showChannelPhase('channel-done');
    doneText.textContent = `Done — ${message.count} transcript${message.count !== 1 ? 's' : ''} downloaded`;
  }

  if (message.type === 'CHANNEL_ERROR') {
    showChannelPhase('channel-input');
    setStatus(message.error || 'Something went wrong', 'error');
    statusEl.style.display = 'flex';
    channelUI.style.display = 'none';
  }
});

// Channel button handlers
btnAll.addEventListener('click', () => {
  // All button: scroll to collect all videos, then confirm before extraction
  switchToChannelUI();
  showChannelPhase('channel-collecting');
  collectingText.textContent = 'Scanning videos...';

  chrome.runtime.sendMessage({
    type: 'CHANNEL_COLLECT',
    tabId: activeTabId
  });
});

btnStart.addEventListener('click', () => {
  // Specific number: scroll to collect, then straight to extraction
  const count = parseInt(videoCountInput.value, 10);
  if (!count || count < 1) {
    videoCountInput.focus();
    return;
  }

  switchToChannelUI();
  showChannelPhase('channel-collecting');
  collectingText.textContent = 'Scanning videos...';

  chrome.runtime.sendMessage({
    type: 'CHANNEL_START_DIRECT',
    count: count,
    tabId: activeTabId
  });
});

btnConfirm.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CHANNEL_CONFIRM' });
  showChannelPhase('channel-progress');
  progressText.textContent = 'Starting extraction...';
});

btnCancel.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CHANNEL_CANCEL' });
  showChannelPhase('channel-input');
});

// Enter key on input triggers start
videoCountInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    btnStart.click();
  }
});

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
}

async function run() {
  // First: check if a channel extraction is already in progress
  try {
    const status = await chrome.runtime.sendMessage({ type: 'CHECK_CHANNEL_STATUS' });
    
    if (status && status.active) {
      switchToChannelUI();

      if (status.phase === 'collecting') {
        showChannelPhase('channel-collecting');
      } else if (status.phase === 'waiting_confirm') {
        showChannelPhase('channel-confirm');
        confirmText.textContent = `Found ${status.total} video${status.total !== 1 ? 's' : ''} on ${status.channelName || 'this channel'}. Start extraction?`;
      } else if (status.phase === 'extracting') {
        showChannelPhase('channel-progress');
        progressText.textContent = `Extracting ${status.current} of ${status.total}...`;
        progressTitle.textContent = status.title || '';
      } else if (status.phase === 'done') {
        showChannelPhase('channel-done');
        doneText.textContent = 'Extraction complete';
      }
      return; // Don't run normal flow
    }
  } catch (e) {
    // Background may not be ready — continue with normal flow
  }

  // Normal flow: detect page type
  setStatus('Working', 'loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      throw new Error('No active tab');
    }

    activeTabId = tab.id;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    let result = results?.[0]?.result;

    if (result && typeof result.then === 'function') {
      result = await result;
    }

    // Channel page detected
    if (result && result.type === 'channel') {
      switchToChannelUI();
      showChannelPhase('channel-input');
      videoCountInput.focus();
      return;
    }

    // Channel page but not on /videos tab
    if (result && result.type === 'channel_not_videos') {
      setStatus('Navigate to the Videos tab', 'error');
      return;
    }

    // Normal single-video flow
    if (!result || result.error) {
      throw new Error(result?.error || 'No transcript found');
    }

    const copied = await copyToClipboard(result.transcript);
    
    if (copied) {
      setStatus('Transcript copied', 'success');
    } else {
      throw new Error('Clipboard failed');
    }

  } catch (err) {
    let msg = 'No transcript found';
    
    // Chrome system pages get a distinct message
    if (err.message.includes('Cannot access') || err.message.includes('chrome://')) {
      msg = "Can't run here";
    }
    
    setStatus(msg, 'error');
  }
}

run();
