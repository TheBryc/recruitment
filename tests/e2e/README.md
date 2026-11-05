# Family portal browser test

Runs the whole family journey in Chromium: sign up, household, autosaved
application, submit, decision release, income verification, onboarding
decline, sign out and back in.

Nothing real is contacted. Firebase is replaced by `fake-*.js`, and RAM HQ is
replaced by `mock-exec.mjs`, which runs the real `Code.gs` and `Portal.gs`
against the in-memory sheets from `apps-script/test/harness.mjs`.

From the repository root:

```
python3 -m http.server 8766 &
node tests/e2e/mock-exec.mjs &
node tests/e2e/portal.e2e.cjs
```

Requires Playwright with Chromium. Set `SHOTS=/some/folder` to save screenshots elsewhere.
Restart `mock-exec.mjs` between runs; it keeps its sheets in memory.
