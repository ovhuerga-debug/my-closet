const installButton = document.getElementById('installApp');
const help = document.getElementById('installHelp');
const standalone = window.matchMedia('(display-mode: standalone)');
let installPrompt;

function updateVisibility() {
  installButton.hidden = standalone.matches || navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  if (help.open) help.close();
  installButton.hidden = true;
});

standalone.addEventListener('change', updateVisibility);
updateVisibility();

installButton.addEventListener('click', async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = undefined;
    try {
      await prompt.prompt();
      return;
    } catch {
      // Instructions also work if a browser withdraws the install prompt.
    }
  }
  if (!help.open) help.showModal();
});
