/* ================================================================
   Tab X — Dashboard App (Pure Extension Edition)

   This file is the brain of the dashboard. Now that the dashboard
   IS the extension page (not inside an iframe), it can call
   chrome.tabs and chrome.storage directly — no postMessage bridge needed.

   What this file does:
   1. Reads open browser tabs directly via chrome.tabs.query()
   2. Groups tabs by domain with a landing pages category
   3. Renders domain cards, banners, and stats
   4. Handles all user actions (close tabs, save for later, focus tab)
   5. Stores "Saved for Later" tabs in chrome.storage.local (no server)
   ================================================================ */

'use strict';


/* ----------------------------------------------------------------
   CHROME TABS — Direct API Access

   Since this page IS the extension's new tab page, it has full
   access to chrome.tabs and chrome.storage. No middleman needed.
   ---------------------------------------------------------------- */

// All open tabs — populated by fetchOpenTabs()
let openTabs = [];
const collapsedDomainIds = new Set();

document.addEventListener('error', event => {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.dataset.hideOnError === 'true') {
    target.hidden = true;
  }
}, true);

/**
 * fetchOpenTabs()
 *
 * Reads all currently open browser tabs directly from Chrome.
 * Sets the extensionId flag so we can identify Tab X's own pages.
 */
async function fetchOpenTabs() {
  try {
    const extensionId = chrome.runtime.id;
    // The new URL for this page is now index.html (not newtab.html)
    const newtabUrl = `chrome-extension://${extensionId}/index.html`;

    const tabs = await chrome.tabs.query({});
    openTabs = tabs.map(t => ({
      id:       t.id,
      url:      t.url,
      title:    t.title,
      windowId: t.windowId,
      active:   t.active,
      // Flag Tab X's own pages so we can detect duplicate new tabs
      isTabOut: t.url === newtabUrl || t.url === 'chrome://newtab/',
    }));
  } catch {
    // chrome.tabs API unavailable (shouldn't happen in an extension page)
    openTabs = [];
  }
}

/**
 * closeTabsByUrls(urls)
 *
 * Closes all open tabs whose hostname matches any of the given URLs.
 * After closing, re-fetches the tab list to keep our state accurate.
 *
 * Special case: file:// URLs are matched exactly (they have no hostname).
 */
async function closeTabsByUrls(urls) {
  if (!urls || urls.length === 0) return;

  // Separate file:// URLs (exact match) from regular URLs (hostname match)
  const targetHostnames = [];
  const exactUrls = new Set();

  for (const u of urls) {
    if (u.startsWith('file://')) {
      exactUrls.add(u);
    } else {
      try { targetHostnames.push(new URL(u).hostname); }
      catch { /* skip unparseable */ }
    }
  }

  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter(tab => {
      const tabUrl = tab.url || '';
      if (tabUrl.startsWith('file://') && exactUrls.has(tabUrl)) return true;
      try {
        const tabHostname = new URL(tabUrl).hostname;
        return tabHostname && targetHostnames.includes(tabHostname);
      } catch { return false; }
    })
    .map(tab => tab.id);

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * closeTabsExact(urls)
 *
 * Closes tabs by exact URL match (not hostname). Used for landing pages
 * so closing "Gmail inbox" doesn't also close individual email threads.
 */
async function closeTabsExact(urls) {
  if (!urls || urls.length === 0) return;
  const urlSet = new Set(urls);
  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs.filter(t => urlSet.has(t.url)).map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * focusTab(url)
 *
 * Switches Chrome to the tab with the given URL (exact match first,
 * then hostname fallback). Also brings the window to the front.
 */
async function focusTab(url) {
  if (!url) return;
  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();

  // Try exact URL match first
  let matches = allTabs.filter(t => t.url === url);

  // Fall back to hostname match
  if (matches.length === 0) {
    try {
      const targetHost = new URL(url).hostname;
      matches = allTabs.filter(t => {
        try { return new URL(t.url).hostname === targetHost; }
        catch { return false; }
      });
    } catch {}
  }

  if (matches.length === 0) return;

  // Prefer a match in a different window so it actually switches windows
  const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];
  await chrome.tabs.update(match.id, { active: true });
  await chrome.windows.update(match.windowId, { focused: true });
}

/**
 * closeDuplicateTabs(urls, keepOne)
 *
 * Closes duplicate tabs for the given list of URLs.
 * keepOne=true → keep one copy of each, close the rest.
 * keepOne=false → close all copies.
 */
async function closeDuplicateTabs(urls, keepOne = true) {
  const allTabs = await chrome.tabs.query({});
  const toClose = [];

  for (const url of urls) {
    const matching = allTabs.filter(t => t.url === url);
    if (keepOne) {
      const keep = matching.find(t => t.active) || matching[0];
      for (const tab of matching) {
        if (tab.id !== keep.id) toClose.push(tab.id);
      }
    } else {
      for (const tab of matching) toClose.push(tab.id);
    }
  }

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * closeTabOutDupes()
 *
 * Closes all duplicate Tab X new-tab pages except the current one.
 */
async function closeTabOutDupes() {
  const extensionId = chrome.runtime.id;
  const newtabUrl = `chrome-extension://${extensionId}/index.html`;

  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();
  const tabOutTabs = allTabs.filter(t =>
    t.url === newtabUrl || t.url === 'chrome://newtab/'
  );

  if (tabOutTabs.length <= 1) return;

  // Keep the active Tab X tab in the CURRENT window — that's the one the
  // user is looking at right now. Falls back to any active one, then the first.
  const keep =
    tabOutTabs.find(t => t.active && t.windowId === currentWindow.id) ||
    tabOutTabs.find(t => t.active) ||
    tabOutTabs[0];
  const toClose = tabOutTabs.filter(t => t.id !== keep.id).map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}


/* ----------------------------------------------------------------
   SAVED FOR LATER — chrome.storage.local

   Replaces the old server-side SQLite + REST API with Chrome's
   built-in key-value storage. Data persists across browser sessions
   and doesn't require a running server.

   Data shape stored under the "deferred" key:
   [
     {
       id: "1712345678901",          // timestamp-based unique ID
       url: "https://example.com",
       title: "Example Page",
       savedAt: "2026-04-04T10:00:00.000Z",  // ISO date string
       completed: false,             // true = checked off (archived)
       dismissed: false              // true = dismissed without reading
     },
     ...
   ]
   ---------------------------------------------------------------- */

/**
 * saveTabForLater(tab)
 *
 * Saves a single tab to the "Saved for Later" list in chrome.storage.local.
 * @param {{ url: string, title: string }} tab
 */
async function saveTabForLater(tab) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  deferred.push({
    id:        Date.now().toString(),
    url:       tab.url,
    title:     tab.title,
    savedAt:   new Date().toISOString(),
    completed: false,
    dismissed: false,
  });
  await chrome.storage.local.set({ deferred });
}

/**
 * getSavedTabs()
 *
 * Returns all saved tabs from chrome.storage.local.
 * Filters out dismissed items (those are gone for good).
 * Splits into active (not completed) and archived (completed).
 */
async function getSavedTabs() {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const visible = deferred.filter(t => !t.dismissed);
  return {
    active:   visible.filter(t => !t.completed),
    archived: visible.filter(t => t.completed),
  };
}

/**
 * checkOffSavedTab(id)
 *
 * Marks a saved tab as completed (checked off). It moves to the archive.
 */
async function checkOffSavedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id);
  if (tab) {
    tab.completed = true;
    tab.completedAt = new Date().toISOString();
    await chrome.storage.local.set({ deferred });
  }
}

/**
 * dismissSavedTab(id)
 *
 * Marks a saved tab as dismissed (removed from all lists).
 */
async function dismissSavedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id);
  if (tab) {
    tab.dismissed = true;
    await chrome.storage.local.set({ deferred });
  }
}


/* ----------------------------------------------------------------
   UI HELPERS
   ---------------------------------------------------------------- */

/**
 * playCloseSound()
 *
 * Plays a clean "swoosh" sound when tabs are closed.
 * Built entirely with the Web Audio API — no sound files needed.
 * A filtered noise sweep that descends in pitch, like air moving.
 */
function playCloseSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // Swoosh: shaped white noise through a sweeping bandpass filter
    const duration = 0.25;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with a natural envelope (quick attack, smooth decay)
    for (let i = 0; i < data.length; i++) {
      const pos = i / data.length;
      // Envelope: ramps up fast in first 10%, then fades out smoothly
      const env = pos < 0.1 ? pos / 0.1 : Math.pow(1 - (pos - 0.1) / 0.9, 1.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter sweeps from high to low — creates the "swoosh" character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration);

    // Volume
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not supported — fail silently
  }
}

/**
 * shootConfetti(x, y)
 *
 * Shoots a burst of colorful confetti particles from the given screen
 * coordinates (typically the center of a card being closed).
 * Pure CSS + JS, no libraries.
 */
function shootConfetti(x, y) {
  const colors = [
    '#c8713a', // amber
    '#e8a070', // amber light
    '#5a7a62', // sage
    '#8aaa92', // sage light
    '#5a6b7a', // slate
    '#8a9baa', // slate light
    '#d4b896', // warm paper
    '#b35a5a', // rose
  ];

  const particleCount = 17;

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement('div');

    const isCircle = Math.random() > 0.5;
    const size = 5 + Math.random() * 6; // 5–11px
    const color = colors[Math.floor(Math.random() * colors.length)];

    el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${isCircle ? '50%' : '2px'};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      opacity: 1;
    `;
    document.body.appendChild(el);

    // Physics: random angle and speed for the outward burst
    const angle   = Math.random() * Math.PI * 2;
    const speed   = 60 + Math.random() * 120;
    const vx      = Math.cos(angle) * speed;
    const vy      = Math.sin(angle) * speed - 80; // bias upward
    const gravity = 200;

    const startTime = performance.now();
    const duration  = 700 + Math.random() * 200; // 700–900ms

    function frame(now) {
      const elapsed  = (now - startTime) / 1000;
      const progress = elapsed / (duration / 1000);

      if (progress >= 1) { el.remove(); return; }

      const px = vx * elapsed;
      const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;
      const opacity = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;
      const rotate  = elapsed * 200 * (isCircle ? 0 : 1);

      el.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${rotate}deg)`;
      el.style.opacity = opacity;

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }
}

/**
 * animateCardOut(card)
 *
 * Smoothly removes a mission card: fade + scale down, then confetti.
 * After the animation, checks if the grid is now empty.
 */
function animateCardOut(card) {
  if (!card) return;

  const rect = card.getBoundingClientRect();
  shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);

  card.classList.add('closing');
  setTimeout(() => {
    card.remove();
    checkAndShowEmptyState();
  }, 300);
}

function refreshDomainCardAfterChipRemoval(card) {
  if (!card) return;

  const remainingChips = card.querySelectorAll('.page-chip[data-action="focus-tab"]:not(.closing-tab)').length;
  if (remainingChips === 0) {
    animateCardOut(card);
    return;
  }

  const countPill = card.querySelector('.mission-count-pill');
  if (countPill) countPill.textContent = remainingChips;

  const groupCloseButton = card.querySelector('.actions .close-tabs');
  if (groupCloseButton) {
    if (remainingChips > 1) {
      groupCloseButton.style.display = '';
    } else {
      groupCloseButton.style.opacity = '0';
      groupCloseButton.style.pointerEvents = 'none';
      setTimeout(() => groupCloseButton.remove(), 180);
    }
  }
}

function animateChipOut(chip, afterRemove) {
  if (!chip) {
    afterRemove?.();
    return;
  }

  const rect = chip.getBoundingClientRect();
  shootConfetti(rect.right - 38, rect.top + rect.height / 2);
  chip.classList.add('closing-tab');

  setTimeout(() => {
    chip.remove();
    afterRemove?.();
  }, 260);
}

/**
 * showToast(message)
 *
 * Brief pop-up notification at the bottom of the screen.
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

function updateOpenTabsSectionSummary(tabCount, domainCount) {
  const countEl = document.getElementById('openTabsSectionCount');
  if (!countEl) return;

  const tabLabel = `${tabCount} tab${tabCount !== 1 ? 's' : ''}`;
  const domainLabel = `${domainCount} domain${domainCount !== 1 ? 's' : ''}`;
  const closeButton = tabCount > 0
    ? ` &nbsp;&middot;&nbsp; <button class="action-btn close-tabs" data-action="close-all-open-tabs" style="font-size:11px;padding:3px 10px;">Close All</button>`
    : '';

  countEl.innerHTML = `${tabLabel} &nbsp;&middot;&nbsp; ${domainLabel}${closeButton}`;
}

/**
 * checkAndShowEmptyState()
 *
 * Shows a cheerful "Inbox zero" message when all domain cards are gone.
 */
function checkAndShowEmptyState() {
  const missionsEl = document.getElementById('openTabsMissions');
  if (!missionsEl) return;

  const remaining = missionsEl.querySelectorAll('.mission-card:not(.closing)').length;
  if (remaining > 0) return;

  missionsEl.innerHTML = `
    <div class="missions-empty-state">
      <div class="empty-checkmark">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div class="empty-title">Inbox zero, but for tabs.</div>
      <div class="empty-subtitle">You're free.</div>
    </div>
  `;

  const countEl = document.getElementById('openTabsSectionCount');
  if (countEl) updateOpenTabsSectionSummary(0, 0);
}

/**
 * timeAgo(dateStr)
 *
 * Converts an ISO date string into a human-friendly relative time.
 * "2026-04-04T10:00:00Z" → "2 hrs ago" or "yesterday"
 */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const then = new Date(dateStr);
  const now  = new Date();
  const diffMins  = Math.floor((now - then) / 60000);
  const diffHours = Math.floor((now - then) / 3600000);
  const diffDays  = Math.floor((now - then) / 86400000);

  if (diffMins < 1)   return 'just now';
  if (diffMins < 60)  return diffMins + ' min ago';
  if (diffHours < 24) return diffHours + ' hr' + (diffHours !== 1 ? 's' : '') + ' ago';
  if (diffDays === 1) return 'yesterday';
  return diffDays + ' days ago';
}

const GZ_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const GZ_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const GZ_STEM_ELEMENTS = ["wood", "wood", "fire", "fire", "earth", "earth", "metal", "metal", "water", "water"];
const GZ_BRANCH_ELEMENTS = ["water", "earth", "wood", "wood", "earth", "fire", "fire", "earth", "metal", "metal", "earth", "water"];
const GZ_TERM_NAMES = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑",
  "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];
const GZ_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551,
  218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447,
  419210, 440795, 462224, 483532, 504758,
];
const GZ_MONTH_BRANCH_BY_TERM = new Map([
  [2, 2], [4, 3], [6, 4], [8, 5], [10, 6], [12, 7],
  [14, 8], [16, 9], [18, 10], [20, 11], [22, 0], [0, 1],
]);
const GZ_DAY_MS = 24 * 60 * 60 * 1000;
const GZ_DEG_TO_RAD = Math.PI / 180;

function gzWrap(value, size) {
  return ((value % size) + size) % size;
}

function gzNormalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function gzAngleDifference(value, target) {
  return ((gzNormalizeDegrees(value) - gzNormalizeDegrees(target) + 540) % 360) - 180;
}

function gzDeltaTSeconds(date) {
  const year = date.getUTCFullYear() + (date.getUTCMonth() + 0.5) / 12;
  if (year >= 2005 && year < 2050) {
    const offset = year - 2000;
    return 62.92 + 0.32217 * offset + 0.005589 * offset * offset;
  }
  if (year >= 2050 && year < 2150) {
    const offset = (year - 1820) / 100;
    return -20 + 32 * offset * offset - 0.5628 * (2150 - year);
  }
  return 62.92;
}

