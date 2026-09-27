---
description: The notice of delay and claim for extension of time, with the cause, the start date, the related RFI and the diary for the period. Renders to docs-out/, never sends.
---

1. Read the delay and the project first: `npm run construction -- delays --all`, `npm run construction -- project <ref>`, `npm run construction -- diary <ref> --days=60`.
2. If the delay is not recorded, record it: `npm run construction -- delay add <project> --cause= --started= [--rfi=]`.
3. Render it: `npm run docs -- delay-notice`. The diary entries since the delay began print with it, because they are the evidence.
4. Tell the operator to check the clause number, the notice address and any prescribed form in their head contract before it goes. The system does not know their contract's wording.
5. When it has gone: `npm run construction -- delay notify <EOT> --days=<days claimed>`. If it went after the notice date, the CLI says so.
