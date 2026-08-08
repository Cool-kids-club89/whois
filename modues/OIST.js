// OIST.js
// Unified OSINT Analysis Module
// Compatible with the current whois/script.js controller.
//
// Expected controller API:
//
//   extractKeywords(text, user, store)
//   fetchGitHubKeywords(user)
//   detectAliases(user)
//   buildFingerprint(user, keywords)
//   inferPersona(keywords, container)
//   displayFingerprint(container)
//   buildGraph(user)
//   renderGraph()
//
// The controller intentionally owns:
//   state.keywordCache
//   state.fingerprints
//   state.confidence
//   state.aliasCandidates
//   state.graphNodes
//   state.graphLinks
//
// This module maintains its own internal per-user analysis cache so
// it does not require modifications to the controller.

"use strict";


// ============================================================
// INTERNAL STATE
// ============================================================

const sessions = new Map();

function getSession(user) {
    const key = normalize(user);

    if (!sessions.has(key)) {
        sessions.set(key, {
            username: key,

            aliases: new Set(),

            sources: new Set(),

            fingerprints: {},

            confidence: {},

            graphNodes: [],
            graphLinks: [],

            github: {
                found: false,
                profile: null,
                repositories: [],
                organizations: [],
                error: null
            },

            personaSignals: [],

            warnings: []
        });
    }

    return sessions.get(key);
}


// ============================================================
// CONSTANTS
// ============================================================

const CONFIG = Object.freeze({
    githubApi: "https://api.github.com",

    githubPerPage: 100,
    githubMaxPages: 5,

    maxKeywordLength: 64,
    maxKeywords: 2500,

    maxAliases: 100,

    maxGraphNodes: 500,
    maxGraphLinks: 1000,

    requestTimeout: 10000
});


const BLACKLIST = new Set([
    "http",
    "https",
    "www",
    "com",
    "org",
    "net",

    "about",
    "after",
    "again",
    "also",
    "because",
    "being",
    "could",
    "from",
    "have",
    "into",
    "more",
    "other",
    "over",
    "that",
    "their",
    "there",
    "these",
    "they",
    "this",
    "using",
    "user",
    "users",
    "which",
    "with",
    "would",

    "github",
    "repository",
    "repositories",
    "profile",
    "project",
    "projects"
]);


// ============================================================
// GENERAL UTILITIES
// ============================================================

function normalize(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}


function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function unique(array) {
    return [...new Set(array)];
}


function addWarning(user, message) {
    const session = getSession(user);

    if (!session.warnings.includes(message)) {
        session.warnings.push(message);
    }
}


function createSection(title) {
    const section = document.createElement("section");

    const heading = document.createElement("h3");
    heading.textContent = title;

    section.appendChild(heading);

    return section;
}


function createListItem(label, value) {
    const li = document.createElement("li");

    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;

    li.appendChild(strong);
    li.appendChild(
        document.createTextNode(String(value))
    );

    return li;
}


// ============================================================
// KEYWORD EXTRACTION
// ============================================================

export function extractKeywords(text, user, store) {
    if (!text || !store) {
        return store;
    }

    const username = normalize(user);

    let source = String(text);

    /*
     * Don't allow an enormous document to create an
     * unbounded keyword store.
     */
    source = source.slice(0, 100000);

    /*
     * Normalize URLs before tokenization.
     */
    source = source
        .replace(
            /https?:\/\/[^\s]+/gi,
            " "
        )
        .replace(
            /www\.[^\s]+/gi,
            " "
        );

    const tokens = source
        .toLowerCase()
        .match(/[a-z0-9][a-z0-9._+-]*/g) || [];

    for (let token of tokens) {
        token = token
            .replace(/^[._+-]+/, "")
            .replace(/[._+-]+$/, "");

        if (
            token.length < 4 ||
            token.length > CONFIG.maxKeywordLength
        ) {
            continue;
        }

        if (
            token === username ||
            BLACKLIST.has(token)
        ) {
            continue;
        }

        /*
         * Ignore obvious HTML/CSS fragments.
         */
        if (
            token.startsWith("class") ||
            token.startsWith("style") ||
            token.startsWith("href")
        ) {
            continue;
        }

        /*
         * Don't allow the keyword dictionary to grow
         * without bounds.
         */
        if (
            !Object.prototype.hasOwnProperty.call(
                store,
                token
            ) &&
            Object.keys(store).length >= CONFIG.maxKeywords
        ) {
            break;
        }

        store[token] =
            (store[token] || 0) + 1;
    }

    /*
     * Synchronize the internal session.
     */
    const session = getSession(user);
    session.sources.add("Local profile");

    return store;
}


