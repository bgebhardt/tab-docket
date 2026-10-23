// Optional on-device naming via the browser's built-in Prompt API (Gemini Nano in Chrome).
// Nothing leaves the machine. Where the API is missing or its model is not already downloaded,
// this returns null and callers fall back to suggestGroupNames() from util.js.

import { cleanGroupName, domainOf, isStashable } from './util.js';

const MAX_TABS = 25;
const TIMEOUT_MS = 8000;

export async function aiSuggestName(tabs, existingNames = []) {
  const Model = globalThis.LanguageModel;
  if (!Model) return null;
  const pages = tabs.filter((t) => isStashable(t.url)).slice(0, MAX_TABS);
  if (!pages.length) return null;

  let session;
  try {
    const options = { expectedOutputs: [{ type: 'text', languages: ['en'] }] };
    // Only use a model that is ready now; never trigger a multi-GB download from a popup.
    if ((await Model.availability(options)) !== 'available') return null;
    session = await Model.create({
      ...options,
      initialPrompts: [
        {
          role: 'system',
          content:
            'You name groups of browser tabs. Reply with only a short topic name of 1 to 3 words, '
            + 'in Title Case, with no quotes or punctuation. Describe the shared topic or task, not the websites.',
        },
      ],
    });
    const list = pages.map((t) => `- ${t.title || ''} (${domainOf(t.url)})`).join('\n');
    const hint = existingNames.length ? `\nExisting groups (reuse one only if it clearly fits): ${existingNames.join(', ')}` : '';
    const reply = await Promise.race([
      session.prompt(`Tabs:\n${list}${hint}\n\nGroup name:`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    const name = cleanGroupName(String(reply).split('\n')[0].replace(/["'.*#]/g, ''));
    return name || null;
  } catch (err) {
    console.warn('Tab Docket: AI naming unavailable', err);
    return null;
  } finally {
    session?.destroy?.();
  }
}
