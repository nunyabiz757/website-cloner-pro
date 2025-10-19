/**
 * Website Cloner Pro - GHL Extension
 * Popup Script
 *
 * Handles UI interactions, authentication, and paste workflow
 */

// State
let authenticated = false;
let currentTab = null;
let clonedPages = [];
let selectedPage = null;
let currentSession = null;

// DOM Elements
const elements = {
  authSection: document.getElementById('authSection'),
  mainSection: document.getElementById('mainSection'),
  errorSection: document.getElementById('errorSection'),
  statusIndicator: document.getElementById('statusIndicator'),
  detectionStatus: document.getElementById('detectionStatus'),
  detectionTitle: document.getElementById('detectionTitle'),
  detectionMessage: document.getElementById('detectionMessage'),
  clonedPagesSection: document.getElementById('clonedPagesSection'),
  clonedPagesList: document.getElementById('clonedPagesList'),
  pasteSection: document.getElementById('pasteSection'),
  pastePageTitle: document.getElementById('pastePageTitle'),
  pastePageUrl: document.getElementById('pastePageUrl'),
  pasteProgress: document.getElementById('pasteProgress'),
  authToken: document.getElementById('authToken'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  showClonedPagesBtn: document.getElementById('showClonedPagesBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  startPasteBtn: document.getElementById('startPasteBtn'),
  cancelPasteBtn: document.getElementById('cancelPasteBtn'),
  searchInput: document.getElementById('searchInput'),
  retryBtn: document.getElementById('retryBtn'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  version: document.getElementById('version'),
};

/**
 * Initialize popup
 */
async function initialize() {
  // Set version
  elements.version.textContent = chrome.runtime.getManifest().version;

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Check authentication status
  const authStatus = await sendMessage({ action: 'getAuthStatus' });
  authenticated = authStatus.authenticated;

  if (authenticated) {
    showMainSection();
    await detectCurrentPage();
  } else {
    showAuthSection();
  }

  // Setup event listeners
  setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  elements.loginBtn.addEventListener('click', handleLogin);
  elements.logoutBtn.addEventListener('click', handleLogout);
  elements.showClonedPagesBtn.addEventListener('click', showClonedPages);
  elements.refreshBtn.addEventListener('click', loadClonedPages);
  elements.startPasteBtn.addEventListener('click', handleStartPaste);
  elements.cancelPasteBtn.addEventListener('click', handleCancelPaste);
  elements.searchInput.addEventListener('input', handleSearch);
  elements.retryBtn.addEventListener('click', () => {
    hideError();
    initialize();
  });

  // Handle Enter key in auth token input
  elements.authToken.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  });
}

/**
 * Handle login
 */
async function handleLogin() {
  const token = elements.authToken.value.trim();

  if (!token) {
    showError('Invalid Token', 'Please enter a valid API token');
    return;
  }

  try {
    elements.loginBtn.disabled = true;
    elements.loginBtn.textContent = 'Logging in...';

    // Save token
    await sendMessage({ action: 'saveAuthToken', token });

    authenticated = true;
    showMainSection();
    await detectCurrentPage();
  } catch (error) {
    showError('Login Failed', error.message || 'Failed to authenticate');
  } finally {
    elements.loginBtn.disabled = false;
    elements.loginBtn.textContent = 'Login';
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  await sendMessage({ action: 'clearAuth' });
  authenticated = false;
  showAuthSection();
}

/**
 * Detect current page
 */
async function detectCurrentPage() {
  updateStatus('checking', 'Checking page...');

  if (!currentTab || !currentTab.url) {
    updateDetectionStatus('❌', 'No Page', 'Please navigate to a GoHighLevel page');
    updateStatus('error', 'No page');
    return;
  }

  // Check if GHL domain
  const isGHLDomain =
    currentTab.url.includes('gohighlevel.com') ||
    currentTab.url.includes('highlevelsite.com') ||
    currentTab.url.includes('leadconnectorhq.com') ||
    currentTab.url.includes('msgsndr.com');

  if (!isGHLDomain) {
    updateDetectionStatus(
      '❌',
      'Not a GHL Page',
      'This extension only works on GoHighLevel pages'
    );
    updateStatus('error', 'Not GHL');
    return;
  }

  try {
    // Detect via API
    const result = await sendMessage({
      action: 'detectGHLSite',
      url: currentTab.url,
    });

    if (result.detection.isGhlSite) {
      updateDetectionStatus(
        '✅',
        'GHL Page Detected',
        `Confidence: ${(result.detection.confidence * 100).toFixed(0)}%`
      );
      updateStatus('ready', 'Ready');
    } else {
      updateDetectionStatus(
        '❌',
        'Not a GHL Builder Page',
        'Could not detect GHL builder elements'
      );
      updateStatus('error', 'Not detected');
    }
  } catch (error) {
    updateDetectionStatus('⚠️', 'Detection Failed', error.message);
    updateStatus('error', 'Error');
  }
}

/**
 * Show cloned pages
 */
async function showClonedPages() {
  elements.detectionStatus.style.display = 'none';
  elements.clonedPagesSection.style.display = 'block';
  elements.pasteSection.style.display = 'none';

  await loadClonedPages();
}

/**
 * Load cloned pages
 */
async function loadClonedPages() {
  try {
    elements.clonedPagesList.innerHTML = '<div class="loading">Loading...</div>';

    const result = await sendMessage({
      action: 'getClonedPages',
      options: { limit: 50, status: 'copied' },
    });

    clonedPages = result.clonedPages || [];

    if (clonedPages.length === 0) {
      elements.clonedPagesList.innerHTML = `
        <div class="loading">
          No cloned pages found. Go to the dashboard to copy some pages first.
        </div>
      `;
      return;
    }

    renderClonedPages(clonedPages);
  } catch (error) {
    elements.clonedPagesList.innerHTML = `
      <div class="loading">Failed to load cloned pages: ${error.message}</div>
    `;
  }
}

/**
 * Render cloned pages list
 */
function renderClonedPages(pages) {
  if (pages.length === 0) {
    elements.clonedPagesList.innerHTML = '<div class="loading">No pages match your search</div>';
    return;
  }

  elements.clonedPagesList.innerHTML = pages
    .map(
      (page) => `
        <div class="page-item" data-page-id="${page.id}">
          <div class="page-item-title">${page.source_title || 'Untitled Page'}</div>
          <div class="page-item-url">${page.source_url}</div>
          <div class="page-item-meta">
            <span>${page.credits_consumed} credit${page.credits_consumed > 1 ? 's' : ''}</span>
            <span>${formatDate(page.created_at)}</span>
          </div>
        </div>
      `
    )
    .join('');

  // Add click handlers
  document.querySelectorAll('.page-item').forEach((item) => {
    item.addEventListener('click', () => {
      const pageId = item.getAttribute('data-page-id');
      const page = clonedPages.find((p) => p.id === pageId);
      if (page) {
        selectPageForPaste(page);
      }
    });
  });
}

/**
 * Handle search
 */
function handleSearch(e) {
  const query = e.target.value.toLowerCase();

  if (!query) {
    renderClonedPages(clonedPages);
    return;
  }

  const filtered = clonedPages.filter(
    (page) =>
      (page.source_title && page.source_title.toLowerCase().includes(query)) ||
      page.source_url.toLowerCase().includes(query)
  );

  renderClonedPages(filtered);
}

/**
 * Select page for paste
 */
function selectPageForPaste(page) {
  selectedPage = page;

  elements.clonedPagesSection.style.display = 'none';
  elements.pasteSection.style.display = 'block';

  elements.pastePageTitle.textContent = page.source_title || 'Untitled Page';
  elements.pastePageUrl.textContent = page.source_url;
}

/**
 * Handle start paste
 */
async function handleStartPaste() {
  if (!selectedPage) return;

  try {
    elements.startPasteBtn.disabled = true;
    elements.startPasteBtn.textContent = 'Creating session...';

    // Create paste session
    const sessionResult = await sendMessage({
      action: 'createPasteSession',
      clonedPageId: selectedPage.id,
    });

    currentSession = sessionResult.session;

    // Get paste data
    elements.startPasteBtn.textContent = 'Loading page data...';
    const dataResult = await sendMessage({
      action: 'getPasteData',
      sessionToken: currentSession.sessionToken,
    });

    // Show progress
    elements.pasteProgress.style.display = 'block';
    elements.startPasteBtn.textContent = 'Pasting...';

    // Send to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'injectPasteData',
      pasteData: dataResult.data,
    });

    if (response.success) {
      // Complete paste
      await sendMessage({
        action: 'completePaste',
        params: {
          sessionToken: currentSession.sessionToken,
          destinationUrl: currentTab.url,
          status: response.results.success ? 'success' : 'partial',
          errors: response.results.errors,
          warnings: response.results.warnings,
          elementsCount: response.results.elementsInserted,
        },
      });

      showSuccess('Paste Complete!', 'The page content has been pasted successfully.');

      // Reset
      setTimeout(() => {
        elements.pasteSection.style.display = 'none';
        elements.detectionStatus.style.display = 'block';
        selectedPage = null;
        currentSession = null;
      }, 2000);
    } else {
      throw new Error('Paste injection failed');
    }
  } catch (error) {
    console.error('Paste error:', error);
    showError('Paste Failed', error.message || 'Failed to paste page content');

    // Try to complete with error status
    if (currentSession) {
      try {
        await sendMessage({
          action: 'completePaste',
          params: {
            sessionToken: currentSession.sessionToken,
            destinationUrl: currentTab.url,
            status: 'failed',
            errors: [{ type: 'general', message: error.message }],
            warnings: [],
            elementsCount: 0,
          },
        });
      } catch (e) {
        console.error('Failed to report error:', e);
      }
    }
  } finally {
    elements.startPasteBtn.disabled = false;
    elements.startPasteBtn.textContent = '📋 Paste into Current Page';
    elements.pasteProgress.style.display = 'none';
  }
}

