# CODEX_TASKS.md

Task specs for handoff to Codex (or any implementer working outside this conversation).
Each task is self-contained — read it fully before touching code.

---

## TASK-1: Replace extension icon/logo with new hexagon-cube design

**Background:** Tab X currently ships a hand-drawn "X mark in a rounded square" icon set:
`extension/icons/icon.svg` (unused — not referenced by `manifest.json` or `index.html`),
`extension/icons/icon16.png` / `icon48.png` / `icon128.png` (referenced by `manifest.json`'s
`icons` and `action.default_icon` fields — these are the toolbar icon and the icon shown on
`chrome://extensions`), `extension/icons/newtab-favicon.svg` (referenced by `index.html`'s
`<link rel="icon">` — this is the favicon shown on the browser tab when a new tab is open),
and `store-assets/store-icon-128.png` (the Chrome Web Store listing icon; `PUBLISHING.md`
line 32 documents it as "Store icon: 128x128 PNG generated from the Tab X icon style").

All of these need to be replaced with the new logo: a hexagon outline with three colored
corner triangles (red top-left, green top-right, gold bottom) framing a small isometric cube
(red top face, gold left face, green right face) in the center.

The source raster has already been added to the repo at
`extension/icons/source/tabx-logo-source.png` (1000x1000 PNG, RGBA, transparent background).
It does not need to be hand-vectorized — regenerate the required sizes from this PNG.

**Files in scope:**
- `extension/icons/source/tabx-logo-source.png` — already added, read-only source. Do not edit.
- `extension/icons/icon16.png` — regenerate from source, exactly 16x16, preserve aspect ratio, transparent background.
- `extension/icons/icon48.png` — regenerate from source, exactly 48x48.
- `extension/icons/icon128.png` — regenerate from source, exactly 128x128.
- `extension/icons/newtab-favicon.png` — new file, regenerate from source at 64x64 (browser favicons are commonly downscaled further by Chrome; 64x64 gives it room).
- `extension/index.html` (line ~8) — change `<link rel="icon" href="icons/newtab-favicon.svg" type="image/svg+xml">` to point at `icons/newtab-favicon.png` with `type="image/png"`.
- `extension/icons/newtab-favicon.svg` — delete once `index.html` no longer references it.
- `store-assets/store-icon-128.png` — regenerate from source, exactly 128x128, matching the documented convention in `PUBLISHING.md`.
- `extension/manifest.json` — no path/field changes needed; it already points at `icon16.png` / `icon48.png` / `icon128.png` by filename, so just confirm the regenerated files keep those exact filenames.

**Acceptance criteria:**
- `icon16.png`, `icon48.png`, `icon128.png`, `newtab-favicon.png`, and `store-icon-128.png` are all re-encoded PNGs derived from `tabx-logo-source.png`, correctly sized, not stretched/distorted, with transparent backgrounds preserved (no added white/black canvas).
- Loading the unpacked extension in `chrome://extensions` shows the new hexagon-cube logo on the extension's card and (if pinned) in the toolbar.
- Opening a new tab shows the new logo as the browser tab's favicon (not the old dark "X" mark).
- `manifest.json`'s `icons` / `action.default_icon` fields are unchanged (same filenames, still valid).

**Non-goals / red lines:**
- Do not hand-vectorize the new logo into an SVG — PNG output is acceptable everywhere it's used.
- Do not touch `extension/icons/icon.svg` — it's already unused dead weight; leave it alone unless removing it is trivial and you're confident nothing references it (grep first).
- Do not change unrelated `manifest.json` fields (permissions, version, name, etc.).
- Do not touch `store-assets/screenshot-*` files — only the store icon.

**Verification steps:**
- Confirm output dimensions with `identify` (ImageMagick) or `sips -g pixelWidth -g pixelHeight`, e.g. `sips -g pixelWidth -g pixelHeight extension/icons/icon128.png`.
- Grep the repo for `newtab-favicon.svg` and `icon.svg` to confirm no dangling references after the change.
- Load the unpacked extension in Chrome, open a new tab, and visually confirm the favicon and toolbar icon.

**Status:** completed

---

## TASK-2: Add Google-style live search suggestions to the new-tab search box

**Background:** `extension/index.html`'s `#newTabSearchForm` / `#newTabSearchInput` (lines ~26-36)
is currently a plain text input with no live suggestions. `extension/app.js`'s
`searchOrNavigate()` (line ~1448) and the form's submit listener (line ~2247-2251) only fire
on submit, sending the query straight to `chrome.search.query` (or a Google search URL
fallback) or navigating directly if `searchOrUrlTarget()` (line ~1419) detects a URL/domain.

