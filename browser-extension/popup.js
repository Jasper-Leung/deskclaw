/**
 * DeskClaw Browser Controller - Popup Script
 */

// Check connection status
function checkStatus() {
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const connectionStatus = document.getElementById('connectionStatus');

  // Send ping to background script to check WebSocket status
  chrome.runtime.sendMessage({ type: 'checkStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.className = 'status disconnected';
      statusText.textContent = 'Disconnected';
      connectionStatus.textContent = 'Not connected to DeskClaw';
    } else if (response && response.connected) {
      statusEl.className = 'status connected';
      statusText.textContent = 'Connected';
      connectionStatus.textContent = 'Connected to DeskClaw';
    }
  });
}

// Update status every second
setInterval(checkStatus, 1000);

// Initial check
checkStatus();
