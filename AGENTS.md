# AGENTS.md -- Tab X Setup & Onboarding Guide for Coding Agents

You are installing **Tab X** for the user. Your job is not just to set it up -- it is to help them understand why this new tab page is useful.

Current Tab X version: **2.0.0**.

---

## Step 0 -- Introduce the product

Before doing anything technical, tell the user what they are about to get:

> **Tab X** replaces your Chrome new tab page with a quiet Apple-inspired dashboard for time, top sites, and open tabs.
>
> What makes it useful:
> - **Ganzhi clock** in the top-left with current year/month/day/hour and solar-term metadata
> - **Word clock + open-tab count** in the top-right
> - **Centered search box** for URLs and Chrome default search
> - **Top sites** from Chrome's common sites, with history fallback
> - **Custom shortcuts** added with `+`, removable with `x`
> - **Drag any open tab into Top sites** to save it as a shortcut
> - **Open tabs grouped by main domain** in a compact light grouped list
> - **Homepages group** for Gmail, X, LinkedIn, YouTube, and GitHub homepages
> - **Duplicate detection** with one-click cleanup
> - **Save for later + Archived** combined in one compact accordion card
> - **Adaptive dark mode** that follows the system setting, with a manual footer toggle
> - **Sync-ready storage utility** for lightweight saved/archive records across Chrome profiles
> - **100% local**: no server, no account, no external database
>
> It is just a Chrome extension. Setup takes about 1 minute.

---

## Step 1 -- Clone Or Locate The Repo

If cloning:

```bash
git clone git@github.com:itouchgod/tab-x.git
cd tab-x
```

If the repo already exists, use the existing project folder and load its `extension/` directory.

---

## Step 2 -- Install The Chrome Extension

This is the one step that requires manual action from the user. Make it as easy as possible.

**First**, print the full path to the `extension/` folder:

```bash
echo "Extension folder: $(cd extension && pwd)"
```

**Then**, copy the `extension/` folder path to their clipboard:

- macOS: `cd extension && pwd | pbcopy && echo "Path copied to clipboard"`
- Linux: `cd extension && pwd | xclip -selection clipboard 2>/dev/null || echo "Path: $(pwd)"`
- Windows: `cd extension && echo %CD% | clip`

**Then**, open the extensions page:

```bash
open -a "Google Chrome" "chrome://extensions"
```

Walk the user through it:

> I've copied the extension folder path to your clipboard. Now:
>
> 1. Open Chrome's extensions page.
> 2. Toggle on **Developer mode** in the top-right.
> 3. Click **Load unpacked**.
> 4. Press **Cmd+Shift+G** on Mac, or use the location bar in the file picker.
> 5. Paste the extension folder path and press Enter.
> 6. Click **Select** or **Open**.
>
> You should see **Tab X** in the extensions list.

Also open the folder as a fallback:

- macOS: `open extension/`
- Linux: `xdg-open extension/`
- Windows: `explorer extension\\`

---

## Step 3 -- Show Them Around

Once the extension is loaded:

> Open a new tab and you will see Tab X.
>
> Layout:
> 1. Top-left: Ganzhi clock and solar-term line.
> 2. Top-right: word clock and open tab count.
> 3. Center: search box, then icon-style Top sites.
> 4. Main area: open tabs grouped by main domain in a compact light grouped list.
> 5. Right side: Saved for later and Archived in a compact accordion side panel.
> 6. Bottom: centered Design by L footer with a theme toggle.
>
> Key actions:
> - Search or open URLs from the search box.
> - Click a Top sites shortcut to open it.
> - Click `+` to add a custom shortcut.
> - Drag a tab from Open tabs into Top sites to save it as a shortcut.
> - Hover a shortcut and click `x` to remove or hide it.
> - Click a tab title to jump to it.
> - Click a tab row's bookmark icon to save it for later.
> - Click a saved item checkbox to move it into Archived.
> - Click Archived to expand or collapse archived records.
> - Click a tab row's `x` to close it.
> - Use Close duplicates to clean repeated tabs.

---

## Key Facts

- Tab X is a pure Chrome Manifest V3 extension.
- No server, no Node.js runtime, no npm install, no database.
- Saved tabs for the current UI and custom shortcuts are stored in `chrome.storage.local`.
- The optional `storageSync.js` utility uses `chrome.storage.sync` and strips records to `url`, `title`, and `timestamp`.
- Chrome top sites come from `chrome.topSites`.
- If `chrome.topSites` is empty, Tab X uses `chrome.history` as a fallback.
- To update after code changes, reload the extension in `chrome://extensions`.
