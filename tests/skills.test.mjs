// Structural guards for the two skill documents.
//
// A skill is prose, so it cannot be unit tested the way code can. What it CAN
// be checked for is the set of contracts it must never silently lose: the
// planning skill must keep refusing to run the factory, the execution skill
// must keep handling every terminal status the runtime can produce. Those are
// exactly the invariants that drift when someone edits a paragraph.
//
// Each check names the failure it prevents, not just the string it greps for.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(here, "..", "skills");

let failures = 0;
function check(name, cond, extra) {
    if (cond) {
        console.log(`  ok   ${name}`);
    } else {
        failures++;
        console.log(`  FAIL ${name}${extra ? ` -- ${JSON.stringify(extra)}` : ""}`);
    }
}

/** Split a SKILL.md into its YAML frontmatter block and body. */
function readSkill(name) {
    const path = join(skillsDir, name, "SKILL.md");
    if (!existsSync(path)) return null;
    const text = readFileSync(path, "utf8");
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    if (!m) return { path, text, frontmatter: null, body: text };
    const frontmatter = {};
    // Only scalar `key: value` pairs are used by either skill, so a full YAML
    // parser would be a dependency for no benefit.
    for (const line of m[1].split("\n")) {
        const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (kv) frontmatter[kv[1]] = kv[2].trim();
    }
    return { path, text, frontmatter, body: m[2] };
}

const skills = {
    "plan-workflow": readSkill("plan-workflow"),
    "execute-workflow": readSkill("execute-workflow"),
};

// ------------------------------------------------------------- frontmatter
console.log("\n== frontmatter");
for (const [name, s] of Object.entries(skills)) {
    check(`${name}: SKILL.md exists`, s !== null);
    if (!s) continue;
    check(`${name}: has frontmatter`, s.frontmatter !== null);
    if (!s.frontmatter) continue;
    // A mismatched name makes the skill unloadable under its directory.
    check(`${name}: name matches directory`, s.frontmatter.name === name, s.frontmatter.name);
    // The description is the only thing the agent sees when deciding whether
    // to invoke the skill, so an empty or terse one makes it undiscoverable.
    const d = s.frontmatter.description ?? "";
    check(`${name}: description is substantive`, d.length >= 80, d.length);
    check(`${name}: description says when to use it`, /\buse (when|after|once)\b/i.test(d));
}

// ------------------------------------------------------- plan-workflow only
console.log("\n== plan-workflow contracts");
{
    const s = skills["plan-workflow"];
    const body = s?.body ?? "";

    // The whole point of splitting the two skills. If planning ever starts the
    // run, the user loses the chance to approve the shape first.
    check(
        "states it never starts a run",
        /never (starts|start) (a |the )?run/i.test(body) || /does not start the run/i.test(body),
    );
    check("defers execution to execute-workflow", /execute-workflow/.test(body));

    // Phase correlation between manifest and runtime is by TITLE. Losing this
    // note produces a canvas whose columns never light up, with no error.
    check("documents phase title matching", /title/i.test(body) && /phase/i.test(body));

    // Verified the expensive way: resume only replays ctx.step results.
    check("covers ctx.step resumability", /ctx\.step|\bstep\(/.test(body));

    // Unique labels: identical prompt+options memoize into a single agent, so
    // duplicate labels silently collapse a fan-out.
    check("warns about unique agent labels", /label/i.test(body) && /uniqu/i.test(body));

    // Agent failure resolves to null rather than throwing.
    check("warns that agent results can be null", /null/.test(body));

    // Limits are a real ceiling and cumulative across attempts.
    check("covers limits", /maxAiCredits/.test(body));

    // A worked example is what makes the skill usable rather than abstract.
    check("has a worked example", /```/.test(body));
}

// ---------------------------------------------------- execute-workflow only
console.log("\n== execute-workflow contracts");
{
    const s = skills["execute-workflow"];
    const body = s?.body ?? "";

    // Every terminal status the runtime can resolve with. Omitting one means
    // the agent reports a halted or cancelled run as though it succeeded.
    for (const status of ["completed", "error", "halted", "cancelled"]) {
        check(`handles terminal status: ${status}`, new RegExp(`\\b${status}\\b`).test(body));
    }

    // Resume must reuse the existing run rather than starting a second one.
    check("uses resumeFromRunId", /resumeFromRunId/.test(body));
    check("checks prior runs first", /\bruns\b/.test(body));

    // The canvas is an observer. If attaching fails the run must continue.
    check("attaches the run to the canvas", /attach_run/.test(body));
    check(
        "canvas failure does not stop the run",
        /does not stop|keep going|continue/i.test(body),
    );

    // One run per session; a second concurrent start is rejected outright.
    check("warns against starting a second run", /already[- ]active|one run|exactly one/i.test(body));

    // The two findings that cost real credits to discover.
    check("notes journal only replays step results", /journal/i.test(body));
    check("notes limits are cumulative", /cumulative/i.test(body));
}

// ------------------------------------------------------------ cross-cutting
console.log("\n== cross-cutting");
{
    const plan = skills["plan-workflow"]?.body ?? "";

    // The planning skill must not tell the agent to invoke run_factory. It may
    // mention it only to say it is out of scope, so any occurrence has to sit
    // on a line that also disclaims it.
    const offending = plan
        .split("\n")
        .filter((l) => /run_factory/.test(l))
        .filter((l) => !/never|not|don't|do not|execute-workflow|instead/i.test(l));
    check("plan-workflow never instructs run_factory", offending.length === 0, offending);

    // Both skills drive the same canvas; a typo in the id opens nothing.
    for (const [name, s] of Object.entries(skills)) {
        check(`${name}: references the canvas id`, /workflow-factory-canvas/.test(s?.text ?? ""));
    }

    // Regression guard. Both skills once claimed a resume replays completed
    // work for free. It only replays ctx.step-journalled results; a plain
    // fan-out of agent() calls re-runs and re-pays for every agent. That
    // wording cost real credits to disprove, so it must not creep back.
    for (const [name, s] of Object.entries(skills)) {
        const claim = /(replays?|repeats?|reuses?)[^.]{0,60}\bfor free\b|free\s+replay/i;
        check(`${name}: does not claim resume is free`, !claim.test(s?.text ?? ""));
    }
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
