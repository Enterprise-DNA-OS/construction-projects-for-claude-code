---
description: Everything that wants a decision this morning, worst first. Missed and due payment schedules, delay notices on the clock, overdue claims, unsubmitted variations, overdue RFIs, late submittals, uninsured subcontractors, cost lines over, defects, retentions, quiet diaries and tenders closing.
---

1. Run `npm run construction -- attention`.
2. The list is ordered by what each item can cost. Read it in that order and do not reorder it by ease:
   - **A missed payment schedule** outranks everything. Under the Act the full claimed amount is now payable on the due date. Say so plainly, recommend a call to the business's adviser today, and do not suggest paying less without that advice.
   - **A payment schedule due** inside three days: assess the claim now and issue the schedule (`schedule <SCL-ref> --amount= --reasons=`). Reasons are required for any difference.
   - **A delay notice due or late**: no notice, no time, and liquidated damages land on the head contractor. Draft it today (`/draft-delay-notice`).
   - **An overdue progress claim**: our money. A call today, logged in the diary.
   - **An instructed variation never submitted**: work we may never be paid for. Price it and submit it this week.
   - **Overdue RFIs, late submittals, uninsured subcontractors, cost lines over, overdue defects, retention to release, a quiet diary, a tender closing**: in that order.
3. For each item, say the one action: the command, the person to ring, or the decision. Name who.
4. Paper is drafted, never sent: `npm run docs` and `drafts/`. A person sends.

If the operator asks "what should I do today", pick the top three and say why those three.
