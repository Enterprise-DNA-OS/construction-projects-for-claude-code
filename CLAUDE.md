# Construction Projects for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR COMPANY], a commercial head contractor in [region, New Zealand or Australia]
- **Operator:** [YOUR NAME], [director / commercial manager / project manager]
- **The work:** [what: warehouses, schools, fit-outs; how many projects run at once; typical contract size]
- **The head contracts:** [which form: NZS 3910, AS 4000, AS 2124, bespoke; the payment schedule period and the extension of time notice period in each, and where notices are served]
- **The subcontracts:** [your standard subcontract; your retention percentage; how many working days you give yourself to schedule a claim]
- **Who signs a payment schedule:** [name them now, and who can approve a variation to a client]
- **What matters most:** [for example: never a missed payment schedule, every delay notified inside its time bar, the cost report true every month]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a project, a claim or a subcontractor, read the whole card: `project <ref>`, `company <name>`.
3. **Plain language.** Short sentences. No filler. Numbers in tables. The industry's words: a project, a head contract, a subcontract, a payment claim, a payment schedule, a variation, a site instruction, an RFI, a submittal, a delay, an extension of time, practical completion, defects, retention.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or goes to a client, a subcontractor or a consultant waits for a yes in this session.
6. **Never invent a fact.** Amounts, dates, instruction numbers and approvals come from the record. If one is missing, ask for that one fact.
7. **Never rule on the law.** This system counts the days and enforces the gates. Whether a specific schedule, claim or notice meets the Act or the contract is the operator's and their adviser's call, never yours. When a statutory deadline has been missed, say so and recommend advice.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs a decision today | `/attention` |
| How the projects stand | `/projects` |
| One project, before a meeting | `/project` |
| The monthly cost report | `/cost-report` |
| The QS's forecast for a line | `forecast <project> --line= --final=` |
| A direct cost to book | `cost-add <project> --line= --amount= --supplier=` |
| Let a subcontract | `commit <project> --company= --line= --value= --title=` |
| A subcontractor's claim landed | `sub-claim <SC-ref> --amount= --received=` |
| What claims are on the clock | `/sub-claims` |
| Answer a subcontractor's claim | `/draft-payment-schedule` |
| Pay a subcontractor | `pay <SCL-ref>` |
| Claim from the client | `claim <project> --amount=`, then `npm run docs -- progress-claim` |
| The client's schedule or payment came back | `client-schedule <PC-ref> --amount= --reasons=` / `received <PC-ref>` |
| Who owes us | `/claims` |
| A site instruction or a change | `/variations`, then `variation add` |
| The client approved it in writing | `variation approve <VAR> --by=` |
| A question to the design team | `rfi add <project> --subject= --to= --due=` |
| Which RFIs are late | `/rfis`, then `/draft-rfi-chaser` |
| Shop drawings and samples | `/submittals` |
| Something is holding the programme | `delay add`, then `/draft-delay-notice` |
| Which notices are due | `/delays` |
| The punch list | `/defects` |
| Subcontractor insurance | `/subbies`; renewal: `insurance <company> --expires=` |
| Something happened on site | `/log` |
| Practical completion | `project pc <ref> --on= --defects-days=` |
| Close a project | `project close <ref>` |
| The Monday review | `/weekly-review` |
| Are we compliant | `/compliance` |
| A public holiday for the clocks | `holiday add <date> "<name>" --jurisdiction=` |
| Bring a project over from Procore | `/import` |
| Change how this system works | `/customise` |
| A new page to look at | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run construction -- help`) and then propose a new command for it.

## Hard rules

- **Every subcontractor claim is recorded the day it lands.** `sub-claim` computes the payment schedule deadline in working days for the project's jurisdiction. A late entry shortens the time to answer; a missed deadline makes the full claimed amount payable.
- **A payment schedule for less than the claim states how it was calculated and why.** `schedule` refuses without `--reasons`, and there is no force flag.
- **A progress claim never passes the contract plus APPROVED variations**, and an NSW claim does not go without its supporting statement. `claim` refuses both, with no force flag.
- **A subcontractor with expired or missing public liability does not get a subcontract executed.** `commit` and `execute` refuse.
- **A project does not close with loose ends.** Unanswered subcontractor claims, undecided variations, open defects and unpaid claims block `project close`.
- **Nothing here connects to a bank, a client or a portal, and nothing sends.** Documents render to `docs-out/`, drafts to `drafts/`; a person serves them.
- **Never delete records.** Projects close, subcontracts complete, claims stay. The project record is the business's liability tail and, in a dispute, its evidence.
- **Never invent a record.** If a name or a reference is ambiguous, list the candidates and ask. The CLI already does this.
- The database is the source of truth. If the answer is not in it, say so.

## Words this business uses

- A **project** runs tender, active, defects, closed (or lost). The **contract value** plus **approved variations** is the ceiling every progress claim is checked against.
- A **subcontract** (commitment) lets part of the work to a trade against a **cost line**. **Committed** is executed subcontracts plus their approved variations.
- A **payment claim** is served under the **Construction Contracts Act 2002** (NZ), the **Building and Construction Industry Security of Payment Act 1999** (NSW) or the **Building Industry Fairness (Security of Payment) Act 2017** (QLD). The recipient answers with a **payment schedule** inside the statutory period, stating the amount it will pay and, if less, why. No schedule in time and the full claimed amount is payable.
- **Working days** (NZ) and **business days** (NSW, QLD) skip weekends, public holidays and each Act's Christmas period: 24 December to 5 January in NZ, 27 to 31 December in NSW, 22 December to 10 January in QLD.
- A **supporting statement** (NSW) is the head contractor's declaration, served with its payment claim, that the subcontractors have been paid.
- A **variation** starts as a **site instruction**, is priced and **submitted** to the client, and is **approved** in writing before it raises the ceiling.
- An **RFI** asks the design team a question by a date. An overdue RFI with a **time impact** is the start of an **extension of time** claim.
- A **submittal** (shop drawings, samples, product data) needs approval by a date so the order goes in on time.
- A **delay** needs a **notice** inside the head contract's **time bar**. No notice, no time, and **liquidated damages** land on the head contractor.
- **Retention** is money held back against defects: the client holds ours, we hold the subcontractors'. In NZ, retention we hold is trust money.
- **Practical completion** starts the **defects period**; retention is released around it and at its end, as the contract says.
- The **site diary** is the daily record. In an extension of time claim, it is the evidence.

## Where things live

- `scripts/construction.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it. Never edit an applied migration; add the next one.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `brand.json`, `views.json`, `documents.json` the HTML output: whose name is on it, what pages, what paperwork.
- `docs/compliance.md` the rules `/compliance` checks, each with its source. `docs/replace-procore.md` moving off the incumbent. `docs/why-no-front-end.md` the honest trade-offs.
- `exports/` whole database dumps. `drafts/` and `docs-out/` anything written for a person to send.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/procore
