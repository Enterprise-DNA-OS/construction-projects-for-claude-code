#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'construction-smoke-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const d10 = (v) => String(v ?? '').slice(0, 10);
const cx = (...args) => ['construction.mjs', ...args];

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the business ---------------------------------------------------------

  const stats = run('stats', cx('stats'));
  assert(stats.active_projects === 2, `two active projects (${stats.active_projects})`);
  assert(stats.owed_to_us === 1657750, `owed to us (${stats.owed_to_us})`);
  assert(stats.schedules_missed === 1 && stats.schedules_due === 1, 'one schedule missed, one due now');
  assert(stats.attention_items === 18, `eighteen attention items (${stats.attention_items})`);

  const attention = run('attention', cx('attention'));
  assert(attention.length === 18, `attention list (${attention.length})`);
  assert(attention[0].reason === 'schedule_missed' && attention[0].label === 'SCL-703', 'the missed payment schedule sorts first');
  for (const r of ['schedule_due', 'delay_notice', 'claim_overdue', 'variation_unsubmitted', 'rfi_overdue', 'submittal_late', 'insurance_expired', 'cost_over', 'defect_overdue', 'retention_release', 'diary_quiet', 'tender_due', 'insurance_expiring']) {
    assert(attention.some((a) => a.reason === r), `attention carries ${r}`);
  }

  const projects = run('projects', cx('projects'));
  assert(projects.length === 4, `four live projects (${projects.length})`);

  const p201 = run('a project by bare number', cx('project', '201'));
  assert(p201.project.ref === 'PRJ-201', '"201" finds PRJ-201');
  assert(n(p201.project.revised_contract) === 8452000, `contract plus approved variations (${p201.project.revised_contract})`);
  assert(n(p201.project.claimed) === 4360000 && n(p201.project.owed_to_us) === 935750, 'the claims position');
  assert(n(p201.project.retention_held_by_client) === 211250, 'retention held by the client');
  assert(n(p201.project.forecast_cost) === 7952000 && n(p201.project.forecast_margin) === 500000, `forecast margin (${p201.project.forecast_margin})`);
  assert(p201.cost.length === 11 && p201.commitments.length === 5, 'cost lines and subcontracts on the card');

  const noSuch = run('an unknown project exits 1', cx('project', 'nowhere at all'), { json: false, expectFail: true });
  assert(/No project matches/.test(noSuch.stderr), 'and says so plainly');
  const ambiguous = run('an ambiguous company exits 1 and lists candidates', cx('company', 'a'), { json: false, expectFail: true });
  assert(/matches \d+ company records/.test(ambiguous.stderr), 'with the candidates listed');

  const company = run('a company card by partial name', cx('company', 'waikato steel'));
  assert(company.company.name === 'Waikato Steel Erectors' && company.claims.length === 2, 'Waikato Steel with two claims');

  // ---- the cost report ------------------------------------------------------

  const cost = run('cost report', cx('cost', 'PRJ-201'));
  const steel = cost.find((l) => l.line === 'Structural steel');
  assert(steel.state === 'OVER' && n(steel.variance) === -62000, `steel forecast 62,000 over (${steel.variance})`);
  assert(n(steel.committed) === 1622000, 'committed includes the approved subcontract variation');
  const concrete = cost.find((l) => l.line === 'Concrete');
  assert(n(concrete.pending) === 36000 && concrete.state === 'near', 'pending variation cost counted on concrete');
  const prelims = cost.find((l) => l.cost_code === '01');
  assert(n(prelims.forecast_final) === 1210000, 'the QS forecast override holds');

  const margin = run('margin', cx('margin'));
  assert(margin[0].ref === 'PRJ-201', 'the thinnest margin sorts first');

  // ---- claims both ways -------------------------------------------------------

  const subClaims = run('sub-claims waiting', cx('sub-claims'));
  assert(subClaims.length === 4, `four claims waiting (${subClaims.length})`);
  assert(subClaims[0].ref === 'SCL-703' && subClaims[0].state === 'MISSED', 'the missed one first');
  assert(subClaims[1].ref === 'SCL-702' && subClaims[1].state === 'DUE NOW', 'the steel claim due now');

  const claims = run('claims unpaid', cx('claims'));
  assert(claims.length === 2 && claims[0].state === 'OVERDUE' && n(claims[0].outstanding) === 935750, 'PC-604 overdue at 935,750');

  const noReasons = run('schedule for less without reasons is refused', cx('schedule', 'SCL-702', '--amount=200000'), { json: false, expectFail: true });
  assert(/must say how it was calculated/.test(noReasons.stderr), 'with the Act cited');
  const sched = run('schedule for less with reasons', cx('schedule', '702', '--amount=200000', '--reasons=Mezzanine members not yet erected'));
  assert(n(sched.scheduled_amount) === 200000 && n(sched.retention_withheld) === 10000, `five per cent retention withheld (${sched.retention_withheld})`);
  const paid = run('pay the subcontractor', cx('pay', 'SCL-702'));
  assert(n(paid.amount_paid) === 190000 && paid.status === 'paid', 'paid the scheduled amount less retention');
  const again = run('a second schedule is refused', cx('schedule', 'SCL-702', '--amount=1'), { json: false, expectFail: true });
  assert(/already has a payment schedule/.test(again.stderr), 'one schedule per claim');

  const late = run('a late schedule is recorded and flagged', cx('schedule', 'SCL-703', '--amount=96300'), { json: false });
  assert(/LATE/.test(late.stdout), 'the late schedule says so');

  const ceiling = run('a claim past the ceiling is refused', cx('claim', 'PRJ-201', '--amount=4200000'), { json: false, expectFail: true });
  assert(/ceiling of \$8,452,000/.test(ceiling.stderr) && /no force flag/.test(ceiling.stderr), 'with the ceiling named');

  // ---- variations raise the ceiling only when approved --------------------------

  const unsigned = run('approve without a name is refused', cx('variation', 'approve', 'VAR-503'), { json: false, expectFail: true });
  assert(/in writing/.test(unsigned.stderr), 'who approved, in writing');
  run('submit the dock pits variation', cx('variation', 'submit', 'VAR-502', '--price=48500'));
  run('approve it in writing', cx('variation', 'approve', 'VAR-502', '--by=Dana Whitaker, by email'));
  const after = run('the ceiling rose', cx('project', 'PRJ-201'));
  assert(n(after.project.revised_contract) === 8500500, `8,400,000 + 52,000 + 48,500 (${after.project.revised_contract})`);
  const claim = run('a claim inside the ceiling goes out', cx('claim', 'PRJ-201', '--amount=1250000'));
  assert(claim.claim_no === 5 && claim.ref === 'PC-609', `claim 5 is PC-609 (${claim.ref})`);
  run('the client schedules less', cx('client-schedule', 'PC-609', '--amount=1200000', '--retention=60000', '--reasons=Cladding at 60 per cent'));
  const rec = run('payment received', cx('received', 'PC-609'));
  assert(n(rec.amount_paid) === 1140000, `scheduled less retention received (${rec.amount_paid})`);

  // ---- the insurance gate -------------------------------------------------------

  const uninsured = run('an uninsured subcontractor is refused', cx('commit', 'PRJ-201', '--company=Kaimai', '--line=05', '--value=12000'), { json: false, expectFail: true });
  assert(/expired/.test(uninsured.stderr) && /No force flag/.test(uninsured.stderr), 'with the expiry named');
  const draft = run('a draft is allowed', cx('commit', 'PRJ-201', '--company=Kaimai', '--line=05', '--value=12000', '--title=Canopy flashings', '--draft'));
  const blocked = run('executing the draft is refused', cx('execute', draft.ref), { json: false, expectFail: true });
  assert(/uninsured/.test(blocked.stderr), 'still uninsured');
  run('renew the insurance', cx('insurance', 'Kaimai', '--expires=2027-09-30'));
  const executed = run('now it executes', cx('execute', draft.ref));
  assert(executed.status === 'executed', 'executed');

  // ---- RFIs, delays, submittals, defects ----------------------------------------

  const noDue = run('an RFI without a due date is refused', cx('rfi', 'add', 'PRJ-202', '--subject=Stair nosing detail'), { json: false, expectFail: true });
  assert(/due date/.test(noDue.stderr), 'an RFI needs a due date');
  const rfi = run('raise an RFI', cx('rfi', 'add', 'PRJ-202', '--subject=Stair nosing detail', '--to=Arcline', '--due=tomorrow', '--time'));
  assert(rfi.ref === 'RFI-405', `RFI-405 (${rfi.ref})`);
  run('answer RFI-401', cx('rfi', 'answer', 'RFI-401', '--answer=Revised connection per SK-19'));

  const delay = run('log a delay against the Monday of a fixed week', cx('delay', 'add', 'PRJ-201', '--cause=Crane breakdown', '--started=2026-03-02'));
  assert(d10(delay.notice_due_on) === '2026-03-30', `20 working days from Monday 2 March is 30 March (${delay.notice_due_on})`);
  const notified = run('notify EOT-901 in time', cx('delay', 'notify', 'EOT-901', '--days=8'));
  assert(notified.status === 'notified' && notified.days_claimed === 8, 'notified with days claimed');
  const delays = run('delays', cx('delays', '--project=PRJ-202'));
  assert(delays.length === 1 && delays[0].state === 'NOTICE LATE', 'the stormwater delay is past its time bar');

  const subs = run('submittals', cx('submittals'));
  assert(subs[0].ref === 'SUB-801' && subs[0].state === 'LATE for procurement', 'sprinkler drawings late for procurement');
  run('the sprinkler drawings come back', cx('submittal', 'return', 'SUB-801', '--status=approved_as_noted'));

  const defect = run('raise a defect', cx('defect', 'add', 'PRJ-203', '--description=Scuffed skirting', '--location=Level 1', '--company=Totara'));
  for (const ref of ['DEF-1001', 'DEF-1002', 'DEF-1004', defect.ref]) run(`close ${ref}`, cx('defect', 'close', ref));
  const closed = run('PRJ-203 closes once the loose ends are tied', cx('project', 'close', 'PRJ-203'));
  assert(closed.status === 'closed', 'closed');
  const loose = run('PRJ-201 does not close with loose ends', cx('project', 'close', 'PRJ-201'), { json: false, expectFail: true });
  assert(/loose ends/.test(loose.stderr), 'loose ends named');

  run('diary entry', cx('log', 'PRJ-202', 'Level 2 pour done', '--weather=Fine', '--workers=22'));
  const diary = run('diary read', cx('diary', 'PRJ-202'));
  assert(diary[0].note === 'Level 2 pour done', 'the entry reads back first');

  // ---- the jurisdictions and their clocks ---------------------------------------

  run('an NSW client', cx('add', 'company', 'Harbourside Health Pty Ltd', '--kind=client'));
  run('an NSW subcontractor', cx('add', 'company', 'Eastern Suburbs Electrical', '--kind=subcontractor', '--trade=electrical', '--expires=2027-12-31'));
  const nsw = run('an NSW project at tender', cx('project', 'add', 'Parramatta Clinic Fit-out', '--client=Harbourside', '--value=3200000', '--jurisdiction=NSW', '--form=AS 4000'));
  run('awarded', cx('project', 'award', nsw.ref, '--on=2026-02-02'));
  run('its cost plan', cx('budget', 'add', nsw.ref, '--code=06', '--name=Electrical', '--budget=400000'));
  const sc = run('its electrical subcontract', cx('commit', nsw.ref, '--company=Eastern Suburbs', '--line=06', '--value=380000'));
  const nswClaim = run('an NSW subcontractor claim', cx('sub-claim', sc.ref, '--amount=90000', '--received=2026-03-02'));
  assert(d10(nswClaim.schedule_due_on) === '2026-03-16', `10 business days from 2 March 2026 is 16 March (${nswClaim.schedule_due_on})`);
  run('a public holiday on the clock', cx('holiday', 'add', '2026-03-10', 'Demo holiday', '--jurisdiction=NSW'));
  const withHoliday = run('the next claim skips it', cx('sub-claim', sc.ref, '--amount=50000', '--received=2026-03-02'));
  assert(d10(withHoliday.schedule_due_on) === '2026-03-17', `the holiday pushes it to 17 March (${withHoliday.schedule_due_on})`);
  const noStatement = run('an NSW claim without a supporting statement is refused', cx('claim', nsw.ref, '--amount=300000'), { json: false, expectFail: true });
  assert(/s13\(7\)/.test(noStatement.stderr), 'the supporting statement rule cited');
  const withStatement = run('with it, the claim goes', cx('claim', nsw.ref, '--amount=300000', '--supporting-statement', '--served=2026-03-02'));
  assert(withStatement.supporting_statement === true, 'statement recorded');

  run('a QLD client', cx('add', 'company', 'Sunshine Coast Storage Pty Ltd', '--kind=client'));
  const qld = run('a QLD project', cx('project', 'add', 'Maroochydore Storage Units', '--client=Sunshine Coast', '--value=2100000', '--jurisdiction=QLD'));
  run('awarded', cx('project', 'award', qld.ref));
  run('its cost plan', cx('budget', 'add', qld.ref, '--code=04', '--name=Structure', '--budget=600000'));
  const qsc = run('a subcontract with a known-good subcontractor', cx('commit', qld.ref, '--company=Waikato Steel', '--line=04', '--value=500000'));
  const qClaim = run('a QLD claim over Christmas', cx('sub-claim', qsc.ref, '--amount=80000', '--received=2026-12-18'));
  assert(d10(qClaim.schedule_due_on) === '2027-01-28', `15 business days skipping 22 Dec to 10 Jan is 28 January (${qClaim.schedule_due_on})`);

  // ---- compliance -------------------------------------------------------------

  const compliance = run('compliance', cx('compliance'));
  assert(compliance.length === 10, `ten rules (${compliance.length})`);
  const rule = (k) => compliance.find((r) => r.key === k);
  assert(rule('retention_trust').breaches.length === 1, 'retentions held on PRJ-202 with no trust account');
  assert(rule('schedule_reasons').breaches.length === 1, 'the imported schedule with no reasons');
  const timing = rule('schedules_on_time').breaches.map((b) => b.label.split(' ')[0]).sort();
  assert(timing.join() === 'SCL-703,SCL-708,SCL-709', `the late Voltline schedule and the two back-dated NSW claims (${timing})`);
  assert(rule('supporting_statement').breaches.length === 0, 'the NSW claim carries its statement');
  run('record the trust account', cx('project', 'set', 'PRJ-202', '--retention-account=Retentions trust account, BNZ'));
  const one = run('one rule by key', cx('compliance', 'retention_trust'));
  assert(one.length === 1 && one[0].breaches.length === 0, 'now clean');

  // ---- import from Procore's CSV exports ---------------------------------------

  const importDir = mkdtempSync(path.join(tmpdir(), 'construction-import-'));
  const commitmentsCsv = path.join(importDir, 'commitments.csv');
  writeFileSync(commitmentsCsv, [
    '#,Title,Contract Company,Status,Executed,Original Contract Amount,Approved Change Orders',
    'SC-001,Structural steel,Waikato Steel Erectors,Approved,Yes,"$1,200,000.00",$0.00',
    'SC-002,Carpentry and linings,Ruakura Carpentry Ltd,Approved,Yes,"$420,500.00",$0.00',
    'SC-003,,No Title Ltd,Draft,No,$1.00,$0.00',
  ].join('\r\n'));
  const rfisCsv = path.join(importDir, 'rfis.csv');
  writeFileSync(rfisCsv, [
    '#,Subject,Status,Date Initiated,Due Date,Received From,Cost Impact,Schedule Impact',
    '1,Slab set-down at toilets,Open,2026-01-05,2026-01-12,Structura Consulting Engineers,No,Yes',
    '2,"Door hardware schedule, level 1",Closed,2026-01-06,2026-01-13,Arcline Architects,No,No',
  ].join('\r\n'));
  const submittalsCsv = path.join(importDir, 'submittals.csv');
  writeFileSync(submittalsCsv, [
    'Spec Section,#,Title,Status,Ball In Court,Required On Site',
    '05 12 00,1,Steel shop drawings,Approved,Structura Consulting Engineers,2026-02-01',
    '09 29 00,2,Plasterboard system data,Revise and Resubmit,Arcline Architects,2026-12-01',
  ].join('\r\n'));
  const files = [`--commitments=${commitmentsCsv}`, `--rfis=${rfisCsv}`, `--submittals=${submittalsCsv}`];
  const dry = run('import procore --dry-run', cx('import', 'procore', `--project=${qld.ref}`, ...files, '--dry-run'));
  assert(dry.dry_run && dry.commitments === 2 && dry.rfis === 2 && dry.submittals === 2 && dry.skipped === 1, 'counts what it would bring');
  const beforeSubs = run('commitments before', cx('commitments', `--project=${qld.ref}`));
  assert(beforeSubs.length === 1, 'the dry run wrote nothing');
  const imp = run('import procore', cx('import', 'procore', `--project=${qld.ref}`, ...files));
  assert(imp.commitments === 2 && imp.companies === 1 && imp.uninsured === 1 && imp.overdue_rfis === 1, 'one new uninsured subcontractor, one overdue RFI');
  run('import again is harmless', cx('import', 'procore', `--project=${qld.ref}`, ...files));
  const afterSubs = run('commitments after', cx('commitments', `--project=${qld.ref}`));
  assert(afterSubs.length === 3, `the re-import added nothing (${afterSubs.length})`);
  const qcost = run('imported commitments land on line 99', cx('cost', qld.ref));
  assert(qcost.some((l) => l.cost_code === '99' && l.state === 'OVER'), 'loud until moved to real lines');
  rmSync(importDir, { recursive: true, force: true });

  // ---- export, documents, views -------------------------------------------------

  const exportFile = path.join(dataDir, 'export.json');
  const exp = run('export', cx('export', `--out=${exportFile}`));
  assert(existsSync(exportFile) && exp.counts.projects === 6, `whole database exported (${exp.counts.projects} projects)`);
  const dump = JSON.parse(readFileSync(exportFile, 'utf8'));
  assert(dump.sub_claims.length === 10, `sub claims in the export (${dump.sub_claims.length})`);

  const docsOut = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/document\(s\) rendered/.test(docsOut.stdout), 'documents rendered');
  for (const d of ['payment-schedule', 'progress-claim', 'delay-notice', 'cost-report']) {
    const dir = path.join(root, 'docs-out', d);
    assert(existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.html')), `${d} rendered`);
  }
  const html = readFileSync(path.join(root, 'docs-out', 'payment-schedule', readdirSync(path.join(root, 'docs-out', 'payment-schedule')).find((f) => f.includes('scl-702'))), 'utf8');
  assert(html.includes('Mezzanine members not yet erected'), 'the schedule carries its reasons');
  const viewOut = run('npm run view', ['view.mjs'], { json: false });
  assert(/views[\\/]site-board\.html/.test(viewOut.stdout) && /views[\\/]money\.html/.test(viewOut.stdout), 'both views rendered');

  const help = run('help', cx('help'), { json: false });
  assert(/sub-claim/.test(help.stdout) && /No force flag|nothing sends/.test(help.stdout), 'help lists the commands');

  console.log(`\nPASS: ${step} steps against ${dataDir}`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
