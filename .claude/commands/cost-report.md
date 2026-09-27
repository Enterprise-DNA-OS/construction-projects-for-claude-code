---
description: The monthly cost report for one project: budget, committed, pending variations, actual and forecast final by cost code, with the lines doing the damage named.
---

1. Run `npm run construction -- cost <project>`.
2. Lead with the forecast margin and the variance total, then every line OVER or near, each with the likely cause from the record: an approved subcontract variation not yet recovered from the client, a direct cost overrun, or a QS forecast.
3. If a line is over because the client changed something, say it is a variation to submit (`/variations`).
4. The QS's view beats the arithmetic when it is higher: `npm run construction -- forecast <project> --line=<code> --final=<amount>`.
5. For the board or the bank: `npm run docs -- cost-report` renders it in the company's brand.