// ============================================================
// ALIAS DETECTION
// ============================================================

function generateLeetspeak(value) {
    return value.replace(
        /[aeios]/g,
        character => {
            const map = {
                a: "4",
                e: "3",
                i: "1",
                o: "0",
                s: "5"
            };

            return map[character] || character;
        }
    );
}


export function detectAliases(user) {
    const username = normalize(user);
    const session = getSession(user);

    if (!username) {
        return [];
    }

    const aliases = new Set();

    const add = alias => {
        alias = normalize(alias);

        if (
            alias &&
            aliases.size < CONFIG.maxAliases
        ) {
            aliases.add(alias);
        }
    };

    /*
     * Original username.
     */
    add(username);

    /*
     * Numeric-stripped version.
     *
     * Example:
     * 4zx16 -> zx
     */
    add(
        username.replace(/[0-9]/g, "")
    );

    /*
     * Leetspeak representation.
     */
    add(
        generateLeetspeak(username)
    );

    /*
     * Common development suffixes.
     */
    add(`${username}dev`);
    add(`${username}_dev`);

    /*
     * Common alternate-account naming.
     */
    add(`${username}alt`);
    add(`${username}_alt`);

    /*
     * Underscore-prefixed variant.
     */
    add(`_${username}`);

    /*
     * Short numeric variants.
     *
     * These are deliberately limited because
     * arbitrary alias generation creates noise.
     */
    if (username.length > 4) {
        add(
            username.slice(0, -1)
        );
    }

    for (const alias of aliases) {
        session.aliases.add(alias);
    }

    /*
     * The controller maintains its own aliasCandidates Set.
     * Because the controller doesn't pass it to this module,
     * we mirror the results onto window when possible.
     *
     * This is only for compatibility with the existing script.
     */
    if (
        window.aliasCandidates instanceof Set
    ) {
        for (const alias of aliases) {
            window.aliasCandidates.add(alias);
        }
    }

    return [...aliases];
}


// ============================================================
// FINGERPRINTING
// ============================================================

function calculateEntropy(keywords) {
    const values = Object.values(
        keywords || {}
    ).filter(
        value =>
            Number.isFinite(value) &&
            value > 0
    );

    if (!values.length) {
        return 0;
    }

    const total =
        values.reduce(
            (sum, value) =>
                sum + value,
            0
        );

    let entropy = 0;

    for (const value of values) {
        const probability =
            value / total;

        entropy -=
            probability *
            Math.log2(probability);
    }

    return Number(
        entropy.toFixed(3)
    );
}


function getTopKeywords(keywords, limit = 20) {
    return Object.entries(
        keywords || {}
    )
        .sort(
            (a, b) =>
                b[1] - a[1]
        )
        .slice(0, limit)
        .map(
            ([keyword, count]) => ({
                keyword,
                count
            })
        );
}


