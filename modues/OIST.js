"use strict";

/*
 * OIST.js
 *
 * Unified OSINT analysis module.
 *
 * Designed specifically for:
 *
 *     whois/
 *     ├── script.js
 *     ├── individual/
 *     └── modues/
 *         └── OIST.js
 *
 * The controller explicitly passes its state into this module.
 * No window-global state is required.
 */

// ============================================================
// INTERNAL SESSION STATE
// ============================================================

const sessions = new Map();

function normalize(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

function getSession(user) {
    const key = normalize(user);

    if (!sessions.has(key)) {
        sessions.set(key, {
            username: key,

            aliases: new Set(),
            sources: new Set(),

            fingerprints: null,
            confidence: {},

            github: {
                found: false,
                profile: null,
                repositories: [],
                organizations: [],
                error: null
            },

            personaSignals: [],

            graphNodes: [],
            graphLinks: [],

            warnings: [],

            keywords: null
        });
    }

    return sessions.get(key);
}

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = Object.freeze({
    githubApi: "https://api.github.com",

    githubPerPage: 100,
    githubMaxPages: 5,

    requestTimeout: 10000,

    maxKeywordLength: 64,
    maxKeywords: 2500,

    maxAliases: 100,

    maxGraphNodes: 500,
    maxGraphLinks: 1000,

    maxRepositoriesInGraph: 100
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
// DOM UTILITIES
// ============================================================

function createSection(title) {
    const section =
        document.createElement("section");

    const heading =
        document.createElement("h3");

    heading.textContent = title;

    section.appendChild(heading);

    return section;
}

function createListItem(label, value) {
    const li =
        document.createElement("li");

    const strong =
        document.createElement("strong");

    strong.textContent =
        `${label}: `;

    li.appendChild(strong);

    li.appendChild(
        document.createTextNode(
            String(value)
        )
    );

    return li;
}

function unique(array) {
    return [...new Set(array)];
}

function addWarning(user, message) {
    const session =
        getSession(user);

    if (
        !session.warnings.includes(message)
    ) {
        session.warnings.push(message);
    }
}

// ============================================================
// KEYWORD EXTRACTION
// ============================================================

export function extractKeywords(
    text,
    user,
    store
) {
    if (!text || !store) {
        return store;
    }

    const username =
        normalize(user);

    let source =
        String(text).slice(0, 100000);

    /*
     * Remove URLs before tokenization.
     */
    source = source
        .replace(
            /https?:\/\/[^\s"'<>]+/gi,
            " "
        )
        .replace(
            /www\.[^\s"'<>]+/gi,
            " "
        );

    const tokens =
        source
            .toLowerCase()
            .match(
                /[a-z0-9][a-z0-9._+-]*/g
            ) || [];

    for (
        let token of tokens
    ) {
        token =
            token
                .replace(
                    /^[._+-]+/,
                    ""
                )
                .replace(
                    /[._+-]+$/,
                    ""
                );

        if (
            token.length <
                4 ||
            token.length >
                CONFIG.maxKeywordLength
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
         * Avoid obvious markup fragments.
         */
        if (
            token.startsWith("class") ||
            token.startsWith("style") ||
            token.startsWith("href")
        ) {
            continue;
        }

        const exists =
            Object.prototype.hasOwnProperty.call(
                store,
                token
            );

        if (
            !exists &&
            Object.keys(store).length >=
                CONFIG.maxKeywords
        ) {
            break;
        }

        store[token] =
            (store[token] || 0) + 1;
    }

    const session =
        getSession(user);

    session.sources.add(
        "Local profile"
    );

    session.keywords =
        store;

    return store;
}

// ============================================================
// ALIAS DETECTION
// ============================================================

function generateLeetspeak(value) {
    const map = {
        a: "4",
        e: "3",
        i: "1",
        o: "0",
        s: "5"
    };

    return value.replace(
        /[aeios]/g,
        character =>
            map[character] ||
            character
    );
}

export function detectAliases(
    user,
    aliasStore
) {
    const username =
        normalize(user);

    const session =
        getSession(user);

    if (!username) {
        return [];
    }

    const aliases =
        new Set();

    const add = alias => {
        alias =
            normalize(alias);

        if (
            alias &&
            aliases.size <
                CONFIG.maxAliases
        ) {
            aliases.add(alias);
        }
    };

    add(username);

    /*
     * Numeric-stripped variant.
     *
     * Example:
     * 4zx16 -> zx
     */
    add(
        username.replace(
            /[0-9]/g,
            ""
        )
    );

    /*
     * Leetspeak variant.
     */
    add(
        generateLeetspeak(
            username
        )
    );

    /*
     * Common development variants.
     */
    add(`${username}dev`);
    add(`${username}_dev`);

    /*
     * Alternate account variants.
     */
    add(`${username}alt`);
    add(`${username}_alt`);

    /*
     * Underscore-prefixed variant.
     */
    add(`_${username}`);

    /*
     * Shortened variant.
     */
    if (
        username.length > 4
    ) {
        add(
            username.slice(
                0,
                -1
            )
        );
    }

    for (
        const alias of aliases
    ) {
        session.aliases.add(
            alias
        );

        if (
            aliasStore instanceof Set
        ) {
            aliasStore.add(
                alias
            );
        }
    }

    return [
        ...aliases
    ];
}

// ============================================================
// FINGERPRINT
// ============================================================

function calculateEntropy(
    keywords
) {
    const values =
        Object.values(
            keywords || {}
        ).filter(
            value =>
                Number.isFinite(
                    value
                ) &&
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

    for (
        const value of values
    ) {
        const probability =
            value / total;

        entropy -=
            probability *
            Math.log2(
                probability
            );
    }

    return Number(
        entropy.toFixed(3)
    );
}

function getTopKeywords(
    keywords,
    limit = 20
) {
    return Object.entries(
        keywords || {}
    )
        .sort(
            (a, b) =>
                b[1] - a[1]
        )
        .slice(
            0,
            limit
        )
        .map(
            ([keyword, count]) => ({
                keyword,
                count
            })
        );
}

export function buildFingerprint(
    user,
    keywords,
    state
) {
    const username =
        String(user ?? "");

    const session =
        getSession(user);

    session.keywords =
        keywords;

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
            /[^a-zA-Z0-9._-]/.test(
                username
            ),

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

        github: {
            found:
                session.github.found,

            repositories:
                session.github.repositories
                    .length,

            organizations:
                session.github.organizations
                    .length
        },

        generatedAt:
            new Date().toISOString()
    };

    session.fingerprints =
        fingerprint;

    if (
        state?.fingerprints
    ) {
        state.fingerprints[user] =
            fingerprint;
    }

    return fingerprint;
}

// ============================================================
// FINGERPRINT DISPLAY
// ============================================================

export function displayFingerprint(
    container,
    user,
    state
) {
    if (!container) {
        return;
    }

    const session =
        getSession(user);

    const fingerprint =
        state?.fingerprints?.[user] ||
        session.fingerprints ||
        {};

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

    for (
        const [label, value]
        of rows
    ) {
        list.appendChild(
            createListItem(
                label,
                value
            )
        );
    }

    section.appendChild(
        list
    );

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
            const item
            of fingerprint.topKeywords
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

    if (
        fingerprint.github
    ) {
        const heading =
            document.createElement("h4");

        heading.textContent =
            "GitHub Signal";

        section.appendChild(
            heading
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
// CONTENT SIGNAL ANALYSIS
// ============================================================

const SIGNALS = {
    technical: [
        "rust",
        "cpp",
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

    for (
        const keyword
        of Object.keys(
            keywords || {}
        )
    ) {
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

    return unique(
        matches
    );
}

export function inferPersona(
    keywords,
    container
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

    const ranked =
        Object.entries(
            matches
        )
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
                    b.score -
                    a.score
            );

    /*
     * Find the session whose keyword
     * store is the one being analyzed.
     */
    for (
        const session
        of sessions.values()
    ) {
        if (
            session.keywords ===
            keywords
        ) {
            session.personaSignals =
                ranked;

            break;
        }
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

    for (
        const item of ranked
    ) {
        if (
            !item.score
        ) {
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

        li.appendChild(
            strong
        );

        li.appendChild(
            document.createTextNode(
                ` — ${item.evidence.join(", ")}`
            )
        );

        list.appendChild(
            li
        );
    }

    if (!emitted) {
        const li =
            document.createElement("li");

        li.textContent =
            "No strong content-domain signal detected.";

        list.appendChild(
            li
        );
    }

    section.appendChild(
        list
    );

    const note =
        document.createElement("p");

    note.textContent =
        "Signals are derived from observable text and should not be treated as definitive psychological classifications.";

    section.appendChild(
        note
    );

    container.appendChild(
        section
    );

    return ranked;
}

// ============================================================
// GITHUB REQUESTS
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
            response.status === 404
        ) {
            throw new Error(
                "GitHub account not found."
            );
        }

        if (
            response.status === 403
        ) {
            const remaining =
                response.headers.get(
                    "x-ratelimit-remaining"
                );

            if (
                remaining === "0"
            ) {
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
        clearTimeout(
            timeout
        );
    }
}

async function githubPages(
    path
) {
    const results = [];

    for (
        let page = 1;
        page <=
            CONFIG.githubMaxPages;
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
    user,
    keywordStore
) {
    const username =
        normalize(user);

    const session =
        getSession(user);

    const keywords =
        keywordStore ||
        session.keywords ||
        {};

    session.keywords =
        keywords;

    if (!username) {
        return keywords;
    }

    try {
        /*
         * Profile.
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

        if (
            repositories.length
        ) {
            session.sources.add(
                "GitHub repositories"
            );
        }

        for (
            const repository
            of repositories
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
                    repository.topics.join(
                        " "
                    ),
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

        if (
            organizations.length
        ) {
            session.sources.add(
                "GitHub organizations"
            );
        }

        for (
            const organization
            of organizations
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
        if (
            error.message ===
            "GitHub account not found."
        ) {
            session.github.found =
                false;

            session.github.error =
                error.message;

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
// GRAPH CONSTRUCTION
// ============================================================

export function buildGraph(
    user,
    state
) {
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
     * Primary identity.
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
     * Aliases.
     */
    const aliases =
        state?.aliasCandidates ||
        session.aliases;

    for (
        const alias
        of aliases
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
     * GitHub source.
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
         */
        for (
            const repository
            of session.github.repositories
                .slice(
                    0,
                    CONFIG.maxRepositoriesInGraph
                )
        ) {
            const repoId =
                `repo:${repository.full_name}`;

            if (
                addNode(
                    repoId,
                    4,
                    {
                        type:
                            "repository",

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

    session.graphNodes =
        nodes;

    session.graphLinks =
        links;

    /*
     * Synchronize the actual controller state.
     */
    if (state) {
        state.graphNodes =
            nodes;

        state.graphLinks =
            links;
    }

    return {
        nodes,
        links
    };
}

// ============================================================
// GRAPH RENDERING
// ============================================================

export function renderGraph(
    container,
    state
) {
    if (!container) {
        return null;
    }

    /*
     * D3 must be loaded by the HTML page.
     */
    if (
        typeof window === "undefined" ||
        typeof window.d3 === "undefined"
    ) {
        console.warn(
            "[OIST] D3 is not loaded; graph rendering skipped."
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

    const d3 =
        window.d3;

    const nodes =
        Array.isArray(
            state?.graphNodes
        )
            ? state.graphNodes
            : [];

    const links =
        Array.isArray(
            state?.graphLinks
        )
            ? state.graphLinks
            : [];

    if (!nodes.length) {
        return null;
    }

    /*
     * Remove an existing graph if rendering
     * happens more than once.
     */
    container
        .querySelectorAll(
            "[data-oist-graph]"
        )
        .forEach(
            element =>
                element.remove()
        );

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
     * Copy links before D3 mutates them.
     */
    const simulationLinks =
        links.map(link => ({
            ...link
        }));

    const simulation =
        d3
            .forceSimulation(
                nodes
            )
            .force(
                "link",
                d3
                    .forceLink(
                        simulationLinks
                    )
                    .id(
                        node =>
                            node.id
                    )
                    .distance(
                        link => {
                            switch (
                                link.type
                            ) {
                                case "alias":
                                    return 90;

                                case "repository":
                                    return 120;

                                default:
                                    return 100;
                            }
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
                simulationLinks
            )
            .join("line")
            .attr(
                "stroke",
                item => {
                    switch (
                        item.type
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
                item =>
                    item.primary
                        ? 9
                        : 6
            )
            .attr(
                "fill",
                item => {
                    if (
                        item.primary
                    ) {
                        return "#58a6ff";
                    }

                    switch (
                        item.type
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
                item =>
                    item.label ||
                    item.id
            )
            .attr(
                "font-size",
                item =>
                    item.primary
                        ? "12px"
                        : "10px"
            )
            .attr(
                "font-weight",
                item =>
                    item.primary
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
     * Native tooltip.
     */
    node.append("title")
        .text(
            item => {
                if (
                    item.primary
                ) {
                    return `${item.id} — primary identity`;
                }

                if (
                    item.type ===
                    "alias"
                ) {
                    return `${item.id} — alias candidate`;
                }

                if (
                    item.type ===
                    "source"
                ) {
                    return `${item.label || item.id} — public source`;
                }

                if (
                    item.type ===
                    "repository"
                ) {
                    return `${item.label || item.id} — repository`;
                }

                return item.id;
            }
        );

    /*
     * Drag support.
     */
    node.call(
        d3
            .drag()
            .on(
                "start",
                (event, item) => {
                    if (
                        !event.active
                    ) {
                        simulation
                            .alphaTarget(
                                0.3
                            )
                            .restart();
                    }

                    item.fx =
                        item.x;

                    item.fy =
                        item.y;
                }
            )
            .on(
                "drag",
                (event, item) => {
                    item.fx =
                        event.x;

                    item.fy =
                        event.y;
                }
            )
            .on(
                "end",
                (event, item) => {
                    if (
                        !event.active
                    ) {
                        simulation
                            .alphaTarget(
                                0
                            );
                    }

                    item.fx = null;
                    item.fy = null;
                }
            )
    );

    /*
     * Tick.
     */
    simulation.on(
        "tick",
        () => {
            link
                .attr(
                    "x1",
                    item =>
                        item.source.x
                )
                .attr(
                    "y1",
                    item =>
                        item.source.y
                )
                .attr(
                    "x2",
                    item =>
                        item.target.x
                )
                .attr(
                    "y2",
                    item =>
                        item.target.y
                );

            node
                .attr(
                    "cx",
                    item =>
                        item.x
                )
                .attr(
                    "cy",
                    item =>
                        item.y
                );

            label
                .attr(
                    "x",
                    item =>
                        item.x + 9
                )
                .attr(
                    "y",
                    item =>
                        item.y + 4
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
        links: simulationLinks
    };
}

// ============================================================
// DEBUG / API
// ============================================================

export function getAnalysis(
    user
) {
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

export function clearAnalysis(
    user
) {
    if (user) {
        sessions.delete(
            normalize(user)
        );

        return;
    }

    sessions.clear();
}
