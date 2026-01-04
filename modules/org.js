async function fetchOrg(orgName) {
  result.innerHTML += `<p>Loading organization data...</p>`;

  try {
    // 1. Fetch organization info
    const orgRes = await fetch(`https://api.github.com/orgs/${orgName}`);
    if (!orgRes.ok) throw new Error("Organization not found");
    const orgData = await orgRes.json();

    result.innerHTML += `<section>
      <h3>Organization Overview</h3>
      <p><strong>Name:</strong> ${orgData.login}</p>
      <p><strong>Description:</strong> ${orgData.description || "No description available"}</p>
      <p><strong>Website:</strong> <a href="${orgData.blog}" target="_blank">${orgData.blog || "No website available"}</a></p>
    </section>`;

    // 2. Fetch members
    const membersRes = await fetch(`https://api.github.com/orgs/${orgName}/members`);
    let members = [];
    if (membersRes.ok) members = await membersRes.json();
    if (members.length) {
      result.innerHTML += `<section>
        <h3>Members</h3>
        <ul>${members.map(m => `<li>${m.login}</li>`).join("")}</ul>
      </section>`;
    }

    // 3. Fetch public repositories
    const reposRes = await fetch(orgData.repos_url);
    let repos = [];
    if (reposRes.ok) repos = await reposRes.json();
    if (repos.length) {
      result.innerHTML += `<section>
        <h3>Repositories</h3>
        <ul>${repos.map(r => `<li><a href="${r.html_url}" target="_blank">${r.name}</a> - ${r.language || "N/A"}</li>`).join("")}</ul>
      </section>`;
    }

    // 4. Fetch Organization Page README from `.github` repo
    try {
      const readmeRes = await fetch(`https://raw.githubusercontent.com/${orgName}/.github/main/README.md`);
      if (readmeRes.ok) {
        const readmeText = await readmeRes.text();
        result.innerHTML += `<section>
          <h3>Organization Page README.md (.github repo)</h3>
          <pre>${escapeHtml(readmeText)}</pre>
        </section>`;
      } else {
        result.innerHTML += `<p>No organization page README.md found in .github repository.</p>`;
      }
    } catch {
      result.innerHTML += `<p>No organization page README.md found in .github repository.</p>`;
    }

    // 5. OPSEC rating
    let opsec = "Good OPSEC";
    if (repos.length > 10 || members.length > 20) opsec = "Bad OPSEC";
    else if (repos.length > 5 || members.length > 5) opsec = "Medium OPSEC";
    result.innerHTML += `<p><strong>Privacy & Security Rating:</strong> ${opsec}</p>`;

  } catch (err) {
    result.innerHTML += `<p>Error fetching organization data: ${err.message}</p>`;
    console.error(err);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