export function buildFingerprint(user, keywords) {
    const username = String(user ?? "");
    const session = getSession(user);

    const fingerprint = {
        username,

        usernameLength:
            username.length,

        digits:
            /\d/.test(username),

        uppercase:
            /[A-Z]/.test(username),

        underscore:
            username.includes("_"),

        hyphen:
            username.includes("-"),

        dot:
            username.includes("."),

        symbols:
            /[^a-zA-Z0-9._-]/.test(username),

        keywordCount:
            Object.keys(
                keywords || {}
            ).length,

        keywordEntropy:
            calculateEntropy(
                keywords
            ),

        topKeywords:
            getTopKeywords(
                keywords
            ),

        aliasCount:
            session.aliases.size,

        sourceCount:
            session.sources.size,

        github:
            {
                found:
                    session.github.found,

                repositories:
                    session.github.repositories.length,

                organizations:
                    session.github.organizations.length
            },

        generatedAt:
            new Date().toISOString()
    };

    session.fingerprints = fingerprint;

    /*
     * Compatibility with a controller that exposes
     * a global fingerprint object.
     */
    if (
        typeof window !== "undefined"
    ) {
        window.fingerprintProfile =
            fingerprint;

        window.userFingerprints ??= {};
        window.userFingerprints[user] =
            fingerprint;
    }

    return fingerprint;
}


// ============================================================
// FINGERPRINT DISPLAY
// ============================================================

export function displayFingerprint(
    container = document.getElementById(
        "dynamicProfile"
    )
) {
    if (!container) {
        return;
    }

    const user =
        getCurrentUserFromContainer(
            container
        );

    const session =
        user
            ? getSession(user)
            : null;

    const fingerprint =
        session?.fingerprints ||
        window.fingerprintProfile ||
        {};

    /*
     * Don't destroy previously generated sections.
     */
    const section =
        createSection(
            "Passive Fingerprint"
        );

    const list =
        document.createElement("ul");

    const rows = [
        [
            "Username",
            fingerprint.username
        ],
        [
            "Length",
            fingerprint.usernameLength
        ],
        [
            "Contains digits",
            fingerprint.digits
        ],
        [
            "Contains uppercase",
            fingerprint.uppercase
        ],
        [
            "Contains underscore",
            fingerprint.underscore
        ],
        [
            "Contains hyphen",
            fingerprint.hyphen
        ],
        [
            "Contains dot",
            fingerprint.dot
        ],
        [
            "Contains symbols",
            fingerprint.symbols
        ],
        [
            "Keyword count",
            fingerprint.keywordCount
        ],
        [
            "Keyword entropy",
            fingerprint.keywordEntropy
        ],
        [
            "Alias candidates",
            fingerprint.aliasCount
        ],
        [
            "Sources",
            fingerprint.sourceCount
        ]
    ];

    for (const [label, value] of rows) {
        list.appendChild(
            createListItem(
                label,
                value
            )
        );
    }

    section.appendChild(list);

    /*
     * Top keywords.
     */
    if (
        Array.isArray(
            fingerprint.topKeywords
        ) &&
        fingerprint.topKeywords.length
    ) {
        const heading =
            document.createElement("h4");

        heading.textContent =
            "Top Keywords";

        section.appendChild(
            heading
        );

        const keywordList =
            document.createElement("ul");

        for (
            const item of
            fingerprint.topKeywords
        ) {
            keywordList.appendChild(
                createListItem(
                    item.keyword,
                    item.count
                )
            );
        }

        section.appendChild(
            keywordList
        );
    }

    /*
     * GitHub summary.
     */
    if (fingerprint.github) {
        const githubHeading =
            document.createElement("h4");

        githubHeading.textContent =
            "GitHub Signal";

        section.appendChild(
            githubHeading
        );

        const githubList =
            document.createElement("ul");

        githubList.appendChild(
            createListItem(
                "Account found",
                fingerprint.github.found
            )
        );

        githubList.appendChild(
            createListItem(
                "Repositories collected",
                fingerprint.github.repositories
            )
        );

        githubList.appendChild(
            createListItem(
                "Organizations collected",
                fingerprint.github.organizations
            )
        );

        section.appendChild(
            githubList
        );
    }

    container.appendChild(
        section
    );
}


// ============================================================
// PERSONA / CONTENT SIGNAL ANALYSIS
// ============================================================
//
// Important:
//
// This does NOT pretend that arbitrary keywords can establish
// someone's psychology. It reports observable content signals.
//
// ============================================================

