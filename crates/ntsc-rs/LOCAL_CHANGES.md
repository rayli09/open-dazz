# Local maintenance changes

This is the vendored `valadaptive/ntsc-rs` core identified by `Cargo.toml`.
Upstream authorship and the MIT / ISC / Apache-2.0 license texts are retained.

The 2026-10-26 strict-Clippy repair adds `Default` delegating to the existing
constructors, replaces index-only loops with ordered iteration, removes an
identity bit operation, and renames the private `settings::settings` module to
`settings::descriptors`. Public re-exports and settings IDs remain unchanged.

The two nested YIQ blit helpers retain their upstream eight-argument signatures.
Their function-local `too_many_arguments` allowances preserve the separate
borrowed Y/I/Q planes, metadata and SIMD dispatch boundary instead of redesigning
unsafe conversion code for an argument-count lint. No crate-wide suppression or
CI flag change was introduced. See `docs/verification/ci-repair-2026-10-26.md`
at the repository root for test and before/after pixel evidence.
