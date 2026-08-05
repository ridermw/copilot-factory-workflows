// Shared assertion harness for the test suites.
//
// Every suite here is a plain node script -- no framework, no dependencies.
// They all need the same three things: an assertion that records instead of
// throwing, a running failure count, and an exit code CI can read. Keeping one
// copy means a change to the report format lands in every suite at once.
//
// Suites run as separate processes (`npm test` chains them), so the counter
// below is per-process by construction.

let failures = 0;

/**
 * Record one assertion.
 *
 * Never throws: a suite should report every failure it finds in a single run
 * rather than stopping at the first one, because the second failure is usually
 * the one that explains the first.
 *
 * @param name  what the assertion protects, phrased as the guarantee
 * @param cond  truthy to pass
 * @param extra optional context, JSON-stringified into the failure line
 */
export function check(name, cond, extra) {
    if (cond) {
        console.log(`  ok   ${name}`);
    } else {
        failures++;
        console.log(`  FAIL ${name}${extra ? ` -- ${JSON.stringify(extra)}` : ""}`);
    }
}

/** Current failure count, for suites that need to branch on it. */
export function failureCount() {
    return failures;
}

/** Print the verdict and exit with a status code CI can read. */
export function summary() {
    console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
    process.exit(failures === 0 ? 0 : 1);
}
