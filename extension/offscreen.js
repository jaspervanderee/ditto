// Offscreen document - detects system theme using matchMedia

const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

function sendThemeUpdate() {
  chrome.runtime.sendMessage({
    type: 'THEME_CHANGE',
    isDark: darkModeQuery.matches
  });
}

// Listen for system theme changes - this fires immediately when user toggles dark/light mode
darkModeQuery.addEventListener('change', (e) => {
  sendThemeUpdate();
});

// Listen for theme check requests from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'GET_THEME') {
    sendThemeUpdate();
  }
});

// Send initial theme state when document loads
sendThemeUpdate();
