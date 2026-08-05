/**
 * L3 — behavioural harness.
 *
 * L1 (`examples.test.mjs`) proves each fixture's *manifest* is internally
 * consistent. It says nothing about whether the `run` body actually produces the
 * graph the manifest claims. This suite closes that gap: it executes every
 * fixture's real `run` against a mock `ctx` and compares what the run *emitted*
 * against what the manifest *declared*.
 *
 * That mechanically catches the three failure modes called out in
 * `skills/plan-workflow/SKILL.md`:
 *
 *   - duplicate labels collapsing into one memoized agent
 *   - phase-title drift between `meta.phases` and the `phase()` calls
 *   - agents the manifest never declared (or declared and never spawned)
 *
 *     fixture.run(mockCtx)
 *         |
 *         +-- agent(prompt, {label, schema}) --> emittedLabels[]  --+
 *         |                                      synth(schema)     |
 *         +-- phase(title) ----------------> emittedPhases[]      |
 *         |                                                        v
 *         +-- parallel([thunk,...]) ---------------------> set-equality vs
 *                                                          fixture.manifest
 *
 * Branch coverage: each fixture is run three times with `pick` = 0, 1, 2. `pick`
 * selects the enum member and flips booleans, so a 3-member enum
 * (classify-and-act's category, deep-verification's verdict) and every boolean
 * gate are all exercised across the sweep. The assertion is on the *union* of
 * the three passes, because no single pass can reach every branch.
 *
 * Terminal artifact nodes (`kind: "terminal"`) are excluded from the expected
 * label set: they are outputs, not agents, and never appear in `emittedLabels`.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { check, summary } from "./_check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "examples");

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

// ---------------------------------------------------------------------------
// Schema -> value
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON-Schema -> plausible value.
 *
 * `pick` is the branch selector: it indexes into `enum` (clamped) and flips
 * booleans, so sweeping pick=0..2 walks the fixtures down different paths.
 * Strings are made unique per call so loop bodies that dedupe against a `seen`
 * list keep finding fresh work instead of stalling on round two.
 */
function makeSynth() {
    let seq = 0;
    return function synth(schema, pick, key = "value") {
        if (!schema || typeof schema !== "object") return {};
        if (Array.isArray(schema.enum) && schema.enum.length > 0) {
            return schema.enum[Math.min(pick, schema.enum.length - 1)];
        }
        switch (schema.type) {
            case "object": {
                const out = {};
                for (const [k, sub] of Object.entries(schema.properties ?? {})) {
                    out[k] = synth(sub, pick, k);
                }
                return out;
            }
            case "array":
                return [0, 1, 2].map((i) =>
                    synth(schema.items ?? { type: "string" }, pick, `${key}${i}`)
                );
            case "boolean":
                return pick % 2 === 0;
            case "number":
            case "integer":
                return pick + 1;
            default:
                seq += 1;
                return `${key}-${seq}`;
        }
    };
}

// ---------------------------------------------------------------------------
// Mock ctx
// ---------------------------------------------------------------------------

/**
 * Build the `ctx` a factory `run` is handed. Every call is recorded, and the
 * contract from `plan-workflow/SKILL.md` is enforced inline so a violation
 * surfaces as a named failure rather than as a confusing downstream mismatch.
 */
function makeCtx(args, pick) {
    const synth = makeSynth();
    const labels = [];
    const phases = [];
    const logs = [];
    const violations = [];

    const agent = async (prompt, options = {}) => {
        if (typeof prompt !== "string" || prompt.trim() === "") {
            violations.push("agent() called with an empty prompt");
        }
        const label = options?.label;
        if (typeof label !== "string" || label.trim() === "") {
            violations.push(`agent() called without a label (prompt: ${String(prompt).slice(0, 40)})`);
        } else {
            labels.push(label);
        }
        return synth(options?.schema, pick);
    };

    const parallel = async (thunks) => {
        if (!Array.isArray(thunks)) {
            violations.push("parallel() called with a non-array");
            return [];
        }
        const bad = thunks.filter((t) => typeof t !== "function").length;
        if (bad > 0) violations.push(`parallel() got ${bad} non-thunk entr(ies)`);
        return Promise.all(thunks.map((t) => (typeof t === "function" ? t() : t)));
    };

    const pipeline = async (thunks) => {
        if (!Array.isArray(thunks)) {
            violations.push("pipeline() called with a non-array");
            return [];
        }
        const out = [];
        for (const t of thunks) out.push(typeof t === "function" ? await t() : t);
        return out;
    };

    const step = async (name, fn) => (typeof fn === "function" ? fn() : fn);
    const phase = (title) => {
        if (typeof title !== "string" || title.trim() === "") {
            violations.push("phase() called with an empty title");
            return;
        }
        phases.push(title);
    };
    const log = (message) => logs.push(String(message));

    return {
        ctx: { args, agent, parallel, pipeline, step, phase, log },
        labels,
        phases,
        logs,
        violations,
    };
}

