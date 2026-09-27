---
description: Ten rules from the NZ Construction Contracts Act, the NSW and QLD security of payment Acts, the head contract and the business's own standards, run against the live records with sources cited.
---

1. Run `npm run construction -- compliance`.
2. Report FAIL rules first, each breach named with its record and the fix. The sources are in `docs/compliance.md`; cite them when asked why a rule exists.
3. The gates already enforce the sharpest rules at the door, so some rules are usually clean:
   - `schedule` refuses a payment schedule for less than the claim without reasons.
   - `claim` refuses anything past the contract plus approved variations, and an NSW claim without its supporting statement.
   - `commit` and `execute` refuse a subcontractor with expired or no public liability.
   - `project close` refuses while claims are unanswered, variations undecided, defects open or claims unpaid.
4. A breach on imported history is a finding, not a bug: the old system allowed what this one refuses.
5. One rule alone: `npm run construction -- compliance <rule>`. Changing a rule is a `/customise` job: the rule, the check and the doc move together.

Nothing here is legal advice. The rules are what this business has told the system to enforce, with their sources. If a rule is out of date, say so and stop; the operator confirms the law.
