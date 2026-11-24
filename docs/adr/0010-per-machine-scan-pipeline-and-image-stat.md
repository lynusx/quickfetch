# Per-Machine Scan Pipeline, Image `stat` Collection, and Progressive Result Table

Previously, `ScanTaskRunner` ran two global phases—probing directories for every machine first, then collecting file lists in a final `collectDetails` pass—and rendered all unstarted machines upfront as static「未探测」rows without per-machine byte totals or durations. Because `readdir` does not return file sizes, copy-plan previews later had to issue thousands of separate `fs.stat` calls over SMB, which could stall local file I/O when restoring offline history records.

We switched `ScanTaskRunner` to a sorted per-machine pipeline:

- `params.machines` is normalized in natural ascending order (with `LX` machines placed last, matching the machine picker) before batching so scans, UI rows, and persisted history follow one deterministic order.
- Each machine transitions to `status: 'scanning'` as it starts, runs directory probing plus its own detail collection and bounded per-image `fs.stat` (`ext`, `size`, `mtimeMs`, with a 2s per-file timeout and 4-way local concurrency), records `ScanBranch.bytes` and `ScanBranch.elapsedMs`, and seeds `measure.ts`'s `sizeCache` so copy previews reuse already-measured sizes with zero extra SMB round trips.
- All new `ScannedImage` and `ScanBranch` fields are optional so existing history JSON files remain readable (displaying `—` when absent); unfinished `scanning` branches normalize back to `skipped` on history persistence.

In `ScanTaskPanel`, the result table renames「图片」to「数量」and adds「大小」and「用时」columns, renders a `<Spinner size="1" />` in the status cell while `scanning`, filters out unstarted `skipped` rows so machines appear progressively as scanning advances, and animates row insertion via `@react-spring/web`'s `useTransition` (respecting `prefers-reduced-motion`).
