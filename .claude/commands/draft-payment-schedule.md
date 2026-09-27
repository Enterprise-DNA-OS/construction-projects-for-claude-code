---
description: The payment schedule for a subcontractor's claim, in the company's brand, with the amount, how it was calculated and the reasons for any difference. Renders to docs-out/, never sends.
---

1. Read first: `npm run construction -- sub-claims --all`, the subcontract (`npm run construction -- company <name>`), and the diary for the period.
2. If the schedule is not yet recorded, agree the amount and the reasons with the operator, then `npm run construction -- schedule <SCL-ref> --amount= --reasons=`. The CLI refuses less than claimed without reasons.
3. The reasons must be specific: which work, what quantity or percentage, which defect notice or back charge, and the contract clause relied on if the operator names one. "Not agreed" is not a reason.
4. Render it: `npm run docs -- payment-schedule`. The file is in `docs-out/payment-schedule/`.
5. Check the deadline in the output. If it has passed, say so above everything else.
6. A person checks and serves it. Never send from here. Log it: `npm run construction -- log <project> "payment schedule for <SCL-ref> served by <how>"`.
