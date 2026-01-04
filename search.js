const input = document.getElementById("inputSearch");  // Make sure inputSearch is used (matches HTML)
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

window.userKeywordCache = {};
window.userFingerprints = {};
window.sourceConfidence = {};
window.aliasCandidates = new Set();

const corsProxyUrl = 'https://corsproxy.io/?url=';  // CORS proxy service
const htmlDrivenUrl = 'https://html-driven.com/proxy?url=';  // HTMLDriven proxy service

// Check if there's a search query in the URL
const urlParams = new URLSearchParams(window.location.search);
const searchQuery = urlParams.get('search');

// Pre-fill the input with the search query if available
if (searchQuery) {
  input.value = searchQuery;
  btn.click();  // Automatically trigger the search
}

btn.onclick = async () => {
  const user = input.value.trim();
  if (!user) return;

  resetState();
  result.innerHTML = `<h2>Search Results for: ${user}</h2>`;

  // Dynamically load and run all .js modules based on the module list from JSON
  await loadModules(user);

  // Display the result for GitHub user (or whatever other modules might add data)
  await loadGitHub(user, window.userKeywordCache[user]);

  // Fetch and display the local individual page if it exists
  await fetchLocalPage(user);

  // Show user profile details
  await showUserProfile(user, result);
};

// Dynamically import and run all .js modules (excluding templates)
async function loadModules(user) {
  // Fetch the list of module files from moduleList.json
  const moduleFiles = await fetchModuleFiles();

  for (const fileName of moduleFiles) {
    // Skip files that contain 'template' in the name
    if (fileName.includes('template')) continue;

    try {
      // Dynamically import the module (based on the file name)
      const module = await import(`./modules/${fileName}`);
      
      // Call relevant functions if they exist in the module
      if (typeof module.showUserProfile === 'function') {
        await module.showUserProfile(user, result);  // Call showUserProfile if it exists
      }
      // Add any other functions you want to invoke based on the module's structure
      if (typeof module.loadGitHub === 'function') {
        await module.loadGitHub(user, window.userKeywordCache[user]); // Call loadGitHub if available
      }
    } catch (error) {
      console.warn(`Failed to load module ${fileName}:`, error);
    }
  }
}

async function fetchModuleFiles() {
  try {
    const response = await fetch('./modules/moduleList.json');  // Fetch module list JSON
    if (!response.ok) {
      throw new Error('Failed to fetch module list.');
    }
    const moduleList = await response.json();
    return moduleList.files;  // This should return the "files" array from the JSON
  } catch (error) {
    console.error("Error fetching module list:", error);
    return [];  // Return an empty array if there's an error fetching the JSON
  }
}

// Fetch the local individual page for the user
async function fetchLocalPage(username) {
  try {
    const response = await fetch(`individual/${username}.html`);
    if (response.ok) {
      const html = await response.text();
      result.innerHTML += `
        <section>
          <h3>Local Individual Page</h3>
          <div>${html}</div>
        </section>
      `;
    } else {
      console.warn(`Local page for ${username} not found.`);
    }
  } catch (error) {
    console.warn(`Error fetching local page for ${username}:`, error);
  }
}

function resetState() {
  window.userKeywordCache = {};
  window.userFingerprints = {};
  window.sourceConfidence = {};
  window.aliasCandidates.clear();
}
