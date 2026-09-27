---
description: The subcontracts and orders: value with approved variations, certified, paid, retention withheld, and each subcontractor's insurance state.
---

1. Run `npm run construction -- commitments` (add `--project=<ref>` for one project, `--all` for completed).
2. Call out any EXPIRED or NONE insurance on an executed subcontract first. That subcontractor is on site uninsured.
3. New subcontract: `npm run construction -- commit <project> --company= --line=<cost code> --value= --title=`. It refuses an uninsured subcontractor, with no force flag; `--draft` records it unsigned until the certificate arrives.
