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
The interactive operation slot placed on the right side of `PageShell`'s sticky header, reserved for page-level prerequisite configuration (such as selecting the entry root directory) and aligned opposite the page title.
_Avoid_: Top bar controls, navigation actions, window toolbar

**Stacked Scan Workspace**:
The top-down vertical page layout where scan parameter configuration (Scope Parameter Matrix) sits on top, and task execution, inspection, and local copying (Scan Task & Results Stream) sit below, eliminating cross-column height asymmetries.
_Avoid_: Two-column scan layout, split-screen workspace, side-by-side scan view

**Scope Parameter Matrix**:
The responsive 3-column parameter card at the top of the scan workspace that horizontally aligns plant/machine selection, time/shift options, and defect types with bounded scroll heights.
_Avoid_: Left filter panel, scan scope drawer, filter column

**Plant Machine Picker**:
The parameter component responsible for plant-level and machine-level filtering and multi-selection inside the Scope Parameter Matrix.
_Avoid_: Scope picker, directory machine picker

**Single-Column Task Stream**:
The unified vertical workflow in the lower content area that integrates scan triggering, machine result inspection with bounded table scrolling, in-place copy selection, and local copy execution into a single coherent flow.
_Avoid_: Multi-panel task area, split copy panel, separate copy workflow
