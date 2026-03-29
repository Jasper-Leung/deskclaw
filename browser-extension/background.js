/**
 * DeskClaw Browser Controller - Background Service Worker
 * Handles communication between DeskClaw app and browser content
 */

let ws = null;
let reconnectTimer = null;
const WS_URL = 'ws://localhost:9527';

// Connect to DeskClaw WebSocket server
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('Connected to DeskClaw Extension Bridge');
    chrome.action.setIcon({ path: 'icons/icon48-active.png' });
    clearTimeout(reconnectTimer);
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleDeskClawMessage(message);
  };

  ws.onclose = () => {
    console.log('Disconnected from DeskClaw Extension Bridge');
    chrome.action.setIcon({ path: 'icons/icon48.png' });
    // Attempt to reconnect every 5 seconds
    reconnectTimer = setTimeout(connect, 5000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Handle messages from DeskClaw
async function handleDeskClawMessage(message) {
  const { type, data } = message;

  switch (type) {
    case 'pong':
      // Response to ping
      break;

    case 'navigate':
      // Navigate to URL
      if (data.url) {
        const tab = await getCurrentTab();
        if (tab) {
          // Normalize URL - add https:// if no protocol specified
          let url = data.url;
          if (!url.match(/^https?:\/\//i) && !url.match(/^chrome:\/\//i)) {
            url = 'https://' + url;
          }
          await chrome.tabs.update(tab.id, { url });
          sendToDeskClaw({
            type: 'success',
            data: { message: 'Navigated to ' + url },
          });
        }
      }
      break;

    case 'snapshot':
      // Get page snapshot
      try {
        const tab = await getCurrentTab();
        if (tab) {
          if (!isAccessibleUrl(tab.url)) {
            sendToDeskClaw({
              type: 'error',
              error: 'Cannot access a chrome:// URL',
            });
            break;
          }
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: getSnapshot,
          });
          sendToDeskClaw({
            type: 'success',
            data: result,
          });
        }
      } catch (error) {
        sendToDeskClaw({
          type: 'error',
          error: error.message,
        });
      }
      break;

    case 'click':
      // Click element
      if (data.selector) {
        const tab = await getCurrentTab();
        if (tab) {
          if (!isAccessibleUrl(tab.url)) {
            sendToDeskClaw({
              type: 'error',
              error: 'Cannot access a chrome:// URL',
            });
            break;
          }
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: clickElement,
            args: [data.selector],
          });
          sendToDeskClaw({
            type: 'success',
            data: { message: 'Clicked: ' + data.selector },
          });
        }
      }
      break;

    case 'type':
      // Type text
      if (data.selector && data.text) {
        const tab = await getCurrentTab();
        if (tab) {
          if (!isAccessibleUrl(tab.url)) {
            sendToDeskClaw({
              type: 'error',
              error: 'Cannot access a chrome:// URL',
            });
            break;
          }
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: typeText,
            args: [data.selector, data.text],
          });
          sendToDeskClaw({
            type: 'success',
            data: { message: 'Typed text into: ' + data.selector },
          });
        }
      }
      break;

    case 'evaluate':
      // Evaluate JavaScript (with security validation)
      if (data.script) {
        // Security check: validate script before execution
        if (!isScriptSafe(data.script)) {
          sendToDeskClaw({
            type: 'error',
            error: 'Script rejected: contains potentially dangerous operations',
          });
          break;
        }

        const tab = await getCurrentTab();
        if (tab) {
          if (!isAccessibleUrl(tab.url)) {
            sendToDeskClaw({
              type: 'error',
              error: 'Cannot access a chrome:// URL',
            });
            break;
          }

          // Use safer evaluation method with try-catch
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: new Function(
              'try { ' + data.script + ' } catch(e) { return {error: e.message}; }'
            ),
          });
          sendToDeskClaw({
            type: 'success',
            data: { result: result.result },
          });
        }
      }
      break;

    case 'screenshot':
      // Take screenshot
      try {
        const tab = await getCurrentTab();
        if (tab) {
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId);
          sendToDeskClaw({
            type: 'success',
            data: { screenshot: dataUrl },
          });
        }
      } catch (error) {
        sendToDeskClaw({
          type: 'error',
          error: error.message,
        });
      }
      break;
  }
}

// Check if URL is accessible
function isAccessibleUrl(url) {
  if (!url) return false;
  // Chrome internal pages are not accessible
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  ) {
    return false;
  }
  return true;
}

// Security validation for scripts to prevent code injection
function isScriptSafe(script) {
  if (!script || typeof script !== 'string') return false;

  // Block dangerous patterns
  const dangerousPatterns = [
    /fetch\s*\(/i,
    /XMLHttpRequest/i,
    /\.import\s*\(/i,
    /eval\s*\(/i,
    /new\s+Function\s*\(/i,
    /document\.write/i,
    /innerHTML\s*=/i,
    /outerHTML\s*=/i,
    /localStorage\s*\./i,
    /sessionStorage\s*\./i,
    /indexedDB\s*\./i,
    /\.postMessage\s*\(/i,
    /\.addEventListener\s*\(/i,
    /Worker\s*\(/i,
    /importScripts\s*\(/i,
    /@sourceURL/i,
    ///# sourceMappingURL/i,
    /\/\/@.*?sourceURL/i,
  ];

  // Check for dangerous patterns
  for (const pattern of dangerousPatterns) {
    if (pattern.test(script)) {
      console.warn('Blocked potentially dangerous script pattern:', pattern);
      return false;
    }
  }

  // Limit script length to prevent abuse
  if (script.length > 10000) {
    console.warn('Script exceeds maximum allowed length');
    return false;
  }

  return true;
}

// Get current active tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Send message to DeskClaw
function sendToDeskClaw(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Page snapshot function (injected into page)
function getSnapshot() {
  // Get basic page info
  const snapshot = {
    url: window.location.href,
    title: document.title,
    // Get readable text
    text: document.body.innerText,
    // Get HTML
    html: document.documentElement.outerHTML,
    // Get forms and inputs
    forms: Array.from(document.forms).map((form) => ({
      action: form.action,
      method: form.method,
      inputs: Array.from(form.elements).map((input) => ({
        name: input.name,
        type: input.type,
        id: input.id,
        value: input.value,
      })),
    })),
    // Get buttons and links
    interactables: Array.from(document.querySelectorAll('a, button')).map((el) => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      href: el.href,
      text: el.textContent?.slice(0, 100),
    })),
  };
  return snapshot;
}

// Click element function
function clickElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  element.click();
  return { success: true, selector };
}

// Type text function
function typeText(selector, text) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return { success: true, selector, text };
}

// Listen for messages from popup, content script, etc.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getSnapshot') {
    handleDeskClawMessage({ type: 'snapshot' });
    sendResponse({ success: true });
  } else if (message.type === 'checkStatus') {
    // Check WebSocket connection status
    sendResponse({
      connected: ws && ws.readyState === WebSocket.OPEN,
    });
  }
  return true;
});

// Auto-connect on startup
connect();

// Keep service worker alive
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
