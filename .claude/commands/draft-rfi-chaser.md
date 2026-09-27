---
description: A short, firm chaser for an overdue RFI to the consultant who holds it, naming the work it is holding. Drafts to drafts/, never sends.
---

1. Read the RFI and its project first: `npm run construction -- rfis --project=<ref>`, then `npm run construction -- project <ref>` for any delay logged against it.
2. Draft to `drafts/` in this shape: the RFI number and subject, the date asked and the date due, days overdue, the work it is holding (from the diary), the date an answer is now needed by, and one line that a delay has been notified under the head contract if one has.
3. No blame, no threat. Facts and a date.
4. A person sends it. Log it: `npm run construction -- log <project> "RFI chaser for <RFI> drafted"`.
