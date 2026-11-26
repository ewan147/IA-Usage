# IA Usage launch campaign

This campaign runs on GitHub Actions from 26 November to 3 December 2026. Dates use Paris time. Two scheduled runs per day let the second run retry a missed or failed first run.

The workflow verifies the release asset names, sizes and published digests. It records stars, downloads and feedback in one comment in issue #1. GitHub Insights totals are included when the workflow token can read them. The campaign also checks the two public directory submissions. It labels matching open preview feedback and posts at most one prepared response for installation or CSV discrepancy reports.

The first successful run records the baseline and its timestamp. The final run is scheduled for 3 December at 00:07 Paris time with later opportunities to retry. It freezes the final report and disables the workflow. If disabling fails, later runs retry the disable step while keeping the report frozen. The workflow uses the temporary GitHub Actions token. No external service or personal access token is required.

Run local tests with Node.js 24:

```sh
node --test campaign/run.test.mjs
```
