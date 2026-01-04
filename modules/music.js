import { extractKeywords, scoreSource } from './display.js';

// Last.fm API Key (replace with your actual key)
const lastFmApiKey = 'YOUR_LASTFM_API_KEY';  // Replace with your Last.fm API key
// Libre.fm API Key (provided key)
const libreFmApiKey = 'd8c6000a28a61040275c4cf624f192d8';  // Provided Libre.fm API key

export async function loadMusicOSINT(user, keywords) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML += `<section><h3>Music OSINT</h3><ul id="music"></ul></section>`;
  const list = document.getElementById("music");

  // CORS proxy URL to bypass restrictions
  const corsProxyUrl = 'https://api.cors.lol/?url=';

  const sites = ["last.fm", "libre.fm"];
  
  for (const site of sites) {
    try {
      let url, apiUrl;
      
      if (site === "last.fm") {
        // Last.fm URL for user profile
        url = `https://www.last.fm/user/${user}`;
        
        // Last.fm API endpoint for user info
        apiUrl = `http://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${user}&api_key=${lastFmApiKey}&format=json`;
        
      } else if (site === "libre.fm") {
        // Libre.fm URL for user profile
        url = `https://libre.fm/user/${user}`;
        
        // Libre.fm API endpoint for user info
        apiUrl = `https://libre.fm/api/rest?method=user.getinfo&user=${user}&api_key=${libreFmApiKey}&format=json`;
      }

      // Fetch the user profile page through the CORS proxy
      const res = await fetch(`${corsProxyUrl}${encodeURIComponent(url)}`);
      
      if (res.ok) {
        const html = await res.text();
        extractKeywords(html, user, keywords);

        // Display the link to the user profile
        list.innerHTML += `<li><a href="${url}" target="_blank">${site}</a></li>`;
      } else {
        console.warn(`Failed to fetch from ${site}: ${res.statusText}`);
      }

      // Fetch data from the API for more structured user info (JSON)
      const apiRes = await fetch(apiUrl);
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        
        // Optionally, handle the API data (e.g., display user info)
        console.log(`${site} API data:`, apiData);

        // This is just an example; you can extract more specific information as needed
        if (site === "last.fm" && apiData.user) {
          console.log(`Last.fm User Info: ${apiData.user.name}`);
        }
        
        // If you want to process the API data into your keywords or display it:
        extractKeywords(JSON.stringify(apiData), user, keywords);
      } else {
        console.warn(`Failed to fetch from ${site} API: ${apiRes.statusText}`);
      }
      
    } catch (err) {
      console.warn(`Failed to fetch from ${site}: ${err.message}`);
    }
  }

  // Score the extracted keywords
  scoreSource("Music", keywords);
}
