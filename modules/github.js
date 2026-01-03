import { extractKeywords, scoreSource } from './display.js';

export async function loadGitHub(user, keywords) {
  try {
    const profile = await fetch(`https://api.github.com/users/${user}`).then(r => r.json());
    const orgs = await fetch(`https://api.github.com/users/${user}/orgs`).then(r => r.json());

    const html = `
      <section>
        <h3>GitHub</h3>
        <p>${profile.bio || "No bio"}</p>
        <p>Repos: ${profile.public_repos}</p>
        <h4>Organizations</h4>
        <ul>${orgs.map(o => `<li>${o.login}</li>`).join("") || "<li>None</li>"}</ul>
      </section>
    `;
    document.getElementById("result").innerHTML += html;

    extractKeywords(profile.bio || "", user, keywords);
    orgs.forEach(o => extractKeywords(o.login, user, keywords));

    scoreSource("GitHub", keywords);
  } catch {
    scoreSource("GitHub", {});
  }
}