function gzSolarLongitude(date) {
  const julianDayUtc = date.getTime() / GZ_DAY_MS + 2440587.5;
  const julianDayTt = julianDayUtc + gzDeltaTSeconds(date) / 86400;
  const centuries = (julianDayTt - 2451545) / 36525;
  const meanLongitude = gzNormalizeDegrees(
    280.46646 + 36000.76983 * centuries + 0.0003032 * centuries * centuries,
  );
  const meanAnomaly = gzNormalizeDegrees(
    357.52911 + 35999.05029 * centuries - 0.0001537 * centuries * centuries,
  );
  const anomalyRadians = meanAnomaly * GZ_DEG_TO_RAD;
  const equationOfCenter =
    (1.914602 - 0.004817 * centuries - 0.000014 * centuries * centuries) * Math.sin(anomalyRadians) +
    (0.019993 - 0.000101 * centuries) * Math.sin(2 * anomalyRadians) +
    0.000289 * Math.sin(3 * anomalyRadians);
  const omega = (125.04 - 1934.136 * centuries) * GZ_DEG_TO_RAD;

  return gzNormalizeDegrees(meanLongitude + equationOfCenter - 0.00569 - 0.00478 * Math.sin(omega));
}

function gzTermTargetLongitude(termIndex) {
  return gzNormalizeDegrees(285 + termIndex * 15);
}

function gzRoughTermDate(year, termIndex) {
  const base = Date.UTC(1900, 0, 6, 2, 5);
  return new Date(base + 31556925974.7 * (year - 1900) + GZ_TERM_INFO[termIndex] * 60000);
}

function gzTermDate(year, termIndex) {
  const center = gzRoughTermDate(year, termIndex).getTime();
  const targetLongitude = gzTermTargetLongitude(termIndex);
  let start = center - 3 * GZ_DAY_MS;
  let end = center + 3 * GZ_DAY_MS;
  let startDiff = gzAngleDifference(gzSolarLongitude(new Date(start)), targetLongitude);
  let endDiff = gzAngleDifference(gzSolarLongitude(new Date(end)), targetLongitude);
  let attempts = 0;

  while (startDiff > 0 && attempts < 10) {
    end = start;
    start -= GZ_DAY_MS;
    startDiff = gzAngleDifference(gzSolarLongitude(new Date(start)), targetLongitude);
    attempts += 1;
  }

  attempts = 0;
  while (endDiff < 0 && attempts < 10) {
    start = end;
    end += GZ_DAY_MS;
    endDiff = gzAngleDifference(gzSolarLongitude(new Date(end)), targetLongitude);
    attempts += 1;
  }

  if (startDiff > 0 || endDiff < 0) return new Date(center);

  for (let index = 0; index < 48; index += 1) {
    const midpoint = (start + end) / 2;
    const diff = gzAngleDifference(gzSolarLongitude(new Date(midpoint)), targetLongitude);
    if (diff < 0) start = midpoint;
    else end = midpoint;
  }

  return new Date((start + end) / 2);
}

function gzSignificantTermsAround(year) {
  const terms = [];
  for (const candidateYear of [year - 1, year, year + 1]) {
    for (const termIndex of GZ_MONTH_BRANCH_BY_TERM.keys()) {
      terms.push({
        date: gzTermDate(candidateYear, termIndex),
        index: termIndex,
        name: GZ_TERM_NAMES[termIndex],
        branchIndex: GZ_MONTH_BRANCH_BY_TERM.get(termIndex),
      });
    }
  }
  return terms.sort((a, b) => a.date - b.date);
}

function gzAllTermsAround(year) {
  const terms = [];
  for (const candidateYear of [year - 1, year, year + 1]) {
    for (let index = 0; index < GZ_TERM_NAMES.length; index += 1) {
      terms.push({ date: gzTermDate(candidateYear, index), index, name: GZ_TERM_NAMES[index] });
    }
  }
  return terms.sort((a, b) => a.date - b.date);
}

function gzGregorianJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) -
    Math.floor(y / 100) + Math.floor(y / 400) - 32045
  );
}

function gzPillars(now) {
  const liChun = gzTermDate(now.getFullYear(), 2);
  const ganzhiYear = now >= liChun ? now.getFullYear() : now.getFullYear() - 1;
  const year = {
    stemIndex: gzWrap(ganzhiYear - 4, 10),
    branchIndex: gzWrap(ganzhiYear - 4, 12),
  };
  const monthTerm = gzSignificantTermsAround(now.getFullYear()).filter(term => term.date <= now).at(-1);
  const monthBranch = monthTerm.branchIndex;
  const firstMonthStem = gzWrap((year.stemIndex % 5) * 2 + 2, 10);
  const month = {
    term: monthTerm,
    stemIndex: gzWrap(firstMonthStem + gzWrap(monthBranch - 2, 12), 10),
    branchIndex: monthBranch,
  };
  const dayIndex = gzWrap(gzGregorianJdn(now.getFullYear(), now.getMonth() + 1, now.getDate()) + 49, 60);
  const day = {
    stemIndex: dayIndex % 10,
    branchIndex: dayIndex % 12,
  };
  const hourBranch = Math.floor((now.getHours() + 1) / 2) % 12;
  const hour = {
    stemIndex: gzWrap((day.stemIndex % 5) * 2 + hourBranch, 10),
    branchIndex: hourBranch,
  };

  return { year, month, day, hour };
}

function gzTermMeta(now, month) {
  const nextTerm = gzAllTermsAround(now.getFullYear()).find(term => term.date > now);
  const formatTermDate = date => new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${month.term.name} ${formatTermDate(month.term.date)} · ${GZ_BRANCHES[month.branchIndex]}月 · ${nextTerm.name} ${formatTermDate(nextTerm.date)}`;
}

function renderGanzhiHeader() {
  const now = new Date();
  const pillars = gzPillars(now);
  const parts = [
    ["年", pillars.year],
    ["月", pillars.month],
    ["日", pillars.day],
    ["时", pillars.hour],
  ];

  return {
    html: parts.map(([suffix, pillar]) => {
      const stemElement = GZ_STEM_ELEMENTS[pillar.stemIndex];
      const branchElement = GZ_BRANCH_ELEMENTS[pillar.branchIndex];
      return `<span class="ganzhi-unit"><span class="ganzhi-char element-${stemElement}">${GZ_STEMS[pillar.stemIndex]}</span><span class="ganzhi-char element-${branchElement}">${GZ_BRANCHES[pillar.branchIndex]}</span><span class="ganzhi-suffix">${suffix}</span></span>`;
    }).join(""),
    meta: gzTermMeta(now, pillars.month),
  };
}

function updateGanzhiHeader() {
  const greetingEl = document.getElementById('greeting');
  const dateEl = document.getElementById('dateDisplay');
  const ganzhiHeader = renderGanzhiHeader();
  if (greetingEl) greetingEl.innerHTML = ganzhiHeader.html;
  if (dateEl) dateEl.textContent = ganzhiHeader.meta;
}

const WORD_CLOCK_NUMBERS = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "eleven",
  12: "twelve",
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
  19: "nineteen",
  20: "twenty",
  21: "twenty-one",
  22: "twenty-two",
  23: "twenty-three",
  24: "twenty-four",
  25: "twenty-five",
  26: "twenty-six",
  27: "twenty-seven",
  28: "twenty-eight",
  29: "twenty-nine",
};

function wordClockHour(hour24) {
  const hour = hour24 % 12;
  return hour === 0 ? 12 : hour;
}

function wordClockMinuteUnit(value) {
  return value === 1 ? "minute" : "minutes";
}

function wordClockParts(date = new Date()) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const currentHour = WORD_CLOCK_NUMBERS[wordClockHour(hour)];
  const nextHour = WORD_CLOCK_NUMBERS[wordClockHour(hour + 1)];

  if (minute === 0) {
    return [
      { text: currentHour, strong: true },
      { text: "o'clock" },
    ];
  }
  if (minute === 15) {
    return [
      { text: "quarter", strong: true },
      { text: "past" },
      { text: currentHour, strong: true },
    ];
  }
  if (minute === 30) {
    return [
      { text: "half", strong: true },
      { text: "past" },
      { text: currentHour, strong: true },
    ];
  }
  if (minute === 45) {
    return [
      { text: "quarter", strong: true },
      { text: "to" },
      { text: nextHour, strong: true },
    ];
  }
  if (minute < 30) {
    return [
      { text: WORD_CLOCK_NUMBERS[minute], strong: true },
      { text: wordClockMinuteUnit(minute) },
      { text: "past" },
      { text: currentHour, strong: true },
    ];
  }

  const minutesToNextHour = 60 - minute;
  return [
    { text: WORD_CLOCK_NUMBERS[minutesToNextHour], strong: true },
    { text: wordClockMinuteUnit(minutesToNextHour) },
    { text: "to" },
    { text: nextHour, strong: true },
  ];
}

function updateWordClockFooter() {
  const el = document.getElementById('wordClockFooter');
  if (!el) return;

  const date = new Date();
  const wordTime = wordClockParts(date).map(part => {
    const classes = ['word-clock-word'];
    if (part.strong) classes.push('word-clock-strong');
    return `<span class="${classes.join(' ')}">${part.text}</span>`;
  }).join(' ');

  const digitalTime = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const digitalDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

  el.innerHTML = `
    <div class="word-clock-text">${wordTime}</div>
    <div class="digital-clock-text">${digitalDate} ${digitalTime}</div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function searchOrUrlTarget(rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return '';

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;

  const hasSpaces = /\s/.test(value);
  const looksLikeLocalhost = /^localhost(?::\d+)?(?:\/.*)?$/i.test(value);
  const looksLikeIp = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(value);
  const looksLikeDomain = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/.*)?$/i.test(value);

  if (!hasSpaces && (looksLikeLocalhost || looksLikeIp)) return `http://${value}`;
  if (!hasSpaces && looksLikeDomain) return `https://${value}`;

  return '';
}

