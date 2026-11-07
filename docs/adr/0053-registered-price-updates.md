# ADR-0053: Separate model adoption from price maintenance

## Status

accepted

## Context

The owner selected eight current model presets. The scheduled pricing updater nevertheless proposed importing every supported row on the official pages, including older and specialized models. PR #21 contained 31 unregistered entries after #22 supplied the selected models, plus a rate correction for the already registered GPT-5. Closing the proposal alone would allow the next scheduled run to propose those entries again.

## Decision

- Update prices only for model IDs already present in the catalog. New models and aliases require manual selection and registration; an empty catalog remains empty.
- Continue validating both official documents before writing, detecting missing monitored models and conflicting rates. Keep updates to registered historical models, existing aliases, conditional pricing tiers, and invocation price snapshots under their existing rules.
- Explain the adoption policy in update proposals and the operations guide. Once this change reaches the default branch, close superseded PR #21 and delete `automation/model-prices` so its pending additions cannot be carried into later proposals.

## Validation

Maintenance tests verify that unregistered rows do not add IDs, registered rate changes still carry their sources and verification dates, historical entries and aliases survive, empty catalogs remain empty, and unchanged prices create no date churn. The live check should propose the existing GPT-5 cache-write correction without importing the 31 unregistered models.
