# Moving off Procore

Procore holds a head contractor's project record across its tools: Commitments, RFIs, Submittals, Change Events and Change Orders, Daily Log, Punch List, Budget, Prime Contract and Invoicing. Each tool exports its own list, per project. This guide moves the three that carry the most live risk, then the rest by hand or with Claude Code.

## 1. Export from Procore

For each live project, in Procore:

- **Commitments:** open the project's Commitments tool, choose Export, then CSV. It downloads the purchase orders and subcontracts in the list.
- **RFIs:** open the RFIs tool, choose Export, then CSV. The export follows your current filters and search, so clear them first.
- **Submittals:** open the Submittals tool on the Items tab, choose Export, then CSV (Excel also works: save it as CSV). Over 150 items, Procore emails the file when it is ready.

Procore's help centre documents each export. The Procore Extracts desktop app pulls a whole project into folders if you want everything, attachments included, for your archive.

## 2. Create the project here

```bash
npm run construction -- add company "<client name>" --kind=client
npm run construction -- project add "<project name>" --client="<client name>" --value=<contract value> --jurisdiction=NZ --form="NZS 3910:2013"
npm run construction -- project award PRJ-201 --on=<award date> --pc-due=<practical completion date>
```

Load the cost plan by cost code with `budget add`, one line per code, from your tender or Procore's Budget tool.

## 3. Import, dry run first

```bash
npm run construction -- import procore --project=PRJ-201 --commitments=commitments.csv --rfis=rfis.csv --submittals=submittals.csv --dry-run
npm run construction -- import procore --project=PRJ-201 --commitments=commitments.csv --rfis=rfis.csv --submittals=submittals.csv
```

The import is safe to run twice: each row carries Procore's number and does not duplicate.

## What maps

| Procore column | Here |
|---|---|
| Commitments: #, Title, Contract Company, Status, Executed, Original Contract Amount | `commitments`: external ref, title, company (created as a subcontractor if new), status, executed date when the column holds a date, value |
| RFIs: #, Subject, Status, Date Initiated, Due Date, Received From / Ball In Court, Cost Impact, Schedule Impact | `rfis`: external ref, subject, status, asked, due (asked plus 7 days if blank), who holds it, cost and time impact |
| Submittals: Spec Section, #, Title, Status, Ball In Court, Submit By, Required On Site / Final Due Date | `submittals`: spec section, external ref, title, status, reviewer, submitted, needed by |

Column names are matched case-insensitively and several common names are tried for each field, because Procore's exports vary with your configured columns.

## What the import flags

- **Subcontractors with no public liability on record.** Procore's export does not carry insurance expiry. Enter each certificate: `insurance "<company>" --expires=<date>`.
- **Commitments on cost line 99.** The commitments list does not carry your cost codes, so every commitment lands on "Imported commitments" with no budget, and the cost report shows it OVER until you move each to its real line. Ask Claude Code: "move SC-301 to cost line 04".
- **Open RFIs already past due.** Check which hold work and log the delays.

## What does not carry over, deliberately

- **Drawings, photos and markups.** Keep them in your document management or the Procore Extracts archive. This system records the RFI and the decision, not the PDF.
- **Subcontractor claims and invoices in flight.** Enter each open claim with its real received date (`sub-claim <SC> --amount= --received=`) so the payment schedule clock is right. Paid history stays in your accounting system.
- **Change events and change orders.** Enter live ones as variations (`variation add`, then `submit` or `approve`). Mapping the Change Orders CSV is a customisation Enterprise DNA does on the installed version, or ask Claude Code to write the mapping.
- **Daily logs.** The last few weeks are worth typing in as diary entries if a delay claim is open; the rest belongs in the archive.

## Running both for a month

Keep Procore read-only for a month while the team works here. Check one cost report, one subcontractor's claim position and the open RFI list against Procore each week. When they agree, let the renewal lapse.