The user wants the same instant autocomplete dropdown you get typing directly into
google.com's search box. Per the user's explicit decision, suggestions come **only** from
Google's public suggestion endpoint — no local history or open-tab matching in this task.
Endpoint: `https://suggestqueries.google.com/complete/search?client=chrome&q=<query>`, which
returns a JSON array shaped like `[query, [suggestion1, suggestion2, ...], [...], [...], {...}]`
— index `1` is the array of suggestion strings.

**Files in scope:**
- `extension/manifest.json` — add a `host_permissions` array containing
  `"https://suggestqueries.google.com/*"` (MV3 requires this for the service worker/page to
  fetch cross-origin without it being blocked).
- `extension/index.html` — add a suggestions container inside `.new-tab-search` (which is
  already `position: relative`, right after the `<input id="newTabSearchInput">`), e.g.:
  `<ul id="newTabSearchSuggestions" class="search-suggestions" role="listbox" aria-label="Search suggestions" hidden></ul>`
- `extension/app.js` — new suggestion-fetch/render/keyboard-nav logic, added near
  `searchOrNavigate()` (~line 1448) and wired into the existing input handling near the form
  submit listener (~line 2247).
- `extension/style.css` — new `.search-suggestions` / `.search-suggestion` /
  `.search-suggestion.is-active` rules near the existing `.new-tab-search` block (~lines
  283-354). Use existing design tokens (`--surface-solid`, `--shadow`, `--hairline`, `--ink`,
  `--quiet`, `--accent-blue`, `--radius`) so light/dark mode work without extra code — do not
  hardcode colors.
- `extension/PRIVACY.md` — add a line disclosing that search-box input is sent to Google's
  suggestion endpoint while typing, since this is a new outbound network call the extension
  did not previously make.

**Acceptance criteria:**
- Typing 2+ non-whitespace characters into `#newTabSearchInput` triggers a debounced
  (~150-200ms) fetch to `https://suggestqueries.google.com/complete/search?client=chrome&q=<encodeURIComponent(query)>`.
- Up to 8 suggestion strings from the response's index `[1]` are rendered as list items in
  `#newTabSearchSuggestions`; the container is `hidden` whenever there are zero suggestions or
  the input is empty.
- Escape hides the dropdown without clearing the input's typed text.
- Blur hides the dropdown (with a short delay, e.g. via `mousedown`-before-`blur` handling, so
  a click on a suggestion still registers before the list disappears).
- ArrowDown/ArrowUp move an "active" highlight (`.is-active`) through the visible suggestions
  without throwing at either boundary (clamping is fine; wrapping is optional).
- Enter with an active suggestion calls `searchOrNavigate(activeSuggestionText)`; Enter with no
  active suggestion preserves current behavior (submits the literal typed text via the
  existing submit handler — do not change that path).
- Clicking a suggestion with the mouse fills the input with that suggestion's text and
  immediately calls `searchOrNavigate(suggestionText)`.
- Fast typing does not flash stale/out-of-order results — guard with an `AbortController` (or
  a request-token check) keyed to the latest input value; superseded requests are aborted or
  their results discarded.
- Network errors, aborts, or offline states fail silently (dropdown stays empty/hidden); no
  uncaught console errors.
- Dropdown visually adapts to dark mode (uses the CSS variables listed above).

**Non-goals / red lines:**
- Do not add local history or open-tab matches to this dropdown — user explicitly chose
  Google-suggestions-only for this task.
- Do not change what happens on submit/Enter/click at the point of navigation — this task only
  adds the suggestion dropdown; final navigation still goes through the existing
  `searchOrNavigate()` / `searchOrUrlTarget()` logic untouched.
- Do not add a user-facing settings toggle to disable suggestions unless it's trivial — out of
  scope for this task.
- Do not touch the favorites/top-sites shelf code (`getTopSites`, `getHistoryTopSites`,
  `renderFavoritesShelf`, etc.) — unrelated feature, same file, do not conflate.

**Verification steps (for whoever implements this):**
- `node --check extension/app.js` (repo has no build/lint pipeline per `AGENTS.md` — this is
  the closest thing to a syntax check available).
- Manual: load unpacked extension, open a new tab, type a query slowly — a dropdown appears
  with live Google suggestions within ~1s; confirm via Chrome DevTools Network tab that
  requests hit `suggestqueries.google.com` and are debounced (not one fetch per keystroke).
- Manual: arrow-key navigation + Enter selects the highlighted suggestion; mouse click also
  works; Escape and blur both dismiss the dropdown correctly.
- Manual: toggle dark mode via the existing footer theme toggle while the dropdown is open —
  confirm colors adapt.

**Status:** completed

---

## TASK-3: Fix search-suggestions dropdown rendering behind later page content

