---
description: Our progress claims to clients: served, scheduled, retention held, payment due, owed, with overdue claims first.
---

1. Run `npm run construction -- claims` (`--all` for paid history).
2. OVERDUE first, with the amount owed after retention and the days. The action is a call today and a diary entry.
3. Where the client scheduled less than we claimed, name the difference and their reasons; recommend whether it is worth an adjudication conversation.
4. The next claim: `npm run construction -- claim <project> --amount=`. It refuses anything past the contract plus approved variations, and on an NSW project it refuses without `--supporting-statement`. Then `npm run docs -- progress-claim`.
5. Record the client's response: `npm run construction -- client-schedule <PC-ref> --amount= --reasons=`, and payment: `npm run construction -- received <PC-ref>`.