async function navigateCurrentTab(url) {
  if (!url) return;
  try {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab && currentTab.id) {
      await chrome.tabs.update(currentTab.id, { url });
      return;
    }
  } catch {}
  window.location.href = url;
}

async function searchOrNavigate(rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return;

  const targetUrl = searchOrUrlTarget(value);
  if (targetUrl) {
    await navigateCurrentTab(targetUrl);
    return;
  }

  try {
    if (chrome.search && chrome.search.query) {
      await chrome.search.query({ text: value, disposition: 'CURRENT_TAB' });
      return;
    }
  } catch {}

  await navigateCurrentTab(`https://www.google.com/search?q=${encodeURIComponent(value)}`);
}

async function getTopSites(limit = 10) {
  if (!chrome.topSites || !chrome.topSites.get) return [];

  try {
    const { hiddenTopSiteUrls = [] } = await chrome.storage.local.get('hiddenTopSiteUrls');
    const hidden = new Set(hiddenTopSiteUrls);
    const sites = await chrome.topSites.get();
    return sites
      .filter(site => site && site.url && !hidden.has(site.url))
      .slice(0, limit)
      .map(site => ({
        title: site.title || site.url,
        url: site.url,
        source: 'top-site',
      }));
  } catch (err) {
    console.warn('[tab-x] Could not load top sites:', err);
    return [];
  }
}

async function getHistoryTopSites(limit = 10) {
  if (!chrome.history || !chrome.history.search) return [];

  try {
    const { hiddenTopSiteUrls = [] } = await chrome.storage.local.get('hiddenTopSiteUrls');
    const hidden = new Set(hiddenTopSiteUrls);
    const since = Date.now() - 1000 * 60 * 60 * 24 * 120;
    const historyItems = await chrome.history.search({
      text: '',
      startTime: since,
      maxResults: 200,
    });
    const byHost = new Map();

    for (const item of historyItems) {
      if (!item.url || hidden.has(item.url)) continue;
      let parsed;
      try { parsed = new URL(item.url); } catch { continue; }
      if (!/^https?:$/.test(parsed.protocol)) continue;

      const host = parsed.hostname.replace(/^www\./, '');
      const existing = byHost.get(host);
      const score = (item.visitCount || 0) * 10000000000000 + (item.lastVisitTime || 0);

      if (!existing || score > existing.score) {
        byHost.set(host, {
          title: item.title || friendlyDomain(parsed.hostname) || host,
          url: item.url,
          source: 'history',
          score,
        });
      }
    }

    return Array.from(byHost.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ title, url, source }) => ({ title, url, source }));
  } catch (err) {
    console.warn('[tab-x] Could not load history shortcuts:', err);
    return [];
  }
}

async function getLocalFavorites() {
  try {
    const { favoriteLinks = [] } = await chrome.storage.local.get('favoriteLinks');
    return favoriteLinks
      .filter(item => item && item.url)
      .map(item => ({ ...item, source: 'local' }));
  } catch {
    return [];
  }
}

async function saveLocalFavorite(favorite) {
  const { favoriteLinks = [] } = await chrome.storage.local.get('favoriteLinks');
  const withoutDupe = favoriteLinks.filter(item => item.url !== favorite.url);
  withoutDupe.push({
    id: Date.now().toString(),
    title: favorite.title,
    url: favorite.url,
    savedAt: new Date().toISOString(),
  });
  await chrome.storage.local.set({ favoriteLinks: withoutDupe });
}

async function removeFavorite(url, source) {
  if (!url) return;

  const { favoriteLinks = [], hiddenTopSiteUrls = [] } = await chrome.storage.local.get([
    'favoriteLinks',
    'hiddenTopSiteUrls',
  ]);

  if (source === 'local') {
    await chrome.storage.local.set({
      favoriteLinks: favoriteLinks.filter(item => item.url !== url),
    });
    showToast('Shortcut removed');
    return;
  }

  await chrome.storage.local.set({
    hiddenTopSiteUrls: Array.from(new Set([...hiddenTopSiteUrls, url])),
  });
  showToast('Shortcut hidden');
}

function normalizeBookmarkUrl(rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return '';

  const targetUrl = searchOrUrlTarget(value);
  if (targetUrl) return targetUrl;

  return '';
}

async function addFavoriteBookmark() {
  const rawUrl = window.prompt('Add a favorite URL');
  const url = normalizeBookmarkUrl(rawUrl);
  if (!url) {
    if (rawUrl !== null) showToast('Enter a valid URL');
    return;
  }

  let defaultTitle = url;
  try {
    defaultTitle = friendlyDomain(new URL(url).hostname) || new URL(url).hostname;
  } catch {}

  const title = (window.prompt('Name this favorite', defaultTitle) || defaultTitle).trim();

  try {
    await saveLocalFavorite({ title, url });
    await renderFavoritesShelf();
    showToast('Shortcut added');
  } catch (err) {
    console.warn('[tab-x] Could not add shortcut:', err);
    showToast('Could not add shortcut');
  }
}

async function addFavoriteFromDraggedTab(tab) {
  if (!tab || !tab.url) return;

  const title = (tab.title || tab.url).trim();
  try {
    await saveLocalFavorite({ title, url: tab.url });
    await renderFavoritesShelf();
    showToast('Shortcut added');
  } catch (err) {
    console.warn('[tab-x] Could not add dragged shortcut:', err);
    showToast('Could not add shortcut');
  }
}

