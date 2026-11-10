---
status: accepted
date: 2026-11-04
---

# 3. Dual-Tier Error Correction Strategy for 1090ES Parity


## Context and Problem Statement
1090ES uses a 24-bit CRC that is XORed with the aircraft's 24-bit ICAO address in DF11 and DF17 messages. In weak signal or multipath environments, single-bit errors cause frames to fail parity check and be dropped, losing critical situational awareness.

## Considered Options
1. Strict discard: Drop any frame where the computed syndrome does not match an expected condition.
2. Brute-force multi-bit flipping: Attempt 1-bit and 2-bit error correction across all incoming frames blindly.
3. Dual-tier address-filtered 1-bit correction: Correct single-bit errors only when the corrected address matches a verified active ICAO track in the local tracking cache.

## Decision Outcome
Chosen option: **Option 3 (Dual-tier address-filtered 1-bit correction)**.

### Positive Consequences
* High frame recovery yield: Recovers 5% to 15% of degraded frames in noisy conditions.
* Eliminates phantom aircraft: By only accepting single-bit corrections that match previously verified ICAO addresses in the tracker table, false positive ghost targets are prevented.
* Low CPU overhead compared to blind multi-bit search.

### Negative Consequences
* The decoder must query an active target lookup table (or bloom filter), introducing a coupling between state observation and frame recovery.