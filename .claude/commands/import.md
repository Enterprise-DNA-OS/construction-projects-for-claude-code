---
description: Bring a project across from Procore: its commitments list, RFI log and submittals log, from Procore's own CSV exports, dry run first. The import is the first audit.
---

1. Read `docs/replace-procore.md` for which exports to take and how columns map.
2. Procore exports per project, so create the project here first (`npm run construction -- project add` then `project award`) and import into it.
3. Always dry run first and show the operator the result:
   ```
   npm run construction -- import procore --project=<ref> --commitments=commitments.csv --rfis=rfis.csv --submittals=submittals.csv --dry-run
   ```
4. If it looks right, run it without `--dry-run`. It is safe to run twice: rows carry Procore's numbers and do not duplicate.
5. Prove it landed: `npm run construction -- attention`, `npm run construction -- compliance`, `npm run construction -- cost <ref>`.
6. Three findings are normal and worth saying out loud:
   - Subcontractors with no public liability on record: enter each certificate.
   - Commitments on cost line 99 with no budget: move each to its real cost line and load the cost plan.
   - Open RFIs already past due: check which hold work and log the delays.
