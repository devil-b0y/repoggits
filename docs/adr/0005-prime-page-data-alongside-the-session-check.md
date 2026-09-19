# ADR-0005: A page's data is primed alongside the session check

**Date**: 2026-09-19
**Status**: accepted
**Deciders**: devil-b0y (repo owner), via Claude Code session

## Context

Pages were reported as taking about two seconds to open. Measurement found two unrelated costs. The first is `next dev` compiling a route on its first visit (0.57–0.97s cold, ~0.25s warm), which does not exist in a production build. The second is real and permanent: a single `SELECT 1` against the database takes **480–550 ms**, because the Neon instance is in AWS `us-east-2` (Ohio) while the users are in India. Against that latency the client's own request waterfall matters — `Shell` fetched `auth/me`, `Gate` held its children back until the answer arrived, and only then did the page's `useData` start asking for the page's own data. Two sequential waits where one would do, each costing a full round trip.

## Decision

Keep the client-rendered structure and remove the serialization inside it. `components/platform/shared.tsx` gains a module-level map of in-flight requests: a page calls `primeData(path)` as it renders — outside `Gate` — and `useData` adopts that already-flying request instead of issuing a second one. A primed response is only adopted within a 5-second TTL, so a stale answer (including a 401 from before a sign-in) is never reused. Server side, `adminData` in `app/api/[...path]/route.ts` now issues its independent reads with `Promise.all`; only the reviewer-scoped audit query, which genuinely depends on the project rows, still waits.

## Alternatives Considered

### Alternative 1: Fetch in server components and render data into the HTML
- **Pros**: Removes the client round trip entirely — the best possible result.
- **Cons**: Every page here is a client component wrapped in `Shell`/`Gate`, with session-dependent rendering throughout; converting them is a broad refactor of the whole platform UI, not a targeted fix.
- **Why not**: Too large to undertake while the reported problem had a much cheaper cause. Still the right long-term direction.

### Alternative 2: Adopt SWR or React Query
- **Pros**: Mature caching, deduplication, revalidation and retry behaviour.
- **Cons**: A new runtime dependency and a second data-fetching idiom beside the existing `useData`/`api` helpers, for one behaviour.
- **Why not**: The needed behaviour is roughly fifteen lines against the helper this codebase already uses everywhere.

### Alternative 3: Do nothing in code and only move the database region
- **Pros**: Addresses the dominant cost directly; roughly ten times faster per query.
- **Cons**: Is an infrastructure decision with a migration, and a serialized waterfall would still cost two round trips instead of one afterwards.
- **Why not**: Not mutually exclusive — the region move remains the larger win and is recommended separately; this change makes every navigation cheaper regardless of where the database sits.

## Consequences

### Positive
- One full round trip (~500 ms today) is removed from each navigation to a primed page.
- The review desk's three sequential reads became one batch, saving roughly a second for a Super Admin.
- No new dependency, and pages that do not call `primeData` behave exactly as before.

### Negative
- Priming starts a request that may be discarded — a signed-out visitor who lands on `/projects` fires a request that 401s and is thrown away.
- The TTL is a heuristic. Set it too high and a stale answer could be adopted after a sign-in; too low and the optimization stops applying.
- The real bottleneck is unchanged: at ~500 ms per query, a page remains far from instant.

### Risks
- A future page could prime a path whose response depends on the session (for example a role-specific payload) and adopt an answer fetched before the role was known. Mitigated by the 5-second TTL and by priming only paths whose response depends on the signed-in user, never on a role selection made after load.
