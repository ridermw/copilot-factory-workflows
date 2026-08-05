// L1 -- structural verification of the article-derived example corpus.
//
// This suite proves three things, all of them free and offline:
//
//   fixture.manifest  --normalizeManifest-->  zero errors, nothing dropped
//   fixture.scenarios --projectRun--------->  the exact per-node states claimed
//   examples/corpus   --coverage----------->  all 24 items accounted for
//
// It deliberately does NOT execute any `run` body -- that is L3
// (tests/harness.test.mjs). What it does check about `run` is the one property
// that can be established statically and that silently breaks factories:
// a run function must close over nothing, so it may not carry static imports.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { check, summary } from "./_check.mjs";
import { normalizeManifest } from "../extensions/workflow-factory-canvas/manifest.mjs";
import { projectRun } from "../extensions/workflow-factory-canvas/projection.mjs";
import { CORPUS, PATTERN_FIXTURES, RUN_FIXTURES } from "../examples/corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "examples");

/** Load every fixture in a tier directory, tagged with where it came from. */
async function loadTier(tier) {
    const dir = join(examplesDir, tier);
    const files = readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();
    const out = [];
    for (const file of files) {
        const mod = await import(new URL(`../examples/${tier}/${file}`, import.meta.url));
        out.push({ tier, file, fixture: mod.default });
    }
    return out;
}

const loaded = [...(await loadTier("patterns")), ...(await loadTier("runs"))];

console.log("== corpus: fixtures load and are shaped consistently");

check("ten fixtures on disk", loaded.length === 10, { found: loaded.length });

const patternIds = loaded.filter((l) => l.tier === "patterns").map((l) => l.fixture.id).sort();
const runIds = loaded.filter((l) => l.tier === "runs").map((l) => l.fixture.id).sort();

check(
    "pattern fixture ids match the corpus index",
    JSON.stringify(patternIds) === JSON.stringify([...PATTERN_FIXTURES].sort()),
    { onDisk: patternIds, indexed: [...PATTERN_FIXTURES].sort() }
);
check(
    "run fixture ids match the corpus index",
    JSON.stringify(runIds) === JSON.stringify([...RUN_FIXTURES].sort()),
    { onDisk: runIds, indexed: [...RUN_FIXTURES].sort() }
);

const seenIds = new Set();
for (const { file, fixture: f } of loaded) {
    const at = (what) => `${file}: ${what}`;

    check(at("has a unique id"), typeof f.id === "string" && f.id && !seenIds.has(f.id), { id: f.id });
    seenIds.add(f.id);
    check(at("has a title"), typeof f.title === "string" && f.title.length > 0);
    check(
        at("cites the article section and url"),
        typeof f.source?.section === "string" &&
            f.source.section.length > 0 &&
            typeof f.source?.url === "string" &&
            f.source.url.startsWith("https://claude.com/blog/"),
        f.source
    );
    check(at("exports a run function"), typeof f.run === "function");
    check(at("has at least one scenario"), Array.isArray(f.scenarios) && f.scenarios.length > 0);
}

console.log("\n== corpus: run bodies are self-contained");