const SIGNALS = {
    technical: [
        "rust",
        "cpp",
        "c++",
        "python",
        "javascript",
        "typescript",
        "linux",
        "kernel",
        "backend",
        "database",
        "security",
        "cryptography",
        "encryption",
        "networking",
        "systems",
        "infrastructure",
        "api",
        "compiler",
        "reverse",
        "engineering"
    ],

    security: [
        "exploit",
        "exploitation",
        "vulnerability",
        "bypass",
        "pentest",
        "pentesting",
        "malware",
        "security",
        "redteam",
        "blueteam",
        "purpleteam",
        "threat",
        "opsec",
        "osint"
    ],

    privacy: [
        "privacy",
        "telemetry",
        "tracking",
        "anonymous",
        "anonymity",
        "tor",
        "vpn",
        "encryption",
        "e2ee",
        "secure"
    ],

    creative: [
        "game",
        "gaming",
        "unity",
        "unreal",
        "music",
        "audio",
        "design",
        "story",
        "narrative"
    ],

    ai: [
        "ai",
        "machine",
        "learning",
        "model",
        "neural",
        "inference",
        "llm"
    ]
};


function collectSignalMatches(
    keywords,
    signalWords
) {
    const matches = [];

    for (const keyword of Object.keys(
        keywords || {}
    )) {
        if (
            signalWords.includes(
                normalize(keyword)
            )
        ) {
            matches.push(
                keyword
            );
        }
    }

    return unique(matches);
}


export function inferPersona(
    keywords,
    container = document.getElementById(
        "dynamicProfile"
    )
) {
    const matches = {
        technical:
            collectSignalMatches(
                keywords,
                SIGNALS.technical
            ),

        security:
            collectSignalMatches(
                keywords,
                SIGNALS.security
            ),

        privacy:
            collectSignalMatches(
                keywords,
                SIGNALS.privacy
            ),

        creative:
            collectSignalMatches(
                keywords,
                SIGNALS.creative
            ),

        ai:
            collectSignalMatches(
                keywords,
                SIGNALS.ai
            )
    };

    /*
     * Determine the strongest content domains.
     */
    const ranked =
        Object.entries(matches)
            .map(
                ([category, evidence]) => ({
                    category,
                    evidence,
                    score:
                        evidence.length
                })
            )
            .sort(
                (a, b) =>
                    b.score - a.score
            );

    const session =
        findSessionByKeywords(
            keywords
        );

    if (session) {
        session.personaSignals =
            ranked;
    }

    if (!container) {
        return ranked;
    }

    const section =
        createSection(
            "Content Signal Analysis"
        );

    const list =
        document.createElement("ul");

    const labels = {
        technical:
            "Technical / Systems",

        security:
            "Security",

        privacy:
            "Privacy",

        creative:
            "Creative / Multimedia",

        ai:
            "Artificial Intelligence"
    };

    let emitted = 0;

    for (const item of ranked) {

        if (!item.score) {
            continue;
        }

        emitted++;

        const li =
            document.createElement("li");

        const strong =
            document.createElement(
                "strong"
            );

        strong.textContent =
            labels[item.category];

        li.appendChild(strong);

        li.appendChild(
            document.createTextNode(
                ` — ${item.evidence.join(", ")}`
            )
        );

        list.appendChild(li);
    }

    if (!emitted) {
        const li =
            document.createElement("li");

        li.textContent =
            "No strong content-domain signal detected.";

        list.appendChild(li);
    }

    section.appendChild(list);

    const note =
        document.createElement("p");

    note.textContent =
        "Signals are derived from observable text and should not be treated as definitive personality or psychological classifications.";

    section.appendChild(note);

    container.appendChild(
        section
    );

    return ranked;
}


// ============================================================
// GITHUB API
// ============================================================

