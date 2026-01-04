export async function fetchOrg(orgName) {
  const result = document.getElementById('result');
  result.innerHTML += `<p>Loading organization data...</p>`;

  // Proxy URLs
  const corsProxyUrl = 'https://corsproxy.io/?url=';
  const htmlDrivenUrl = 'https://html-driven.com/proxy?url=';

  // Function to fetch data with the proxy fallback
  const fetchWithProxy = async (url) => {
    const proxyUrl = corsProxyUrl + encodeURIComponent(url);
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error('Failed to fetch data with primary proxy');
      return res.json();
    } catch {
      // If the first proxy fails, fall back to HTMLDriven proxy
      const fallbackProxyUrl = htmlDrivenUrl + encodeURIComponent(url);
      const res = await fetch(fallbackProxyUrl);
      if (!res.ok) throw new Error('Failed to fetch data with fallback proxy');
      return res.json();
    }
  };

  try {
    // 1. Fetch organization info
    const orgData = await fetchWithProxy(`https://api.github.com/orgs/${orgName}`);
    result.innerHTML += `<section>
      <h3>Organization Overview</h3>
      <p><strong>Name:</strong> ${orgData.login}</p>
      <p><strong>Description:</strong> ${orgData.description || "No description available"}</p>
      <p><strong>Website:</strong> <a href="${orgData.blog}" target="_blank">${orgData.blog || "No website available"}</a></p>
    </section>`;

    // 2. Fetch members
    const membersData = await fetchWithProxy(`https://api.github.com/orgs/${orgName}/members`);
    result.innerHTML += `<section>
      <h3>Members</h3>
      <ul>${membersData.map(m => `<li>${m.login}</li>`).join("")}</ul>
    </section>`;

    // 3. Fetch public repositories
    const reposData = await fetchWithProxy(orgData.repos_url);
    result.innerHTML += `<section>
      <h3>Repositories</h3>
      <ul>${reposData.map(r => `<li><a href="${r.html_url}" target="_blank">${r.name}</a> - ${r.language || "N/A"}</li>`).join("")}</ul>
    </section>`;

    // 4. Fetch Organization README
    try {
      const readmeRes = await fetchWithProxy(`https://raw.githubusercontent.com/${orgName}/.github/main/README.md`);
      result.innerHTML += `<section>
        <h3>Organization README</h3>
        <pre>${escapeHtml(await readmeRes.text())}</pre>
      </section>`;
    } catch {
      result.innerHTML += `<p>No organization README found.</p>`;
    }

    // 5. OPSEC rating based on repositories and members
    const opsec = reposData.length > 10 || membersData.length > 20 ? "Bad OPSEC" : reposData.length > 5 || membersData.length > 5 ? "Medium OPSEC" : "Good OPSEC";
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
