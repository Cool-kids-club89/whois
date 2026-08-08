const input = document.getElementById("inputSearch");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

const moduleCache = new Map();

const state = {
    keywordCache: Object.create(null),
    fingerprints: Object.create(null),
    confidence: Object.create(null),
    aliasCandidates: new Set(),
    graphNodes: [],
    graphLinks: []
};

let currentSearchId = 0;

/**
 * Load an ES module from ./modues/.
 *
 * Uses import.meta.url so the path is resolved relative to this script,
 * rather than relying on the document's current URL.
 */
async function importModule(file) {
    if (moduleCache.has(file)) {
        return moduleCache.get(file);
    }

    const url = new URL(`./modues/${file}`, import.meta.url);

    console.debug(`[OIST] Loading ${url.href}`);

    try {
        // Check the resource first. This makes path/server errors obvious.
        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch ${url.href}: HTTP ${response.status} ${response.statusText}`
            );
        }

        const source = await response.text();

        if (!source.trim()) {
            throw new Error(`Module is empty: ${url.href}`);
        }

        console.debug(`[OIST] Fetched ${source.length} bytes`);

        const mod = await import(`${url.href}?v=${Date.now()}`);

        const requiredExports = [
            "extractKeywords",
            "fetchGitHubKeywords",
            "detectAliases",
            "buildFingerprint",
            "inferPersona",
            "displayFingerprint",
            "buildGraph",
            "renderGraph"
        ];

        const missing = requiredExports.filter(
            name => typeof mod[name] !== "function"
        );

        if (missing.length) {
            throw new Error(
                `OIST.js loaded, but is missing exports: ${missing.join(", ")}`
            );
        }

        console.debug(
            "[OIST] Loaded successfully:",
            Object.keys(mod)
        );

        moduleCache.set(file, mod);
        return mod;

    } catch (err) {
        console.error(`[OIST] Failed to load ${url.href}`, err);

        // Do NOT return {}.
        // Returning an empty object hides the actual module failure.
        throw err;
    }
}

/**
 * Reset all search-specific state.
 */
function resetState() {
    state.keywordCache = Object.create(null);
    state.fingerprints = Object.create(null);
    state.confidence = Object.create(null);
    state.aliasCandidates = new Set();
    state.graphNodes = [];
    state.graphLinks = [];
}

/**
 * Run the OIST analysis pipeline.
 */
async function runModules(user, searchId) {
    const dynamic = document.getElementById("dynamicProfile");
    const local = document.getElementById("localProfile");

    if (!dynamic) {
        throw new Error("Missing #dynamicProfile");
    }

    const mod = await importModule("OIST.js");

    // A newer search may have started while the module was loading.
    if (searchId !== currentSearchId) {
        console.debug("[OIST] Search superseded; aborting old run.");
        return;
    }

    const keywords = state.keywordCache[user] ??= Object.create(null);

    /*
     * Extract keywords from the locally stored profile.
     */
    if (local?.textContent?.trim()) {
        mod.extractKeywords(
            local.textContent,
            user,
            keywords
        );
    }

    /*
     * GitHub enrichment.
     *
     * OIST.js should return/update the keyword object.
     */
    const githubKeywords = await mod.fetchGitHubKeywords(
        user,
        keywords
    );

    if (githubKeywords && typeof githubKeywords === "object") {
        Object.assign(keywords, githubKeywords);
    }

    if (searchId !== currentSearchId) {
        return;
    }

    /*
     * Alias analysis.
     */
    const aliases = mod.detectAliases(
        user,
        state
    );

    if (aliases instanceof Set) {
        aliases.forEach(alias => {
            state.aliasCandidates.add(alias);
        });
    } else if (Array.isArray(aliases)) {
        aliases.forEach(alias => {
            state.aliasCandidates.add(alias);
        });
    }

    /*
     * Fingerprint.
     */
    const fingerprint = mod.buildFingerprint(
        user,
        keywords,
        state
    );

    if (fingerprint !== undefined) {
        state.fingerprints[user] = fingerprint;
    }

    /*
     * Persona inference.
     */
    mod.inferPersona(
        keywords,
        dynamic,
        state
    );

    /*
     * Fingerprint display.
     */
    mod.displayFingerprint(
        dynamic,
        state.fingerprints[user]
    );

    /*
     * Graph construction.
     */
    mod.buildGraph(
        user,
        state
    );

    /*
     * Render graph.
     */
    mod.renderGraph(
        dynamic,
        state
    );

    /*
     * Debug information.
     *
     * Escape it before inserting into HTML.
     */
    const debug = document.createElement("section");

    const heading = document.createElement("h3");
    heading.textContent = "All Keywords";

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(keywords, null, 2);

    debug.appendChild(heading);
    debug.appendChild(pre);

    dynamic.appendChild(debug);
}

/**
 * Load the local profile.
 */
async function loadLocalProfile(user) {
    const local = document.getElementById("localProfile");

    if (!local) {
        throw new Error("Missing #localProfile");
    }

    const url = `individual/${encodeURIComponent(user)}.html`;

    try {
        const res = await fetch(url, {
            cache: "no-store"
        });

        if (res.ok) {
            local.innerHTML = await res.text();
            return true;
        }

        if (res.status === 404) {
            local.innerHTML = `
                <p>
                    No local profile was found for
                    <strong>${escapeHTML(user)}</strong>.
                </p>
            `;

            return false;
        }

        throw new Error(
            `HTTP ${res.status} ${res.statusText}`
        );

    } catch (err) {
        console.warn(
            `[Search] Local profile failed for "${user}":`,
            err
        );

        local.innerHTML = `
            <p class="risk-high">
                Failed to load local profile.
            </p>
            <pre>${escapeHTML(err.message)}</pre>
        `;

        return false;
    }
}

/**
 * Prevent user-controlled values from becoming HTML.
 */
function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/**
 * Perform a search.
 */
async function searchUser() {
    const user = input.value.trim();

    if (!user) {
        return;
    }

    const searchId = ++currentSearchId;

    resetState();

    result.innerHTML = `
        <h2>Search Results for: ${escapeHTML(user)}</h2>
        <div id="localProfile"></div>
        <div id="dynamicProfile">
            <p>Loading analysis...</p>
        </div>
    `;

    btn.disabled = true;

    try {
        await loadLocalProfile(user);

        if (searchId !== currentSearchId) {
            return;
        }

        await runModules(user, searchId);

    } catch (err) {
        console.error("[Search] Analysis failed:", err);

        const dynamic = document.getElementById("dynamicProfile");

        if (dynamic && searchId === currentSearchId) {
            dynamic.innerHTML = `
                <section>
                    <h2>Analysis Failed</h2>
                    <p class="risk-high">
                        Unable to load the OIST analysis module.
                    </p>
                    <pre>${escapeHTML(
                        err instanceof Error
                            ? err.message
                            : String(err)
                    )}</pre>
                </section>
            `;
        }

    } finally {
        if (searchId === currentSearchId) {
            btn.disabled = false;
        }
    }
}

/**
 * Search button.
 */
btn.addEventListener("click", searchUser);

/**
 * Enter key support.
 */
input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        searchUser();
    }
});