async function githubRequest(
    path
) {
    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () =>
                controller.abort(),
            CONFIG.requestTimeout
        );

    try {
        const response =
            await fetch(
                `${CONFIG.githubApi}${path}`,
                {
                    method: "GET",

                    headers: {
                        "Accept":
                            "application/vnd.github+json",

                        "X-GitHub-Api-Version":
                            "2022-11-28"
                    },

                    signal:
                        controller.signal
                }
            );

        if (
            response.status === 403
        ) {
            const remaining =
                response.headers.get(
                    "x-ratelimit-remaining"
                );

            if (remaining === "0") {
                throw new Error(
                    "GitHub API rate limit exhausted."
                );
            }
        }

        if (
            !response.ok
        ) {
            throw new Error(
                `GitHub API returned HTTP ${response.status}.`
            );
        }

        return await response.json();

    } finally {
        clearTimeout(timeout);
    }
}


async function githubPages(
    path
) {
    const results = [];

    for (
        let page = 1;
        page <= CONFIG.githubMaxPages;
        page++
    ) {
        const separator =
            path.includes("?")
                ? "&"
                : "?";

        const data =
            await githubRequest(
                `${path}${separator}per_page=${CONFIG.githubPerPage}&page=${page}`
            );

        if (
            !Array.isArray(data)
        ) {
            break;
        }

        results.push(
            ...data
        );

        if (
            data.length <
            CONFIG.githubPerPage
        ) {
            break;
        }
    }

    return results;
}


// ============================================================
// GITHUB ANALYSIS
// ============================================================

export async function fetchGitHubKeywords(
    user
) {
    const username =
        normalize(user);

    const session =
        getSession(user);

    const keywords =
        getControllerKeywordStore(
            user
        );

    if (!username) {
        return keywords;
    }

    try {
        /*
         * GitHub profile.
         */
        const profile =
            await githubRequest(
                `/users/${encodeURIComponent(username)}`
            );

        session.github.found =
            true;

        session.github.profile =
            profile;

        session.sources.add(
            "GitHub profile"
        );

        extractKeywords(
            profile.login,
            username,
            keywords
        );

        extractKeywords(
            profile.name,
            username,
            keywords
        );

        extractKeywords(
            profile.bio,
            username,
            keywords
        );

        extractKeywords(
            profile.company,
            username,
            keywords
        );

        extractKeywords(
            profile.blog,
            username,
            keywords
        );

        /*
         * Repositories.
         */
        const repositories =
            await githubPages(
                `/users/${encodeURIComponent(username)}/repos?sort=updated`
            );

        session.github.repositories =
            repositories;

        if (repositories.length) {
            session.sources.add(
                "GitHub repositories"
            );
        }

        for (
            const repository of
            repositories
        ) {
            extractKeywords(
                repository.name,
                username,
                keywords
            );

            extractKeywords(
                repository.description,
                username,
                keywords
            );

            extractKeywords(
                repository.language,
                username,
                keywords
            );

            if (
                Array.isArray(
                    repository.topics
                )
            ) {
                extractKeywords(
                    repository.topics.join(" "),
                    username,
                    keywords
                );
            }
        }

        /*
         * Organizations.
         */
        const organizations =
            await githubPages(
                `/users/${encodeURIComponent(username)}/orgs`
            );

        session.github.organizations =
            organizations;

        if (organizations.length) {
            session.sources.add(
                "GitHub organizations"
            );
        }

        for (
            const organization of
            organizations
        ) {
            extractKeywords(
                organization.login,
                username,
                keywords
            );

            extractKeywords(
                organization.description,
                username,
                keywords
            );
        }

        return keywords;

    } catch (error) {

        /*
         * A 404 simply means there isn't a
         * matching public GitHub account.
         */
        if (
            String(error.message)
                .includes("HTTP 404")
        ) {
            session.github.found =
                false;

            session.github.error =
                "GitHub account not found.";

            return keywords;
        }

        session.github.error =
            error.message;

        addWarning(
            user,
            `GitHub analysis failed: ${error.message}`
        );

        console.warn(
            "[OIST] GitHub analysis failed:",
            error
        );

        return keywords;
    }
}


// ============================================================
// GRAPH
// ============================================================

