/**
 * Website Cloner Pro - GHL Extension
 * Content Script
 *
 * Runs on GoHighLevel pages to:
 * - Detect GHL builder elements
 * - Extract page data for copying
 * - Insert/paste copied page data
 * - Monitor paste operation status
 */

console.log('Website Cloner Pro content script loaded');

// State
let isGHLBuilder = false;
let currentPageData = null;
let pasteInProgress = false;

/**
 * Detect if current page is GHL builder
 */
function detectGHLBuilder() {
  // Check for GHL builder elements
  const builderIndicators = [
    '[data-page-id]',
    '[data-funnel-id]',
    '.hl_page',
    '.funnel-body',
    '.builder-page',
    '#builder-iframe',
    '.page-builder',
  ];

  for (const selector of builderIndicators) {
    if (document.querySelector(selector)) {
      isGHLBuilder = true;
      return true;
    }
  }

  // Check meta tags
  const generator = document.querySelector('meta[name="generator"]');
  if (generator && generator.content.toLowerCase().includes('highlevel')) {
    isGHLBuilder = true;
    return true;
  }

  return false;
}

/**
 * Extract GHL page data
 */
function extractPageData() {
  const data = {
    url: window.location.href,
    title: document.title,
    pageId: null,
    funnelId: null,
    accountId: null,
    elements: [],
    metadata: {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    },
  };

  // Extract data attributes
  const pageElement = document.querySelector('[data-page-id]');
  if (pageElement) {
    data.pageId = pageElement.getAttribute('data-page-id');
    data.funnelId = pageElement.getAttribute('data-funnel-id');
    data.accountId = pageElement.getAttribute('data-account-id');
  }

  // Extract builder elements
  const builderElements = document.querySelectorAll(
    '.builder-section, .builder-row, .builder-column, [data-element-type]'
  );

  data.elements = Array.from(builderElements).map((el, index) => ({
    index,
    type: el.getAttribute('data-element-type') || el.className,
    id: el.id,
    classes: Array.from(el.classList),
    html: el.outerHTML.substring(0, 500), // Preview only
  }));

  currentPageData = data;
  return data;
}

/**
 * Inject paste data into GHL builder
 */
async function injectPasteData(pasteData) {
  console.log('Injecting paste data into GHL builder', pasteData);
  pasteInProgress = true;

  try {
    const results = {
      success: true,
      elementsInserted: 0,
      cssInserted: 0,
      jsInserted: 0,
      formsInserted: 0,
      errors: [],
      warnings: [],
    };

    // 1. Inject custom CSS
    if (pasteData.customCss && pasteData.customCss.length > 0) {
      try {
        for (const css of pasteData.customCss) {
          const styleEl = document.createElement('style');
          styleEl.textContent = css;
          styleEl.setAttribute('data-wcp-injected', 'true');
          document.head.appendChild(styleEl);
          results.cssInserted++;
        }
      } catch (error) {
        results.errors.push({ type: 'css', message: error.message });
      }
    }

    // 2. Inject custom JavaScript (carefully)
    if (pasteData.customJs && pasteData.customJs.length > 0) {
      try {
        for (const js of pasteData.customJs) {
          // Only inject safe scripts (no eval, no inline event handlers)
          if (!js.includes('eval(') && !js.includes('onclick=')) {
            const scriptEl = document.createElement('script');
            scriptEl.textContent = js;
            scriptEl.setAttribute('data-wcp-injected', 'true');
            document.body.appendChild(scriptEl);
            results.jsInserted++;
          } else {
            results.warnings.push({
              type: 'js',
              message: 'Skipped potentially unsafe script',
            });
          }
        }
      } catch (error) {
        results.errors.push({ type: 'js', message: error.message });
      }
    }

    // 3. Process forms
    if (pasteData.forms && pasteData.forms.length > 0) {
      results.formsInserted = pasteData.forms.length;
      results.warnings.push({
        type: 'forms',
        message: `${pasteData.forms.length} forms detected - manual configuration may be needed`,
      });
    }

    // 4. Notify user of asset requirements
    if (pasteData.assets) {
      const totalAssets =
        (pasteData.assets.images?.length || 0) +
        (pasteData.assets.videos?.length || 0) +
        (pasteData.assets.fonts?.length || 0) +
        (pasteData.assets.stylesheets?.length || 0) +
        (pasteData.assets.scripts?.length || 0);

      if (totalAssets > 0) {
        results.warnings.push({
          type: 'assets',
          message: `${totalAssets} assets detected - you may need to upload/configure these manually`,
          assets: pasteData.assets,
        });
      }
    }

    // 5. Show notification to user
    showNotification({
      type: 'success',
      title: 'Paste Complete!',
      message: `Injected ${results.cssInserted} CSS styles, ${results.jsInserted} scripts. Check the page for results.`,
      duration: 5000,
    });

    // Set success flag
    results.success = results.errors.length === 0;
    results.elementsInserted = results.cssInserted + results.jsInserted;

    return results;
  } catch (error) {
    console.error('Paste injection error:', error);
    showNotification({
      type: 'error',
      title: 'Paste Failed',
      message: error.message,
      duration: 5000,
    });

    return {
      success: false,
      elementsInserted: 0,
      cssInserted: 0,
      jsInserted: 0,
      formsInserted: 0,
      errors: [{ type: 'general', message: error.message }],
      warnings: [],
    };
  } finally {
    pasteInProgress = false;
  }
}

