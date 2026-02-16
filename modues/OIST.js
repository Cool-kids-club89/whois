// OIST.js — Full unified OSINT module
// -------------------------

export function extractKeywords(text, user, store) {
  if (!text) return;
  const blacklist = ["http", "https", "www", user.toLowerCase()];
  text.toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !blacklist.includes(w))
    .forEach(w => store[w] = (store[w] || 0) + 1);
}

export function detectAliases(user) {
  const b = user.toLowerCase();
  [
    b,
    b.replace(/[0-9]/g, ""),
    b.replace(/[aeios]/g, c => ({ a: "4", e: "3", i: "1", o: "0", s: "5" }[c] || c)),
    b + "dev",
    b + "alt",
    "_" + b
  ].forEach(a => window.aliasCandidates.add(a));
}

export function buildFingerprint(user, keywords) {
  window.fingerprintProfile = {
    length: user.length,
    digits: /\d/.test(user),
    symbols: /[_\-]/.test(user),
    entropy: Object.keys(keywords || {}).length,
    sources: Object.keys(window.sourceConfidence || {})
  };
  window.userFingerprints[user] = window.fingerprintProfile;
}

export function displayFingerprint(container = document.getElementById("dynamicProfile")) {
  container.innerHTML += `<section>
    <h3>Passive Fingerprint</h3>
    <pre>${JSON.stringify(window.fingerprintProfile || {}, null, 2)}</pre>
  </section>`;
}

export function inferPersona(keywords, container = document.getElementById("dynamicProfile")) {
  const tags = Object.keys(keywords || {});
  const persona = [];
  if (tags.some(t => ["ambient","idm","electronic"].includes(t))) persona.push("Technical / Abstract Thinker");
  if (tags.some(t => ["metal","noise"].includes(t))) persona.push("High Complexity Tolerance");
  if (tags.some(t => ["pop","charts"].includes(t))) persona.push("Mainstream Leaning");
  if (!persona.length) persona.push("Low Music Signal");

  container.innerHTML += `<section>
    <h3>Persona Inference</h3>
    <ul>${persona.map(p => `<li>${p}</li>`).join("")}</ul>
  </section>`;
}

// -------------------------
// GITHUB PROFILE FETCH
// -------------------------
export async function showUserProfile(user, container = document.getElementById("dynamicProfile")) {
  if (!user) return;
  container.innerHTML += `<h2>${user}</h2><p>Loading GitHub profile...</p>`;

  const keywords = window.userKeywordCache[user] || {};

  try {
    // GitHub user profile
    const profileRes = await fetch(`https://api.github.com/users/${user}`);
    if (!profileRes.ok) throw new Error("GitHub user not found");
    const profile = await profileRes.json();
    extractKeywords(profile.bio || "", user, keywords);

    // Repos
    const reposRes = await fetch(`https://api.github.com/users/${user}/repos`);
    if (reposRes.ok) {
      const repos = await reposRes.json();
      repos.forEach(r => {
        extractKeywords(r.name, user, keywords);
        extractKeywords(r.description, user, keywords);
      });
    }

    // Organizations
    const orgsRes = await fetch(`https://api.github.com/users/${user}/orgs`);
    if (orgsRes.ok) {
      const orgs = await orgsRes.json();
      orgs.forEach(o => extractKeywords(o.login, user, keywords));
    }

    // Render GitHub info
    container.innerHTML += `<h3>GitHub Profile</h3>
      <p>Bio: ${profile.bio || "No bio"}</p>
      <p>Public Repos: ${profile.public_repos}</p>
      <h4>Repositories</h4>
      <ul>${(profile.public_repos ? profile.public_repos : []).map(r => `<li>${r}</li>`).join("")}</ul>`;

    // Merge everything into fingerprint + persona + aliases
    detectAliases(user);
    buildFingerprint(user, keywords);
    inferPersona(keywords, container);
    displayFingerprint(container);

  } catch (err) {
    console.warn("GitHub fetch failed:", err);
  }
}

// -------------------------
// Minimal clustering / graph stubs
// -------------------------
export function clusterUsers() {}
export function displayClusters() {}
export function buildGraph() {}
export function renderGraph() {}
