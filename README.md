<h1 align="center">Construction Projects for Claude Code</h1>

<p align="center">
  <strong>The open-source commercial construction project management system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Procore data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=procore">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/procore?utm_source=github&utm_medium=readme&utm_campaign=procore">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#compliance-checked-against-the-data">Compliance</a> &bull;
  <a href="#ten-questions-procore-cannot-answer">Ten questions</a> &bull;
  <a href="#instead-of-procore">Instead of Procore</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Construction Projects for Claude Code does the job a commercial head contractor pays Procore for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and run the projects in plain language. It runs the right query, and it answers questions the Procore dashboard cannot.

Procore publishes no price. Its own pricing page says it charges "an upfront annual fee by product and based upon your Annual Construction Volume", the dollar value of the work across your projects, and quotes each builder privately. The bill grows with your turnover, not with anything the software does for you. What a head contractor actually holds is ordinary: the projects, the cost plan, the subcontracts, the variations, the claims going out and coming in, the RFIs, the submittals, the delays, the defects and the diary. That is fourteen Postgres tables, and the cost report Procore sells as the product is one SQL view.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=procore).

This repo is built for New Zealand and Australian head contractors running commercial and institutional work between one and fifty million dollars: warehouses, schools, fit-outs, medical and retail. The rituals are the ones that cost money when they slip:

```
/attention               everything that wants a decision this morning, worst first
/sub-claims              subcontractor claims on the payment schedule clock, missed first
/claims                  our progress claims: scheduled, owed, overdue
/cost-report             budget, committed, pending, actual and forecast final by cost code
/variations              instructed, submitted, approved: the unsubmitted pile valued
/rfis                    open RFIs and which ones hold work
/submittals              shop drawings late for procurement
/delays                  delay events and the extension of time notice time bar
/defects                 the punch list, whose each item is
/subbies                 the subcontractor register, expired insurance first
/compliance              ten rules from the Acts and your contracts
/weekly-review           the Monday review, written from three commands
```

The sharp edges are deliberate, because this is where head contractors lose money they had earned:

- **Every subcontractor claim carries its payment schedule deadline from the day it lands**, counted in working days for its jurisdiction: 20 in New Zealand unless the contract says otherwise, the earlier of the contract and 10 business days in NSW, and of the contract and 15 in Queensland, skipping each Act's Christmas period and your public holidays. Miss it and the full claimed amount is payable. It is the loudest thing on the attention list.
- **A payment schedule for less than the claim must say why.** The CLI refuses one without reasons, and there is no force flag.
- **A progress claim never passes the contract plus approved variations**, and on an NSW project it does not go without the supporting statement that the subcontractors have been paid.
- **A subcontractor with expired public liability does not get a subcontract executed.**
- **A delay gets its notice date the moment it is logged**, from the head contract's time bar. No notice, no time.
- **A project does not close with loose ends**: unanswered subcontractor claims, undecided variations, open defects or unpaid claims.

