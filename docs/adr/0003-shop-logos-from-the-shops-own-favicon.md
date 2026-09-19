# ADR-0003: Shop logos come from the shop's own favicon, not a logo service

**Date**: 2026-09-19
**Status**: accepted
**Deciders**: devil-b0y (repo owner), via Claude Code session

## Context

Recording where a team bought its parts (see ADR-0004) is more useful with the shop's logo beside its name, and the brief was explicit that the system should "automatically fetch the website logo and display" it. A project page is read by students, educators and anyone the link is shared with, so whatever serves that logo learns which project pages are being opened and by whom. The repository already vendors every technology and AI-tool logo it shows (`public/images/technologies`, `public/images/ai-tools`) rather than hot-linking them.

## Decision

Request the icon from the shop itself: `https://<host>/favicon.ico`, derived from the stored shop URL by `shopHost`. If the request fails, an `onError` handler swaps in a lucide `Globe`/`Store` mark, so a missing icon is a quiet fallback rather than a broken image. The catalogue in `lib/cost-catalogue.ts` seeds common retailers with their domains so the usual cases resolve without anyone typing a URL.

## Alternatives Considered

### Alternative 1: A favicon service (Google `s2/favicons`, Clearbit, DuckDuckGo)
- **Pros**: Far more reliable — handles sites that declare their icon via `<link rel="icon">` at a non-standard path, and returns a consistent size.
- **Cons**: Every project-page view tells that service which shop a reader is looking at, from the reader's IP; it also becomes a third-party dependency on a page that currently has none.
- **Why not**: The privacy cost is paid by readers who never chose it, for a decorative gain.

### Alternative 2: Vendor retailer logos like the technology logos
- **Pros**: No external request at all; matches how every other logo here is served.
- **Cons**: Retailer marks are trademarks with varied usage terms, unlike the permissively licensed icon sets already vendored; a fixed set also cannot cover a shop an author types in themselves.
- **Why not**: Licensing is materially different from an icon set, and custom shops — the common case for a local supplier — would still show nothing.

### Alternative 3: Show no logo, just the shop name and link
- **Pros**: Simplest, zero external requests.
- **Cons**: Does not meet the request, and a wall of plain text shop names is harder to scan.
- **Why not**: The favicon approach satisfies the ask while keeping the reader's browsing to themselves.

## Consequences

### Positive
- No third-party service is introduced, and no analytics provider learns what readers open.
- Any shop works, including one an author types in by hand — there is no list to maintain for coverage.
- A failed or blocked request degrades to a generic mark, so the layout never breaks.

### Negative
- Reliability varies: a site that serves its icon only via `<link rel="icon">` at another path shows the fallback mark even though it has a perfectly good logo.
- The browser still makes a request to the shop's domain, so the reader's IP reaches the shop. That is the same exposure as clicking the link, but it happens without the click.
- Favicons are small and sometimes ugly at 22px; they are not brand assets.

### Risks
- A shop domain could serve something unexpected at `/favicon.ico`. It is rendered in a fixed-size `<img>` with `alt=""`, so the blast radius is a wrong picture, not script execution.