export function buildGraph(user) {
    const username =
        String(user);

    const session =
        getSession(user);

    const nodes = [];
    const links = [];

    const nodeIds =
        new Set();

    const linkIds =
        new Set();


    function addNode(
        id,
        group,
        metadata = {}
    ) {
        id = String(id);

        if (!id) {
            return false;
        }

        if (
            nodeIds.has(id)
        ) {
            return true;
        }

        if (
            nodes.length >=
            CONFIG.maxGraphNodes
        ) {
            return false;
        }

        nodes.push({
            id,
            group,
            ...metadata
        });

        nodeIds.add(id);

        return true;
    }


    function addLink(
        source,
        target,
        type
    ) {
        const key =
            `${source}\u0000${target}\u0000${type}`;

        if (
            linkIds.has(key)
        ) {
            return;
        }

        if (
            links.length >=
            CONFIG.maxGraphLinks
        ) {
            return;
        }

        links.push({
            source,
            target,
            type
        });

        linkIds.add(key);
    }


    /*
     * Primary node.
     */
    addNode(
        username,
        1,
        {
            primary: true,
            type: "identity"
        }
    );


    /*
     * Alias nodes.
     */
    for (
        const alias of
        session.aliases
    ) {
        if (
            alias === username
        ) {
            continue;
        }

        if (
            addNode(
                alias,
                2,
                {
                    type: "alias"
                }
            )
        ) {
            addLink(
                username,
                alias,
                "alias"
            );
        }
    }


    /*
     * GitHub node.
     *
     * This represents the public source,
     * not proof that every GitHub artifact
     * belongs to the searched person.
     */
    if (
        session.github.found
    ) {
        const githubNode =
            `github:${username}`;

        addNode(
            githubNode,
            3,
            {
                type: "source",
                label: "GitHub"
            }
        );

        addLink(
            username,
            githubNode,
            "source"
        );


        /*
         * Repository nodes.
         *
         * Keep this bounded so a large GitHub
         * account doesn't turn the graph into
         * an unusable hairball.
         */
        for (
            const repository of
            session.github.repositories.slice(
                0,
                100
            )
        ) {
            const repoId =
                `repo:${repository.full_name}`;

            if (
                addNode(
                    repoId,
                    4,
                    {
                        type: "repository",
                        label:
                            repository.name
                    }
                )
            ) {
                addLink(
                    githubNode,
                    repoId,
                    "repository"
                );
            }
        }
    }


    /*
     * Copy into the controller's globals.
     *
     * Your current script uses:
     *
     * state.graphNodes
     * state.graphLinks
     *
     * but does not pass those objects into OIST.js.
     *
     * Mirroring them here preserves compatibility.
     */
    if (
        typeof window !== "undefined"
    ) {
        window.graphNodes =
            nodes;

        window.graphLinks =
            links;
    }

    session.graphNodes =
        nodes;

    session.graphLinks =
        links;

    return {
        nodes,
        links
    };
}


// ============================================================
// GRAPH RENDERING
// ============================================================

