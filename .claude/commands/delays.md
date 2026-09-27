---
description: Delay events and their extension of time notices, with the head contract's time bar counted in working days. Late and due notices first.
---

1. Run `npm run construction -- delays` (`--all` for decided ones).
2. NOTICE LATE: the window closed. Recommend the notice goes today anyway and that the business takes advice on the time bar.
3. NOTICE DUE: draft it now with `/draft-delay-notice`.
4. New delay: `npm run construction -- delay add <project> --cause= --started=<the day work was affected> [--rfi=]`. The notice date is computed from the project's recorded time bar (`project set <ref> --eot-days=`).
5. Notice given: `npm run construction -- delay notify <EOT> --days=<days claimed>`. Decision back: `npm run construction -- delay decide <EOT> --granted=<days>`.
