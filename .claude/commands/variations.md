---
description: The variations register: instructed, submitted, approved and rejected, with the instructed-and-never-submitted pile valued and aged.
---

1. Run `npm run construction -- variations` (`--all` for decided ones, `--project=` for one project).
2. Instructed and not submitted is the loudest line: work being done that the client has not been asked to pay for. Give the total.
3. Submitted and waiting: who at the client to chase, and for how long it has waited.
4. New one from a site instruction: `npm run construction -- variation add <project> --title= --si=<SI number> --price= --cost= --commitment=<SC-ref>`.
5. Submit: `npm run construction -- variation submit <VAR> --price=`. Approved: `npm run construction -- variation approve <VAR> --by="name, and how (email, signed)"`. Only approved variations raise the claim ceiling.