async function renderFavoritesShelf() {
  const section = document.getElementById('favoritesSection');
  const linksEl = document.getElementById('favoriteLinks');
  const countEl = document.getElementById('favoritesCount');
  if (!section || !linksEl) return;

  try {
    const topSites = await getTopSites();
    const historyTopSites = topSites.length > 0 ? [] : await getHistoryTopSites();
    const localFavorites = await getLocalFavorites();
    const seen = new Set();
    const favorites = [...localFavorites, ...topSites, ...historyTopSites].filter(favorite => {
      if (seen.has(favorite.url)) return false;
      seen.add(favorite.url);
      return true;
    });

    const favoriteLinks = favorites.map(favorite => {
      let domain = '';
      try { domain = new URL(favorite.url).hostname; } catch {}
      const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
      const safeUrl = escapeHtml(favorite.url);
      const safeTitle = escapeHtml(favorite.title);
      const safeSource = escapeHtml(favorite.source || 'top-site');

      return `
        <div class="favorite-link favorite-item" role="link" tabindex="0" data-action="open-favorite" data-url="${safeUrl}" data-source="${safeSource}" title="${safeTitle}">
          ${faviconUrl ? `<img class="favorite-favicon" src="${faviconUrl}" alt="" data-hide-on-error="true">` : ''}
          <span class="favorite-title">${safeTitle}</span>
          <button class="favorite-remove" type="button" data-action="remove-favorite" data-url="${safeUrl}" data-source="${safeSource}" title="Remove shortcut">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>`;
    }).join('');

    linksEl.innerHTML = `${favoriteLinks}
      <button class="favorite-link favorite-add" type="button" data-action="add-favorite" title="Add favorite">
        <span class="favorite-plus" aria-hidden="true">+</span>
        <span class="favorite-title">Add</span>
      </button>`;

    if (countEl) countEl.textContent = favorites.length ? `${favorites.length} shortcuts` : 'Add a shortcut';
    section.style.display = 'block';
  } catch (err) {
    console.warn('[tab-x] Could not load shortcuts:', err);
    linksEl.innerHTML = `
      <button class="favorite-link favorite-add" type="button" data-action="add-favorite" title="Add favorite">
        <span class="favorite-plus" aria-hidden="true">+</span>
        <span class="favorite-title">Add</span>
      </button>`;
    if (countEl) countEl.textContent = 'Add a shortcut';
    section.style.display = 'block';
  }
}


/* ----------------------------------------------------------------
   DOMAIN & TITLE CLEANUP HELPERS
   ---------------------------------------------------------------- */

// Map of known hostnames → friendly display names.
const FRIENDLY_DOMAINS = {
  'github.com':           'GitHub',
  'www.github.com':       'GitHub',
  'gist.github.com':      'GitHub Gist',
  'youtube.com':          'YouTube',
  'www.youtube.com':      'YouTube',
  'music.youtube.com':    'YouTube Music',
  'x.com':                'X',
  'www.x.com':            'X',
  'twitter.com':          'X',
  'www.twitter.com':      'X',
  'reddit.com':           'Reddit',
  'www.reddit.com':       'Reddit',
  'old.reddit.com':       'Reddit',
  'substack.com':         'Substack',
  'www.substack.com':     'Substack',
  'medium.com':           'Medium',
  'www.medium.com':       'Medium',
  'linkedin.com':         'LinkedIn',
  'www.linkedin.com':     'LinkedIn',
  'stackoverflow.com':    'Stack Overflow',
  'www.stackoverflow.com':'Stack Overflow',
  'news.ycombinator.com': 'Hacker News',
  'google.com':           'Google',
  'www.google.com':       'Google',
  'mail.google.com':      'Gmail',
  'docs.google.com':      'Google Docs',
  'drive.google.com':     'Google Drive',
  'calendar.google.com':  'Google Calendar',
  'meet.google.com':      'Google Meet',
  'gemini.google.com':    'Gemini',
  'chatgpt.com':          'ChatGPT',
  'www.chatgpt.com':      'ChatGPT',
  'chat.openai.com':      'ChatGPT',
  'claude.ai':            'Claude',
  'www.claude.ai':        'Claude',
  'code.claude.com':      'Claude Code',
  'notion.so':            'Notion',
  'www.notion.so':        'Notion',
  'figma.com':            'Figma',
  'www.figma.com':        'Figma',
  'slack.com':            'Slack',
  'app.slack.com':        'Slack',
  'discord.com':          'Discord',
  'www.discord.com':      'Discord',
  'wikipedia.org':        'Wikipedia',
  'en.wikipedia.org':     'Wikipedia',
  'amazon.com':           'Amazon',
  'www.amazon.com':       'Amazon',
  'netflix.com':          'Netflix',
  'www.netflix.com':      'Netflix',
  'spotify.com':          'Spotify',
  'open.spotify.com':     'Spotify',
  'vercel.com':           'Vercel',
  'www.vercel.com':       'Vercel',
  'npmjs.com':            'npm',
  'www.npmjs.com':        'npm',
  'developer.mozilla.org':'MDN',
  'arxiv.org':            'arXiv',
  'www.arxiv.org':        'arXiv',
  'huggingface.co':       'Hugging Face',
  'www.huggingface.co':   'Hugging Face',
  'producthunt.com':      'Product Hunt',
  'www.producthunt.com':  'Product Hunt',
  'xiaohongshu.com':      'RedNote',
  'www.xiaohongshu.com':  'RedNote',
  'local-files':          'Local Files',
};

function friendlyDomain(hostname) {
  if (!hostname) return '';
  if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];

  if (hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
    return capitalize(hostname.replace('.substack.com', '')) + "'s Substack";
  }
  if (hostname.endsWith('.github.io')) {
    return capitalize(hostname.replace('.github.io', '')) + ' (GitHub Pages)';
  }

  let clean = hostname
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|us|uk|co\.uk|co\.jp)$/, '');

  return clean.split('.').map(part => capitalize(part)).join(' ');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stripTitleNoise(title) {
  if (!title) return '';
  // Strip leading notification count: "(2) Title"
  title = title.replace(/^\(\d+\+?\)\s*/, '');
  // Strip inline counts like "Inbox (16,359)"
  title = title.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');
  // Strip email addresses (privacy + cleaner display)
  title = title.replace(/\s*[\-\u2010-\u2015]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  title = title.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  // Clean X/Twitter format
  title = title.replace(/\s+on X:\s*/, ': ');
  title = title.replace(/\s*\/\s*X\s*$/, '');
  return title.trim();
}

function cleanTitle(title, hostname) {
  if (!title || !hostname) return title || '';

  const friendly = friendlyDomain(hostname);
  const domain   = hostname.replace(/^www\./, '');
  const seps     = [' - ', ' | ', ' — ', ' · ', ' – '];

  for (const sep of seps) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;
    const suffix     = title.slice(idx + sep.length).trim();
    const suffixLow  = suffix.toLowerCase();
    if (
      suffixLow === domain.toLowerCase() ||
      suffixLow === friendly.toLowerCase() ||
      suffixLow === domain.replace(/\.\w+$/, '').toLowerCase() ||
      domain.toLowerCase().includes(suffixLow) ||
      friendly.toLowerCase().includes(suffixLow)
    ) {
      const cleaned = title.slice(0, idx).trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return title;
}

function smartTitle(title, url) {
  if (!url) return title || '';
  let pathname = '', hostname = '';
  try { const u = new URL(url); pathname = u.pathname; hostname = u.hostname; }
  catch { return title || ''; }

  const titleIsUrl = !title || title === url || title.startsWith(hostname) || title.startsWith('http');

  if ((hostname === 'x.com' || hostname === 'twitter.com' || hostname === 'www.x.com') && pathname.includes('/status/')) {
    const username = pathname.split('/')[1];
    if (username) return titleIsUrl ? `Post by @${username}` : title;
  }

  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo, ...rest] = parts;
      if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
      if (rest[0] === 'pull'   && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
      if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
      if (titleIsUrl) return `${owner}/${repo}`;
    }
  }

  if ((hostname === 'www.youtube.com' || hostname === 'youtube.com') && pathname === '/watch') {
    if (titleIsUrl) return 'YouTube Video';
  }

  if ((hostname === 'www.reddit.com' || hostname === 'reddit.com' || hostname === 'old.reddit.com') && pathname.includes('/comments/')) {
    const parts  = pathname.split('/').filter(Boolean);
    const subIdx = parts.indexOf('r');
    if (subIdx !== -1 && parts[subIdx + 1]) {
      if (titleIsUrl) return `r/${parts[subIdx + 1]} post`;
    }
  }

  return title || url;
}


/* ----------------------------------------------------------------
   SVG ICON STRINGS
   ---------------------------------------------------------------- */
const ICONS = {
  tabs:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8.25V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v2.25m-18 0h18" /></svg>`,
  close:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`,
  archive: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>`,
  focus:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" /></svg>`,
};