**Background:** After TASK-2, the suggestions dropdown (`#newTabSearchSuggestions` /
`.search-suggestions`, `extension/style.css` lines ~326-345, `z-index: 50`) visually renders
**behind** content that comes later in the DOM: the "Tab X tabs open" dedupe banner
(`.tab-cleanup-banner`, `extension/style.css` lines ~630-644) and the "Top sites" shortcuts
grid (`.favorites-section` inside `.start-section`). User-reported screenshot shows both of
those elements' opaque/blurred boxes painted on top of the suggestion list text (e.g. "helen
of troy" and "hello kitty cafe" get partially covered).

Root cause: `.new-tab-search` (the dropdown's positioned containing block, `extension/style.css`
line ~283) sits inside `header`, and `header` itself has no `position`/`z-index`/`transform`/
`filter`/`backdrop-filter` of its own — so it never establishes a stacking context. Meanwhile,
`.tab-cleanup-banner` (and its siblings `.nudge-banner`, `.update-banner`) and `.active-section`
/ `.deferred-column` all set `backdrop-filter: blur(...)`, which — per the CSS stacking spec —
makes each of them establish its **own** stacking context even though none of them sets an
explicit `position`/`z-index`. With `header` not anchoring its own stacking context, the
dropdown's `z-index: 50` ends up competing unpredictably against these later
backdrop-filter-created contexts instead of cleanly winning, which is why it paints underneath
them. This is the classic "glass-morphism sibling swallows my z-index dropdown" stacking bug —
fixed by giving the dropdown's ancestor an explicit, unambiguous stacking context with a
z-index higher than every sibling section.

**Files in scope:**
- `extension/style.css`:
  - `header` rule (~lines 166-175) — add `position: relative;` and `z-index: 20;` so the
    entire header (including the search box and its dropdown) becomes one explicit, high
    stacking context that unambiguously paints above `.tab-cleanup-banner`, `.nudge-banner`,
    `.update-banner`, `.start-section`/`.favorites-section`, `.active-section`, and
    `.deferred-column` (none of which set an explicit `z-index`, so any positive value on
    `header` wins).
  - `.search-suggestions` rule (~lines 326-341) — keep `z-index: 50` (or any value — it only
    needs to beat other elements *inside* `header`, which it already does), but double-check
    it still renders correctly now that `header` has its own stacking context.
  - Do not change `.toast`'s `z-index: 100` (~line 1634) — the toast notification should still
    be able to render above the search dropdown if both are ever visible at once.

**Acceptance criteria:**
- With the dedupe banner visible (2+ Tab X tabs open) and Top sites populated, typing into the
  search box so the suggestions dropdown opens results in the dropdown rendering fully on top
  of both the dedupe banner and the Top sites row — no suggestion text is obscured, no banner/
  icon bleeds through the dropdown.
- This holds in both light and dark mode.
- No regression: the dedupe banner, Top sites, open tabs list, and toast notifications all
  still render/animate/position exactly as before when the dropdown is closed.

**Non-goals / red lines:**
- Do not restructure the DOM (don't move the dropdown element, don't move the banner/top-sites
  markup) — this is a stacking-context/z-index fix only.
- Do not touch the suggestion-fetching logic in `app.js` from TASK-2 — this is a CSS-only fix.
- Do not remove `backdrop-filter` from `.tab-cleanup-banner`/`.active-section`/`.deferred-column`
  to "solve" this — that would change their visual glass effect; fix it via `header`'s stacking
  context instead.

**Verification steps (for whoever implements this):**
- Manual: load the unpacked extension with 2+ Tab X tabs open (to trigger the dedupe banner)
  and at least a few Top sites shortcuts populated. Click the search box and type 2+ characters
  to open the suggestions dropdown. Confirm the full dropdown is visible and legible, fully on
  top of the banner and Top sites row beneath it.
- Manual: repeat with dark mode toggled on.
- Manual: confirm the dedupe banner's "Close extras" button and Top sites shortcuts are still
  clickable/functional when the dropdown is closed (i.e., the new `z-index` on `header` doesn't
  make it swallow clicks meant for elements below it — `header`'s height is unchanged, so this
  should be a non-issue, but verify).

**Status:** completed

---

## TASK-4: Bump version to 2.0.1 and switch the Chrome Web Store listing copy to Chinese

**Background:** Tab X 2.0.0 is already live on the Chrome Web Store (item ID
`mdpnfjjeclibnejfdcfnbclhdhjannac`, per `PUBLISHING.md`). The user wants to ship 2.0.1 (this
release bundles TASK-1/2/3: new logo, Google search suggestions, and the dropdown z-index fix)
and wants the Chrome Web Store listing's short/detailed descriptions switched from English to
plain, easy-to-understand Chinese. The exact Chinese copy is provided below — copy it verbatim
into `PUBLISHING.md`, do not paraphrase or improve it further (wording was already reviewed).

