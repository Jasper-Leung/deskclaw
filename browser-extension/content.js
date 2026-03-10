/**
 * DeskClaw Browser Controller - Content Script
 * Injected into all pages to provide browser control capabilities
 */

console.log('DeskClaw Browser Controller loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ status: 'alive', url: window.location.href });
  }
  return true;
});
