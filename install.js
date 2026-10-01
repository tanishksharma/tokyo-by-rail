// Installation control and offline download status.
(() => {
  let offer, ready = false, installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let status = 'Preparing offline download.';
  const paint = () => {
    document.querySelectorAll('[data-app-install]').forEach(button => { const label = installed ? 'Installed' : 'Add to Home Screen'; if (button.textContent !== label) button.textContent = label; button.disabled = installed; });
    document.querySelectorAll('[data-app-install-status]').forEach(item => { if (item.textContent !== status) item.textContent = status; });
  };
  new MutationObserver(paint).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); offer = event; paint(); });
  window.addEventListener('appinstalled', () => { installed = true; offer = null; status = 'Installed. Ready for offline use.'; paint(); });
  document.addEventListener('click', async event => {
    if (!event.target.closest('[data-app-install]')) return;
    if (!ready) { status = 'Wait for the offline download to finish, then try again.'; paint(); return; }
    if (offer) {
      const prompt = offer; offer = null;
      try { await prompt.prompt(); await prompt.userChoice; } catch { status = 'Use your browser menu to install this app.'; }
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
      status = 'Tap Share, then Add to Home Screen, then Add. Open the app once while online to finish its offline download.';
    } else if (/Android/.test(navigator.userAgent)) {
      status = 'Open your browser menu, then Install app or Add to Home screen.';
    } else {
      status = 'Chrome or Edge: use the install icon in the address bar or browser menu. Safari: File, Add to Dock. Open this link in a full browser if your current browser has no installation option.';
    }
    paint();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(registration => { const worker = registration.installing; if (worker) worker.addEventListener('statechange', () => { if (worker.state === 'redundant') { status = 'Offline download failed. Reconnect and reload before installing.'; paint(); } }); return navigator.serviceWorker.ready; }).then(() => {
      ready = true; status = installed ? 'Installed. Ready for offline use.' : 'Ready for offline use. Add this app to your Home Screen for quick access.'; paint();
    }).catch(() => { status = 'Offline download failed. Reconnect and reload before installing.'; paint(); });
  } else { status = 'This browser cannot download the app for offline use. Open it in Chrome, Edge or Safari.'; paint(); }
  paint();
})();
