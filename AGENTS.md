# Repository Agent Guide (com.tuya.zigbee)
This repo is a Homey SDK3 Zigbee app (Node.js, CommonJS). Most work happens in driver `device.js` files under `drivers/` and shared Zigbee/Tuya helpers under `lib/`.

## Quick Facts
- Runtime: Node.js (`package.json` -> `engines.node` is `>=12`).
- App entry: `app.js` (`package.json` -> `main`, `scripts.start`).
- Homey compose source: `.homeycompose/` (generates `app.json`).

## Commands (Build / Lint / Test)
Derived from `package.json`.

### Install
- `npm ci` (lockfile present: `package-lock.json`)
- `npm install` (fallback)

### Run / Start
- `npm run start` (equivalent: `node app.js`)

### Lint
- `npm run lint` (script: `eslint .`)
- `eslint` is not declared in `package.json` (so lint may fail unless ESLint is available in your environment)
- No `.eslintrc*`, `eslint.config.*`, or `.eslintignore` found at repo root

### Tests
- `npm test` is a placeholder (`Error: no test specified`)
- No test runner is configured; “run a single test” is not applicable until tests exist

## Generated vs Source Files
- Do not edit `app.json` directly (generated); edit `.homeycompose/app.json` instead.
- Treat `.homeybuild/` as generated build output.

## Repo Layout
- `app.js`: Homey app lifecycle + flow cards.
- `drivers/<driver_id>/device.js`: device driver logic.
- `lib/`: shared clusters/helpers (Tuya datapoints, utilities).
- `.homeycompose/`: source-of-truth app/driver metadata.

## Key Reference Files
- `package.json`: runtime/scripts/dependencies.
- `.editorconfig`: formatting defaults.
- `.homeycompose/app.json`: app manifest source.
- `app.json`: generated manifest (don’t edit directly).
- `app.js`: flow card registration + app startup.
- `lib/TuyaHelpers.js`: datapoint parsing + schedule marshal/parse.
- `lib/TuyaSpecificClusterDevice.js`: datapoint write helpers.
- `lib/util/index.js`: shared utilities + input validation patterns.
- Example drivers: `drivers/wall_switch_1_gang/device.js`, `drivers/thermostatic_radiator_valve/device.js`.

## Coding Style (Observed)
The repo is not fully uniform; match the file/driver you edit.

### Formatting
- `.editorconfig`: 2-space indent for `*.js`/`*.json`, LF, final newline, line length 100 for JS.
- Semicolons are common (e.g. `lib/util/index.js`).
- Quotes: many files use single quotes; `.editorconfig` mentions double quotes but code is mixed.

### Imports / Exports
- CommonJS only: `const X = require('...')`, `module.exports = ...`.
- Prefer `const` and destructured requires (`const { ZigBeeDevice } = require('homey-zigbeedriver');`).
- Keep `require(...)` at top, then constants, then class.

### Naming
- Drivers live in `drivers/<driver_id>/device.js`.
- Class naming is mixed (lowercase in some drivers, PascalCase in others); follow the local pattern.
- Lifecycle methods: `onNodeInit`, `onInit`, `onSettings`, `onDeleted`.

### Validation & Errors
- Plain JS; explicit guards are common.
- Input/type errors often use stable codes: `throw new TypeError('expected_value_number');`.

### Async & Logging
- Prefer `async`/`await`.
- Promise style often uses `.catch(err => this.error('context', err));`.
- Logging patterns: `this.log`, `this.debug`, `this.error`; call `this.printNode()` early in `onNodeInit`.
- `zigbee-clusters` debug sometimes enabled (`debug(true)`); avoid leaving overly chatty debug on.

## Zigbee / Homey Driver Patterns
- Typical `device.js` starts with `'use strict';` + requires for `homey-zigbeedriver` and `zigbee-clusters`.
- Add custom clusters with `Cluster.addCluster(...)` before using them.
- In `onNodeInit({ zclNode })`: `this.printNode()`, register capabilities/listeners, read basic attributes and log errors.