export function renderGraph() {

    const container =
        document.getElementById(
            "dynamicProfile"
        );

    if (!container) {
        return null;
    }

    if (
        typeof window.d3 ===
        "undefined"
    ) {
        console.warn(
            "[OIST] D3 is not available; graph rendering skipped."
        );

        const warning =
            createSection(
                "Identity Graph"
            );

        warning.appendChild(
            document.createTextNode(
                "D3 is not loaded. Graph rendering is unavailable."
            )
        );

        container.appendChild(
            warning
        );

        return null;
    }


    /*
     * Prefer the current controller-compatible globals.
     */
    const nodes =
        Array.isArray(
            window.graphNodes
        )
            ? window.graphNodes
            : [];


    const links =
        Array.isArray(
            window.graphLinks
        )
            ? window.graphLinks
            : [];


    if (!nodes.length) {
        return null;
    }


    /*
     * Remove an existing OIST graph if the
     * function is accidentally called twice.
     */
    const oldGraph =
        container.querySelector(
            "[data-oist-graph]"
        );

    if (oldGraph) {
        oldGraph.remove();
    }


    const section =
        createSection(
            "Identity Graph"
        );

    section.dataset.oistGraph =
        "true";


    const width =
        Math.max(
            320,
            Math.min(
                900,
                container.clientWidth ||
                    700
            )
        );

    const height =
        450;


    const svg =
        d3
            .select(section)
            .append("svg")
            .attr(
                "viewBox",
                `0 0 ${width} ${height}`
            )
            .attr(
                "width",
                "100%"
            )
            .attr(
                "height",
                height
            )
            .attr(
                "role",
                "img"
            )
            .attr(
                "aria-label",
                "Identity relationship graph"
            );


    /*
     * Simulation.
     */
    const simulation =
        d3
            .forceSimulation(
                nodes
            )
            .force(
                "link",
                d3
                    .forceLink(
                        links
                    )
                    .id(
                        node =>
                            node.id
                    )
                    .distance(
                        link => {
                            if (
                                link.type ===
                                "alias"
                            ) {
                                return 90;
                            }

                            if (
                                link.type ===
                                "repository"
                            ) {
                                return 120;
                            }

                            return 100;
                        }
                    )
            )
            .force(
                "charge",
                d3
                    .forceManyBody()
                    .strength(-300)
            )
            .force(
                "center",
                d3.forceCenter(
                    width / 2,
                    height / 2
                )
            )
            .force(
                "collision",
                d3
                    .forceCollide()
                    .radius(25)
            );


    /*
     * Links.
     */
    const link =
        svg
            .append("g")
            .attr(
                "class",
                "oist-links"
            )
            .selectAll("line")
            .data(
                links
            )
            .join("line")
            .attr(
                "stroke",
                link => {
                    switch (
                        link.type
                    ) {
                        case "alias":
                            return "#f778ba";

                        case "source":
                            return "#7ee787";

                        case "repository":
                            return "#8b949e";

                        default:
                            return "#555";
                    }
                }
            )
            .attr(
                "stroke-width",
                1.5
            )
            .attr(
                "opacity",
                0.75
            );


    /*
     * Nodes.
     */
    const node =
        svg
            .append("g")
            .attr(
                "class",
                "oist-nodes"
            )
            .selectAll("circle")
            .data(
                nodes
            )
            .join("circle")
            .attr(
                "r",
                node =>
                    node.primary
                        ? 9
                        : 6
            )
            .attr(
                "fill",
                node => {

                    if (
                        node.primary
                    ) {
                        return "#58a6ff";
                    }

                    switch (
                        node.type
                    ) {
                        case "alias":
                            return "#f778ba";

                        case "source":
                            return "#7ee787";

                        case "repository":
                            return "#8b949e";

                        default:
                            return "#c9d1d9";
                    }
                }
            )
            .attr(
                "stroke",
                "#0b0e13"
            )
            .attr(
                "stroke-width",
                1.5
            );


    /*
     * Labels.
     */
    const label =
        svg
            .append("g")
            .attr(
                "class",
                "oist-labels"
            )
            .selectAll("text")
            .data(
                nodes
            )
            .join("text")
            .text(
                node =>
                    node.label ||
                    node.id
            )
            .attr(
                "font-size",
                node =>
                    node.primary
                        ? "12px"
                        : "10px"
            )
            .attr(
                "font-weight",
                node =>
                    node.primary
                        ? "700"
                        : "400"
            )
            .attr(
                "fill",
                "currentColor"
            )
            .attr(
                "pointer-events",
                "none"
            );


    /*
     * Drag support.
     */
    node.call(
        d3
            .drag()
            .on(
                "start",
                (event, d) => {

                    if (
                        !event.active
                    ) {
                        simulation
                            .alphaTarget(
                                0.3
                            )
                            .restart();
                    }

                    d.fx = d.x;
                    d.fy = d.y;
                }
            )
            .on(
                "drag",
                (event, d) => {
                    d.fx =
                        event.x;

                    d.fy =
                        event.y;
                }
            )
            .on(
                "end",
                (event, d) => {

                    if (
                        !event.active
                    ) {
                        simulation
                            .alphaTarget(
                                0
                            );
                    }

                    d.fx = null;
                    d.fy = null;
                }
            )
    );


    /*
     * Tooltip-like native browser title.
     */
    node.append("title")
        .text(
            node => {
                if (
                    node.primary
                ) {
                    return `${node.id} — primary identity`;
                }

                if (
                    node.type ===
                    "alias"
                ) {
                    return `${node.id} — alias candidate`;
                }

                if (
                    node.type ===
                    "source"
                ) {
                    return `${node.label || node.id} — public source`;
                }

                if (
                    node.type ===
                    "repository"
                ) {
                    return `${node.label || node.id} — repository`;
                }

                return node.id;
            }
        );


    /*
     * Simulation tick.
     */
    simulation.on(
        "tick",
        () => {

            link
                .attr(
                    "x1",
                    d => d.source.x
                )
                .attr(
                    "y1",
                    d => d.source.y
                )
                .attr(
                    "x2",
                    d => d.target.x
                )
                .attr(
                    "y2",
                    d => d.target.y
                );

            node
                .attr(
                    "cx",
                    d => d.x
                )
                .attr(
                    "cy",
                    d => d.y
                );

            label
                .attr(
                    "x",
                    d => d.x + 9
                )
                .attr(
                    "y",
                    d => d.y + 4
                );
        }
    );


    container.appendChild(
        section
    );


    return {
        svg,
        simulation,
        nodes,
        links
    };
}


