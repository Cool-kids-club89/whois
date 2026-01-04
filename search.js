import { showUserProfile } from './modules/user.js';
import { extractKeywords, scoreSource, displayKeywordConfidence, displaySourceConfidence, applyDecay } from './modules/display.js';
import { detectAliases } from './modules/aliases.js';
import { fetchOrg } from './modules/org.js';  // Make sure this path is correct

const input = document.getElementById("inputSearch");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

window.userKeywordCache = {};
window.userFingerprints = {};
window.sourceConfidence = {};
window.aliasCandidates = new Set();

btn.onclick = async () => {
  const user = input.value.trim();
  if (!user) return;

  resetState();
  result.innerHTML = `<h2>WHOIS Report: ${user}</h2>`;

  // -------------------------
  // Show user profile
  // -------------------------
  const profile = await showUserProfile(user, result);

  // -------------------------
  // Fetch local individual page (same repo)
  // -------------------------
  try {
    const res = await fetch(`individual/${user}.html`);
    if (res.ok) {
      const html = await res.text();
      result.innerHTML += `<section><h3>Local Individual Page</h3>${html}</section>`;
      extractKeywords(html, user, window.userKeywordCache[user] = {});
      scoreSource("Local Individual Page", window.userKeywordCache[user]);
    }
  } catch (e) {
    console.warn("Individual page fetch failed:", e);
  }

  // -------------------------
  // Fetch GitHub organizations pages (same repo)
  // -------------------------
  if (profile.github?.orgs?.length) {
    for (const org of profile.github.orgs) {
      await fetchOrg(org); // Calling the function from org.js
    }
  }

  // -------------------------
  // Display keyword confidence and source confidence
  // -------------------------
  displayKeywordConfidence(window.userKeywordCache[user]);
  applyDecay();
  displaySourceConfidence();

  // -------------------------
  // Display alias list
  // -------------------------
  detectAliases(user);
  if (window.aliasCandidates.size) {
    result.innerHTML += `<section><h3>Aliases</h3><ul>${[...window.aliasCandidates].map(a => `<li>${a}</li>`).join("")}</ul></section>`;
  }
};

function resetState() {
  window.userKeywordCache = {};
  window.userFingerprints = {};
  window.sourceConfidence = {};
  window.aliasCandidates.clear();
}
