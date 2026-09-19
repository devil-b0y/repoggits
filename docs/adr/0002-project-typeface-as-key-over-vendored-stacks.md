# ADR-0002: A project's typeface is a key over vendored and system font stacks

**Date**: 2026-09-19
**Status**: accepted
**Deciders**: devil-b0y (repo owner), via Claude Code session

## Context

Teams asked to choose a "premium looking" typeface for their project, so that one project page does not read exactly like the next. This site deliberately self-hosts its three families (DM Sans, Space Grotesk, Caveat) as `.woff2` files under `public/fonts` with their licence texts committed alongside, and makes no font-CDN request at view time. A per-project choice threatens both of those properties: it either drags in new font binaries or turns every project page into a third-party request. The owner chose to apply the selected face to the whole published project page rather than to the story text alone.

## Decision

Store a short key — `ProjectData.font`, e.g. `"editorial"` — and nothing else. `lib/project-fonts.ts` maps that key to a CSS font stack assembled from the families already vendored here plus faces the reader's own system provides. `Detail.tsx` sets the resolved stack as the `--pd-typeface` custom property on `.detail-page`; the stylesheet applies it to headings and body while the small structural labels (kickers, status tags, badges) stay in the site's own face.

## Alternatives Considered

### Alternative 1: Vendor new families (Playfair Display, Fraunces, Sora)
- **Pros**: Genuinely distinctive typography; identical rendering on every device.
- **Cons**: Each family means new `.woff2` files plus licence texts in the repo, and a download for every reader on the first project page they open.
- **Why not**: Not rejected on principle — it is the natural upgrade path — but it needs the owner's decision on repo weight and licences, and the feature works without it today.

### Alternative 2: Google Fonts or `next/font/google`
- **Pros**: Large catalogue, no files to manage, `next/font` self-hosts at build time.
- **Cons**: `next/font/google` downloads at build, which breaks an offline build; a stylesheet link calls a CDN at view time, which this project has avoided everywhere else.
- **Why not**: Contradicts the existing vendoring posture, and the build-time variant needs network access the rest of this build does not.

### Alternative 3: Store the font family or CSS directly in `ProjectData`
- **Pros**: No mapping table; any face is expressible.
- **Cons**: Puts author-controlled text into a `style` attribute, and a removed or renamed family leaves broken values in stored rows.
- **Why not**: A key resolves through `findFont`, so an unknown or retired key falls back to the studio default instead of rendering arbitrary CSS.

## Consequences

### Positive
- No new binaries, no new licences, and no font request at view time — a team's choice cannot make a project page slower or leak a reader to a font CDN.
- Retiring or renaming a face is a one-line change in `lib/project-fonts.ts`; stored rows keep working via the default fallback.
- The same catalogue drives the picker's previews and the published page, so what an author sees is what a reader gets.

### Negative
- The typographic range is modest: three real families plus generic serif/sans/mono stacks, which is less striking than a curated web-font set.
- The serif, system and mono stacks resolve to different faces on macOS, Windows and Android, so a project page is not pixel-identical across devices.

### Risks
- Authors may read "Editorial serif" as a specific typeface and be surprised by the rendering on another machine. Mitigated by previewing every option in its own face inside the picker, so the choice is made by eye rather than by name.
