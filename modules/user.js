// modules/user.js
export async function showUserProfile(username, container) {
  container.innerHTML = `<h2>${username}</h2><p>Loading profile...</p>`;
  const profile = { aliases: [], links: [], music: [], github: {} };

  // -----------------------------
  // Fetch GitHub
  // -----------------------------
  try {
    const ghProfile = await fetch(`https://api.github.com/users/${username}`).then(r => r.json());
    if (ghProfile.login) {
      profile.github = {
        username: ghProfile.login,
        bio: ghProfile.bio || "No bio provided",
        public_repos: ghProfile.public_repos || 0,
        followers: ghProfile.followers || 0
      };
      profile.links.push({ name: "GitHub", url: `https://github.com/${username}` });
    }
  } catch {}

  // -----------------------------
  // Detect primary Carrd / About pages
  // (simple heuristic: about{username}.carrd.co or username.carrd.co)
  // -----------------------------
  const carrdUrls = [
    `https://about${username}.carrd.co/`,
    `https://${username}.carrd.co/`
  ];
  for (const url of carrdUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        profile.links.push({ name: "Carrd", url });
      }
    } catch {}
  }

  // -----------------------------
  // Music accounts (dynamic handling)
  // -----------------------------
  // Last.fm usernames can't start with a number -> fix dynamically
  const lastFmUsername = /^[0-9]/.test(username) ? `l${username}` : username;
  const lastFmUrl = `https://www.last.fm/user/${lastFmUsername}`;
  try {
    const res = await fetch(lastFmUrl, { method: "HEAD" });
    if (res.ok) profile.music.push({ platform: "Last.fm", username: lastFmUsername, url: lastFmUrl });
  } catch {}

  // Libre.fm (allows numeric usernames)
  const libreUrl = `https://libre.fm/user/${username}`;
  try {
    const res = await fetch(libreUrl, { method: "HEAD" });
    if (res.ok) profile.music.push({ platform: "Libre.fm", username, url: libreUrl });
  } catch {}

  // -----------------------------
  // Aliases: parse Carrd / About pages for handles
  // -----------------------------
  const aliasCandidates = new Set();
  for (const link of profile.links.filter(l => l.name === "Carrd")) {
    try {
      const html = await fetch(link.url).then(r => r.text());
      const matches = html.match(/\b[a-z0-9]{3,15}\b/gi); // rough alias detection
      if (matches) matches.forEach(a => aliasCandidates.add(a));
    } catch {}
  }
  profile.aliases = [...aliasCandidates];

  // -----------------------------
  // Render dynamically
  // -----------------------------
  container.innerHTML = `<h2>${username}</h2>`;
  if (profile.github.username) {
    container.innerHTML += `
      <h3>GitHub</h3>
      <p><strong>${profile.github.username}</strong> — ${profile.github.bio}</p>
      <p>Repos: ${profile.github.public_repos} | Followers: ${profile.github.followers}</p>
      <p><a href="https://github.com/${profile.github.username}" target="_blank">Visit GitHub</a></p>`;
  }

  if (profile.links.length) {
    container.innerHTML += `<h3>Links</h3><ul>${profile.links.map(l=>`<li><a href="${l.url}" target="_blank">${l.name}</a></li>`).join("")}</ul>`;
  }

  if (profile.music.length) {
    container.innerHTML += `<h3>Music Profiles</h3><ul>${profile.music.map(m=>`<li>${m.platform}: <a href="${m.url}" target="_blank">${m.username}</a></li>`).join("")}</ul>`;
  }

  if (profile.aliases.length) {
    container.innerHTML += `<h3>Aliases (Detected)</h3><p>${profile.aliases.join(", ")}</p>`;
  }

  return profile;
}
