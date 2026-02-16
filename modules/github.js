import { extractKeywords, scoreSource } from './display.js';

export async function loadGitHub(user, keywords = {}) {
  const resultDiv = document.getElementById("result");
  if (!resultDiv) return;

  try {
    // Fetch profile + repos + orgs in parallel
    const [profileRes, reposRes, orgsRes] = await Promise.all([
      fetch(`https://api.github.com/users/${user}`),
      fetch(`https://api.github.com/users/${user}/repos?per_page=100`),
      fetch(`https://api.github.com/users/${user}/orgs`)
    ]);

    // Handle profile errors first
    if (!profileRes.ok) {
      if (profileRes.status === 404) {
        resultDiv.innerHTML += `<section><h3>GitHub</h3><p>User not found.</p></section>`;
        return;
      }

      if (profileRes.status === 403) {
        const reset = profileRes.headers.get("X-RateLimit-Reset");
        const resetTime = reset
          ? new Date(reset * 1000).toLocaleTimeString()
          : "later";

        resultDiv.innerHTML += `
          <section>
            <h3>GitHub</h3>
            <p>Rate limit exceeded. Resets at ${resetTime}.</p>
          </section>
        `;
        return;
      }

      throw new Error(`GitHub profile error: ${profileRes.status}`);
    }

    const profile = await profileRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];
    const orgs = orgsRes.ok ? await orgsRes.json() : [];

    // Render safely
    resultDiv.innerHTML += `
      <section>
        <h3>GitHub</h3>
        <p><strong>Username:</strong> ${profile.login || "N/A"}</p>
        <p><strong>Bio:</strong> ${profile.bio || "No bio available"}</p>
        <p><strong>Public Repos:</strong> ${profile.public_repos ?? 0}</p>

        <h4>Repositories</h4>
        <ul>
          ${Array.isArray(repos) && repos.length
            ? repos.map(r => `
                <li>
                  <a href="${r.html_url}" target="_blank">
                    ${r.name}
                  </a> - ${r.language || "N/A"}
                </li>
              `).join("")
            : "<li>No repositories</li>"
          }
        </ul>

        <h4>Organizations</h4>
        <ul>
          ${Array.isArray(orgs) && orgs.length
            ? orgs.map(o => `<li>${o.login}</li>`).join("")
            : "<li>None</li>"
          }
        </ul>

        <h4>Stats</h4>
        <img 
          src="https://github-readme-stats.vercel.app/api?username=${user}&show_icons=true&hide_title=true&hide_border=true&count_private=true&include_all_commits=true&hide=prs"
          alt="GitHub stats"
        />
      </section>
    `;

    // Keyword extraction (safe)
    if (profile.bio) {
      extractKeywords(profile.bio, user, keywords);
    }

    if (Array.isArray(repos)) {
      for (const repo of repos) {
        if (repo?.name) extractKeywords(repo.name, user, keywords);
        if (repo?.description) extractKeywords(repo.description, user, keywords);
      }
    }

    if (Array.isArray(orgs)) {
      for (const org of orgs) {
        if (org?.login) extractKeywords(org.login, user, keywords);
      }
    }

    scoreSource("GitHub", keywords);

  } catch (err) {
    console.error("GitHub module error:", err);
    scoreSource("GitHub", {});
  }
}
