"use strict";

// Max matches stored per page.
const MAX_MATCHES_PER_PAGE = 5;
const STORAGE_KEY = "cfMatches";

// In-memory mirror of persisted store: { [pageUrl]: [{ resourceUrl, resourcePattern, time }] }
let store = {};

// Current top-level page URL per tab (for badge + match attribution).
const pageUrlByTab = {};

// --- persistence -----------------------------------------------------------

function loadStore() {
  chrome.storage.local.get(STORAGE_KEY, function (data) {
    store = (data && data[STORAGE_KEY]) || {};
    refreshAllBadges();
  });
}

function persist() {
  chrome.storage.local.set({ [STORAGE_KEY]: store });
}

loadStore();

// --- CloudFront policy decoding --------------------------------------------

/**
 * Decode a CloudFront-encoded base64 string.
 * CloudFront replaces URL-unsafe characters in the standard base64 alphabet:
 *   '+' -> '-', '=' -> '_', '/' -> '~'
 */
function decodeCloudFrontBase64(value) {
  const standard = value.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
  return atob(standard);
}

/**
 * Return the decoded CloudFront custom policy object, or null.
 * A custom-policy signed URL carries Policy + Signature + Key-Pair-Id.
 */
function extractPolicy(parsedUrl) {
  const params = parsedUrl.searchParams;
  const policyParam = params.get("Policy");
  if (!policyParam) return null;
  if (!params.get("Signature")) return null;
  if (!params.get("Key-Pair-Id")) return null;

  try {
    return JSON.parse(decodeCloudFrontBase64(policyParam));
  } catch (e) {
    return null;
  }
}

/** Return the first wildcard-containing Resource pattern, or null. */
function findWildcardResource(policy) {
  if (!policy || !Array.isArray(policy.Statement)) return null;
  for (const stmt of policy.Statement) {
    const resource = stmt && stmt.Resource;
    if (typeof resource === "string" && resource.indexOf("*") !== -1) {
      return resource;
    }
  }
  return null;
}

// --- store mutations -------------------------------------------------------

function recordMatch(tabId, resourceUrl, resourcePattern) {
  const pageUrl = pageUrlByTab[tabId];
  if (!pageUrl) return;

  const items = store[pageUrl] || (store[pageUrl] = []);
  if (items.length >= MAX_MATCHES_PER_PAGE) return;
  if (items.some((it) => it.resourceUrl === resourceUrl)) return;

  items.push({ resourceUrl: resourceUrl, resourcePattern: resourcePattern, time: Date.now() });
  persist();
  updateBadge(tabId);
}

// --- badge -----------------------------------------------------------------

function updateBadge(tabId) {
  const pageUrl = pageUrlByTab[tabId];
  const count = pageUrl && store[pageUrl] ? store[pageUrl].length : 0;
  chrome.browserAction.setBadgeText({ tabId: tabId, text: count > 0 ? String(count) : "" });
  chrome.browserAction.setBadgeBackgroundColor({ tabId: tabId, color: "#1a73e8" });
}

function refreshAllBadges() {
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(function (tab) {
      if (tab.url) pageUrlByTab[tab.id] = tab.url;
      updateBadge(tab.id);
    });
  });
}

// --- request monitoring ----------------------------------------------------

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    const tabId = details.tabId;
    if (tabId < 0) return;

    // Track top-level navigation as the current page. Data is NOT cleared:
    // previously-seen pages stay in the store across navigation / tab changes.
    if (details.type === "main_frame") {
      pageUrlByTab[tabId] = details.url;
      updateBadge(tabId);
    }

    let parsed;
    try {
      parsed = new URL(details.url);
    } catch (e) {
      return;
    }

    if (!parsed.searchParams.has("Policy")) return;

    const policy = extractPolicy(parsed);
    if (!policy) return;

    const wildcardResource = findWildcardResource(policy);
    if (!wildcardResource) return;

    recordMatch(tabId, details.url, wildcardResource);
  },
  { urls: ["<all_urls>"] }
);

// Keep current-page tracking accurate on SPA / history navigation and tab focus.
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.url) {
    pageUrlByTab[tabId] = changeInfo.url;
    updateBadge(tabId);
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete pageUrlByTab[tabId];
});

// --- popup messaging -------------------------------------------------------

function buildGroups() {
  return Object.keys(store)
    .filter((pageUrl) => store[pageUrl].length > 0)
    .map((pageUrl) => ({ pageUrl: pageUrl, items: store[pageUrl] }));
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;

  if (msg.type === "getMatches") {
    sendResponse({ groups: buildGroups() });
    return;
  }

  if (msg.type === "clearAll") {
    store = {};
    persist();
    refreshAllBadges();
    sendResponse({ groups: [] });
    return;
  }

  if (msg.type === "deleteOne") {
    const items = store[msg.pageUrl];
    if (items) {
      const idx = items.findIndex((it) => it.resourceUrl === msg.resourceUrl);
      if (idx !== -1) items.splice(idx, 1);
      if (items.length === 0) delete store[msg.pageUrl];
      persist();
      refreshAllBadges();
    }
    sendResponse({ groups: buildGroups() });
    return;
  }
});
