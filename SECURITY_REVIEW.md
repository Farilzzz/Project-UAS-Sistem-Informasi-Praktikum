# Publication security review

## Scope and result — 2026-11-18

Dependency remediation was limited to this standalone publication copy. React Router DOM is pinned to 7.18.5, Vite to 6.4.6, and Vitest to 4.1.12. Clean installation, dependency-tree validation, frontend build/typecheck, 52 frontend tests, 8 PHP syntax checks, and 16 SQLite in-memory regression tests passed. No application database or local environment credentials were used. No push, visibility change, deployment, or original-source modification was performed by this remediation step.

The full npm audit decreased from 18 affected packages (5 moderate, 11 high, 2 critical) to 12 high affected packages and zero critical/moderate findings. The production-only audit decreased from 2 moderate findings to zero. These are registry audit results at review time, not a guarantee of vulnerability-free software or production readiness.

## Remaining development-tool risk

All remaining affected lockfile nodes are marked development-only. The 12 package findings trace to one underlying advisory: [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), a picomatch regular-expression denial of service involving attacker-supplied repeated extglob patterns and crafted input. Affected packages include picomatch, anymatch, chokidar, fast-glob, fdir, micromatch, readdirp, sucrase, tailwindcss, tinyglobby, vite, and vitest. This is not 12 independent exploits.

The registry's latest picomatch version was 4.0.7, still within the advisory's affected range; the advisory lists no patched version. npm's suggested major upgrades/downgrades are not proof of a clean replacement tree. No blind `npm audit fix --force`, unsupported override, or security-suppressing exclusion was applied.

The application does not intentionally accept user-provided build/test glob configuration. This reduces relevance to the shipped static frontend and PHP API, but does not eliminate risk to developer or CI processes. Build only trusted revisions/configuration, do not feed untrusted glob patterns into tooling, isolate untrusted PR builds without secrets and with time/resource limits, and bind development/test servers to loopback. Recheck the advisory and upgrade when a verified patched dependency tree is available. Do not expose Vite/Vitest as production services.

## Secrets, provenance, and limitations

Reachable Git history and the staged publication tree were scanned for private keys, provider tokens, JWTs, sensitive path names, and credential-context indicators. The review found no operational secret requiring removal. This is a bounded static review, not proof that every possible secret format is detectable. Seed bcrypt hashes, `password123`, fixed demo usernames, and test-only keys are intentional fictional academic fixtures. Never reuse them for a public deployment. Real `.env` files, database dumps, local evidence, dependency folders, and build output remain excluded; blank `.env.example` fields require local configuration.

Existing commit attribution metadata is preserved rather than history-rewritten. Contributor permission for public redistribution was explicitly confirmed by the repository owner; see [ATTRIBUTION.md](ATTRIBUTION.md). No arbitrary license is added.

Publication of source is distinct from approval to deploy. Token revocation, HTTPS, production secrets, public API exposure, authenticated browser E2E, and fresh MariaDB integration remain outside this review. See [verification report](END_TO_END_TEST_REPORT.md) for current checks versus historical evidence.
