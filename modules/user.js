import { extractKeywords, scoreSource } from './display.js';
import { detectAliases } from './aliases.js';
import { detectPrimaryBioSite } from './bio.js';
import { loadMusicOSINT } from './music.js';

/**
 * showUserProfile
 * Generates a full profile for a user.
 * @param {string} user
 * @param {HTMLElement} container
 */
export async function showUserProfile(user, container) {
  if (!container) container = document.getElementById("result");
  container.innerHTML = `<h2>User Profile: ${user}</h2>`;

  const keywords = {};
  const profileData = {
    pfp: null,
    banner: null,
    aliases: [],
    bioSites: [],
    github: {},
    socialMedia: [],
    music: [],
    skills: []
  };

  // =========================
  // ALIAS DETECTION
  // =========================
  detectAliases(user);
  profileData.aliases = [...window.aliasCandidates];

  // =========================
  // PRIMARY BIO
  // =========================
  await detectPrimaryBioSite(user, keywords);

  const bioLinks = [
    `https://${user}.carrd.co`,
    `https://about${user}.carrd.co`,
    `https://github.com/${user}`
  ];

  // Filter alive links
  for (const s of bioLinks) {
    try {
      const res = await fetch(s, { method: "HEAD" });
      if (res.ok) profileData.bioSites.push(s);
    } catch {}
  }

  // =========================
  // MUSIC
  // =========================
  await loadMusicOSINT(user, keywords);

  for (const site of ["last.fm", "libre.fm"]) {
    const url = `https://${site}/user/${user}`;
    try {
      const res = await fetch(url);
      if (res.ok) profileData.music.push(url);
    } catch {}
  }

  // =========================
  // GITHUB
  // =========================
  try {
    const profile = await fetch(`https://api.github.com/users/${user}`).then(r => r.json());
    const repos = await fetch(profile.repos_url).then(r => r.json());
    const orgs = await fetch(`https://api.github.com/users/${user}/orgs`).then(r => r.json());

    profileData.github = {
      login: profile.login,
      bio: profile.bio || "",
      public_repos: profile.public_repos,
      followers: profile.followers,
      following: profile.following,
      orgs: orgs.map(o => o.login),
      projects: repos.map(r => ({
        name: r.name,
        desc: r.description,
        url: r.html_url,
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language
      })),
      pfp: profile.avatar_url,
      banner: profile.blog || null // GitHub doesn't have banners, but blog field can be used
    };

    profileData.pfp = profileData.github.pfp;
    profileData.banner = profileData.github.banner;

    // Extract keywords for skills
    extractKeywords(profile.bio || "", user, keywords);
    repos.forEach(r => extractKeywords(r.name + " " + (r.description || ""), user, keywords));
    orgs.forEach(o => extractKeywords(o.login, user, keywords));

    scoreSource("GitHub", keywords);

  } catch {}

  // =========================
  // SOCIAL MEDIA
  // =========================
  const socialSites = ["twitter.com", "instagram.com", "tiktok.com", "linkedin.com", "mastodon.social", "pixiv.net"];
  profileData.socialMedia = [];

  for (const link of profileData.bioSites) {
    try {
      const res = await fetch(link);
      if (!res.ok) continue;
      const html = await res.text();
      socialSites.forEach(site => {
        const regex = new RegExp(`https?://(?:www\\.)?${site}/[\\w@]+`, "g");
        const matches = html.match(regex);
        if (matches) profileData.socialMedia.push(...matches);
      });
    } catch {}
  }

  // Deduplicate social links
  profileData.socialMedia = [...new Set(profileData.socialMedia)];

  // =========================
  // SKILLS (GitHub + bio)
  // =========================
  profileData.skills = [];
  const techKeywords = ["lua","js","javascript","html","css","python","c++","c#","unity","unreal","roblox","sql","typescript","rust","sciter"];

  // From GitHub projects
  profileData.github.projects.forEach(p => {
    const text = (p.name + " " + (p.desc || "")).toLowerCase();
    techKeywords.forEach(kw => {
      if (text.includes(kw) && !profileData.skills.includes(kw)) profileData.skills.push(kw);
    });
  });

  // From bio sites
  for (const link of profileData.bioSites) {
    try {
      const res = await fetch(link);
      if (!res.ok) continue;
      const html = await res.text();
      const lower = html.toLowerCase();
      techKeywords.forEach(kw => {
        if (lower.includes(kw) && !profileData.skills.includes(kw)) profileData.skills.push(kw);
      });
    } catch {}
  }

  // =========================
  // DISPLAY
  // =========================
  let html = '';

  // Banner
  if (profileData.banner) html += `<div class="banner"><img src="${profileData.banner}" alt="Banner"></div>`;

  // PFP + username
  html += `<div class="profile-header">
    ${profileData.pfp ? `<img class="pfp" src="${profileData.pfp}" alt="Profile Picture">` : ""}
    <h2>${user}</h2>
  </div>`;

  // Aliases
  html += `<section><h3>Aliases</h3><ul>${profileData.aliases.map(a => `<li>${a}</li>`).join("")}</ul></section>`;

  // Bio sites
  html += `<section><h3>Primary Bio / About Sites</h3><ul>${profileData.bioSites.map(b => `<li><a href="${b}" target="_blank">${b}</a></li>`).join("")}</ul></section>`;

  // GitHub
  if (profileData.github.login) {
    html += `
      <section>
        <h3>GitHub</h3>
        <p><strong>Bio:</strong> ${profileData.github.bio}</p>
        <p><strong>Followers:</strong> ${profileData.github.followers} | <strong>Following:</strong> ${profileData.github.following}</p>
        <p><strong>Public Repos:</strong> ${profileData.github.public_repos}</p>
        <h4>Organizations</h4>
        <ul>${profileData.github.orgs.map(o => `<li>${o}</li>`).join("") || "<li>None</li>"}</ul>
        <h4>Projects</h4>
        <ul>${profileData.github.projects.map(p =>
          `<li><a href="${p.url}" target="_blank">${p.name}</a> - ${p.desc || ""} ${p.language ? `(<strong>${p.language}</strong>)` : ""} ⭐ ${p.stars} | Forks: ${p.forks}</li>`
        ).join("")}</ul>
      </section>
    `;
  }

  // Social Media
  if (profileData.socialMedia.length) {
    html += `<section><h3>Social Media Links</h3><ul>${profileData.socialMedia.map(s => `<li><a href="${s}" target="_blank">${s}</a></li>`).join("")}</ul></section>`;
  }

  // Music
  if (profileData.music.length) {
    html += `<section><h3>Music / Listening Profiles</h3><ul>${profileData.music.map(m => `<li><a href="${m}" target="_blank">${m}</a></li>`).join("")}</ul></section>`;
  }

  // Skills
  if (profileData.skills.length) {
    html += `<section><h3>Skills</h3><ul>${profileData.skills.map(s => `<li>${s}</li>`).join("")}</ul></section>`;
  }

  container.innerHTML += html;

  return profileData;
}