/**
 * Handle cancel paste
 */
function handleCancelPaste() {
  elements.pasteSection.style.display = 'none';
  elements.clonedPagesSection.style.display = 'block';
  selectedPage = null;
}

/**
 * Update status indicator
 */
function updateStatus(status, text) {
  elements.statusIndicator.className = 'status-indicator ' + status;
  elements.statusIndicator.querySelector('.status-text').textContent = text;
}

/**
 * Update detection status
 */
function updateDetectionStatus(icon, title, message) {
  elements.detectionStatus.querySelector('.status-icon').textContent = icon;
  elements.detectionTitle.textContent = title;
  elements.detectionMessage.textContent = message;
}

/**
 * Show/hide sections
 */
function showAuthSection() {
  elements.authSection.style.display = 'block';
  elements.mainSection.style.display = 'none';
  elements.errorSection.style.display = 'none';
}

function showMainSection() {
  elements.authSection.style.display = 'none';
  elements.mainSection.style.display = 'block';
  elements.errorSection.style.display = 'none';
}

function showError(title, message) {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  elements.errorSection.style.display = 'block';
  elements.authSection.style.display = 'none';
  elements.mainSection.style.display = 'none';
}

function hideError() {
  elements.errorSection.style.display = 'none';
}

function showSuccess(title, message) {
  // Update detection status to show success
  updateDetectionStatus('✅', title, message);
  updateStatus('ready', 'Success');
}

/**
 * Send message to background script
 */
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.success) {
        resolve(response);
      } else {
        reject(new Error(response?.error || 'Request failed'));
      }
    });
  });
}

/**
 * Format date
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

// Initialize when popup opens
initialize().catch((error) => {
  console.error('Initialization error:', error);
  showError('Initialization Failed', error.message);
});
