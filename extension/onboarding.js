// Onboarding - Close tab on CTA click

document.getElementById('letsRip').addEventListener('click', async () => {
  // Close the current tab so user can try Ditto on their open tabs
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) {
      chrome.tabs.remove(tab.id);
    }
  } catch {
    // Fallback for non-extension contexts
    window.close();
  }
});