const norm = (s) => String(s).trim().toLowerCase();
const sortedUnique = (xs) => [...new Set(xs)].sort();
const same = (a, b) => JSON.stringify(sortedUnique(a)) === JSON.stringify(sortedUnique(b));

// ---------------------------------------------------------------------------

console.log("== harness: every fixture declares how to drive it");

for (const { file, fixture: f } of loaded) {
    check(
        `${file}: exports harnessArgs`,
        f.harnessArgs !== null && typeof f.harnessArgs === "object" && !Array.isArray(f.harnessArgs),
        { harnessArgs: f.harnessArgs }
    );
}

console.log("== harness: run bodies emit exactly the graph the manifest declares");

// A factory `run` is shipped to the runtime as source text: `String(run)` is the
// literal payload `factories_manage` takes. Calling the imported function object
// directly would keep its module closure alive, so a body that referenced a
// top-level import or helper would pass here and fail in production -- and the
// regex guards cannot see it, because top-level imports never appear in
// `String(f.run)`. Rehydrating through `new Function` reproduces the runtime's
// scope exactly: anything not defined inside the body is a ReferenceError.
function rehydrate(fn) {
    return new Function(`"use strict"; return (${String(fn)});`)();
}

for (const { file, fixture: f } of loaded) {
    const at = (what) => `${file}: ${what}`;

    let run = null;
    let rehydrateError = null;
    try {
        run = rehydrate(f.run);
    } catch (err) {
        rehydrateError = err?.message ?? String(err);
    }
    check(at("run survives serialization"), rehydrateError === null, { rehydrateError });
    if (!run) continue;

    const declaredLabels = (f.manifest?.nodes ?? [])
        .filter((n) => n.kind !== "terminal")
        .map((n) => n.label);
    const declaredPhases = (f.meta?.phases ?? []).map((p) => p.title);

    const allLabels = [];
    const allPhases = [];
    const allViolations = [];
    let threw = null;

    for (const pick of [0, 1, 2]) {
        const h = makeCtx(f.harnessArgs, pick);
        try {
            await run(h.ctx);
        } catch (err) {
            threw = threw ?? `pick=${pick}: ${err?.message ?? err}`;
        }
        allLabels.push(...h.labels);
        allPhases.push(...h.phases);
        allViolations.push(...h.violations.map((v) => `pick=${pick}: ${v}`));
    }

    check(at("run completes for every branch"), threw === null, { threw });
    check(at("run honours the ctx contract"), allViolations.length === 0, {
        violations: allViolations.slice(0, 4),
    });

    // Undeclared agents are the expensive failure: they spawn, they bill, and
    // the canvas shows them as an anonymous __unmapped__ box.
    const declaredSet = new Set(declaredLabels);
    const undeclared = sortedUnique(allLabels.filter((l) => !declaredSet.has(l)));
    check(at("every spawned agent is declared in the manifest"), undeclared.length === 0, {
        undeclared,
    });

    // The inverse: a node the manifest promises but the run never spawns stays
    // grey forever and silently misreports the workflow.
    const emittedSet = new Set(allLabels);
    const neverSpawned = sortedUnique(declaredLabels.filter((l) => !emittedSet.has(l)));
    check(at("every declared node is spawned on some branch"), neverSpawned.length === 0, {
        neverSpawned,
    });

    check(at("emitted phase titles match meta.phases"), same(allPhases.map(norm), declaredPhases.map(norm)), {
        emitted: sortedUnique(allPhases),
        declared: sortedUnique(declaredPhases),
    });
}

console.log("== harness: run bodies reject missing args");

for (const { file, fixture: f } of loaded) {
    const h = makeCtx({}, 0);
    let rejected = false;
    try {
        await rehydrate(f.run)(h.ctx);
    } catch {
        rejected = true;
    }
    check(`${file}: run throws on empty args`, rejected, { spawned: h.labels });
}

summary();
