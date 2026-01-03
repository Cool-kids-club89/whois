const input = document.getElementById("usernameInput");
const result = document.getElementById("result");
const btn = document.getElementById("searchBtn");

// Known users for cross-correlation
const knownUsers = ["4zx16", "7zh14"];
window.userKeywordCache = {}; // cache for correlation

btn.onclick = async () => {
  const user = input.value.trim();
  if (!user) return;

  result.innerHTML = `<h2>WHOIS Report: ${user}</h2>`;
  const userKeywords = {};

  // Local Profile
  await loadLocalProfile(user, userKeywords);

  // GitHub
  await loadGitHub(user, userKeywords);

  // External Sources
  listExternalSources(user, userKeywords);

  // KrySearch OSINT
  await loadKrySearch(user, userKeywords);

  // Display Keyword Confidence
  displayKeywordConfidence(userKeywords);

  // Cache keywords for correlation
  window.userKeywordCache[user] = {...userKeywords};

  // Cross-User Correlation
  displayCrossUserCorrelation(user, userKeywords);
};

/////////////////////////////
// Local Profile
/////////////////////////////
async function loadLocalProfile(user, keywords) {
  try {
    const res = await fetch(`users/${user}.html`);
    if (!res.ok) throw new Error("No local profile found");
    const html = await res.text();
    result.innerHTML += `<section><h3>Local Profile</h3>${html}</section>`;
    extractKeywordsFromText(html, user, keywords);
  } catch {
    result.innerHTML += `<section><h3>Local Profile</h3><p>No local profile available.</p></section>`;
  }
}

/////////////////////////////
// GitHub Info
/////////////////////////////
async function loadGitHub(user, keywords) {
  try {
    const profile = await fetch(`https://api.github.com/users/${user}`).then(r => r.json());
    const repos = await fetch(profile.repos_url).then(r => r.json());
    result.innerHTML += `
      <section>
        <h3>GitHub</h3>
        <p><strong>Username:</strong> ${profile.login}</p>
        <p><strong>Bio:</strong> ${profile.bio || "Not provided"}</p>
        <p><strong>Public Repositories:</strong> ${profile.public_repos}</p>
        <p><strong>Followers:</strong> ${profile.followers}</p>
        <details>
          <summary>Repositories</summary>
          <ul>
            ${repos.map(r=>`<li><a href="${r.html_url}" target="_blank">${r.name}</a> - ${r.description||""}</li>`).join("")}
          </ul>
        </details>
      </section>
    `;
    extractKeywordsFromText(profile.bio||"", user, keywords);
    repos.forEach(r=>extractKeywordsFromText(r.name + " " + (r.description||""), user, keywords));
  } catch {
    result.innerHTML += `<section><h3>GitHub</h3><p>GitHub info unavailable.</p></section>`;
  }
}

/////////////////////////////
// External Sources
/////////////////////////////
function listExternalSources(user, keywords) {
  const sources = [
    `https://about${user}.carrd.co/`,
    `https://degenerates2.carrd.co/#l${user}`,
    `https://vybfnedwm.carrd.co/`,
    `https://4zx16-info.carrd.co/`,
    `https://degenerates.carrd.co/`,
    `https://jameshickers.github.io/About/${user}.html`,
    `https://github.com/${user}`
  ];
  result.innerHTML += `<section><h3>External Sources</h3><ul>${sources.map(url=>`<li><a href="${url}" target="_blank">${url}</a></li>`).join("")}</ul></section>`;
  sources.forEach(url=>extractKeywordsFromText(url, user, keywords));
}

/////////////////////////////
// KrySearch OSINT
/////////////////////////////
async function loadKrySearch(user, keywords) {
  const url = `https://4zx16.github.io/Krynet/KrySearch/Search.html?q=${encodeURIComponent(user)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = [...doc.querySelectorAll("a")].map(a=>a.href).filter(h=>h&&!h.includes("#"));
    const text = doc.body.innerText || "";
    extractKeywordsFromText(text, user, keywords);
    result.innerHTML += `
      <section>
        <h3>OSINT Discovery (KrySearch)</h3>
        <p><strong>Queried Source:</strong> <a href="${url}" target="_blank">${url}</a></p>
        <ul>
          ${links.slice(0,15).map(l=>`<li><a href="${l}" target="_blank">${l}</a></li>`).join("")}
        </ul>
      </section>
    `;
  } catch {
    result.innerHTML += `<section><h3>OSINT Discovery (KrySearch)</h3><p>Unable to retrieve search results.</p></section>`;
  }
}

/////////////////////////////
// Keyword Extraction & Confidence
/////////////////////////////
function extractKeywordsFromText(text, user, keywords) {
  const blacklist = ["the","and","with","from","that",user.toLowerCase()];
  const words = text.toLowerCase().replace(/[^a-z0-9+.#]/g," ").split(/\s+/).filter(w=>w.length>3 && !blacklist.includes(w));
  words.forEach(w => { keywords[w]=(keywords[w]||0)+1; });
}

function displayKeywordConfidence(keywords) {
  const total = Object.values(keywords).reduce((a,b)=>a+b,0);
  const sorted = Object.entries(keywords).sort((a,b)=>b[1]-a[1]);
  result.innerHTML += `<section><h3>Keyword Confidence</h3><ul>${sorted.map(([k,v])=>`<li>${k} — ${(v/total*100).toFixed(1)}%</li>`).join("")}</ul></section>`;
}

/////////////////////////////
// Cross-User Correlation
/////////////////////////////
function displayCrossUserCorrelation(user, keywords) {
  const correlations = [];
  knownUsers.forEach(otherUser => {
    if(otherUser===user) return;
    if(window.userKeywordCache && window.userKeywordCache[otherUser]){
      const otherKeywords = window.userKeywordCache[otherUser];
      Object.keys(keywords).forEach(k=>{ if(otherKeywords[k]) correlations.push({keyword:k,user:otherUser}); });
    }
  });
  if(correlations.length){
    result.innerHTML += `<section><h3>Cross-User Keyword Correlation</h3><ul>${correlations.map(c=>`<li>${c.keyword} — also appears in ${c.user}</li>`).join("")}</ul></section>`;
  }
}
