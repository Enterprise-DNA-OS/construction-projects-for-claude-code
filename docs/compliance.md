# Compliance: the rules /compliance checks

`npm run construction -- compliance` runs each rule below against the live records and reports what is breached. The sharpest are also enforced at the gate, so a breach usually means imported history or a record entered late.

Nothing here is legal advice. The Acts are summarised in plain words so the check can be written; read the Act and your contract, and take advice, before relying on any of it. When a rule here stops matching the law or your contracts, change the rule, the check in `scripts/construction.mjs` and this page together (`/customise`).

## The clocks

The payment schedule deadline is counted when a subcontractor claim is recorded (`sub-claim`), in working days for the project's jurisdiction:

| Jurisdiction | Act | Period to answer a payment claim | Days skipped besides weekends and public holidays |
|---|---|---|---|
| NZ | Construction Contracts Act 2002, s22 | The contract's period, or 20 working days after the claim is served if the contract has none | 24 December to 5 January (s5, "working day") |
| NSW | Building and Construction Industry Security of Payment Act 1999, s14(4) | The contract's period or 10 business days after the claim is served, whichever is earlier | 27 to 31 December (s4, "business day") |
| QLD | Building Industry Fairness (Security of Payment) Act 2017, s76 | The contract's period or 15 business days after the claim is given, whichever is earlier | 22 December to 10 January (schedule 2, "business day") |

Public holidays are whatever is in the `holidays` table: add your region's with `holiday add <date> "<name>" --jurisdiction=`. The contract's period is recorded per project (`project set <ref> --schedule-days=`).

## The rules

### 1. schedules_on_time: every subcontractor payment claim is answered by a payment schedule before its deadline

- **Source:** NZ CCA ss 21 to 24; NSW SOPA ss 14 and 15; QLD BIF Act ss 76 and 77. If the recipient of a payment claim does not provide a payment schedule within the period, it becomes liable to pay the full claimed amount on the due date, and the claimant can recover it as a debt.
- **Breach in the data:** a claim with no schedule issued and the deadline passed, or a schedule issued after the deadline.
- **Gate:** none can stop a deadline passing. The attention list puts a claim three days from its deadline second from the top, and a missed one first.

### 2. schedule_reasons: every payment schedule for less than the claim states its reasons

- **Source:** NZ CCA s21 (a payment schedule indicates the scheduled amount, the manner of calculation and, if less than claimed, the reason for the difference); NSW SOPA s14(3); QLD BIF Act s69.
- **Breach in the data:** `scheduled_amount < claimed_amount` with no `schedule_reasons`.
- **Gate:** `schedule` refuses a lower amount without `--reasons`. No force flag.

### 3. supporting_statement: every NSW progress claim carries a supporting statement

- **Source:** NSW SOPA s13(7): a head contractor must not serve a payment claim on the principal unless it is accompanied by a supporting statement indicating that it relates to that payment claim and declaring that the subcontractors have been paid all amounts due.
- **Breach in the data:** an NSW head claim with `supporting_statement` false.
- **Gate:** `claim` on an NSW project refuses without `--supporting-statement`.

### 4. retention_trust: retentions held from subcontractors on NZ projects sit in a recorded trust account

- **Source:** NZ CCA subpart 2A (retention money), strengthened by the Construction Contracts (Retention Money) Amendment Act 2023: retention money withheld under a commercial construction contract is held on trust for the party it was withheld from, kept separate, and recorded.
- **Breach in the data:** an NZ project with retention withheld from subcontractors and no `retention_account` recorded.
- **Fix:** `project set <ref> --retention-account="<bank, account name>"`.

### 5. claims_within_contract: progress claims never pass the contract plus approved variations

- **Source:** your head contract. A payment claim is for work under the contract; claiming past the ceiling invites a schedule for less and loses the argument.
- **Gate:** `claim` refuses. No force flag.

### 6. variations_submitted: instructed variations are priced and submitted within 14 days

- **Source:** your head contract's variation clause (NZS 3910 and AS 4000 both expect the contractor to value instructed variations) and this business's own standard. Work instructed and never submitted is work you may never be paid for.
- **Breach in the data:** a variation `instructed` more than 14 days ago.

### 7. delay_notices: every delay is notified inside the head contract's time bar

- **Source:** your head contract's extension of time clause. NZS 3910 and AS 4000 both require notice within a set period, and a late notice can lose the time and leave liquidated damages with the head contractor. The period is recorded per project (`project set <ref> --eot-days=`, default 20 working days) because it differs by contract: check yours.
- **Breach in the data:** an open delay past its `notice_due_on`, or a notice given after it.

### 8. insurance_current: every subcontractor on a live subcontract carries current public liability insurance

- **Source:** your subcontract terms and the head contract's insurance clause.
- **Gate:** `commit` and `execute` refuse a subcontractor with expired or no public liability on record.

### 9. rfi_delays: an overdue RFI that holds work has a delay logged against it

- **Source:** this business's own standard. An RFI with a time impact past its due date is the start of an extension of time claim, and the time bar runs from when the work was held, not from when someone noticed.

### 10. cost_watch: no cost line forecast over budget without a decision

- **Source:** this business's own standard. A line over budget is a variation to submit, a buying loss to name, or a forecast to correct, this month.
