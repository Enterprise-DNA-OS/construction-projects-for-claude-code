---
description: Subcontractor payment claims waiting on a payment schedule, with the statutory deadline counted in working days for the project's jurisdiction. Missed deadlines first.
---

1. Run `npm run construction -- sub-claims`.
2. MISSED first: under the Act the full claimed amount is payable. Recommend advice today.
3. DUE NOW next: each needs an assessment of the work done against the subcontract and a schedule issued before the deadline. Read the subcontract (`npm run construction -- company <name>`) and the diary before recommending an amount.
4. Record a new claim the day it lands: `npm run construction -- sub-claim <SC-ref> --amount= --received=<date>`. The deadline is computed then (NZ 20 working days unless the contract says otherwise, NSW 10 business days or earlier, QLD 15 business days or earlier), skipping weekends, the Christmas period each Act excludes, and public holidays in the holidays table.
5. Issue the schedule: `npm run construction -- schedule <SCL-ref> --amount= --reasons="how it was calculated and why it is less"`. Then `/draft-payment-schedule`.
