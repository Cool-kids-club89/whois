// modules/user.js
export async function showUserProfile(username, container) {
  container.innerHTML = `<h2>${username}</h2><p>Loading profile...</p>`;
  const profile = { aliases: [], links: [], music: [], github: {}, pronouns: null, image: null, banner: null, badges: [], email: null, organizations: [] };

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
        followers: ghProfile.followers || 0,
        avatar_url: ghProfile.avatar_url,
        banner_url: ghProfile.banner_url,
        email: ghProfile.email || "No public email available",
        organizations_url: ghProfile.organizations_url
      };
      profile.links.push({ name: "GitHub", url: `https://github.com/${username}` });

      // -----------------------------
      // Fetch and add user's organizations
      // -----------------------------
      try {
        const orgs = await fetch(ghProfile.organizations_url).then(res => res.json());
        if (orgs.length) {
          profile.organizations = orgs.map(org => org.login);
        }
      } catch {}

      // Attempt to detect pronouns from GitHub bio
      const pronounMatch = ghProfile.bio?.match(/\b(he\/him|she\/her|they\/them|any pronouns)\b/i);
      if (pronounMatch) profile.pronouns = pronounMatch[0];

      // -----------------------------
      // Fetch README.md content if available
      // -----------------------------
      const readmeUrl = `https://raw.githubusercontent.com/${username}/${username}/main/README.md`; // Default for user's repo
      try {
        const readmeRes = await fetch(readmeUrl);
        if (readmeRes.ok) {
          const readmeContent = await readmeRes.text();
          profile.readme = readmeContent;
        }
      } catch {}

      // GitHub Badges (contribution status, etc.)
      const badgesRes = await fetch(`https://github-readme-stats.vercel.app/api?username=${username}&show_icons=true&hide_title=true&hide_border=true&count_private=true&include_all_commits=true&hide=prs`);
      profile.badges.push(badgesRes.url); // Adds a dynamic badge URL
    }
  } catch {}

  // -----------------------------
  // Detect primary Carrd / About pages
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

        // Try to extract pronouns from Carrd
        const html = await res.text();
        const pronounMatch = html.match(/\b(he\/him|she\/her|they\/them|any pronouns)\b/i);
        if (pronounMatch) profile.pronouns = pronounMatch[0];

        // Extract aliases
        const matches = html.match(/\b[a-z0-9]{3,15}\b/gi);
        if (matches) matches.forEach(a => profile.aliases.push(a));
      }
    } catch {}
  }

  // -----------------------------
  // Music accounts (dynamic handling)
  // -----------------------------
  const lastFmUsername = /^[0-9]/.test(username) ? `l${username}` : username;
  const lastFmUrl = `https://www.last.fm/user/${lastFmUsername}`;
  try {
    const res = await fetch(lastFmUrl, { method: "HEAD" });
    if (res.ok) profile.music.push({ platform: "Last.fm", username: lastFmUsername, url: lastFmUrl });
  } catch {}
  const libreUrl = `https://libre.fm/user/${username}`;
  try {
    const res = await fetch(libreUrl, { method: "HEAD" });
    if (res.ok) profile.music.push({ platform: "Libre.fm", username, url: libreUrl });
  } catch {}

  // -----------------------------
  // Render dynamically
  // -----------------------------
  container.innerHTML = `<h2>${username}</h2>`;

  // Display Profile Image (GitHub)
  if (profile.github.avatar_url) {
    container.innerHTML += `<img src="${profile.github.avatar_url}" alt="${username}'s profile picture" style="max-width: 150px; border-radius: 8px;" />`;
  }

  // Display Banner Image (GitHub)
  if (profile.github.banner_url) {
    container.innerHTML += `<img src="${profile.github.banner_url}" alt="${username}'s banner" style="max-width: 100%; border-radius: 8px;" />`;
  }

  // Display Pronouns
  if (profile.pronouns) {
    container.innerHTML += `<p><strong>Pronouns:</strong> ${profile.pronouns}</p>`;
  }

  // GitHub Profile
  if (profile.github.username) {
    container.innerHTML += `
      <h3>GitHub</h3>
      <p><strong>${profile.github.username}</strong> — ${profile.github.bio}</p>
      <p>Repos: ${profile.github.public_repos} | Followers: ${profile.github.followers}</p>
      <p><a href="https://github.com/${profile.github.username}" target="_blank">Visit GitHub</a></p>`;

    // Add GitHub Badge
    if (profile.badges.length) {
      container.innerHTML += `<h3>GitHub Badges</h3><img src="${profile.badges[0]}" alt="GitHub Stats Badge" />`;
    }

    // Display email (if available)
    if (profile.github.email && profile.github.email !== "No public email available") {
      container.innerHTML += `<p><strong>Email:</strong> <a href="mailto:${profile.github.email}">${profile.github.email}</a></p>`;
    }

    // Display Organizations (if any)
    if (profile.organizations.length) {
      container.innerHTML += `<p><strong>Organizations:</strong> ${profile.organizations.join(", ")}</p>`;
    }
  }

  // Links Section
  if (profile.links.length) {
    container.innerHTML += `<h3>Links</h3><ul>${profile.links.map(l=>`<li><a href="${l.url}" target="_blank">${l.name}</a></li>`).join("")}</ul>`;
  }

  // Music Profiles
  if (profile.music.length) {
    container.innerHTML += `<h3>Music Profiles</h3><ul>${profile.music.map(m=>`<li>${m.platform}: <a href="${m.url}" target="_blank">${m.username}</a></li>`).join("")}</ul>`;
  }

  // Aliases
  if (profile.aliases.length) {
    container.innerHTML += `<h3>Aliases (Detected)</h3><p>${[...new Set(profile.aliases)].join(", ")}</p>`;
  }

  // Display README.md if available
  if (profile.readme) {
    container.innerHTML += `<h3>README.md</h3><pre>${profile.readme.slice(0, 1000)}...</pre>`;
  }

  return profile;
}