/* ----------------------------------------------------------------
   IN-MEMORY STORE FOR OPEN-TAB GROUPS
   ---------------------------------------------------------------- */
let domainGroups = [];


/* ----------------------------------------------------------------
   HELPER: filter out browser-internal pages
   ---------------------------------------------------------------- */

/**
 * getRealTabs()
 *
 * Returns tabs that are real web pages — no chrome://, extension
 * pages, about:blank, etc.
 */
function getRealTabs() {
  return openTabs.filter(t => {
    const url = t.url || '';
    return (
      !url.startsWith('chrome://') &&
      !url.startsWith('chrome-extension://') &&
      !url.startsWith('about:') &&
      !url.startsWith('edge://') &&
      !url.startsWith('brave://')
    );
  });
}

/**
 * checkTabOutDupes()
 *
 * Counts how many Tab X pages are open. If more than 1,
 * shows a banner offering to close the extras.
 */
function checkTabOutDupes() {
  const tabOutTabs = openTabs.filter(t => t.isTabOut);
  const banner  = document.getElementById('tabOutDupeBanner');
  const countEl = document.getElementById('tabOutDupeCount');
  if (!banner) return;

  if (tabOutTabs.length > 1) {
    if (countEl) countEl.textContent = tabOutTabs.length;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}


/* ----------------------------------------------------------------
   OVERFLOW CHIPS ("+N more" expand button in domain cards)
   ---------------------------------------------------------------- */

function buildOverflowChips(hiddenTabs, urlCounts = {}) {
  const hiddenChips = hiddenTabs.map(tab => {
    const label    = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
    const count    = urlCounts[tab.url] || 1;
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
      const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
      const safeTitle = label.replace(/"/g, '&quot;');
      let domain = '';
      try { domain = new URL(tab.url).hostname; } catch {}
      const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : '';
    return `<div class="page-chip clickable${chipClass}" draggable="true" data-action="focus-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" data-hide-on-error="true">` : ''}
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Save for later">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="Close this tab">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hiddenChips}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">+${hiddenTabs.length} more</span>
    </div>`;
}


/* ----------------------------------------------------------------
   DOMAIN CARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderDomainCard(group, groupIndex)
 *
 * Builds the HTML for one domain group card.
 * group = { domain: string, tabs: [{ url, title, id, windowId, active }] }
 */
function renderDomainCard(group) {
  const tabs      = group.tabs || [];
  const tabCount  = tabs.length;
  const stableId  = 'domain-' + group.domain.replace(/[^a-z0-9]/g, '-');
  const isCollapsed = collapsedDomainIds.has(stableId);
  const groupTitle = group.label || group.domain.replace(/^www\./, '');
  let groupFaviconHost = '';
  if (!group.label) groupFaviconHost = group.domain;
  const groupFaviconUrl = groupFaviconHost
    ? `https://www.google.com/s2/favicons?domain=${groupFaviconHost}&sz=32`
    : '';

  // Count duplicates (exact URL match)
  const urlCounts = {};
  for (const tab of tabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;
  const dupeUrls   = Object.entries(urlCounts).filter(([, c]) => c > 1);
  const hasDupes   = dupeUrls.length > 0;
  const totalExtras = dupeUrls.reduce((s, [, c]) => s + c - 1, 0);

  const dupeBadge = hasDupes
    ? `<span class="mission-dupe-pill">
        ${totalExtras} duplicate${totalExtras !== 1 ? 's' : ''}
      </span>`
    : '';

  // Deduplicate for display: show each URL once, with (Nx) badge if duped
  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const visibleTabs = uniqueTabs.slice(0, 8);
  const extraCount  = uniqueTabs.length - visibleTabs.length;

  const pageChips = visibleTabs.map(tab => {
    let label = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), group.domain);
    // For localhost tabs, prepend port number so you can tell projects apart
    try {
      const parsed = new URL(tab.url);
      if (parsed.hostname === 'localhost' && parsed.port) label = `${parsed.port} ${label}`;
    } catch {}
    const count    = urlCounts[tab.url];
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
    const safeTitle = label.replace(/"/g, '&quot;');
    let domain = '';
    try { domain = new URL(tab.url).hostname; } catch {}
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : '';
    return `<div class="page-chip clickable${chipClass}" draggable="true" data-action="focus-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" data-hide-on-error="true">` : ''}
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Save for later">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="Close this tab">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(uniqueTabs.slice(8), urlCounts) : '');

  let actionsHtml = tabCount > 1 ? `
    <button class="action-btn close-tabs" data-action="close-domain-tabs" data-domain-id="${stableId}" title="Close all tabs in this group">
      Close All
    </button>` : '';

  if (hasDupes) {
    const dupeUrlsEncoded = dupeUrls.map(([url]) => encodeURIComponent(url)).join(',');
    actionsHtml += `
      <button class="action-btn" data-action="dedup-keep-one" data-dupe-urls="${dupeUrlsEncoded}">
        Close duplicate${totalExtras !== 1 ? 's' : ''}
      </button>`;
  }

  return `
    <div class="mission-card domain-card ${hasDupes ? 'has-amber-bar' : 'has-neutral-bar'} ${isCollapsed ? 'is-collapsed' : ''}" data-domain-id="${stableId}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top" data-action="toggle-domain" data-domain-id="${stableId}" title="${isCollapsed ? 'Expand group' : 'Collapse group'}">
          <button class="mission-chevron" type="button" data-action="toggle-domain" data-domain-id="${stableId}" aria-expanded="${isCollapsed ? 'false' : 'true'}" title="${isCollapsed ? 'Expand group' : 'Collapse group'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 9 3.75 3.75L15.75 9" /></svg>
          </button>
          ${groupFaviconUrl ? `<img class="mission-domain-favicon" src="${groupFaviconUrl}" alt="" data-hide-on-error="true">` : ''}
          <span class="mission-name">${groupTitle}</span>
          <span class="mission-count-pill">${tabCount}</span>
          ${dupeBadge}
        </div>
        <div class="mission-pages">${pageChips}</div>
        <div class="actions">${actionsHtml}</div>
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">tabs</div>
      </div>
    </div>`;
}


/* ----------------------------------------------------------------
   SAVED FOR LATER — Render Checklist Column
   ---------------------------------------------------------------- */

/**
 * renderDeferredColumn()
 *
 * Reads saved tabs from chrome.storage.local and renders the right-side
 * "Saved for Later" checklist column. Archived items stay in storage but
 * are intentionally not shown in the compact side panel.
 */
async function renderDeferredColumn() {
  const column         = document.getElementById('deferredColumn');
  const dashboard      = document.getElementById('dashboardColumns');
  const list           = document.getElementById('deferredList');
  const empty          = document.getElementById('deferredEmpty');
  const countEl        = document.getElementById('deferredCount');

  if (!column) return;

  try {
    const { active } = await getSavedTabs();

    // Hide the entire column if there's nothing to show
    if (active.length === 0) {
      column.style.display = 'none';
      dashboard?.classList.remove('saved-only');
      return;
    }

    column.style.display = 'block';
    dashboard?.classList.toggle('saved-only', domainGroups.length === 0);

    // Render active checklist items
    if (active.length > 0) {
      countEl.textContent = `${active.length} item${active.length !== 1 ? 's' : ''}`;
      list.innerHTML = active.map(item => renderDeferredItem(item)).join('');
      list.style.display = '';
      empty.style.display = 'none';
    } else {
      list.style.display = 'none';
      countEl.textContent = '';
      empty.style.display = 'block';
    }

  } catch (err) {
    console.warn('[tab-x] Could not load saved tabs:', err);
    column.style.display = 'none';
    dashboard?.classList.remove('saved-only');
  }
}

/**
 * renderDeferredItem(item)
 *
 * Builds HTML for one active checklist item: checkbox, title link,
 * domain, time ago, dismiss button.
 */
function renderDeferredItem(item) {
  let domain = '';
  try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  const ago = timeAgo(item.savedAt);

  return `
    <div class="deferred-item" data-deferred-id="${item.id}">
      <input type="checkbox" class="deferred-checkbox" data-action="check-deferred" data-deferred-id="${item.id}">
      <div class="deferred-info">
        <a href="${item.url}" target="_blank" rel="noopener" class="deferred-title" title="${(item.title || '').replace(/"/g, '&quot;')}">
          <img class="deferred-favicon" src="${faviconUrl}" alt="" data-hide-on-error="true">${item.title || item.url}
        </a>
        <div class="deferred-meta">
          <span>${domain}</span>
          <span>${ago}</span>
        </div>
      </div>
      <button class="deferred-dismiss" data-action="dismiss-deferred" data-deferred-id="${item.id}" title="Dismiss">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>`;
}


/* ----------------------------------------------------------------
   MAIN DASHBOARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderStaticDashboard()
 *
 * The main render function:
 * 1. Paints Ganzhi clock + solar-term metadata
 * 2. Fetches open tabs via chrome.tabs.query()
 * 3. Groups tabs by main domain
 * 4. Renders domain cards
 * 5. Updates header stats
 * 6. Renders the "Saved for Later" checklist
 */
async function renderStaticDashboard() {
  // --- Header ---
  updateGanzhiHeader();

  // --- Search + top sites ---
  await renderFavoritesShelf();

  // --- Fetch tabs ---
  await fetchOpenTabs();
  const realTabs = getRealTabs();

  // --- Group tabs by main domain ---
  domainGroups = [];
  const groupMap = {};

  // Custom group rules from config.local.js (if any)
  const customGroups = typeof LOCAL_CUSTOM_GROUPS !== 'undefined' ? LOCAL_CUSTOM_GROUPS : [];

  // Check if a URL matches a custom group rule; returns the rule or null
  function matchCustomGroup(url) {
    try {
      const parsed = new URL(url);
      return customGroups.find(r => {
        const hostMatch = r.hostname
          ? parsed.hostname === r.hostname
          : r.hostnameEndsWith
            ? parsed.hostname.endsWith(r.hostnameEndsWith)
            : false;
        if (!hostMatch) return false;
        if (r.pathPrefix) return parsed.pathname.startsWith(r.pathPrefix);
        return true; // hostname matched, no path filter
      }) || null;
    } catch { return null; }
  }

  function mainDomainFromParsedUrl(parsed) {
    const hostname = parsed.hostname.replace(/^www\./, '');
    if (!hostname) return '';
    if (hostname === 'localhost') {
      return parsed.port ? `${hostname}:${parsed.port}` : hostname;
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname;

    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;

    const twoPartSuffixes = new Set([
      'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
      'com.cn', 'net.cn', 'org.cn', 'gov.cn',
      'com.au', 'net.au', 'org.au',
      'co.jp', 'ne.jp', 'or.jp',
      'co.kr', 'or.kr',
      'com.br', 'com.mx', 'com.tr',
      'co.nz',
    ]);
    const suffix = parts.slice(-2).join('.');
    return twoPartSuffixes.has(suffix)
      ? parts.slice(-3).join('.')
      : parts.slice(-2).join('.');
  }

  function domainKeyFromTabUrl(url) {
    if (!url) return '';
    if (url.startsWith('file://')) return 'local-files';
    return mainDomainFromParsedUrl(new URL(url));
  }

  for (const tab of realTabs) {
    try {
      // Check custom group rules first (e.g. merge subdomains, split by path)
      const customRule = matchCustomGroup(tab.url);
      if (customRule) {
        const key = customRule.groupKey;
        if (!groupMap[key]) groupMap[key] = { domain: key, label: customRule.groupLabel, tabs: [] };
        groupMap[key].tabs.push(tab);
        continue;
      }

      let hostname;
      hostname = domainKeyFromTabUrl(tab.url);
      if (!hostname) continue;

      if (!groupMap[hostname]) groupMap[hostname] = { domain: hostname, tabs: [] };
      groupMap[hostname].tabs.push(tab);
    } catch {
      // Skip malformed URLs
    }
  }

  // Sort domains by tab count, then alphabetically for stable ordering.
  domainGroups = Object.values(groupMap).sort((a, b) => {
    const countDiff = b.tabs.length - a.tabs.length;
    if (countDiff !== 0) return countDiff;
    return (a.label || a.domain).localeCompare(b.label || b.domain);
  });

  // --- Render domain cards ---
  const openTabsSection      = document.getElementById('openTabsSection');
  const openTabsMissionsEl   = document.getElementById('openTabsMissions');
  const openTabsSectionTitle = document.getElementById('openTabsSectionTitle');

  if (domainGroups.length > 0 && openTabsSection) {
    if (openTabsSectionTitle) openTabsSectionTitle.textContent = 'Open tabs';
    updateOpenTabsSectionSummary(realTabs.length, domainGroups.length);
    openTabsMissionsEl.innerHTML = domainGroups.map(g => renderDomainCard(g)).join('');
    openTabsSection.style.display = 'block';
  } else if (openTabsSection) {
    openTabsSection.style.display = 'none';
  }

  // --- Check for duplicate Tab X tabs ---
  checkTabOutDupes();

  // --- Render "Saved for Later" column ---
  await renderDeferredColumn();
}

async function renderDashboard() {
  await renderStaticDashboard();
}


document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'newTabSearchForm') return;
  e.preventDefault();

  const input = document.getElementById('newTabSearchInput');
  await searchOrNavigate(input ? input.value : '');
});


/* ----------------------------------------------------------------
   EVENT HANDLERS — using event delegation

   One listener on document handles ALL button clicks.
   Think of it as one security guard watching the whole building
   instead of one per door.
   ---------------------------------------------------------------- */

document.addEventListener('click', async (e) => {
  // Walk up the DOM to find the nearest element with data-action
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  // ---- Close duplicate Tab X tabs ----
  if (action === 'close-tabout-dupes') {
    await closeTabOutDupes();
    playCloseSound();
    const banner = document.getElementById('tabOutDupeBanner');
    if (banner) {
      banner.style.transition = 'opacity 0.4s';
      banner.style.opacity = '0';
      setTimeout(() => { banner.style.display = 'none'; banner.style.opacity = '1'; }, 400);
    }
    showToast('Closed extra Tab X tabs');
    return;
  }

  // ---- Open a favorite shortcut in the current new tab ----
  if (action === 'open-favorite') {
    e.preventDefault();
    const url = actionEl.dataset.url || actionEl.getAttribute('href');
    if (url) await navigateCurrentTab(url);
    return;
  }

  // ---- Remove or hide a favorite shortcut ----
  if (action === 'remove-favorite') {
    e.preventDefault();
    e.stopPropagation();
    await removeFavorite(actionEl.dataset.url, actionEl.dataset.source);
    await renderFavoritesShelf();
    return;
  }

  // ---- Add a new favorite shortcut ----
  if (action === 'add-favorite') {
    await addFavoriteBookmark();
    return;
  }

  const card = actionEl.closest('.mission-card');

  // ---- Collapse / expand a domain group ----
  if (action === 'toggle-domain') {
    e.stopPropagation();
    const domainId = actionEl.dataset.domainId;
    if (!domainId || !card) return;

    const shouldCollapse = !card.classList.contains('is-collapsed');
    card.classList.toggle('is-collapsed', shouldCollapse);

    const title = shouldCollapse ? 'Expand group' : 'Collapse group';
    actionEl.title = title;
    const topRow = card.querySelector('.mission-top');
    if (topRow) topRow.title = title;
    const toggleButton = card.querySelector('.mission-chevron');
    if (toggleButton) {
      toggleButton.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
      toggleButton.title = title;
    }

    if (shouldCollapse) {
      collapsedDomainIds.add(domainId);
    } else {
      collapsedDomainIds.delete(domainId);
    }
    return;
  }

  // ---- Expand overflow chips ("+N more") ----
  if (action === 'expand-chips') {
    const overflowContainer = actionEl.parentElement.querySelector('.page-chips-overflow');
    if (overflowContainer) {
      overflowContainer.style.display = 'contents';
      actionEl.remove();
    }
    return;
  }

  // ---- Focus a specific tab ----
  if (action === 'focus-tab') {
    const tabUrl = actionEl.dataset.tabUrl;
    if (tabUrl) await focusTab(tabUrl);
    return;
  }

  // ---- Close a single tab ----
  if (action === 'close-single-tab') {
    e.stopPropagation(); // don't trigger parent chip's focus-tab
    const tabUrl = actionEl.dataset.tabUrl;
    if (!tabUrl) return;

    // Close the tab in Chrome directly
    const allTabs = await chrome.tabs.query({});
    const match   = allTabs.find(t => t.url === tabUrl);
    if (match) await chrome.tabs.remove(match.id);
    await fetchOpenTabs();

    playCloseSound();

    // Animate the chip row out
    const chip = actionEl.closest('.page-chip');
    animateChipOut(chip, () => {
      refreshDomainCardAfterChipRemoval(card);
      updateOpenTabsSectionSummary(getRealTabs().length, document.querySelectorAll('#openTabsMissions .mission-card:not(.closing)').length);
    });

    showToast('Tab closed');
    return;
  }

  // ---- Save a single tab for later (then close it) ----
  if (action === 'defer-single-tab') {
    e.stopPropagation();
    const tabUrl   = actionEl.dataset.tabUrl;
    const tabTitle = actionEl.dataset.tabTitle || tabUrl;
    if (!tabUrl) return;

    // Save to chrome.storage.local
    try {
      await saveTabForLater({ url: tabUrl, title: tabTitle });
    } catch (err) {
      console.error('[tab-x] Failed to save tab:', err);
      showToast('Failed to save tab');
      return;
    }

    // Close the tab in Chrome
    const allTabs = await chrome.tabs.query({});
    const match   = allTabs.find(t => t.url === tabUrl);
    if (match) await chrome.tabs.remove(match.id);
    await fetchOpenTabs();

    // Animate chip out
    const chip = actionEl.closest('.page-chip');
    animateChipOut(chip, () => {
      refreshDomainCardAfterChipRemoval(card);
      updateOpenTabsSectionSummary(getRealTabs().length, document.querySelectorAll('#openTabsMissions .mission-card:not(.closing)').length);
    });

    showToast('Saved for later');
    await renderDeferredColumn();
    return;
  }

  // ---- Check off a saved tab (moves it to archive) ----
  if (action === 'check-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await checkOffSavedTab(id);

    // Animate: strikethrough first, then slide out
    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('checked');
      setTimeout(() => {
        item.classList.add('removing');
        setTimeout(() => {
          item.remove();
          renderDeferredColumn(); // refresh counts and archive
        }, 300);
      }, 800);
    }
    return;
  }

  // ---- Dismiss a saved tab (removes it entirely) ----
  if (action === 'dismiss-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await dismissSavedTab(id);

    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => {
        item.remove();
        renderDeferredColumn();
      }, 300);
    }
    return;
  }

  // ---- Close all tabs in a domain group ----
  if (action === 'close-domain-tabs') {
    const domainId = actionEl.dataset.domainId;
    const group    = domainGroups.find(g => {
      return 'domain-' + g.domain.replace(/[^a-z0-9]/g, '-') === domainId;
    });
    if (!group) return;

    const urls      = group.tabs.map(t => t.url);
    // Custom groups whose domain key isn't a real hostname must use exact URL
    // matching to avoid closing unrelated tabs.
    const useExact = !!group.label;

    if (useExact) {
      await closeTabsExact(urls);
    } else {
      await closeTabsByUrls(urls);
    }

    if (card) {
      playCloseSound();
      animateCardOut(card);
    }

    // Remove from in-memory groups
    const idx = domainGroups.indexOf(group);
    if (idx !== -1) domainGroups.splice(idx, 1);

    const groupLabel = group.label || friendlyDomain(group.domain);
    showToast(`Closed ${urls.length} tab${urls.length !== 1 ? 's' : ''} from ${groupLabel}`);

    updateOpenTabsSectionSummary(getRealTabs().length, domainGroups.length);
    return;
  }

  // ---- Close duplicates, keep one copy ----
  if (action === 'dedup-keep-one') {
    const urlsEncoded = actionEl.dataset.dupeUrls || '';
    const urls = urlsEncoded.split(',').map(u => decodeURIComponent(u)).filter(Boolean);
    if (urls.length === 0) return;

    await closeDuplicateTabs(urls, true);
    playCloseSound();

    // Hide the dedup button
    actionEl.style.transition = 'opacity 0.2s';
    actionEl.style.opacity    = '0';
    setTimeout(() => actionEl.remove(), 200);

    // Remove dupe badges from the card
    if (card) {
      card.querySelectorAll('.chip-dupe-badge').forEach(b => {
        b.style.transition = 'opacity 0.2s';
        b.style.opacity    = '0';
        setTimeout(() => b.remove(), 200);
      });
      card.querySelectorAll('.open-tabs-badge').forEach(badge => {
        if (badge.textContent.includes('duplicate')) {
          badge.style.transition = 'opacity 0.2s';
          badge.style.opacity    = '0';
          setTimeout(() => badge.remove(), 200);
        }
      });
      card.classList.remove('has-amber-bar');
      card.classList.add('has-neutral-bar');
    }

    showToast('Closed duplicates, kept one copy each');
    return;
  }

  // ---- Close ALL open tabs ----
  if (action === 'close-all-open-tabs') {
    const allUrls = openTabs
      .filter(t => t.url && !t.url.startsWith('chrome') && !t.url.startsWith('about:'))
      .map(t => t.url);
    await closeTabsByUrls(allUrls);
    playCloseSound();
    domainGroups = [];
    updateOpenTabsSectionSummary(getRealTabs().length, 0);

    document.querySelectorAll('#openTabsMissions .mission-card').forEach(c => {
      shootConfetti(
        c.getBoundingClientRect().left + c.offsetWidth / 2,
        c.getBoundingClientRect().top  + c.offsetHeight / 2
      );
      animateCardOut(c);
    });

    showToast('All tabs closed. Fresh start.');
    return;
  }
});

