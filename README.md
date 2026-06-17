# Tab X

[中文说明](README.zh-CN.md)

**A calm Chrome new tab dashboard for tabs, shortcuts, and time.**

Tab X replaces Chrome's new tab page with a local, Apple-inspired dashboard. It shows the current Ganzhi time on the left, a word clock plus open-tab count on the right, icon-style access to top sites, and a clean domain-grouped view of every tab you currently have open.

No server. No account. No build step. Everything runs inside the Chrome extension.

---

## Current Layout

```text
Top header
  Left:  Ganzhi clock (year/month/day/hour) + solar-term metadata
  Right: English word clock + open tab count

Start area
  Centered search box
  Icon-style Top sites shortcuts

Main dashboard
  Left:  Open tabs grouped by main domain in a compact light grouped list
  Right: Saved for later checklist in a compact side panel, active items only
```

There is no extension-owned bottom bar. The bottom area stays clean so Chrome's own UI can sit below the extension page.

---

## Features

- **Ganzhi clock header** shows current year, month, day, and hour in heavenly stems and earthly branches, with solar-term metadata underneath.
- **Word clock status** in the top-right renders the current time in natural English, such as `three minutes to twelve`.
- **Open tab counter** sits beside the word clock and updates as tabs are opened or closed.
- **Search box** behaves like a new-tab search/address field: URLs open directly, search terms use Chrome's default search provider when available.
- **Apple-inspired layout** uses system fonts, cool white surfaces, subtle shadows, icon-style shortcuts, and no custom bottom bar.
- **Top sites shortcuts** use Chrome `topSites`, with a history-based fallback when `topSites` is empty.
- **Manual shortcuts** can be added with the `+` button and are stored locally.
- **Drag tabs into Top sites** by dragging any open-tab row into the Top sites area.
- **Remove shortcuts** with the small `x`: manual shortcuts are deleted; automatic top/history shortcuts are hidden in Tab X.
- **Open tabs grouped by main domain** in a compact grouped-list layout with indented child rows and direct row-level `X` close controls.
- **Homepages group** pulls Gmail inbox, X home, YouTube, LinkedIn, and GitHub homepages into one cleanup card.
- **Duplicate detection** flags repeated URLs and can close duplicates while keeping one copy.
- **Click any tab title** to jump directly to that tab, even across Chrome windows.
- **Close tabs with feedback** using a swoosh sound and confetti burst.
- **Save for later** stores a tab in a local checklist before closing it; the side panel only shows active saved items.
- **Localhost grouping** includes port numbers so local dev projects are easier to tell apart.
- **Expandable groups** show the first 8 tabs, with a `+N more` control for larger groups.
- **100% local data storage** using Chrome extension APIs and `chrome.storage.local`.

---

## Manual Setup

Clone the repo if needed:

```bash
git clone git@github.com:itouchgod/tab-x.git
cd tab-x
```

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` folder from this repo.
5. Open a new tab.

If you already loaded Tab X before, click **Reload** on the extension card after making changes.

---

## How To Use

- Type in the search box to search or open a URL.
- Click a Top sites shortcut to open it in the current tab.
- Click `+` in Top sites to add a custom shortcut.
- Drag a tab row from **Open tabs** into **Top sites** to save it as a shortcut.
- Hover a Top sites shortcut and click `x` to remove or hide it.
- Click an open tab row to switch to that tab.
- Click the bookmark icon on a tab row to save it for later, then close it.
- Click the `x` on a tab row to close only that tab.
- Click **Close All** on a multi-tab domain group to close that group.
- Click **Close duplicates** when a duplicate badge appears.

---

## Data And Permissions

| Area | API / Storage |
| --- | --- |
| New tab replacement | Chrome Manifest V3 `chrome_url_overrides.newtab` |
| Open tabs and focusing tabs | `chrome.tabs`, `chrome.windows` |
| Open tab count badge | `chrome.action` in the service worker |
| Search | `chrome.search`, with URL fallback |
| Top sites | `chrome.topSites` |
| History fallback for shortcuts | `chrome.history` |
| Site icons | Chrome extension `/_favicon/` API, with initials fallback |
| New tab favicon | Chrome native `chrome://theme/IDR_PRODUCT_LOGO_*` resources |
| Saved for later | `chrome.storage.local` key `deferred` |
| Manual shortcuts | `chrome.storage.local` key `favoriteLinks` |
| Hidden automatic shortcuts | `chrome.storage.local` key `hiddenTopSiteUrls` |
| Sound | Web Audio API |
| Confetti | DOM/CSS animation |

Tab X does not run a server and does not require Node.js, npm, or a database.

---

## Project Structure

```text
extension/
  manifest.json      Chrome extension manifest
  index.html         New tab page structure
  style.css          Dashboard styling
  app.js             Dashboard logic and UI interactions
  background.js      Toolbar badge count service worker
  icons/             Extension icons
```

---

## Development Notes

- `extension/config.local.js` is intentionally ignored and can be used for personal landing-page or grouping rules.
- After editing files, reload the unpacked extension from `chrome://extensions`.
- If permissions change, Chrome may ask for confirmation when the extension is reloaded.
- Site-level icons, such as Top sites and domain group headers, use Chrome's native extension `/_favicon/` provider with the origin URL for a stable logo. Individual tab rows use the exact page URL and can fall back to Chrome's `tab.favIconUrl` when needed.
- The browser tab favicon is declared in `index.html` using Chrome's native theme product logo resources, so it does not reuse Tab X's extension icon.

---

## License

MIT

Built by L
