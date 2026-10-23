// Product and legal details shown in the UI. Keep in sync with LICENSE and manifest.json.

export const ABOUT = {
  name: 'Tab Docket',
  author: 'Bryan Gebhardt',
  year: 2026,
  license: 'MIT License',
  repoUrl: 'https://github.com/bgebhardt/tab-docket',
  licenseUrl: 'https://github.com/bgebhardt/tab-docket/blob/master/LICENSE',
  privacyUrl: 'https://github.com/bgebhardt/tab-docket/blob/master/PRIVACY.md',
  issuesUrl: 'https://github.com/bgebhardt/tab-docket/issues',
  disclaimer:
    'Provided “as is”, without warranty of any kind. Not affiliated with or endorsed by Google, Perplexity, '
    + 'or the makers of Tab Stash, Tab Manager Plus, Session Buddy or Raindrop.io. All trademarks belong to their owners.',
};

export function copyrightLine() {
  return `© ${ABOUT.year} ${ABOUT.author}. Released under the ${ABOUT.license}.`;
}