### Driver Checklist (When Implementing / Modifying)
- Call `this.printNode()` early to confirm endpoints and clusters.
- Avoid hard-coding endpoint `1` unless you verified it matches the device.
- Prefer `this.registerCapability(capabilityId, CLUSTER.X)` when cluster mapping is standard.
- Prefer `this.registerCapabilityListener(capabilityId, async (value, opts) => { ... })` when you need custom writes/transformations.
- When reading attributes, use `.catch(err => this.error('context', err))` so failures are visible but non-fatal.
- When writing attributes/commands, log enough context to diagnose device-specific quirks.
- For settings changes:
  - implement `async onSettings({ oldSettings, newSettings, changedKeys })`.
  - only write the keys that changed.
- For cleanup, implement `onDeleted()` and keep it side-effect free.

### Common Zigbee Calls (Observed)
- Read basic attributes:
  - `await zclNode.endpoints[1].clusters.basic.readAttributes([...]).catch(err => this.error('...', err));`
- Write attributes (example pattern):
  - `await this.zclNode.endpoints[1].clusters.onOff.writeAttributes({ indicatorMode: parsedValue });`
- Listen for Tuya cluster events (example pattern):
  - `zclNode.endpoints[1].clusters.tuya.on('reporting', value => this.processReport(value));`

### Minimal Driver Skeleton (Example)
```js
'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER } = require('zigbee-clusters');

class MyDevice extends ZigBeeDevice {
  async onNodeInit({ zclNode }) {
    this.printNode();

    this.registerCapability('onoff', CLUSTER.ON_OFF);

    await zclNode.endpoints[1].clusters.basic
      .readAttributes(['manufacturerName', 'modelId'])
      .catch(err => this.error('Error reading basic attributes', err));
  }
}

module.exports = MyDevice;
```

## Tuya-Specific Patterns
- Prefer shared helpers:
  - `lib/TuyaHelpers.js` (datapoint parsing, schedules)
  - `lib/TuyaSpecificClusterDevice.js` (datapoint write helpers)

### Schedules / Datapoints
- `marshalSchedule(...)` and `parseSchedule(...)` expect a constrained format; errors are thrown for invalid entries.
- When mapping datapoints to capabilities, keep conversions explicit (e.g., temperature often uses `* 10` scaling).

## Homey Compose Notes
- Compose is enabled (`.homeyplugins.json` includes `compose`).
- Driver templates exist under `.homeycompose/drivers/templates/` (e.g. `light_color.json`).
- Shared driver settings definitions exist under `.homeycompose/drivers/settings/` (e.g. `powerOnState.json`).
- Prefer changing compose templates/settings rather than copy/pasting into each driver.

## Flow Cards
- App-level flow cards are registered in `app.js` via `this.homey.flow.getActionCard(...)` / `getConditionCard(...)`.
- Device drivers sometimes register flow cards too; keep run listeners small and delegate to device methods.

## Dependency / Compatibility Guardrails
- Keep Node compatibility with `>=12` unless the project explicitly upgrades.
- Avoid adding new runtime dependencies unless necessary; prefer reusing `lib/` helpers.
- If introducing linting/tooling, wire it through `package.json` scripts and commit config files alongside.

## Contribution Notes
From `CONTRIBUTING.md`: keep PRs focused (ideally one device), single commit, rebase on latest master, follow existing formatting.

## Cursor / Copilot Rules
- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` found in this repo.

## Common Pitfalls
- Generated: don’t edit `app.json`; change `.homeycompose/app.json`.
- Lint: `npm run lint` may fail because ESLint isn’t declared in `package.json`.
- Endpoints: many drivers assume endpoint `1`; confirm via `this.printNode()`.
- Debug spam: avoid leaving `debug(true)` enabled globally unless required.
