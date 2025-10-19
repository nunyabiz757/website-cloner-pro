/**
 * Website Cloner Pro - GHL Extension
 * Background Service Worker
 *
 * Handles:
 * - API communication with backend
 * - Authentication token management
 * - Session management
 * - Message passing between popup and content scripts
 * - Badge updates
 */

import { config } from './config.js';

const API_BASE_URL = config.apiBaseUrl;

// Log configuration on load
if (config.debug) {
  console.log('[Background] Loaded with config:', {
    environment: config.environment,
    apiBaseUrl: API_BASE_URL,
    version: config.version,
  });
}

// Extension state
let authToken = null;
let currentSession = null;

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Website Cloner Pro Extension installed');

  // Load saved auth token
  chrome.storage.local.get(['authToken'], (result) => {
    if (result.authToken) {
      authToken = result.authToken;
      updateBadge('ready');
    }
  });
});

/**
 * Update extension badge
 */
function updateBadge(status) {
  const badges = {
    ready: { text: '✓', color: '#4CAF50' },
    active: { text: '...', color: '#2196F3' },
    error: { text: '!', color: '#F44336' },
    warning: { text: '⚠', color: '#FF9800' },
  };

  const badge = badges[status] || badges.ready;
  chrome.action.setBadgeText({ text: badge.text });
  chrome.action.setBadgeBackgroundColor({ color: badge.color });
}

/**
 * API request helper
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

/**
 * Save authentication token
 */
async function saveAuthToken(token) {
  authToken = token;
  await chrome.storage.local.set({ authToken: token });
  updateBadge('ready');
  return true;
}

/**
 * Clear authentication
 */
async function clearAuth() {
  authToken = null;
  currentSession = null;
  await chrome.storage.local.remove(['authToken', 'currentSession']);
  updateBadge('error');
}

/**
 * Create paste session
 */
async function createPasteSession(clonedPageId) {
  updateBadge('active');

  try {
    // Get browser info
    const browserInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    };

    const data = await apiRequest('/ghl/paste/session', {
      method: 'POST',
      body: JSON.stringify({
        clonedPageId,
        browserInfo,
        extensionVersion: chrome.runtime.getManifest().version,
      }),
    });

    currentSession = data.session;
    await chrome.storage.local.set({ currentSession });
    updateBadge('ready');

    return currentSession;
  } catch (error) {
    console.error('Failed to create paste session:', error);
    updateBadge('error');
    throw error;
  }
}

/**
 * Get paste data for session
 */
async function getPasteData(sessionToken) {
  try {
    const data = await apiRequest(`/ghl/paste/data/${sessionToken}`, {
      method: 'GET',
    });

    return data.data;
  } catch (error) {
    console.error('Failed to get paste data:', error);
    throw error;
  }
}

/**
 * Complete paste operation
 */
async function completePaste(params) {
  try {
    await apiRequest('/ghl/paste/complete', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    // Clear current session
    currentSession = null;
    await chrome.storage.local.remove(['currentSession']);
    updateBadge('ready');

    return true;
  } catch (error) {
    console.error('Failed to complete paste:', error);
    updateBadge('error');
    throw error;
  }
}

/**
 * Cancel paste session
 */
async function cancelSession(sessionToken) {
  try {
    await apiRequest(`/ghl/paste/session/${sessionToken}`, {
      method: 'DELETE',
    });

    currentSession = null;
    await chrome.storage.local.remove(['currentSession']);
    updateBadge('ready');

    return true;
  } catch (error) {
    console.error('Failed to cancel session:', error);
    throw error;
  }
}

/**
 * Get user's cloned pages
 */
async function getClonedPages(options = {}) {
  try {
    const params = new URLSearchParams(options);
    const data = await apiRequest(`/ghl/cloned?${params.toString()}`, {
      method: 'GET',
    });

    return data;
  } catch (error) {
    console.error('Failed to get cloned pages:', error);
    throw error;
  }
}

/**
 * Detect if current page is GHL site
 */
async function detectGHLSite(url) {
  try {
    const data = await apiRequest('/ghl/validate', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });

    return data.detection;
  } catch (error) {
    console.error('Failed to detect GHL site:', error);
    throw error;
  }
}

/**
 * Message handler from popup and content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);

  (async () => {
    try {
      switch (request.action) {
        case 'saveAuthToken':
          await saveAuthToken(request.token);
          sendResponse({ success: true });
          break;

        case 'clearAuth':
          await clearAuth();
          sendResponse({ success: true });
          break;

        case 'getAuthStatus':
          sendResponse({
            success: true,
            authenticated: !!authToken,
            hasSession: !!currentSession,
          });
          break;

        case 'createPasteSession':
          const session = await createPasteSession(request.clonedPageId);
          sendResponse({ success: true, session });
          break;

        case 'getPasteData':
          const pasteData = await getPasteData(request.sessionToken);
          sendResponse({ success: true, data: pasteData });
          break;

        case 'completePaste':
          await completePaste(request.params);
          sendResponse({ success: true });
          break;

        case 'cancelSession':
          await cancelSession(request.sessionToken);
          sendResponse({ success: true });
          break;

        case 'getClonedPages':
          const pages = await getClonedPages(request.options);
          sendResponse({ success: true, ...pages });
          break;

        case 'detectGHLSite':
          const detection = await detectGHLSite(request.url);
          sendResponse({ success: true, detection });
          break;

        case 'getCurrentSession':
          sendResponse({ success: true, session: currentSession });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({
        success: false,
        error: error.message || 'Request failed',
      });
    }
  })();

  return true; // Keep message channel open for async response
});

/**
 * Tab update listener - detect GHL pages
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isGHLDomain =
      tab.url.includes('gohighlevel.com') ||
      tab.url.includes('highlevelsite.com') ||
      tab.url.includes('leadconnectorhq.com') ||
      tab.url.includes('msgsndr.com');

    if (isGHLDomain) {
      // Notify content script that page is loaded
      chrome.tabs.sendMessage(tabId, {
        action: 'pageLoaded',
        url: tab.url,
      }).catch(() => {
        // Ignore errors if content script not ready
      });

      // Update badge to show GHL page detected
      if (authToken) {
        updateBadge('ready');
      } else {
        updateBadge('warning');
      }
    }
  }
});

/**
 * Context menu for quick actions (optional)
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clonePage',
    title: 'Clone this GHL page',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://*.gohighlevel.com/*',
      'https://*.highlevelsite.com/*',
      'https://*.leadconnectorhq.com/*',
      'https://*.msgsndr.com/*',
    ],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'clonePage') {
    // Open popup or notify content script
    chrome.action.openPopup();
  }
});

console.log('Website Cloner Pro background service worker loaded');
