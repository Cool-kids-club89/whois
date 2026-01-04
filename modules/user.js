// modules/user.js
export async function showUserProfile(username, container) {
  // Hardcoded profiles with correct music usernames
  const profiles = {
    "4zx16": {
      description: "Underground Developer & Gray-Hat Technologist • Visibility: Low-Medium",
      aliases: ["4zx16","not4zx16","DarkShadow5352","Dark Knight","Bluishparrot70"],
      links: [
        { name: "GitHub", url: "https://github.com/4zx16" },
        { name: "Carrd", url: "https://about4zx16.carrd.co/" },
        { name: "Krynet", url: "https://4zx16.github.io/Krynet/" }
      ],
      music: [
        { platform: "Last.fm", username: "l4zx16", url: "https://www.last.fm/user/l4zx16" },
        { platform: "Libre.fm", username: "4zx16", url: "https://libre.fm/user/4zx16" }
      ],
      github: { username: "4zx16", bio: "Cybersecurity expert, game developer, and hacker.", public_repos: 10 }
    },
    "7zh14": {
      description: "Developer • OSINT-Referenced Identity • Multimedia & Systems",
      aliases: ["7zh14","sevenzh14"],
      links: [
        { name: "GitHub", url: "https://github.com/7zh14" },
        { name: "Carrd", url: "https://7zh14.carrd.co" },
        { name: "SoundCloud", url: "https://soundcloud.com/7zh14s" },
        { name: "Twitch", url: "https://www.twitch.tv/7zh14" }
      ],
      music: [
        { platform: "Last.fm", username: "sevenzh14", url: "https://www.last.fm/user/sevenzh14" }
      ],
      github: { username: "7zh14", bio: "Multimedia Developer with a focus on security.", public_repos: 15 }
    }
  };

  const profile = profiles[username];
  if (!profile) {
    container.innerHTML += `<p>No profile data found for ${username}</p>`;
    return {};
  }

  // Clear container for profile display
  container.innerHTML = `<h2>${username}</h2><p>${profile.description}</p>`;

  // Aliases
  if (profile.aliases?.length) {
    container.innerHTML += `<h3>Aliases</h3><p>${profile.aliases.join(", ")}</p>`;
  }

  // Links
  if (profile.links?.length) {
    container.innerHTML += `<h3>Links</h3><ul>${profile.links.map(l=>`<li><a href="${l.url}" target="_blank">${l.name}</a></li>`).join("")}</ul>`;
  }

  // Music
  if (profile.music?.length) {
    container.innerHTML += `<h3>Music Profiles</h3><ul>${profile.music.map(m=>`<li>${m.platform}: <a href="${m.url}" target="_blank">${m.username}</a></li>`).join("")}</ul>`;
  }

  // GitHub
  if (profile.github) {
    container.innerHTML += `<h3>GitHub</h3>
      <p><strong>${profile.github.username}</strong> — ${profile.github.bio}</p>
      <p>Public Repos: ${profile.github.public_repos}</p>
      <p><a href="https://github.com/${profile.github.username}" target="_blank">Visit GitHub</a></p>`;
  }

  return profile;
}