document.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const shortcut = e.target.closest('.favorite-item[data-action="open-favorite"]');
  if (!shortcut) return;

  e.preventDefault();
  const url = shortcut.dataset.url;
  if (url) await navigateCurrentTab(url);
});

document.addEventListener('dragstart', (e) => {
  const chip = e.target.closest('.page-chip[data-tab-url]');
  if (!chip || e.target.closest('button')) return;

  const payload = {
    url: chip.dataset.tabUrl,
    title: chip.dataset.tabTitle || chip.textContent.trim() || chip.dataset.tabUrl,
  };
  if (!payload.url) return;

  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('application/x-tabx-tab', JSON.stringify(payload));
  e.dataTransfer.setData('text/uri-list', payload.url);
  e.dataTransfer.setData('text/plain', payload.url);
  chip.classList.add('dragging');
});

document.addEventListener('dragend', (e) => {
  e.target.closest('.page-chip')?.classList.remove('dragging');
  document.getElementById('favoritesSection')?.classList.remove('drag-over');
});

document.addEventListener('dragover', (e) => {
  const section = e.target.closest('#favoritesSection');
  const types = Array.from(e.dataTransfer?.types || []);
  if (!section || !types.includes('application/x-tabx-tab')) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  section.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
  const section = e.target.closest('#favoritesSection');
  if (!section || (e.relatedTarget instanceof Node && section.contains(e.relatedTarget))) return;
  section.classList.remove('drag-over');
});

document.addEventListener('drop', async (e) => {
  const section = e.target.closest('#favoritesSection');
  if (!section) return;

  const raw = e.dataTransfer.getData('application/x-tabx-tab');
  if (!raw) return;

  e.preventDefault();
  section.classList.remove('drag-over');

  try {
    await addFavoriteFromDraggedTab(JSON.parse(raw));
  } catch {
    showToast('Could not add shortcut');
  }
});

/* ----------------------------------------------------------------
   INITIALIZE
   ---------------------------------------------------------------- */
renderDashboard();
updateWordClockFooter();
setInterval(updateGanzhiHeader, 60000);
setInterval(updateWordClockFooter, 1000);
