# QuickFetch Domain Glossary

Core domain terms for QuickFetch RCA/LXT/PL/AOI image scan and copy desktop application.

## Language

**Entry Root**:
The top-level filesystem directory containing plant subfolders with machine shortcut links (`.lnk`), or the DC root directory for EL machines.
_Avoid_: Scan directory, root path, shortcut folder

**DC Root**:
The specific entry root directory for RCA EL machines containing the `DC/<machine>/EL/...` hierarchical folder structure.
_Avoid_: DC path, server directory, image root

**Page Header Actions**:
The interactive operation slot placed on the right side of `PageShell`'s sticky header, reserved for page-level low-frequency utilities (such as the compact Entry Root trigger and Scan History trigger) and aligned opposite the page title.
_Avoid_: Top bar controls, navigation actions, window toolbar

**Stacked Scan Workspace**:
The top-down vertical page layout where scan parameter configuration (Scope Parameter Matrix, collapsing into the Scope Summary Bar once active) sits on top, and the Single-Column Task Stream sits below, eliminating cross-column height asymmetries.
_Avoid_: Two-column scan layout, split-screen workspace, side-by-side scan view

**Scan Scope**:
The category-specific selection state and domain invariants governing a scan workspace—covering the active plant, selected machines, date, shift, time slots, optional AOI inspection side and image kind, optional PL defect levels, defect types, readiness validation, and scope fingerprint—powering both the Scope Parameter Matrix and Scope Summary Bar.
_Avoid_: Filter store, scan params, scope plan

**Scope Parameter Matrix**:
The collapsible single-column vertical parameter card at the top of the scan workspace that flows paired date/shift and time slots first, followed by plant/machines (with AOI side/image kind), PL levels, and defect types from top to bottom using borderless inline Radix Radio/Checkbox controls; collapses into the Scope Summary Bar during scanning or result inspection.
_Avoid_: Left filter panel, scan scope drawer, filter column, 3-column parameter matrix

**Scope Summary Bar**:
The compact single-row summary strip replacing the expanded Scope Parameter Matrix while a scan is active or results are displayed, showing the active scope parameters and an action to expand for editing.
_Avoid_: Filter summary header, collapsed filter card, parameter bar

**Plant Machine Picker**:
The parameter component responsible for plant-level and machine-level filtering and multi-selection inside the Scope Parameter Matrix.
_Avoid_: Scope picker, directory machine picker

**Single-Column Task Stream**:
The unified vertical workflow in the lower content area that integrates active scan control, natural-scrolling machine result inspection, in-place copy selection, and a sticky bottom local copy bar into a single coherent flow.
_Avoid_: Multi-panel task area, split copy panel, separate copy workflow

**Leaf Type Directory**:
The innermost defect-type directory representing one Cartesian combination of the active scan scope (machine × time slot × optional PL level × defect type), excluding intermediate structural directories such as share root, date, shift, time slot, `Fail`, or level.
_Avoid_: Intermediate directory, raw directory read count

**Hit Directory**:
A Leaf Type Directory that contains at least one matching image.
_Avoid_: Valid directory, non-empty folder

**Performance Profile**:
A three-tier resource load preset (`low`, `standard`, `high`) that bundles directory read concurrency, machine scan batch size, and copy concurrency for field machines, paired with the independent copy batch size control.
_Avoid_: Concurrency tier, speed mode, four performance sliders
