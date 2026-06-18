# Tab X Privacy Policy

Effective date: June 18, 2026

Tab X is a local Chrome new tab extension for viewing time, top sites, open tabs, saved links, archived links, and duplicate tabs.

## Data Tab X Uses

Tab X may read:

- Open tab URLs, titles, favicons, and tab IDs so it can group tabs, switch to tabs, close tabs, and detect duplicates.
- Chrome top sites and, when top sites are empty, limited browser history entries so it can show useful shortcut suggestions.
- Search text typed into the Tab X search box so it can open URLs or send searches to Chrome's default search provider.
- Saved for later and archived records that contain only URL, title, and timestamp.
- Custom shortcut records and hidden shortcut preferences.

## Storage

Tab X stores lightweight records using Chrome extension storage APIs:

- Saved for later and archived records are stored in `chrome.storage.sync`.
- Custom shortcuts, hidden automatic shortcuts, and UI preferences are stored in `chrome.storage.local`.

Tab X does not store passwords, authentication tokens, payment data, health data, personal communications, or form contents.

## Data Sharing

Tab X does not operate a server, does not create an account, and does not sell or transfer user data to third parties.

Data saved through `chrome.storage.sync` may be synchronized by Chrome across browsers signed in to the same Google account, subject to Chrome's own sync behavior.

## Remote Code

Tab X does not use remote JavaScript or WebAssembly. All extension code is included in the packaged extension.

## Contact

For questions, contact the publisher through the Chrome Web Store listing or the GitHub repository.
