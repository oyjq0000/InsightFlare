# MapLibre attribution advisory: temporary exposure boundary

Reviewed: 2026-09-17. Advisory: [GHSA-jrc7-96c5-q579](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579).

## Status

`maplibre-gl` 5.24.0 remains in the affected package range. This document and the regression check **do not fix or suppress the npm advisory**. They record a narrow application-level mitigation, not a claim that the package is generally safe.

The documented attack needs untrusted attribution HTML to be inserted by the attribution control. All six current dashboard map components explicitly set `attributionControl={false}`. The application does not import the attribution control or construct MapLibre maps directly. A source-level regression check now guards these assumptions, including JSX spreads that could override the disabled setting. Normal map data/attribution licensing is outside this security assertion.

## Why the major upgrade was rejected

The official first fixed version is 6.4.1. A trial upgrade passed the existing typecheck, build, unit tests and 35 E2E scenarios. However, an additional **built, real Chromium/WebGL2** fixture using the actual `react-map-gl` and interleaved `@deck.gl/mapbox` integration failed in both map modes with `Cannot read properties of undefined (reading 'height')`.

MapLibre 6 removed `map.transform`; the installed deck.gl 9.3.10 adapter still reads `map.transform.height`. The published 9.3.11 and 9.4.0 adapter source inspected during this review also retains those accesses. No rendering workaround, dependency source patch or disabled check was introduced to conceal that incompatibility. The unshipped 6.4.1 trial was reverted.

## Scope and exit criteria

- Keep the attribution control disabled; new runtime MapLibre imports, custom attribution controls, or HTML insertion paths require a fresh security review.
- This boundary does not cover future code that bypasses the reviewed map components, dynamically constructs a control, or introduces an unrelated HTML sink.
- Retain the critical advisory visibly in audit results. Do not add an advisory-ignore rule or describe the audit as clean.
- Revisit when the deck.gl interleaved adapter supports a fixed MapLibre release. Upgrade together only after typecheck, normal E2E, and actual Mercator/globe map rendering, camera movement and attribution sanitization pass.

Independent non-major toolchain updates remediate the `sharp`/Miniflare/Wrangler/Vite-plugin advisory chain. The lockfile also upgrades `js-yaml` to 4.3.2. Those changes do not depend on the rejected map-library upgrade.
