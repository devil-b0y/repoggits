# ADR-0004: Purchase provenance lives at project level; model numbers stay free text

**Date**: 2026-09-19
**Status**: accepted
**Deciders**: devil-b0y (repo owner), via Claude Code session

## Context

A cost table that lists "ESP32 — 400" does not help the next team actually buy the same thing. Two details were missing: which version of a part was used, and where it came from. The brief asked for a shop question that branches — online means a website link, in person means a location, optionally a Google Maps link — and for parts to carry model numbers, with the explicit note that boards get new models (a newer Raspberry Pi, a newer Arduino) that a fixed list would not know about.

## Decision

Two separate shapes for two separate facts:

- **Provenance is project level.** `purchaseMode` (`''`/`'online'`/`'store'`), `purchaseSource`, `purchaseUrl` and `purchaseLocation` sit in `ProjectData` beside the existing `purchaseDate`. The form shows only the fields the chosen mode needs.
- **The model is per row and free text.** Each `hardwareCosts` entry gains `model: text(60)`. `lib/cost-catalogue.ts` suggests known models per part through `modelsForPart`, surfaced as a `datalist`, but anything typed is kept.

## Alternatives Considered

### Alternative 1: Purchase source on every hardware row
- **Pros**: Accurate for a build sourced from several shops; each part could link to its own product page.
- **Cons**: Multiplies four fields across every row of a table students already find long; most student builds come from one or two shops, so the same shop would be retyped on every line.
- **Why not**: The cost of filling it in lands on every team, while the accuracy benefits a minority of builds. Project level matches `purchaseDate`, which has always been a single field.

### Alternative 2: Model numbers as an enum or a foreign key to a parts table
- **Pros**: Consistent spelling, filterable, groupable across projects.
- **Cons**: Every new board released after the catalogue was written would need a code change and a deploy before a team could record what they actually bought.
- **Why not**: Directly contradicts the requirement. A catalogue that cannot express this year's hardware is worse than free text.

### Alternative 3: One combined text field ("Arduino Uno R4 WiFi") with no separate model
- **Pros**: No schema change at all.
- **Cons**: The part name can no longer be matched against the logo lookup or the model suggestions, and the published table cannot show the model as secondary detail.
- **Why not**: Splitting them is what lets the row show a logo for the part and the model beneath it.

## Consequences

### Positive
- New hardware is recordable the day it ships — no code change, no deploy.
- The part name stays clean, so it still resolves to a logo via `technologyLogo`, while the model reads as secondary detail on the published page.
- The branching question means nobody is asked for a website when they bought from a shop down the road, or for an address when they ordered online.

### Negative
- A project that bought from several shops can record only one, and will have to pick the main one or describe the rest in the story.
- Free-text models will not be consistent across projects ("R4 WiFi", "r4 wifi", "Uno R4"), so they cannot be aggregated or filtered reliably.

### Risks
- `purchaseMode` is set independently of whether a project has any hardware, so a Software project can carry provenance that makes little sense — the sample project does exactly this to demonstrate the feature. If that becomes confusing, gate the published block on `hardwareCosts.length` rather than on `purchaseMode` alone.
