---
status: accepted
date: 2026-11-09
---

# 7. Reserve the aerofoil namespaces from the maintainer account

* Deciders: Colin Wolff
* Related: `docs/ROADMAP.md` §0, `Cargo.toml` `repository`, `ADR-0008`, `storypole` `AF-20`, `AF-21`

## Context and Problem Statement

The names have to be held before anyone else takes them, and the two platforms behave differently:

* **crates.io has no reservation API.** A name is held only by publishing at least one version, and a
  published version can be *yanked* but never deleted, so the first release of each crate is
  permanent public history.
* **GitHub `aerofoil` is not available.** Checked 2026-11-04: `api.github.com/orgs/aerofoil` returns
  404, but `api.github.com/users/aerofoil` returns a **user** account created 2023-12-27 (display
  name "aerodyne"). A taken username blocks an organisation of the same name, so
  `github.com/aerofoil` cannot be claimed.

Availability checked against the crates.io API on 2026-11-04 — all eight return 404, i.e. free:

`aerofoil`, `aerofoil-common`, `aerofoil-1090`, `aerofoil-978`, `aerofoil-tracker`,
`aerofoil-server`, `aerofoil-cli`, `aerofoil-mcp`.

Forces:

* **Irreversibility.** A wrong first publish cannot be undone, only yanked; a name somebody else
  takes is gone for good.
* **Ownership is separable from the decision.** crates.io owners can be added and removed
  (`cargo owner`), and GitHub repositories transfer with permanent redirects. Publishing from one
  account does not fix the project's long-term ownership.
* **A generic name is a weak identity.** `aerofoil` is an ordinary aerodynamics term, so it says
  nothing about the software in a search result and is hard to defend as a mark.
* **Lockstep SemVer.** The reservation version is a workspace-wide decision: `0.1.0-alpha.1` here
  means every crate published for this project starts there.

**Scope note.** The `gaugeblock` organisation is not a candidate. `aerofoil` is an independent
project; that suite is used here only as dogfooded tooling (`AGENTS.md` §4). Recording the exclusion
stops it being proposed again.

## Considered Options

1. **Maintainer account now, dedicated organisation when the ecosystem justifies one.** Publish the
   crates and host the repository under `colinwolff` today; move when a second repository or a
   second maintainer appears (`ADR-0008`).
2. **Create the organisation first, publish under it from day one.** Cleaner identity from the
   start, but forces a naming decision (`ADR-0008`) before any code exists, and GitHub cannot give
   us `aerofoil`.
3. **Maintainer account permanently.** Simplest, but an organisation is the natural home for the
   satellite repositories this project will grow (a web frontend, an RTL-SDR bridge crate).
4. **Defer all reservations until the first beta.** Zero placeholder history, but exposes all eight
   names through M1–M4. Rejected: losing a name is permanent, a yanked placeholder is not.

## Decision Outcome

Chosen option: **Option 1** — the maintainer account holds the names now; the move to an
organisation is deferred to `ADR-0008`.

* Repository: `https://github.com/colinwolff/aerofoil`.
* crates.io: published from the maintainer's account, which owns the eight crates for now. The
  long-term owner is added as a crates.io owner when it exists — cheaper than transferring later.
* Reservation mechanics: eight placeholder crates at `0.1.0-alpha.1`, scaffolded into a gitignored
  `reserve-staging/` tree by `scripts/reserve-namespaces.sh` and published from there, so no
  placeholder packages enter the real workspace. Real crates publish `0.1.0-beta.1` when
  dogfood-ready, and each placeholder is yanked once its real counterpart exists. A reservation is
  never a `beta`.

### Positive Consequences

* The eight names are held in one sitting, before M1 work makes the project more visible.
* The version ladder keeps `0.1.0` meaningful: the first version anyone should depend on.
* No placeholder packages in the workspace, so `cargo check --workspace` keeps meaning something.
* The naming question stays open without blocking anything irreversible.

### Negative Consequences

* Every published version records `repository = github.com/colinwolff/aerofoil` in immutable
  metadata; after an organisation move, those versions point at a URL that works only through
  GitHub's redirect.
* Placeholder releases are permanent index clutter until their real crates supersede them, and the
  publish rate limit spreads the publishes over several minutes.

*Update 2026-11-04:* a second run reserved `aerofoil-sdr` (ADR-0010) and `aerofoil-persistence`
(ADR-0009), bringing the held set to ten names.
