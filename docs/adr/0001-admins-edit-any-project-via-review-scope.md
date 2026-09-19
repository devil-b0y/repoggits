# ADR-0001: Admins edit any project by reusing the review-scope rule

**Date**: 2026-09-19
**Status**: accepted
**Deciders**: devil-b0y (repo owner), via Claude Code session

## Context

`canEdit` (`lib/projects.ts`) gated every write path for a project version — the `editable` flag on `GET /api/projects/:id`, saving a draft or resubmission (`updateVersion`), and starting a new version after review (`newVersion`). It granted access only to the project's owner, or to a verified team member matched by email against the latest approved version. Super Admins and Teacher-Admins had no way to edit a project directly, even though `canReview` already let them approve, reject, or request changes on the very same content. The request was for admins to be able to edit any project, not just review it.

## Decision

Extend `canEdit` to also grant edit access whenever `canReview(user, latestVersionData)` is true: unconditionally for Super Admins, and for Teacher-Admins scoped to the project's own department or subject — the same rule already used to decide who can approve a submission. The check runs against the project's latest version (not only an approved one), since a draft or pending project has no approved version yet.

## Alternatives Considered

### Alternative 1: A dedicated "edit any project" permission
- **Pros**: Explicit grant, decoupled from review rights.
- **Cons**: A second permission surface to define and keep in sync; review and edit access could drift apart over time.
- **Why not**: Anyone already trusted to approve a department's submissions is already trusted with that content — a separate flag would just duplicate `canReview`'s scoping with no added safety.

### Alternative 2: Super Admin only, no Teacher-Admin scope
- **Pros**: Smaller blast radius; simplest possible change.
- **Cons**: Doesn't fully satisfy the ask — "admin" in this app includes Teacher-Admins with review authority, and they're the ones actually close to a given department's submissions.
- **Why not**: Reusing `canReview` costs nothing extra and naturally covers the same population that already reviews the project.

### Alternative 3: A separate admin-only edit endpoint bypassing the normal save flow
- **Pros**: Could sidestep the existing draft/changes_requested/pending status lock entirely.
- **Cons**: A second code path duplicating file validation, moderation-setting lookups, and the review-clearing side effect that `updateVersion` already does correctly; inconsistent audit trail.
- **Why not**: `updateVersion`/`newVersion` already do the right thing once `canEdit` says yes — no need to fork the write path.

## Consequences

### Positive
- No new permission surface: edit rights stay derived from the same scope rule as review rights, so the two can't silently diverge.
- One choke point (`canEdit`) now consistently gates the `editable` flag, the PATCH save, and new-version creation.
- The admin Project Library UI could add a plain "Edit" link, since server-side authorization already supports it — no extra client-side permission logic needed.

### Negative
- A Teacher-Admin's edit rights are now exactly as broad as their review rights. A scope originally granted for light-touch reviewing now also permits direct content changes, blurring "reviewer" and "co-author."
- Nothing in the project data itself flags that a given save came from an admin rather than the owner/team — only the audit log records the actor.

### Risks
- Scope creep: a Teacher-Admin scoped broadly (e.g. `department:Computer Science`) can now edit any project in that department, not just review it. Mitigated by the existing `audit(client, user.id, ...)` call on every save, which already records who changed what and when.