// `ctx.run` is stringified and handed to the runtime, so anything it closes
// over is gone. A static import is the failure that looks most like working
// code while being guaranteed to break at execution time.
for (const { file, fixture: f } of loaded) {
    const src = String(f.run);
    check(`${file}: run has no static import`, !/\bimport\s+[\w{*]/.test(src) && !/\bimport\s*\(/.test(src), {
        hit: src.match(/\bimport[\s(][^\n]*/)?.[0] ?? null,
    });
    check(`${file}: run has no require()`, !/\brequire\s*\(/.test(src), {
        hit: src.match(/\brequire\s*\([^\n]*/)?.[0] ?? null,
    });
    check(`${file}: run validates ctx.args before use`, /args\?\./.test(src) || /args\s*\?\?/.test(src), {
        note: "expected a guarded read of ctx.args",
    });
    check(`${file}: run throws on bad args`, /throw new Error\(/.test(src));
}

console.log("\n== corpus: manifests normalize cleanly and lose nothing");

const normalized = new Map();
for (const { file, fixture: f } of loaded) {
    const res = normalizeManifest(f.manifest);
    normalized.set(f.id, res.manifest);

    check(`${file}: normalizes with zero errors`, res.errors.length === 0, res.errors);
    check(
        `${file}: keeps every declared node`,
        res.manifest.nodes.length === f.manifest.nodes.length,
        { declared: f.manifest.nodes.length, kept: res.manifest.nodes.length }
    );
    check(
        `${file}: keeps every declared edge`,
        res.manifest.edges.length === f.manifest.edges.length,
        { declared: f.manifest.edges.length, kept: res.manifest.edges.length }
    );
    check(
        `${file}: keeps every declared phase`,
        res.manifest.phases.length === f.manifest.phases.length,
        { declared: f.manifest.phases.length, kept: res.manifest.phases.length }
    );
    const declaredGroups = f.manifest.groups?.length ?? 0;
    check(
        `${file}: keeps every declared group`,
        (res.manifest.groups?.length ?? 0) === declaredGroups,
        { declared: declaredGroups, kept: res.manifest.groups?.length ?? 0 }
    );
}

console.log("\n== corpus: manifests correlate with the factory metadata");

// Correlation is by name and by title, not by id. Drift here is the failure
// mode that produces a canvas where every node lands in one column.
for (const { file, fixture: f } of loaded) {
    check(`${file}: factoryName equals meta.name`, f.manifest.factoryName === f.meta.name, {
        factoryName: f.manifest.factoryName,
        metaName: f.meta.name,
    });

    const manifestTitles = normalized.get(f.id).phases.map((p) => p.title.trim().toLowerCase());
    const metaTitles = (f.meta.phases ?? []).map((p) => p.title.trim().toLowerCase());
    check(
        `${file}: every meta phase title has a manifest phase`,
        metaTitles.every((t) => manifestTitles.includes(t)),
        { metaTitles, manifestTitles }
    );
    check(`${file}: phase counts agree`, metaTitles.length === manifestTitles.length, {
        meta: metaTitles.length,
        manifest: manifestTitles.length,
    });

    const labels = f.manifest.nodes.map((n) => n.label.trim().toLowerCase());
    check(`${file}: node labels are unique`, new Set(labels).size === labels.length, {
        duplicates: labels.filter((l, i) => labels.indexOf(l) !== i),
    });

    check(
        `${file}: declares agent limits`,
        Number.isFinite(f.meta.limits?.maxTotalSubagents) &&
            Number.isFinite(f.meta.limits?.maxAiCredits),
        f.meta.limits
    );
}

console.log("\n== corpus: every group member resolves");

for (const { file, fixture: f } of loaded) {
    const groupIds = new Set((f.manifest.groups ?? []).map((g) => g.id));
    const pointers = f.manifest.nodes.map((n) => n.groupId).filter(Boolean);
    check(
        `${file}: every groupId points at a declared group`,
        pointers.every((p) => groupIds.has(p)),
        { pointers: [...new Set(pointers)], groups: [...groupIds] }
    );
    const norm = normalized.get(f.id);
    check(
        `${file}: normalization preserves group membership`,
        norm.nodes.filter((n) => n.groupId).length === pointers.length,
        { before: pointers.length, after: norm.nodes.filter((n) => n.groupId).length }
    );
}

console.log("\n== corpus: scenarios project to the states they claim");

for (const { file, fixture: f } of loaded) {
    const manifest = normalized.get(f.id);
    for (const sc of f.scenarios) {
        const at = `${file} [${sc.name}]`;
        const view = projectRun(manifest, sc.detail);

        check(`${at}: run status`, view.runStatus === sc.expect.runStatus, {
            got: view.runStatus,
            want: sc.expect.runStatus,
        });

        const byId = new Map(view.nodes.map((n) => [n.id, n]));
        for (const [nodeId, want] of Object.entries(sc.expect.nodeStates ?? {})) {
            const got = byId.get(nodeId);
            check(`${at}: ${nodeId} is ${want}`, got?.state === want, {
                got: got?.state ?? "(node missing)",
                want,
            });
        }

        check(`${at}: unmapped count`, view.unmappedCount === sc.expect.unmapped, {
            got: view.unmappedCount,
            want: sc.expect.unmapped,
        });

        check(`${at}: projection reports no errors`, (view.errors ?? []).length === 0, view.errors);

        // Every agent named in the scenario must be either mapped onto a
        // declared node or surfaced as unmapped. Silently vanishing agents
        // are the failure this pins down.
        const declaredLabels = new Set(f.manifest.nodes.map((n) => n.label.trim().toLowerCase()));
        const scenarioLabels = (sc.detail.agents ?? []).map((a) => a.label.trim().toLowerCase());
        const strays = scenarioLabels.filter((l) => !declaredLabels.has(l));
        check(`${at}: stray agents equal the unmapped count`, strays.length === sc.expect.unmapped, {
            strays,
            want: sc.expect.unmapped,
        });
    }
}

console.log("\n== corpus: article coverage is complete and accounted for");

check("corpus has 24 unique items", CORPUS.length === 24, { found: CORPUS.length });

const fixtureIds = new Set(loaded.map((l) => l.fixture.id));
const referenced = new Set();

for (const item of CORPUS) {
    const hasRealized = Array.isArray(item.realizedBy) && item.realizedBy.length > 0;
    const hasReason = typeof item.outOfScope === "string" && item.outOfScope.trim().length > 0;

    check(`${item.id}: is either realized or explicitly out of scope`, hasRealized !== hasReason, {
        realizedBy: item.realizedBy ?? null,
        outOfScope: item.outOfScope ?? null,
    });

    if (hasRealized) {
        for (const ref of item.realizedBy) {
            check(`${item.id}: realizedBy '${ref}' exists on disk`, fixtureIds.has(ref), {
                known: [...fixtureIds],
            });
            referenced.add(ref);
        }
    }
    if (hasReason) {
        // A one-word reason is how a deferral becomes untraceable three months
        // later. Require enough prose to reconstruct the decision.
        check(`${item.id}: out-of-scope reason is substantive`, item.outOfScope.length >= 40, {
            length: item.outOfScope.length,
        });
    }
}

check(
    "every fixture is referenced by at least one corpus item",
    [...fixtureIds].every((id) => referenced.has(id)),
    { orphaned: [...fixtureIds].filter((id) => !referenced.has(id)) }
);

const tiers = CORPUS.reduce((acc, i) => ({ ...acc, [i.tier]: (acc[i.tier] ?? 0) + 1 }), {});
check("tier split is 6 patterns / 8 prompts / 10 use cases", 
    tiers.pattern === 6 && tiers.prompt === 8 && tiers["use-case"] === 10, tiers);

summary();
