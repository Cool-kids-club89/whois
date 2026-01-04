import { showUserProfile } from './modules/user.js';
import { extractKeywords, scoreSource, displayKeywordConfidence, displaySourceConfidence, applyDecay } from './modules/display.js';
import { detectAliases } from './modules/aliases.js';
import { fetchOrg } from './modules/org.js';  // Import fetchOrg from org.js

const input = document.getElementById("inputSearch");  // Make sure inputSearch is used (matches HTML)
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

window.userKeywordCache = {};
window.userFingerprints = {};
window.sourceConfidence = {};
window.aliasCandidates = new Set();

const corsProxyUrl = 'https://corsproxy.io/?url=';  // CORS proxy service
const htmlDrivenUrl = 'https://html-driven.com/proxy?url=';  // HTMLDriven proxy service

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
  if (profile.github?.organizations?.length) {
    for (const org of profile.github.organizations) {
      await fetchOrgWithDualProxy(org); // Use dual proxy for fetching organization data
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

async function fetchOrgWithDualProxy(orgName) {
  const orgUrl = `https://api.github.com/orgs/${orgName}`;
  const proxyUrlWithCorsProxy = corsProxyUrl + encodeURIComponent(orgUrl);
  const proxyUrlWithHtmlDriven = htmlDrivenUrl + encodeURIComponent(orgUrl);

  try {
    // Try using the primary CORS proxy (corsproxy.io)
    const res = await fetch(proxyUrlWithCorsProxy);
    if (!res.ok) throw new Error("Organization not found (corsproxy.io)");
    const orgData = await res.json();

    result.innerHTML += `<section>
      <h3>Organization Overview</h3>
      <p><strong>Name:</strong> ${orgData.login}</p>
      <p><strong>Description:</strong> ${orgData.description || "No description available"}</p>
      <p><strong>Website:</strong> <a href="${orgData.blog}" target="_blank">${orgData.blog || "No website available"}</a></p>
    </section>`;

    // Fetch members
    const membersRes = await fetch(proxyUrlWithCorsProxy + encodeURIComponent(orgData.members_url.replace('{/member}', '')));
    let members = [];
    if (membersRes.ok) members = await membersRes.json();
    if (members.length) {
      result.innerHTML += `<section>
        <h3>Members</h3>
        <ul>${members.map(m => `<li>${m.login}</li>`).join("")}</ul>
      </section>`;
    }

    // Fetch public repositories
    const reposRes = await fetch(proxyUrlWithCorsProxy + encodeURIComponent(orgData.repos_url));
    let repos = [];
    if (reposRes.ok) repos = await reposRes.json();
    if (repos.length) {
      result.innerHTML += `<section>
        <h3>Repositories</h3>
        <ul>${repos.map(r => `<li><a href="${r.html_url}" target="_blank">${r.name}</a> - ${r.language || "N/A"}</li>`).join("")}</ul>
      </section>`;
    }
  } catch (err) {
    console.warn(`corsproxy.io failed: ${err.message}`);

    // Fallback to HTMLDriven if corsproxy.io fails
    try {
      const res = await fetch(proxyUrlWithHtmlDriven);
      if (!res.ok) throw new Error("Organization not found (html-driven.com)");
      const orgData = await res.json();

      result.innerHTML += `<section>
        <h3>Organization Overview</h3>
        <p><strong>Name:</strong> ${orgData.login}</p>
        <p><strong>Description:</strong> ${orgData.description || "No description available"}</p>
        <p><strong>Website:</strong> <a href="${orgData.blog}" target="_blank">${orgData.blog || "No website available"}</a></p>
      </section>`;

      // Fetch members
      const membersRes = await fetch(proxyUrlWithHtmlDriven + encodeURIComponent(orgData.members_url.replace('{/member}', '')));
      let members = [];
      if (membersRes.ok) members = await membersRes.json();
      if (members.length) {
        result.innerHTML += `<section>
          <h3>Members</h3>
          <ul>${members.map(m => `<li>${m.login}</li>`).join("")}</ul>
        </section>`;
      }

      // Fetch public repositories
      const reposRes = await fetch(proxyUrlWithHtmlDriven + encodeURIComponent(orgData.repos_url));
      let repos = [];
      if (reposRes.ok) repos = await reposRes.json();
      if (repos.length) {
        result.innerHTML += `<section>
          <h3>Repositories</h3>
          <ul>${repos.map(r => `<li><a href="${r.html_url}" target="_blank">${r.name}</a> - ${r.language || "N/A"}</li>`).join("")}</ul>
        </section>`;
      }
    } catch (err) {
      result.innerHTML += `<p>Error fetching organization data: ${err.message}</p>`;
      console.error(err);
    }
  }
}

function resetState() {
  window.userKeywordCache = {};
  window.userFingerprints = {};
  window.sourceConfidence = {};
  window.aliasCandidates.clear();
}
