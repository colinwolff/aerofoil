---
status: accepted
date: 2026-11-04
---

# 4. Inject an `AddressFilter` trait instead of reaching up into the tracker

* Deciders: Colin Wolff
* Related: `ADR-0003`, `docs/SPEC.md` Invariant 5, `docs/ARCHITECTURE.md` §2.1–2.3

## Context and Problem Statement

`ADR-0003` permits single-bit correction only when the corrected ICAO address matches a previously
verified track, which is what stops corrected frames from fabricating phantom aircraft. But the set of
verified addresses lives in `aerofoil-tracker`, and the layering runs the other way:

```
aerofoil-common → aerofoil-1090 / aerofoil-978 → aerofoil-tracker → server / cli / mcp
```

A decoder that calls the tracker would invert that edge and create a cycle, and it would drag `std`,
threads and a sharded table into crates that must stay `#![no_std]` and allocation-free. The decision
ADR-0003 deliberately deferred is therefore *how* the decoder learns which addresses to trust.

## Considered Options

1. **Let `aerofoil-1090` depend on `aerofoil-tracker`.** Simplest call site; rejected — it inverts the
   layer, creates a cycle, and makes the decoder unusable on `no_std` targets without a tracker.
2. **Pass a `impl Fn(u32) -> bool` closure.** No new type, but it infects every signature with a
   generic parameter, cannot be stored behind `&dyn` for the dynamic case, and gives tests no shared
   vocabulary for "this address is trusted".
3. **Define `AddressFilter` in `aerofoil-common` and inject an implementation.** The decoder takes
   `&impl AddressFilter` (object-safe, so `&dyn` also works); `aerofoil-tracker` implements it over its
   verified-address set; `()` / `DenyAll` implements it as "trust nothing"; a blanket implementation
   covers closures so tests and `no_std` callers stay terse.
4. **Hand the decoder a copy or bloom filter of the address table.** Avoids the dependency but
   duplicates state that then diverges silently, and costs memory on an embedded target. Rejected.

## Decision Outcome

Chosen option: **Option 3**, because it keeps the dependency graph pointing down while making the
trust decision an explicit, testable capability of the caller.

### Positive Consequences

* The layer order holds: `aerofoil-1090` depends only on `aerofoil-common`, and the tracker depends on
  the trait rather than the decoder knowing about tracking.
* `no_std` and embedded callers get `DenyAll` and therefore no correction — the safe default — without
  a feature flag or a stub tracker.
* Correction becomes testable without a tracker: a closure or a fixed set is enough, so the branch can
  be covered exhaustively.
* "What counts as a verified address" now has exactly one home, which is where `ADR-0003`'s phantom
  aircraft guarantee is enforced.

### Negative Consequences

* Every correction call site must thread a filter through; a decoder constructed with `DenyAll` silently
  never corrects, so the distinction has to be documented rather than assumed.
* The tracker must answer `is_verified` cheaply on the hot path, which couples the trait's contract to
  the concurrency model still open in `ADR-0005`.
* One more public trait is part of the `aerofoil-common` surface and inherits its stability promise.