**Files in scope:**
- `extension/manifest.json` (line 4) — `"version": "2.0.0"` → `"version": "2.0.1"`.
- `AGENTS.md` (line 5) — `Current Tab X version: **2.0.0**.` → `**2.0.1**.`
- `README.md`:
  - line 5 `Current version: **2.0.0**` → `**2.0.1**`
  - line 9 — update the `Version 2.0.0 also refines...` sentence to describe 2.0.1 instead
    (mention: new hexagon-cube logo, live Google search suggestions in the search box). Keep
    the rest of the paragraph as-is.
  - line 17 `Current submitted version: **2.0.0**` → `**2.0.1**` (only update this once the
    Chrome Web Store submission is actually made — if submission hasn't happened yet when this
    task is implemented, leave a `<!-- TODO: confirm after store submission -->` comment instead
    of guessing the date/status).
- `README.zh-CN.md`:
  - line 3 `当前版本：**2.0.0**` → `**2.0.1**`
  - line 7 — update the `2.0.0 进一步优化了...` sentence to describe 2.0.1 (new logo, Google
    搜索联想建议).
  - line 15 `当前提交版本：**2.0.0**` → `**2.0.1**` (same caveat as README.md line 17 above).
- `PUBLISHING.md` — this is the main deliverable of this task:
  - Update `Version: 2.0.0` (line 8) → `Version: 2.0.1`.
  - Update `Upload package: tab-x-2.0.0.zip` (line 34) → `tab-x-2.0.1.zip`.
  - Change the `Store Listing` section's `Language: English` (line 18) → `Language: Chinese
    (Simplified)`.
  - Add two new fields under `Store Listing` — `Short description (zh-CN)` and `Detailed
    description (zh-CN)` — using this exact text (already reviewed by the user, do not edit
    the wording):

    Short description:
    ```
    把杂乱的标签页整理清楚：自动按网站分组、一键关闭重复标签、常用网站一键直达。全部在本地运行，无需登录，也不会上传你的数据。
    ```

    Detailed description:
    ```
    Tab X 是一个新标签页插件，专门解决"标签页开太多，找不到东西"的问题。

    打开新标签页时，你会看到：
    - 所有已打开的标签页，自动按所属网站分组，一眼看清都开了哪些网站，点一下就能跳过去。
    - 重复打开的标签，一键全部关闭，只留一个。
    - 常用网站的图标入口（比如你最常访问的几个网站），点一下直接打开，不用再翻收藏夹。
    - 一个简单的搜索框，输入网址直接打开，输入关键词就用你原本的搜索引擎搜索，还带输入联想建议。
    - "稍后再看"功能：把暂时不想关但也不用马上看的标签存起来，之后随时找回来，看完了可以归档，桌面不会越堆越乱。
    - 自动跟随系统切换深色/浅色模式，晚上用不刺眼。

    Tab X 完全在你自己的电脑本地运行：
    - 不需要注册账号，不需要联网使用。
    - 不会收集、上传或出售你的浏览数据。
    - 保存的标签和收藏只会通过 Chrome 自带的同步功能，在你自己登录的 Chrome 账号内保存，不会经过任何第三方服务器。

    如果你经常同时开几十个标签、找不到自己想要的那个，Tab X 能帮你把它们理清楚。
    ```

  - Leave the rest of `PUBLISHING.md` (Store Assets, Package Notes, Privacy And Permissions,
    GitHub Updates Included sections) untouched — those are separate concerns from this task.

**Acceptance criteria:**
- `grep -rn "2\.0\.0" .` (excluding `.git/`) returns zero matches outside of historical/immutable
  content (there is none — every "2.0.0" reference listed above should become "2.0.1").
- `extension/manifest.json` is still valid JSON after the edit.
- `PUBLISHING.md` clearly shows the new Chinese short/detailed description text, verbatim as
  given above (no re-wording, no added/removed bullet points).
- README.md / README.zh-CN.md still read naturally in context after the version-number and
  one-sentence updates — no leftover references to "2.0.0" anywhere.

**Non-goals / red lines:**
- Do not rebuild or rename the actual `tab-x-*.zip` upload package — that's a separate packaging
  step done right before the real Chrome Web Store upload, not part of this doc/version-bump task.
- Do not actually submit anything to the Chrome Web Store — that happens afterward, separately,
  via the Developer Dashboard.
- Do not touch `extension/icons/`, `extension/app.js`, `extension/style.css`, or any of the
  TASK-1/2/3 functional code — this task is version metadata + store copy only.
- Do not translate or touch the English `README.md` feature list/body beyond the one version
  sentence noted above — the rest of the English copy stays as-is.

**Verification steps:**
- `python3 -c "import json; json.load(open('extension/manifest.json'))"` — must not error.
- `grep -rn "2\.0\.0" --include=*.md --include=*.json .` (excluding `.git/`) — should return
  nothing.
- Manually read the updated `PUBLISHING.md` Store Listing section to confirm the Chinese text
  matches what's specified above exactly.

**Status:** completed
