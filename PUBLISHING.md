# Tab X Publishing Record

Last updated: June 18, 2026

## Current Store Status

- Extension name: Tab X
- Version: 2.0.0
- Chrome Web Store item ID: `mdpnfjjeclibnejfdcfnbclhdhjannac`
- Review status: Pending review
- Submission date: June 18, 2026
- Publication mode: Publish automatically after review approval
- Publisher contact email: `ukluocn@gmail.com` verified on June 18, 2026

## Store Listing

- Category: Workflow & Planning
- Language: English
- Price: Free of charge
- Visibility: Public
- Regions: All regions
- Mature content: Off
- Support visibility: Off
- Promo video: None
- Small promo tile: Not provided
- Marquee promo tile: Not provided

## Store Assets

Assets used for the June 18, 2026 submission were prepared locally and are intentionally not tracked in Git.

- Store icon: 128x128 PNG generated from the Tab X icon style
- Screenshot: 1280x800 JPEG based on the latest Tab X new-tab screenshot
- Upload package: `tab-x-2.0.0.zip`

These files belong in local release working folders only, not in the repository:

- `store-assets/`
- `tab-x-*.zip`
- `*.crx`
- `*.pem`

The repository should keep only reusable source assets and documentation, such as:

- `extension/`
- `README.md`
- `README.zh-CN.md`
- `PRIVACY.md`
- `PUBLISHING.md`
- `.gitignore`

## Package Notes

The submitted package was built from the `extension/` directory. Tab X is a plain Manifest V3 extension and does not require a Node.js build step, npm install, server, account system, or database.

Before creating a release package, confirm that the package contains only extension runtime files and excludes local-only files such as `.DS_Store`, release screenshots, prior zip files, or local config.

## Privacy And Permissions

Chrome Web Store privacy form values used for the current submission:

- Single purpose: Tab X replaces the Chrome new tab page with a local dashboard for time, top sites, current open tabs, duplicate tab cleanup, shortcuts, and saved/archive tab records.
- Remote code: No remote JavaScript or WebAssembly.
- Data usage disclosure: Web history.
- Privacy policy URL: `https://github.com/itouchgod/tab-x/blob/main/PRIVACY.md`

Permission justifications:

- `tabs`: read currently open tabs so Tab X can group them by domain, show tab titles, switch to a selected tab, close tabs, and detect duplicate tabs.
- `activeTab`: act on the current tab for scoped new-tab actions such as opening searches or URLs.
- `storage`: store saved-for-later records, archived records, custom shortcuts, hidden shortcut preferences, sort preference, and migration state.
- `topSites`: show Chrome common top sites as shortcut suggestions.
- `history`: provide shortcut suggestions only when Chrome top sites is empty or unavailable.
- `search`: submit non-URL search box text through Chrome's default search provider.
- `favicon`: show site icons for shortcuts, grouped domains, and tab rows.

## GitHub Updates Included

- Extension icon assets were updated to the new Tab X / new-tab favicon visual direction.
- `PRIVACY.md` was added for the Chrome Web Store privacy policy URL.
- `.gitignore` now excludes local release artifacts and upload packages.
- This publishing record documents what was submitted and what should remain local.

