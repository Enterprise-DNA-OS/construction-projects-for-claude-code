---
description: Shop drawings, samples and product data not yet approved, ordered by the date approval is needed for procurement. Late ones first.
---

1. Run `npm run construction -- submittals` (`--project=` for one).
2. LATE for procurement first: every day past the needed-by date is lead time eating the programme. Name the reviewer to chase.
3. At risk (needed inside 7 days) next.
4. New: `npm run construction -- submittal add <project> --title= --reviewer= --required-by= --commitment=`. Returned: `npm run construction -- submittal return <SUB> --status=`.
