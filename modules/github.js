import { extractKeywords, scoreSource } from './display.js';
import { fetchOrg } from './org.js';  // Import the fetchOrg function from org.js
import { showUserProfile } from './user.js';  // Import the showUserProfile function from user.js

export async function loadGitHub(user, keywords) {
  try {
    // Fetch user profile
    const profileRes = await fetch(`https://api.github.com/users/${user}`);
    const profile = await profileRes.json();
    
    // Fetch user organizations
    const orgsRes = await fetch(`https://api.github.com/users/${user}/orgs`);
    const orgs = await orgsRes.json();

    // Fetch user repositories
    const reposRes = await fetch(`https://api.github.com/users/${user}/repos`);
    const repos = await reposRes.json();

    // Construct HTML for GitHub profile, repos, and organizations
    const html = `
      <section>
        <h3>GitHub Profile</h3>
        <p><strong>Bio:</strong> ${profile.bio || "No bio available"}</p>
        <p><strong>Public Repos:</strong> ${profile.public_repos}</p>
        <h4>Repositories</h4>
        <ul>${repos.map(r => `<li><a href="${r.html_url}" target="_blank">${r.name}</a> - ${r.language || "N/A"}</li>`).join("") || "<li>No repositories available</li>"}</ul>
        <h4>Organizations</h4>
        <ul>${orgs.map(o => `<li>${o.login}</li>`).join("") || "<li>None</li>"}</ul>
      </section>
    `;
    document.getElementById("result").innerHTML += html;

    // Extract keywords from profile, repos, and organizations
    extractKeywords(profile.bio || "", user, keywords);

    // Extract keywords from repository names and descriptions
    repos.forEach(repo => {
      extractKeywords(repo.name, user, keywords);
      extractKeywords(repo.description, user, keywords);
    });

    // Extract keywords from organization names
    orgs.forEach(org => {
      extractKeywords(org.login, user, keywords);
      // Fetch organization details
      await fetchOrg(org.login); // This will call org.js to process each org's info
    });

    // Score the sources based on extracted keywords
    scoreSource("GitHub Profile", keywords);
    repos.forEach(repo => scoreSource(`Repository: ${repo.name}`, keywords));
    orgs.forEach(org => scoreSource(`Organization: ${org.login}`, keywords));

    // Optionally, fetch and display detailed profile info from modules/user.js (e.g., more detailed user info)
    await showUserProfile(user, document.getElementById("result"));

  } catch (err) {
    console.error("Error loading GitHub data:", err);
    scoreSource("GitHub", {});  // In case of error, still score the GitHub source with empty keywords
  }
}
