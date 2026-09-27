# Why there is no front end

Procore is a database with an annual fee. The records underneath it are ordinary: projects, cost lines, subcontracts, claims, variations, RFIs, submittals, delays, defects and a diary. What you pay for is the layer of screens on top, priced by the dollar value of the work you build, so the fee rises with your turnover whether or not you use more of it.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a report for and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask "which subcontractor claims need a schedule this week, in working days for their state" and get it.
- **A fee that does not follow your turnover.** Win a bigger project and the bill for your own records stays the same.
- **Your record in your Postgres.** Plain tables. Back them up, query them from anything, keep them for the full liability period. There is no export step because there is nothing to leave.
- **Your rules, enforced.** The payment schedule reasons, the claim ceiling, the insurance gate: the system refuses the shortcut instead of reporting it next month.

## What you give up

- **Drawings and markups.** Procore's drawing viewer, versions and markup are real features. Keep your drawings in your document system; this records the questions and decisions about them.
- **A phone app for the site team.** Here the site manager writes the diary through an agent, or someone in the office does. A simple site screen is a customisation Enterprise DNA builds when it earns its keep.
- **Subcontractor and client logins.** Procore lets subcontractors submit through a portal. Here claims arrive the way they already do, by email, and someone records them the same day.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for businesses that want someone to call.

## Who this fits

Head contractors whose project managers and commercial manager live in the numbers, and who would rather ask than click. If your whole site team needs a screen on a phone all day, keep a screen for them. If you need the answers and the deadlines more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/procore
