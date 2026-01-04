// Fetch and display organization data, including owners, repos, etc.
export async function fetchOrgData(orgName) {
  let orgData = {};

  try {
    // Step 1: Get basic organization data (e.g., description, public repos)
    const orgRes = await fetch(`https://api.github.com/orgs/${orgName}`);
    if (orgRes.ok) {
      const orgInfo = await orgRes.json();
      orgData.name = orgInfo.login;
      orgData.description = orgInfo.description || "No description available";
      orgData.website = orgInfo.blog || "No website available";

      // Step 2: Fetch public repositories in the organization
      const reposRes = await fetch(orgInfo.repos_url);
      if (reposRes.ok) {
        const repos = await reposRes.json();
        orgData.repos = repos.map(repo => ({
          name: repo.name,
          url: repo.html_url,
          description: repo.description || "No description available",
          language: repo.language || "Not specified",
        }));
      }

      // Step 3: Get members and owners (Admins and Owners)
      const membersRes = await fetch(`https://api.github.com/orgs/${orgName}/members`);
      if (membersRes.ok) {
        const members = await membersRes.json();
        orgData.members = members.map(member => member.login);
      }

      const ownersRes = await fetch(`https://api.github.com/orgs/${orgName}/memberships`);
      if (ownersRes.ok) {
        const owners = await ownersRes.json();
        orgData.owners = owners.filter(owner => owner.role === 'admin').map(owner => owner.login);
      }

      // Step 4: Set OPSEC Rating based on public data
      orgData.opsecRating = calculateOPSECRating(orgData);
    }
  } catch (err) {
    console.error("Error fetching organization data:", err);
  }

  return orgData;
}

function calculateOPSECRating(orgData) {
  const repoCount = orgData.repos ? orgData.repos.length : 0;
  const memberCount = orgData.members ? orgData.members.length : 0;

  if (repoCount > 10 || memberCount > 20) {
    return "Bad OPSEC";  // Too many public repositories or members
  } else if (repoCount > 5 || memberCount > 5) {
    return "Medium OPSEC";
  }
  return "Good OPSEC";  // Few public repos and members
}
