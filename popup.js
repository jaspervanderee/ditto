// Auto-extract and copy on popup open

// Sync icon with current system theme
chrome.runtime.sendMessage({ type: 'CHECK_THEME' });

const statusEl = document.getElementById('status');
const messageEl = statusEl.querySelector('.message');

function setStatus(message, type) {
  messageEl.textContent = message;
  statusEl.className = 'status ' + type;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
}

async function run() {
  setStatus('Working', 'loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      throw new Error('No active tab');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    let result = results?.[0]?.result;

    if (result && typeof result.then === 'function') {
      result = await result;
    }

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
    setStatus(err.message, 'error');
  }
}

run();