/**
 * Show notification to user
 */
function showNotification({ type, title, message, duration = 3000 }) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'wcp-notification wcp-notification-' + type;
  notification.innerHTML = `
    <div class="wcp-notification-content">
      <div class="wcp-notification-title">${title}</div>
      <div class="wcp-notification-message">${message}</div>
    </div>
    <button class="wcp-notification-close">&times;</button>
  `;

  // Add styles if not already added
  if (!document.getElementById('wcp-notification-styles')) {
    const styles = document.createElement('style');
    styles.id = 'wcp-notification-styles';
    styles.textContent = `
      .wcp-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        min-width: 300px;
        max-width: 500px;
        padding: 16px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999999;
        animation: wcp-slide-in 0.3s ease;
      }
      @keyframes wcp-slide-in {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .wcp-notification-success { border-left: 4px solid #4CAF50; }
      .wcp-notification-error { border-left: 4px solid #F44336; }
      .wcp-notification-warning { border-left: 4px solid #FF9800; }
      .wcp-notification-info { border-left: 4px solid #2196F3; }
      .wcp-notification-title {
        font-weight: bold;
        font-size: 16px;
        margin-bottom: 8px;
        color: #333;
      }
      .wcp-notification-message {
        font-size: 14px;
        color: #666;
        line-height: 1.4;
      }
      .wcp-notification-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        font-size: 20px;
        color: #999;
        cursor: pointer;
        padding: 4px 8px;
      }
      .wcp-notification-close:hover {
        color: #333;
      }
    `;
    document.head.appendChild(styles);
  }

  // Add to DOM
  document.body.appendChild(notification);

  // Close button
  notification.querySelector('.wcp-notification-close').addEventListener('click', () => {
    notification.remove();
  });

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      notification.style.animation = 'wcp-slide-in 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }
}

/**
 * Message handler from background/popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);

  (async () => {
    try {
      switch (request.action) {
        case 'pageLoaded':
          detectGHLBuilder();
          sendResponse({ success: true, isGHLBuilder });
          break;

        case 'detectBuilder':
          const detected = detectGHLBuilder();
          sendResponse({ success: true, isGHLBuilder: detected });
          break;

        case 'extractPageData':
          const pageData = extractPageData();
          sendResponse({ success: true, data: pageData });
          break;

        case 'injectPasteData':
          if (pasteInProgress) {
            sendResponse({ success: false, error: 'Paste already in progress' });
            return;
          }

          const results = await injectPasteData(request.pasteData);
          sendResponse({ success: true, results });
          break;

        case 'getStatus':
          sendResponse({
            success: true,
            isGHLBuilder,
            pasteInProgress,
            hasPageData: !!currentPageData,
          });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep message channel open
});

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    detectGHLBuilder();
    if (isGHLBuilder) {
      console.log('GHL Builder detected on page');
    }
  });
} else {
  detectGHLBuilder();
  if (isGHLBuilder) {
    console.log('GHL Builder detected on page');
  }
}
