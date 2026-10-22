import { getSettings, setSettings } from '../lib/stash.js';

const $ = (selector) => document.querySelector(selector);

function saved() {
  $('#status').textContent = 'Saved';
  setTimeout(() => ($('#status').textContent = ''), 1200);
}

async function init() {
  const settings = await getSettings();
  $('#closeAfter').checked = settings.closeAfter;
  for (const radio of document.querySelectorAll('input[name="quickTarget"]')) {
    radio.checked = radio.value === settings.quickTarget;
    radio.addEventListener('change', async () => {
      await setSettings({ quickTarget: radio.value });
      saved();
    });
  }
  $('#closeAfter').addEventListener('change', async (e) => {
    await setSettings({ closeAfter: e.target.checked });
    saved();
  });

  const commands = await chrome.commands.getAll();
  const quick = commands.find((c) => c.name === 'quick-stash')?.shortcut;
  $('#shortcut').textContent = quick ? `Currently ${quick}.` : 'No shortcut is assigned yet.';

  // chrome:// links are blocked from extension pages, so open the page through the tabs API.
  $('#shortcuts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

init().catch((err) => {
  console.error(err);
  $('#status').textContent = 'Failed to load: ' + err.message;
});
