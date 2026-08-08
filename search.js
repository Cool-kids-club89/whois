"use strict";

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

async function importModule(file) {
    if (moduleCache.has(file)) {
        return moduleCache.get(file);
    }

    try {
        const mod = await import(`./modues/${file}`);
        moduleCache.set(file, mod);
        return mod;
    } catch (err) {
        console.error(`[WHOIS] Failed to import ./modues/${file}`, err);
        throw err;
    }
}

function resetState() {
    state.keywordCache = Object.create(null);
    state.fingerprints = Object.create(null);
    state.confidence = Object.create(null);
    state.aliasCandidates = new Set();
    state.graphNodes = [];
    state.graphLinks = [];
}

function createResultsShell(user) {
    result.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = `Search Results for: ${user}`;

    const localProfile = document.createElement("div");
    localProfile.id = "localProfile";

    const dynamicProfile = document.createElement("div");
    dynamicProfile.id = "dynamicProfile";

    result.append(
        heading,
        localProfile,
        dynamicProfile
    );

    return {
        localProfile,
        dynamicProfile
    };
}

async function loadLocalProfile(user, container) {
    try {
        const response = await fetch(
            `individual/${encodeURIComponent(user)}.html`,
            {
                method: "GET",
                cache: "no-store"
            }
        );

        if (!response.ok) {
            if (response.status === 404) {
                container.textContent =
                    "No local profile was found for this identity.";
            } else {
                container.textContent =
                    `Local profile request failed: HTTP ${response.status}.`;
            }

            return false;
        }

        const html = await response.text();

        if (!html.trim()) {
            container.textContent =
                "The local profile exists but contains no content.";

            return false;
        }

        container.innerHTML = html;
        return true;

    } catch (err) {
        console.warn("[WHOIS] Local profile load failed:", err);

        container.textContent =
            "Unable to load the local profile.";

        return false;
    }
}

async function runModules(user, localProfile, dynamicProfile) {
    const mod = await importModule("OIST.js");

    const keywords =
        state.keywordCache[user] ??= Object.create(null);

    /*
     * Local profile analysis.
     */
    if (localProfile?.textContent?.trim()) {
        mod.extractKeywords(
            localProfile.textContent,
            user,
            keywords
        );
    }

    /*
     * GitHub analysis.
     *
     * The keyword store is explicitly passed in so
     * OIST and script.js always operate on the same object.
     */
    await mod.fetchGitHubKeywords(
        user,
        keywords
    );

    /*
     * Identity / alias analysis.
     */
    mod.detectAliases(
        user,
        state.aliasCandidates
    );

    /*
     * Fingerprint.
     */
    mod.buildFingerprint(
        user,
        keywords,
        state
    );

    /*
     * Observable content signals.
     */
    mod.inferPersona(
        keywords,
        dynamicProfile
    );

    /*
     * Fingerprint UI.
     */
    mod.displayFingerprint(
        dynamicProfile,
        user,
        state
    );

    /*
     * Graph.
     */
    mod.buildGraph(
        user,
        state
    );

    mod.renderGraph(
        dynamicProfile,
        state
    );

    /*
     * Debug information.
     *
     * textContent is used instead of innerHTML so keyword
     * contents cannot inject markup into the page.
     */
    const debug = document.createElement("section");

    const debugHeading = document.createElement("h3");
    debugHeading.textContent = "All Keywords";

    const pre = document.createElement("pre");
    pre.textContent =
        JSON.stringify(keywords, null, 2);

    debug.append(
        debugHeading,
        pre
    );

    dynamicProfile.appendChild(debug);
}

async function performSearch() {
    const user = input.value.trim();

    if (!user) {
        return;
    }

    btn.disabled = true;

    resetState();

    const {
        localProfile,
        dynamicProfile
    } = createResultsShell(user);

    const loading = document.createElement("p");
    loading.id = "searchStatus";
    loading.textContent = "Running analysis…";

    dynamicProfile.appendChild(loading);

    try {
        await loadLocalProfile(
            user,
            localProfile
        );

        await runModules(
            user,
            localProfile,
            dynamicProfile
        );

        loading.remove();

    } catch (err) {
        console.error(
            `[WHOIS] Analysis failed for "${user}":`,
            err
        );

        loading.remove();

        const errorSection =
            document.createElement("section");

        const heading =
            document.createElement("h3");

        heading.textContent =
            "Analysis Failed";

        const message =
            document.createElement("p");

        message.textContent =
            err instanceof Error
                ? err.message
                : String(err);

        errorSection.append(
            heading,
            message
        );

        dynamicProfile.prepend(
            errorSection
        );
    } finally {
        btn.disabled = false;
    }
}

btn.addEventListener(
    "click",
    performSearch
);

input.addEventListener(
    "keydown",
    event => {
        if (event.key === "Enter") {
            event.preventDefault();
            performSearch();
        }
    }
);
