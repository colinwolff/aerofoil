# Architectural Decision Records

This directory holds the decisions that shape `aerofoil`, in
[MADR 3.x](https://adr.github.io/madr/) form. An ADR records *why* the system is the way it is; the
[`SPEC`](../SPEC.md) states *what must be true*, and [`ARCHITECTURE`](../ARCHITECTURE.md) shows how
the parts fit. Where the three disagree, the ADR wins on intent and the spec wins on behaviour —
then one of them is wrong and gets fixed.

## Status vocabulary

An ADR is a record of a decision, not only a record of a decision already taken. A `Proposed` record
exists so that a question can be written down, argued and resolved in the same place.

| Status | Meaning | May change? |
| :--- | :--- | :--- |
| `Proposed` | The question is open, options are enumerated, nothing is implemented against it yet. | Yes — flips to `Accepted` or `Rejected` |
| `Accepted` | The decision is binding. Code and docs follow it. | Only by a superseding ADR |
| `Rejected` | Considered and declined, with the reason kept so it is not re-litigated. | No |
| `Deprecated` | Still binding in the tree, but should not be chosen for new work. | No |
| `Superseded by ADR-NNNN` | Replaced. The old record stays, unedited, for the audit trail. | No |

`Accepted` never means "untouchable": it means "changing it costs a new ADR". Silent edits to an
accepted record destroy the audit trail — write `ADR-NNNN` that supersedes it instead.

## Index

| ADR | Status | Decision |
| :--- | :--- | :--- |
| [0001](./ADR-0001.md) | Accepted | Virtual Cargo workspace with zero-allocation `no_std` core decoders |
| [0002](./ADR-0002.md) | Accepted | Dedicated DO-282B Reed-Solomon codec instead of a generic crate |
| [0003](./ADR-0003.md) | Accepted | Dual-tier, address-filtered single-bit correction for 1090ES parity |
| [0004](./ADR-0004.md) | Accepted | Single-bit correction consults an injected `AddressFilter`, never the tracker |
| [0005](./ADR-0005.md) | Accepted | Tracker concurrency model: striped `parking_lot::RwLock` shards |
| [0006](./ADR-0006.md) | Proposed | Server egress transport: SSE, WebSocket, both, or gRPC streaming only |
| [0007](./ADR-0007.md) | Accepted | Reserve the eight crate names and the repository from the maintainer account |
| [0008](./ADR-0008.md) | Proposed | Long-term organisation handle: `aerofoil-labs`, `aerofoil-rs`, `aerofoil-hq`, stay personal, or a coined name |
| [0009](./ADR-0009.md) | Accepted | Persistence seam now, storage engine later; live track state is never persisted across restarts |
| [0010](./ADR-0010.md) | Accepted | Frames in, one fusion process over N band-tagged sources; demodulation lives in `aerofoil-sdr` |

## Process

1. **Write it before the code.** A decision that changes a crate boundary, a data structure, a wire
   format or a public trait is recorded here first. Code lands against an accepted record.
2. **Open questions get a `Proposed` ADR.** Enumerate the options with honest trade-offs; do not
   pre-select. The record is the agenda for the decision.
3. **Wire it into the backlog.** Raise the question on the task that depends on it:
   `storypole ask-decision <KEY> "<question>" --option "<a>" --option "<b>"`. The task is blocked
   until the decision resolves, so the question cannot be silently skipped.
4. **Resolve in one commit.** `storypole decide <KEY> <decision-id> --choose ... --rationale ...`
   and the ADR flip from `Proposed` to `Accepted`/`Rejected` land together, with the `CHANGELOG.md`
   entry. A decision recorded in one place and not the other is a defect.
5. **Number sequentially**, four digits, never reused — even if a record is rejected or superseded.

## Template

```markdown
# NNNN. <Short imperative title>

* Status: Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN
* Date: YYYY-MM-DD
* Deciders: <who must agree>
* Related: `docs/SPEC.md` §x, `ADR-NNNN`, `storypole` <KEY>

## Context and Problem Statement
<The forces at play: what is constrained, what breaks if nothing is decided.>

## Considered Options
1. <Option A — what it means concretely>
2. <Option B>
3. <Option C>

## Decision Outcome
Chosen option: **<Option X>**, because <the deciding argument, in one paragraph>.

### Positive Consequences
* <What improves, and what it unblocks>

### Negative Consequences
* <What gets harder, what is now forbidden, what must be revisited>
```