**Nothing here connects to a bank, a client or a portal, and nothing sends.** Schedules, claims and notices render to files in your brand; a person serves them. Nothing here is legal advice.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your project record sits in plain Postgres tables you own. Any tool can read them. No export request, no access ending when a subscription does.
- No annual fee tied to your construction volume. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/construction-projects-for-claude-code.git
cd construction-projects-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database, loads Ridgeline Construction (a demo Hamilton head contractor with a distribution centre, a school science block, an office refurbishment in its defects period and a retail tender, and a month going wrong: an electrical subcontractor's claim whose payment schedule was due yesterday, a steel claim due in two days, a delay notice due in four days and another one twelve days late, a $985,000 scheduled claim six days overdue, a dock pit relocation instructed 34 days ago and never priced, a structural RFI holding the steel, sprinkler drawings late for procurement, the roofer on site uninsured, and structural steel $62,000 over), then prints the attention list, the margins and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/sub-claims`, `/cost-report` for PRJ-201, `project 201`, `company waikato steel`, `/weekly-review`. When you are ready for real data, delete `.data/` and start with `/import`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md), especially each head contract's payment schedule period and extension of time notice period, and put your name and colours in [brand.json](brand.json) so every schedule and notice carries them.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data. The project managers, the commercial manager and the site managers each clone the repo, point at the same `DATABASE_URL`, and work in their own agent.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first: a missed payment schedule outranks all. |
| `/projects` | The projects in hand with revised contract, claimed, owed, forecast margin and pending variations. |
| `/project` | One project's whole card: cost report, subcontracts, claims both ways, variations, RFIs, delays, diary. |
| `/cost-report` | Budget, committed, pending, actual and forecast final by cost code, the damaging lines named. |
| `/commitments` | Subcontracts and orders: value, certified, paid, retention, insurance state. |
| `/sub-claims` | Subcontractor claims on the payment schedule clock, in working days for the jurisdiction. |
| `/claims` | Our progress claims: served, scheduled, retention held, owed, overdue. |
| `/variations` | Instructed, submitted, approved, rejected, with the unsubmitted pile valued and aged. |
| `/rfis` | Open RFIs, who holds each, and which hold work or cost money. |
| `/submittals` | Shop drawings and samples not yet approved, late for procurement first. |
| `/delays` | Delay events with the extension of time notice time bar counted. |
| `/defects` | The punch list by project and subcontractor, overdue first. |
| `/subbies` | The subcontractor register: public liability state loud. |
| `/log` | The site diary: weather, labour, instructions, delays. In an extension of time claim, the evidence. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/compliance` | Ten rules from the Acts, your contracts and your own standards, run against your records, sources cited. |
| `/draft-payment-schedule` | The payment schedule for a subcontractor's claim, with reasons, in your brand. Renders only. |
| `/draft-delay-notice` | The notice of delay and extension of time claim, with the diary attached. Renders only. |
| `/draft-rfi-chaser` | A firm, factual chaser for an overdue RFI. Drafts only. |
| `/import` | Bring a project across from Procore's own CSV exports. The import is the first audit. |
| `/customise` | Add a field, change a rule, rename things, in plain language. Writes and applies the migration. |
| `/new-view` | Add a read-only HTML dashboard from a description. |

Everything the commands do, the CLI does: `npm run construction -- help`. Any command takes `--json`.

### Documents and views, in your brand

```bash
npm run docs    # payment schedules, progress claims, delay notices, cost reports
npm run view    # the site board and the money pages, as read-only HTML dashboards
```

Both read [brand.json](brand.json), so your company's name, logo and colours are one file away. Documents land in `docs-out/`, views in `views/`. Print either to PDF from the browser. `/new-view` adds a view, `documents.json` adds a document.

## Compliance, checked against the data

`/compliance` runs the rules in [docs/compliance.md](docs/compliance.md) against your records and reports what is breached, each rule citing its source. The CLI enforces the sharpest at the gate.

1. Every subcontractor payment claim is answered by a payment schedule before its deadline (NZ CCA ss 21 to 24, NSW SOPA s14, QLD BIF Act ss 76 to 77).
2. Every payment schedule for less than the claim states its reasons (NZ CCA s21, NSW SOPA s14(3), QLD BIF Act s69).
3. Every NSW progress claim carries a supporting statement (NSW SOPA s13(7)).
4. Retentions held from subcontractors on NZ projects sit in a recorded trust account (NZ CCA subpart 2A, as amended in 2023).
5. Progress claims never pass the contract plus approved variations.
6. Instructed variations are priced and submitted within 14 days.
7. Every delay is notified inside the head contract's time bar.
8. Every subcontractor on a live subcontract carries current public liability insurance.
9. An overdue RFI that holds work has a delay logged against it.
10. No cost line forecast over budget without a decision.

Nothing there is legal advice. It is the rule book you point the system at, and you change it to match your contracts.

## Ten questions Procore cannot answer

Every one of these is answered from the demo data today. Yours will be different, and that is the point.

1. Which subcontractor claims have a payment schedule due this week, in working days for their state, and which deadline did we already miss?
2. How much instructed variation work are we carrying that has never been priced to the client, by project and by age?
3. Which overdue RFIs are holding work on site, and which of those have no delay notice logged against them yet?
4. Which delay notices are inside their time bar right now, and how many working days are left on each?
5. Which subcontractors are on a live subcontract today with expired public liability?
6. Which cost lines are forecast over budget because of subcontract variations we approved but have not recovered from the client?
7. How much retention are we holding from subcontractors on each New Zealand project, and is there a trust account on record for it?
8. Which payment schedules did we issue for less than the claim without recording why?
9. Across every project, what is the client holding in retention from us, and when does each defects period end?
10. Which projects have gone more than three days without a site diary entry, while a delay claim is open on them?

## Your first hour: ten things to ask for

Open the folder in Claude Code and say these in your own words. Each one changes the system to fit your business.

1. "Put our live projects in, with contract values, the jurisdiction and the head contract form for each."
2. "Our subcontracts give us 15 working days to schedule, not 20. Set that on every NZ project."
3. "Add this year's public holidays for Waikato and New South Wales to the clock."
4. "Put our logo and colours on the payment schedules and delay notices."
5. "Import the Procore commitments, RFIs and submittals for the distribution centre, then show me what the old system never told us."
6. "Add a compliance rule: no subcontractor on site without a current site-specific safety plan on record."
7. "Track head contract milestones and liquidated damages per day, and show our exposure if each slips."
8. "Build a page per subcontractor: their subcontracts, claims, schedules, retention held and insurance."
9. "When I schedule a claim, render the payment schedule in the same breath."
10. "Write a command that drafts the month-end cost report summary for the directors."

`/customise` writes the migration, applies it, updates every command that touches the change, and runs the tests.

## Instead of Procore

Procore exports each tool's log per project: the Commitments list, the RFIs log and the Submittals log all export to CSV from the tool's Export menu. Export those three for a project, create the project here, run one command, and the record comes with you. Step by step, with what maps and what deliberately does not carry over: [docs/replace-procore.md](docs/replace-procore.md).

```bash
npm run construction -- import procore --project=PRJ-201 --commitments=commitments.csv --rfis=rfis.csv --submittals=submittals.csv --dry-run
npm run construction -- import procore --project=PRJ-201 --commitments=commitments.csv --rfis=rfis.csv --submittals=submittals.csv
```

The import is the first audit: subcontractors with no insurance on record, commitments with no cost line behind them and open RFIs already past due are loud the moment it finishes.

## Architecture

```
construction-projects-for-claude-code/
  CLAUDE.md                   how the business wants this run (routing table + house rules)
  AGENTS.md                   the same, for Codex / OpenCode / Cursor / Gemini CLI
  brand.json                  your company's name, logo and colours on every document
  views.json                  the HTML dashboards npm run view renders
  documents.json              the paperwork npm run docs renders
  .claude/commands/           the slash commands
  scripts/construction.mjs    the CLI the commands drive
  scripts/view.mjs            read-only HTML dashboards from the SQL views
  scripts/docs.mjs            the documents, one HTML file per record
  scripts/lib/db.mjs          one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/        plain SQL schema, tables and views
  supabase/seed.sql           demo data
  docs/compliance.md          the rules /compliance checks, each with its source
  docs/replace-procore.md     moving off the incumbent
  docs/why-no-front-end.md    the honest trade-offs
  exports/                    whole database dumps
  drafts/                     anything written for a person to send
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end, no bank or client credentials, nothing that sends, and the schedule, reasons, ceiling, supporting statement, insurance and close gates stay.

## Want it installed and run for you?

Enterprise DNA installs Construction Projects for Claude Code for your company, migrates your Procore projects, writes your head contracts' periods and your subcontract terms in as rules, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=procore)
- Read more: [enterprisedna.co/omni/instead-of/procore](https://enterprisedna.co/omni/instead-of/procore?utm_source=github&utm_medium=readme&utm_campaign=procore)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
