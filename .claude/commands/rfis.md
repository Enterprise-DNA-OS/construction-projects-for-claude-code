---
description: Open RFIs with who holds each one, the due date, and whether it holds work or costs money. Overdue first.
---

1. Run `npm run construction -- rfis` (`--project=` for one project).
2. Overdue first. For each one that holds work (time impact), check there is a delay logged (`/delays`). If not, that is the next action: the time bar is already running.
3. New RFI: `npm run construction -- rfi add <project> --subject= --to=<consultant> --due=<date> [--time --cost]`. It refuses without a due date.
4. Answer landed: `npm run construction -- rfi answer <RFI> --answer=`. If it has a cost impact, raise the variation in the same breath.
5. Chasing one: `/draft-rfi-chaser`.
