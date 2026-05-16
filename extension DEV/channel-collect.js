// Channel video URL collector
// Injected into YouTube channel /videos page by background.js
// Scrolls the page and collects video URLs up to the requested count

(async function() {
  'use strict';

  // Read desired count from global variable (set by background.js before injection)
  // -1 means "all"
  const rawCount = window.__dittoCollectCount;
  const requestedCount = (rawCount === -1 || rawCount === undefined) ? Infinity : rawCount;

  // Extract channel name from page
  function getChannelName() {
    // Try the channel header
    const headerName = document.querySelector(
      'yt-formatted-string#channel-name, ' +
      'yt-dynamic-text-view-model.page-header-view-model-wiz__page-header-title span, ' +
      '#channel-header yt-formatted-string.ytd-channel-name'
    );
    if (headerName && headerName.textContent.trim()) {
      return headerName.textContent.trim();
    }

    // Try meta tag
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle) {
      return metaTitle.getAttribute('content') || '';
    }

    // Fallback: extract from URL
    const pathMatch = window.location.pathname.match(/^\/@([^/]+)/);
    if (pathMatch) return pathMatch[1];

    return 'channel';
  }

  // Collect video links currently in the DOM
  function collectVideoLinks() {
    const seen = new Set();
    const videos = [];

    // Scope to the channel's video grid — don't search the entire page
    // This avoids grabbing recommendations, sidebar videos, subscriptions, etc.
    // Priority: channel-specific browse container first, then broader fallbacks
    const gridContainer =
      document.querySelector('ytd-browse[page-subtype="channels"] ytd-rich-grid-renderer') ||
      document.querySelector('ytd-two-column-browse-results-renderer ytd-rich-grid-renderer') ||
      document.querySelector('ytd-section-list-renderer ytd-item-section-renderer ytd-grid-renderer');

    if (!gridContainer) return videos;

    function addLink(link) {
      const href = link.getAttribute('href');
      if (!href || !href.includes('/watch?v=')) return;

      const fullUrl = new URL(href, window.location.origin).href;
      const videoId = new URL(fullUrl).searchParams.get('v');
      if (!videoId || seen.has(videoId)) return;
      seen.add(videoId);

      const title = link.getAttribute('title') ||
                    link.textContent.trim() ||
                    link.getAttribute('aria-label') ||
                    'Untitled';

      videos.push({ url: fullUrl, title: title });
    }

    // Primary selector: current YouTube layout (2025+) — lockup view model
    const lockupLinks = gridContainer.querySelectorAll(
      'h3.ytLockupMetadataViewModelHeadingReset a.ytLockupMetadataViewModelTitle'
    );
    for (const link of lockupLinks) {
      addLink(link);
    }

    // Fallback selectors: older YouTube layouts
    if (videos.length === 0) {
      const fallbackLinks = gridContainer.querySelectorAll(
        'ytd-rich-item-renderer a#video-title-link, ' +
        'ytd-grid-video-renderer a#video-title, ' +
        'ytd-rich-grid-media a#video-title-link'
      );
      for (const link of fallbackLinks) {
        addLink(link);
      }
    }

    return videos;
  }

  // Initial collection
  let videos = collectVideoLinks();

  // If we already have enough, return immediately
  if (videos.length >= requestedCount) {
    return {
      videos: videos.slice(0, requestedCount),
      channelName: getChannelName(),
      reachedRequestedCount: true
    };
  }

  // Scroll until we have enough videos or no more load
  const SCROLL_INTERVAL = 1500;
  const MAX_STALE_SCROLLS = 3;
  let staleScrolls = 0;
  let lastCount = 0;

  function scrollOnce() {
    window.scrollTo(0, document.documentElement.scrollHeight);
  }

  function waitForScroll() {
    return new Promise(resolve => setTimeout(resolve, SCROLL_INTERVAL));
  }

  // Scroll loop
  while (videos.length < requestedCount && staleScrolls < MAX_STALE_SCROLLS) {
    scrollOnce();
    await waitForScroll();

    videos = collectVideoLinks();

    if (videos.length === lastCount) {
      staleScrolls++;
    } else {
      staleScrolls = 0;
    }

    lastCount = videos.length;

    // Send scroll progress to background
    try {
      chrome.runtime.sendMessage({
        type: 'CHANNEL_SCROLL_PROGRESS',
        found: videos.length
      });
    } catch (e) {
      // Ignore if popup/background not listening
    }
  }

  // Trim to requested count
  const finalVideos = requestedCount === Infinity
    ? videos
    : videos.slice(0, requestedCount);

  return {
    videos: finalVideos,
    channelName: getChannelName(),
    reachedRequestedCount: finalVideos.length >= requestedCount || requestedCount === Infinity
  };

})();
