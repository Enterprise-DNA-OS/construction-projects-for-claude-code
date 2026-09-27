---
description: The defects list: open items by project, whose each one is, and overdue first. Open defects hold the retention.
---

1. Run `npm run construction -- defects` (`--project=` for one).
2. Overdue first, grouped by the subcontractor responsible, so one call clears several.
3. New: `npm run construction -- defect add <project> --description= --location= --company= --due=`. Fixed: `npm run construction -- defect close <DEF>`.
4. When a project in its defects period has none open, say the retention release claim can be prepared.