// ============================================================
// CONTROLLER COMPATIBILITY HELPERS
// ============================================================

function getControllerKeywordStore(
    user
) {
    /*
     * Your script currently creates:
     *
     * state.keywordCache = {};
     *
     * and then:
     *
     * const keywords =
     *     state.keywordCache[user] ??= {};
     *
     * OIST.js does not receive `state`, so the
     * easiest compatibility bridge is to use
     * the same global object when available.
     *
     * If it isn't exposed, the module falls back
     * to its own session-local keyword store.
     */

    if (
        window.__OISTKeywordCache &&
        typeof window.__OISTKeywordCache ===
            "object"
    ) {
        return (
            window.__OISTKeywordCache[user] ||=
                {}
        );
    }

    const session =
        getSession(user);

    session.keywords ||=
        {};

    return session.keywords;
}


function findSessionByKeywords(
    keywords
) {
    for (const session of sessions.values()) {
        if (
            session.keywords ===
            keywords
        ) {
            return session;
        }
    }

    return null;
}


function getCurrentUserFromContainer(
    container
) {
    /*
     * Search for the heading generated by
     * the controller:
     *
     * Search Results for: USER
     */
    const heading =
        container.closest(
            "#result"
        )?.querySelector(
            "h2"
        );

    if (!heading) {
        /*
         * Fall back to the only active session.
         */
        if (
            sessions.size === 1
        ) {
            return [
                ...sessions.keys()
            ][0];
        }

        return null;
    }

    const match =
        heading.textContent.match(
            /Search Results for:\s*(.+)$/i
        );

    return match
        ? normalize(match[1])
        : null;
}


// ============================================================
// OPTIONAL DEBUG API
// ============================================================

export function getAnalysis(user) {
    const session =
        getSession(user);

    return {
        username:
            session.username,

        aliases:
            [...session.aliases],

        sources:
            [...session.sources],

        fingerprint:
            session.fingerprints,

        confidence:
            session.confidence,

        github:
            session.github,

        personaSignals:
            session.personaSignals,

        graphNodes:
            session.graphNodes,

        graphLinks:
            session.graphLinks,

        warnings:
            session.warnings
    };
}


export function clearAnalysis(user) {
    if (user) {
        sessions.delete(
            normalize(user)
        );

        return;
    }

    sessions.clear();
}
