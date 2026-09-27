#!/usr/bin/env node
// construction-projects-for-claude-code: the one CLI. Claude Code slash
// commands call this; so can you.
//
//   node scripts/construction.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system is a New Zealand or Australian commercial head contractor's
// project record: the companies, the projects from tender to close, the cost
// plan by cost code, the subcontracts committed against it, variations, the
// progress claims going out and the subcontractor claims coming in, RFIs,
// submittals, delays with their extension of time notices, defects and the
// site diary. The sharp edges are deliberate: every subcontractor claim carries
// its statutory payment schedule deadline from the day it lands, counted in
// working days for its jurisdiction; a payment schedule for less than the claim
// must state reasons; a progress claim never passes the contract plus APPROVED
// variations, and an NSW claim needs its supporting statement; a subcontractor
// with expired public liability does not get a subcontract executed; and a
// project does not close with claims unanswered, variations unsubmitted or
// defects open. Nothing here connects to a bank, a client or a portal, and
// nothing sends: schedules, notices and claims draft to files and a person sends.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table, isoDate, short, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'supporting-statement', 'time', 'cost', 'draft', 'po']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const money0 = (v) => (num(v) < 0 ? '-' : '') + '$' + Math.abs(Math.round(num(v))).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const blank0 = (v) => (num(v) ? money0(v) : '');
const pct = (v) => (v === null || v === undefined ? '' : `${num(v).toFixed(1)}%`);
const days = (v) => (v === null || v === undefined ? '' : String(v));

// ---------------------------------------------------------------------------
// Dates and the working-day clocks

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand and Australia write DD/MM/YYYY: the first number is the day
  // unless the second one is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
  return isoDate(d);
}

function parseMoney(v, what) {
  if (v === undefined || v === true || v === null || v === '') throw new CliError(`${what} needs a dollar amount.`);
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (Number.isNaN(n)) throw new CliError(`"${v}" is not a dollar amount.`);
  return n;
}

const JURISDICTIONS = ['NZ', 'NSW', 'QLD'];

// The statutory payment schedule period, in working (business) days, when the
// contract is silent or longer. NZ: Construction Contracts Act 2002 s22 (the
// contract's time, or 20 working days if it has none). NSW: Security of
// Payment Act 1999 s14(4) (the earlier of the contract and 10 business days).
// QLD: Building Industry Fairness (Security of Payment) Act 2017 s76 (the
// earlier of the contract and 15 business days).
const STATUTORY_SCHEDULE_DAYS = { NZ: 20, NSW: 10, QLD: 15 };

// The Christmas periods each Act leaves out of its working-day count.
// NZ CCA s5 "working day": 24 December to 5 January. NSW SOPA s4 "business
// day": 27 to 31 December. QLD BIF Act schedule 2 "business day": 22 December
// to 10 January. Public holidays come from the holidays table.
function inChristmasBreak(iso, jurisdiction) {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (jurisdiction === 'NZ') return (m === 12 && d >= 24) || (m === 1 && d <= 5);
  if (jurisdiction === 'NSW') return m === 12 && d >= 27;
  if (jurisdiction === 'QLD') return (m === 12 && d >= 22) || (m === 1 && d <= 10);
  return false;
}

async function holidaySet(db, jurisdiction) {
  const rows = await db.query("select to_char(day, 'YYYY-MM-DD') as day from holidays where jurisdiction in ('ALL', $1)", [jurisdiction]);
  return new Set(rows.map((r) => r.day));
}

function isWorkingDay(iso, jurisdiction, holidays) {
  const dow = new Date(`${iso}T00:00:00`).getDay();
  if (dow === 0 || dow === 6) return false;
  if (holidays.has(iso)) return false;
  return !inChristmasBreak(iso, jurisdiction);
}

async function addWorkingDays(db, fromIso, n, jurisdiction) {
  const holidays = await holidaySet(db, jurisdiction);
  let d = fromIso;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d, jurisdiction, holidays)) left--;
  }
  return d;
}

function scheduleDays(project) {
  const statutory = STATUTORY_SCHEDULE_DAYS[project.jurisdiction] ?? 20;
  const contract = project.schedule_days === null || project.schedule_days === undefined ? null : Number(project.schedule_days);
  if (contract === null) return statutory;
  // NZ: the contract's period stands. NSW and QLD: whichever is earlier.
  return project.jurisdiction === 'NZ' ? contract : Math.min(contract, statutory);
}

// ---------------------------------------------------------------------------
// Lookups: full id, first 4+ characters of an id, exact ref or name, then
// contains. One hit wins. Several hits list the candidates and exit 1.

const RESOLVERS = {
  company: {
    from: 'companies c',
    cols: 'c.*',
    exact: "lower(c.name) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.name ilike $1 or c.trade ilike $1 or c.contact_name ilike $1',
    label: (r) => `${r.name} (${r.kind}${r.trade ? ', ' + r.trade : ''})`,
    order: 'c.name',
    listing: 'companies',
  },
  project: {
    from: 'projects c join companies cl on cl.id = c.client_id',
    cols: 'c.*, cl.name as client_name',
    exact: "lower(coalesce(c.ref, '')) = lower($1) or lower(coalesce(c.ref, '')) = lower('PRJ-' || $1) or lower(c.name) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.ref ilike $1 or c.name ilike $1 or cl.name ilike $1 or c.site_address ilike $1',
    label: (r) => `${r.ref}  ${r.name} (${r.client_name}, ${r.status})`,
    order: 'c.ref',
    listing: 'projects --all',
  },
  commitment: refResolver('commitments', 'SC', 'c.title ilike $1 or co.name ilike $1', 'join companies co on co.id = c.company_id', 'co.name as company_name', (r) => `${r.ref}  ${r.company_name}: ${r.title} (${r.status})`, 'commitments --all'),
  subclaim: refResolver('sub_claims', 'SCL', 'co.name ilike $1', 'join commitments m on m.id = c.commitment_id join companies co on co.id = m.company_id', 'co.name as company_name, m.ref as commitment_ref', (r) => `${r.ref}  ${r.company_name} claim ${r.claim_no} (${r.status})`, 'sub-claims --all'),
  claim: refResolver('head_claims', 'PC', 'p.ref ilike $1', 'join projects p on p.id = c.project_id', 'p.ref as project_ref', (r) => `${r.ref}  ${r.project_ref} claim ${r.claim_no} (${r.status})`, 'claims --all'),
  variation: refResolver('variations', 'VAR', 'c.title ilike $1 or c.instruction_ref ilike $1', '', '', (r) => `${r.ref}  ${r.title} (${r.status})`, 'variations --all'),
  rfi: refResolver('rfis', 'RFI', 'c.subject ilike $1', '', '', (r) => `${r.ref}  ${r.subject} (${r.status})`, 'rfis --all'),
  submittal: refResolver('submittals', 'SUB', 'c.title ilike $1', '', '', (r) => `${r.ref}  ${r.title} (${r.status})`, 'submittals --all'),
  delay: refResolver('delays', 'EOT', 'c.cause ilike $1', '', '', (r) => `${r.ref}  ${r.cause} (${r.status})`, 'delays --all'),
  defect: refResolver('defects', 'DEF', 'c.description ilike $1 or c.location ilike $1', '', '', (r) => `${r.ref}  ${r.description} (${r.status})`, 'defects --all'),
};

function refResolver(tableName, prefix, fuzzyExtra, join, extraCols, label, listing) {
  return {
    from: `${tableName} c ${join}`,
    cols: `c.*${extraCols ? ', ' + extraCols : ''}`,
    exact: `lower(coalesce(c.ref, '')) = lower($1) or lower(coalesce(c.ref, '')) = lower('${prefix}-' || $1)`,
    fuzzy: `c.ref ilike $1 or ${fuzzyExtra}`,
    label,
    order: 'c.created_at desc',
    listing,
  };
}

const ID_RE = /^[0-9a-f]{4,8}(-[0-9a-f-]*)?$/i;

async function resolve(db, kind, q, { optional = false } = {}) {
  const spec = RESOLVERS[kind];
  q = String(q ?? '').trim();
  if (!q || q === 'true') {
    if (optional) return null;
    throw new CliError(`Give me a ${kind} name, reference or id.`);
  }
  const select = `select ${spec.cols} from ${spec.from}`;
  let rows = [];
  if (ID_RE.test(q)) {
    rows = await db.query(`${select} where c.id::text like $1 order by ${spec.order}`, [q.toLowerCase() + '%']);
    if (rows.length === 1) return rows[0];
  }
  if (!rows.length) rows = await db.query(`${select} where ${spec.exact} order by ${spec.order}`, [q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query(`${select} where ${spec.fuzzy} order by ${spec.order}`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) {
    if (optional) return null;
    throw new CliError(`No ${kind} matches "${q}". Run \`${spec.listing}\` to see what exists.`);
  }
  throw new CliError(
    `"${q}" matches ${rows.length} ${kind} records. Use a reference, an id, or a longer name:\n` +
      rows.map((r) => `  ${short(r.id)}  ${spec.label(r)}`).join('\n'),
  );
}

async function resolveLine(db, projectId, q) {
  q = String(q ?? '').trim();
  if (!q || q === 'true') throw new CliError('Which cost line? --line=<code or name> (see `cost <project>`).');
  let rows = await db.query('select * from budget_lines where project_id = $1 and (lower(cost_code) = lower($2) or lower(name) = lower($2))', [projectId, q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query('select * from budget_lines where project_id = $1 and name ilike $2 order by cost_code', [projectId, `%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No cost line on this project matches "${q}". See them: cost <project>. Add one: budget add <project> --code= --name= --budget=`);
  throw new CliError(`"${q}" matches ${rows.length} cost lines. Use the code:\n` + rows.map((r) => `  ${r.cost_code}  ${r.name}`).join('\n'));
}

async function nextRef(db, prefix, tableName, start) {
  const [r] = await db.query(
    `select coalesce(max(substring(ref from ${prefix.length + 2})::int), ${start}) + 1 as n from ${tableName} where ref ~ '^${prefix}-[0-9]+$'`,
  );
  return `${prefix}-${r.n}`;
}

async function withProject(db, flags, sql, where, order) {
  const params = [];
  let w = where;
  if (str(flags.project)) {
    const p = await resolve(db, 'project', flags.project);
    params.push(p.ref);
    w += `${w ? ' and ' : ''}project_ref = $${params.length}`;
  }
  return db.query(`${sql}${w ? ' where ' + w : ''} ${order}`, params);
}

// ---------------------------------------------------------------------------
// Shared column sets

const PROJECT_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'project', label: 'project', width: 30 },
  { key: 'client', label: 'client', width: 24 },
  { key: 'revised_contract', label: 'contract', align: 'right', format: money0 },
  { key: 'claimed', label: 'claimed', align: 'right', format: money0 },
  { key: 'owed_to_us', label: 'owed', align: 'right', format: blank0 },
  { key: 'forecast_margin', label: 'fcst margin', align: 'right', format: money0 },
  { key: 'pending_variations', label: 'vars pending', align: 'right', format: blank0 },
  { key: 'open_rfis', label: 'RFIs', align: 'right', format: (v) => (num(v) ? String(v) : '') },
  { key: 'status', label: 'status' },
];

const SUB_CLAIM_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'company', label: 'subcontractor', width: 26 },
  { key: 'project_ref', label: 'project' },
  { key: 'received_on', label: 'received', format: isoDate },
  { key: 'claimed_amount', label: 'claimed', align: 'right', format: money0 },
  { key: 'schedule_due_on', label: 'schedule due', format: isoDate },
  { key: 'days_left', label: 'days left', align: 'right', format: (v, r) => (r.schedule_issued_on ? '' : days(v)) },
  { key: 'scheduled_amount', label: 'scheduled', align: 'right', format: (v) => (v === null ? '' : money0(v)) },
  { key: 'state', label: 'state' },
];

const HEAD_CLAIM_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'project_ref', label: 'project' },
  { key: 'client', label: 'client', width: 24 },
  { key: 'served_on', label: 'served', format: isoDate },
  { key: 'amount', label: 'claimed', align: 'right', format: money0 },
  { key: 'scheduled_amount', label: 'scheduled', align: 'right', format: (v) => (v === null ? '' : money0(v)) },
  { key: 'retention_held', label: 'retention', align: 'right', format: blank0 },
  { key: 'payment_due_on', label: 'pay by', format: isoDate },
  { key: 'outstanding', label: 'owed', align: 'right', format: (v, r) => (r.status === 'paid' ? '' : money0(v)) },
  { key: 'state', label: 'state' },
];

// ---------------------------------------------------------------------------
// Reads

async function cmdProjects(db, args, flags) {
  const rows = await db.query(
    `select * from v_projects ${flags.all ? '' : "where status in ('active', 'defects', 'tender')"} order by case status when 'active' then 1 when 'defects' then 2 when 'tender' then 3 else 4 end, ref`,
  );
  return { json: rows, text: heading(`Projects (${rows.length})`) + '\n' + table(rows, PROJECT_COLS) };
}

async function cmdProject(db, args) {
  const p = await resolve(db, 'project', args.join(' '));
  const [card] = await db.query('select * from v_projects where project_id = $1', [p.id]);
  const cost = await db.query('select * from v_cost_report where project_id = $1 order by cost_code', [p.id]);
  const subs = await db.query('select * from v_commitments where project_ref = $1 order by ref', [p.ref]);
  const claims = await db.query('select * from v_head_claims where project_ref = $1 order by served_on', [p.ref]);
  const subClaims = await db.query("select * from v_sub_claims where project_ref = $1 and state not in ('paid') order by schedule_due_on", [p.ref]);
  const variations = await db.query('select * from v_variations where project_ref = $1 order by instructed_on', [p.ref]);
  const rfis = await db.query("select * from v_rfis where project_ref = $1 and status = 'open' order by due_on", [p.ref]);
  const delays = await db.query('select * from v_delays where project_ref = $1 order by started_on', [p.ref]);
  const diary = await db.query('select noted_on, weather, workers, note from diary where project_id = $1 order by noted_on desc limit 5', [p.id]);
  const json = { project: card, cost, commitments: subs, claims, sub_claims: subClaims, variations, rfis, delays, diary };
  const margin = num(card.revised_contract) ? (num(card.forecast_margin) / num(card.revised_contract)) * 100 : 0;
  let text = heading(`${card.ref}  ${card.project}`);
  text += `\n  ${card.client}, ${card.site_address || 'no site address'}. ${card.jurisdiction}, ${card.contract_form || 'contract form not recorded'}, ${card.status}.`;
  text += `\n  Contract ${money0(card.contract_value)} + approved variations ${money0(card.approved_variations)} = ${money0(card.revised_contract)}. Pending variations ${money0(card.pending_variations)}.`;
  text += `\n  Claimed ${money0(card.claimed)}, paid ${money0(card.paid)}, owed to us ${money0(card.owed_to_us)}, retention held by the client ${money0(card.retention_held_by_client)}.`;
  text += `\n  Forecast cost ${money0(card.forecast_cost)} against a budget of ${money0(card.budget_total)}: forecast margin ${money0(card.forecast_margin)} (${pct(margin)}).`;
  if (card.pc_due_on) text += `\n  Practical completion due ${isoDate(card.pc_due_on)}${card.pc_on ? `, achieved ${isoDate(card.pc_on)}` : ''}${card.defects_ends_on ? `, defects period ends ${isoDate(card.defects_ends_on)}` : ''}.`;
  text += `\n\nCost report\n` + costTable(cost);
  text += `\n\nSubcontracts\n` + table(subs, COMMITMENT_COLS);
  if (subClaims.length) text += `\n\nSubcontractor claims open\n` + table(subClaims, SUB_CLAIM_COLS);
  text += `\n\nProgress claims\n` + table(claims, HEAD_CLAIM_COLS);
  text += `\n\nVariations\n` + table(variations, VARIATION_COLS);
  if (rfis.length) text += `\n\nOpen RFIs\n` + table(rfis, RFI_COLS);
  if (delays.length) text += `\n\nDelays\n` + table(delays, DELAY_COLS);
  text += `\n\nSite diary, latest\n` + table(diary, [
    { key: 'noted_on', label: 'date', format: isoDate },
    { key: 'weather', label: 'weather' },
    { key: 'workers', label: 'on site', align: 'right' },
    { key: 'note', label: 'note', width: 90 },
  ]);
  return { json, text };
}

function costTable(rows) {
  return table(rows, [
    { key: 'cost_code', label: 'code' },
    { key: 'line', label: 'line', width: 26 },
    { key: 'budget', label: 'budget', align: 'right', format: money0 },
    { key: 'committed', label: 'committed', align: 'right', format: blank0 },
    { key: 'pending', label: 'pending', align: 'right', format: blank0 },
    { key: 'direct', label: 'direct', align: 'right', format: blank0 },
    { key: 'actual', label: 'actual', align: 'right', format: blank0 },
    { key: 'forecast_final', label: 'forecast', align: 'right', format: money0 },
    { key: 'variance', label: 'variance', align: 'right', format: money0 },
    { key: 'state', label: 'state' },
  ]);
}

async function cmdCost(db, args) {
  const p = await resolve(db, 'project', args.join(' '));
  const rows = await db.query('select * from v_cost_report where project_id = $1 order by cost_code', [p.id]);
  const t = (k) => rows.reduce((s, r) => s + num(r[k]), 0);
  const [card] = await db.query('select * from v_projects where project_id = $1', [p.id]);
  return {
    json: rows,
    text:
      heading(`${p.ref}  cost report`) + '\n' + costTable(rows) +
      `\n\n  Totals: ${money0(t('budget'))} budget, ${money0(t('committed'))} committed, ${money0(t('pending'))} pending variations, ${money0(t('actual'))} actual, ${money0(t('forecast_final'))} forecast final (${money0(t('variance'))} variance).` +
      `\n  Revised contract ${money0(card.revised_contract)}, forecast margin ${money0(card.forecast_margin)}.` +
      '\n  Committed is executed subcontracts plus approved variations on them. Pending is the cost of variations not yet decided.' +
      '\n  Forecast final never sits below the budget or the money already promised; a QS forecast overrides it upwards (forecast <project> --line= --final=).',
  };
}

const COMMITMENT_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'company', label: 'subcontractor', width: 26 },
  { key: 'project_ref', label: 'project' },
  { key: 'cost_code', label: 'code' },
  { key: 'revised_value', label: 'value', align: 'right', format: money0 },
  { key: 'certified', label: 'certified', align: 'right', format: blank0 },
  { key: 'paid', label: 'paid', align: 'right', format: blank0 },
  { key: 'retention_withheld', label: 'retention', align: 'right', format: blank0 },
  { key: 'insurance', label: 'insurance' },
  { key: 'status', label: 'status' },
];

async function cmdCommitments(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_commitments', flags.all ? '' : "status in ('draft', 'executed')", 'order by project_ref, ref');
  return { json: rows, text: heading(`Subcontracts and orders (${rows.length})`) + '\n' + table(rows, COMMITMENT_COLS) };
}

async function cmdSubClaims(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_sub_claims', flags.all ? '' : "state in ('MISSED', 'DUE NOW', 'awaiting schedule')", 'order by schedule_due_on');
  const missed = rows.filter((r) => r.state === 'MISSED');
  let text = heading(`Subcontractor claims${flags.all ? '' : ' waiting on a payment schedule'} (${rows.length})`) + '\n' + table(rows, SUB_CLAIM_COLS);
  if (missed.length) text += `\n\n  ${missed.length} schedule deadline(s) MISSED: under the Act the full claimed amount is now payable on the due date. Talk to your adviser before you pay less.`;
  text += '\n  Answer each with: schedule <SCL-ref> --amount= [--reasons="why it is less"]. Days left are calendar days to a working-day deadline.';
  return { json: rows, text };
}

async function cmdClaims(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_head_claims', flags.all ? '' : "status <> 'paid'", 'order by served_on');
  const owed = rows.filter((r) => r.status !== 'paid').reduce((s, r) => s + num(r.outstanding), 0);
  return {
    json: rows,
    text: heading(`Progress claims${flags.all ? '' : ' unpaid'} (${rows.length})`) + '\n' + table(rows, HEAD_CLAIM_COLS) + `\n\n  ${money0(owed)} owed to us on unpaid claims, after retention.`,
  };
}

const VARIATION_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'project_ref', label: 'project' },
  { key: 'title', label: 'variation', width: 38 },
  { key: 'instruction_ref', label: 'SI' },
  { key: 'price', label: 'price', align: 'right', format: money0 },
  { key: 'cost', label: 'cost', align: 'right', format: money0 },
  { key: 'status', label: 'status' },
  { key: 'days_waiting', label: 'days', align: 'right', format: days },
  { key: 'approved_by', label: 'approved by', width: 28 },
];

async function cmdVariations(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_variations', flags.all ? '' : "status in ('instructed', 'submitted')", 'order by status, instructed_on');
  const instructed = rows.filter((r) => r.status === 'instructed');
  let text = heading(`Variations${flags.all ? '' : ' not yet decided'} (${rows.length})`) + '\n' + table(rows, VARIATION_COLS);
  if (instructed.length) text += `\n\n  ${instructed.length} instructed and never priced to the client, worth about ${money0(instructed.reduce((s, r) => s + num(r.price), 0))}. Price it, submit it: variation submit <VAR-ref>.`;
  return { json: rows, text };
}

const RFI_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'project_ref', label: 'project' },
  { key: 'subject', label: 'subject', width: 44 },
  { key: 'to_company', label: 'with', width: 26 },
  { key: 'due_on', label: 'due', format: isoDate },
  { key: 'days_overdue', label: 'late', align: 'right', format: (v, r) => (r.state === 'OVERDUE' ? String(v) : '') },
  { key: 'time_impact', label: 'time?', format: (v) => (v ? 'yes' : '') },
  { key: 'cost_impact', label: 'cost?', format: (v) => (v ? 'yes' : '') },
  { key: 'state', label: 'state' },
];

async function cmdRfis(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_rfis', flags.all ? '' : "status = 'open'", 'order by due_on');
  return { json: rows, text: heading(`RFIs${flags.all ? '' : ' open'} (${rows.length})`) + '\n' + table(rows, RFI_COLS) };
}

async function cmdSubmittals(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_submittals', flags.all ? '' : "state <> 'approved'", 'order by required_by nulls last');
  return {
    json: rows,
    text:
      heading(`Submittals${flags.all ? '' : ' not yet approved'} (${rows.length})`) + '\n' +
      table(rows, [
        { key: 'ref', label: 'ref' },
        { key: 'project_ref', label: 'project' },
        { key: 'title', label: 'submittal', width: 40 },
        { key: 'from_company', label: 'from', width: 24 },
        { key: 'reviewer', label: 'reviewer', width: 22 },
        { key: 'required_by', label: 'needed by', format: isoDate },
        { key: 'status', label: 'status' },
        { key: 'state', label: 'state' },
      ]) +
      '\n\n  Needed by is the date approval must land for the order to go in on time. After it, lead time eats the programme.',
  };
}

const DELAY_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'project_ref', label: 'project' },
  { key: 'cause', label: 'cause', width: 50 },
  { key: 'started_on', label: 'started', format: isoDate },
  { key: 'notice_due_on', label: 'notice due', format: isoDate },
  { key: 'days_left', label: 'days left', align: 'right', format: (v, r) => (r.status === 'open' ? days(v) : '') },
  { key: 'days_claimed', label: 'claimed', align: 'right' },
  { key: 'days_granted', label: 'granted', align: 'right' },
  { key: 'state', label: 'state' },
];

async function cmdDelays(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_delays', flags.all ? '' : "status in ('open', 'notified')", 'order by notice_due_on');
  return {
    json: rows,
    text: heading(`Delays and extension of time notices (${rows.length})`) + '\n' + table(rows, DELAY_COLS) +
      '\n\n  The notice window is the head contract\'s time bar, counted in working days from the day the delay started. No notice, no time.',
  };
}

async function cmdDefects(db, args, flags) {
  const rows = await withProject(db, flags, 'select * from v_defects', flags.all ? '' : "status = 'open'", 'order by due_on nulls last');
  return {
    json: rows,
    text: heading(`Defects${flags.all ? '' : ' open'} (${rows.length})`) + '\n' +
      table(rows, [
        { key: 'ref', label: 'ref' },
        { key: 'project_ref', label: 'project' },
        { key: 'location', label: 'where', width: 24 },
        { key: 'description', label: 'defect', width: 44 },
        { key: 'company', label: 'whose', width: 22 },
        { key: 'due_on', label: 'due', format: isoDate },
        { key: 'state', label: 'state' },
      ]),
  };
}

async function cmdSubbies(db, args, flags) {
  const rows = await db.query(
    `select * from v_companies where kind in ('subcontractor', 'supplier') ${flags.all ? '' : "and status = 'active'"}
     order by case insurance when 'EXPIRED' then 1 when 'NONE' then 2 when 'expiring' then 3 else 4 end, name`,
  );
  return {
    json: rows,
    text: heading(`Subcontractors (${rows.length})`) + '\n' +
      table(rows, [
        { key: 'name', label: 'subcontractor', width: 30 },
        { key: 'trade', label: 'trade', width: 22 },
        { key: 'contact_name', label: 'contact' },
        { key: 'liability_expires_on', label: 'PL expires', format: isoDate },
        { key: 'insurance', label: 'insurance' },
        { key: 'live_subcontracts', label: 'live', align: 'right' },
      ]),
  };
}

async function cmdCompanies(db, args, flags) {
  const kind = str(flags.kind);
  const rows = await db.query(`select * from v_companies ${kind ? 'where kind = $1' : ''} order by kind, name`, kind ? [kind] : []);
  return {
    json: rows,
    text: heading(`Companies (${rows.length})`) + '\n' + table(rows, [
      { key: 'name', label: 'company', width: 32 },
      { key: 'kind', label: 'kind' },
      { key: 'trade', label: 'trade', width: 22 },
      { key: 'contact_name', label: 'contact' },
      { key: 'phone', label: 'phone' },
      { key: 'insurance', label: 'insurance' },
    ]),
  };
}

async function cmdCompany(db, args) {
  const c = await resolve(db, 'company', args.join(' '));
  const [card] = await db.query('select * from v_companies where company_id = $1', [c.id]);
  const subs = await db.query('select * from v_commitments where company_id = $1 order by ref', [c.id]);
  const claims = await db.query('select * from v_sub_claims where company = $1 order by received_on', [c.name]);
  const projects = await db.query('select * from v_projects where client_id = $1 order by ref', [c.id]);
  const rfis = await db.query('select * from v_rfis where to_company = $1 order by due_on', [c.name]);
  const notes = await db.query('select noted_on, note from diary where company_id = $1 order by noted_on desc limit 5', [c.id]);
  let text = heading(card.name) + `\n  ${card.kind}${card.trade ? ', ' + card.trade : ''}. ${card.contact_name || 'no contact'} ${card.phone || ''} ${card.email || ''}`;
  if (card.insurance) text += `\n  Public liability: ${card.insurance}${card.liability_expires_on ? ' (' + isoDate(card.liability_expires_on) + ')' : ''}.`;
  if (projects.length) text += '\n\nProjects for this client\n' + table(projects, PROJECT_COLS);
  if (subs.length) text += '\n\nSubcontracts\n' + table(subs, COMMITMENT_COLS);
  if (claims.length) text += '\n\nTheir claims\n' + table(claims, SUB_CLAIM_COLS);
  if (rfis.length) text += '\n\nRFIs with them\n' + table(rfis, RFI_COLS);
  if (notes.length) text += '\n\nDiary mentions\n' + table(notes, [{ key: 'noted_on', label: 'date', format: isoDate }, { key: 'note', label: 'note', width: 100 }]);
  return { json: { company: card, projects, commitments: subs, claims, rfis, diary: notes }, text };
}

async function cmdMargin(db) {
  const rows = await db.query(
    `select ref, project, client, status, revised_contract, forecast_cost, forecast_margin,
            round(100.0 * forecast_margin / nullif(revised_contract, 0), 1) as margin_pct, pending_variations
     from v_projects where status in ('active', 'defects') order by forecast_margin / nullif(revised_contract, 0)`,
  );
  return {
    json: rows,
    text: heading('Forecast margin by project, worst first') + '\n' +
      table(rows, [
        { key: 'ref', label: 'ref' },
        { key: 'project', label: 'project', width: 32 },
        { key: 'revised_contract', label: 'contract', align: 'right', format: money0 },
        { key: 'forecast_cost', label: 'forecast cost', align: 'right', format: money0 },
        { key: 'forecast_margin', label: 'margin', align: 'right', format: money0 },
        { key: 'margin_pct', label: 'margin %', align: 'right', format: pct },
        { key: 'pending_variations', label: 'vars pending', align: 'right', format: blank0 },
        { key: 'status', label: 'status' },
      ]) +
      '\n\n  Margin is the contract plus approved variations, less the forecast final cost. Pending variations are upside only once approved.',
  };
}

async function cmdDiary(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  const since = addDays(today(), -Number(str(flags.days) || 14));
  const rows = await db.query(
    `select d.noted_on, d.weather, d.workers, co.name as company, d.note from diary d left join companies co on co.id = d.company_id
     where d.project_id = $1 and d.noted_on >= $2 order by d.noted_on desc, d.created_at desc`,
    [p.id, since],
  );
  return {
    json: rows,
    text: heading(`${p.ref} site diary since ${since}`) + '\n' + table(rows, [
      { key: 'noted_on', label: 'date', format: isoDate },
      { key: 'weather', label: 'weather' },
      { key: 'workers', label: 'on site', align: 'right' },
      { key: 'company', label: 'about', width: 24 },
      { key: 'note', label: 'note', width: 90 },
    ]),
  };
}

const ATTENTION_ORDER = ['schedule_missed', 'schedule_due', 'delay_notice', 'claim_overdue', 'variation_unsubmitted', 'rfi_overdue', 'submittal_late', 'insurance_expired', 'cost_over', 'defect_overdue', 'retention_release', 'diary_quiet', 'tender_due', 'insurance_expiring'];

async function cmdAttention(db) {
  const rows = await db.query(`
    select * from v_attention
    order by case reason ${ATTENTION_ORDER.map((r, i) => `when '${r}' then ${i + 1}`).join(' ')} else 99 end,
      days desc nulls last
  `);
  return {
    json: rows,
    text:
      heading(`Needs a decision (${rows.length})`) + '\n' +
      table(rows, [
        { key: 'reason', label: 'why' },
        { key: 'label', label: 'record', width: 14 },
        { key: 'who', label: 'who', width: 24 },
        { key: 'place', label: 'where', width: 30 },
        { key: 'days', label: 'days', align: 'right', format: days },
        { key: 'detail', label: 'detail', width: 90 },
      ]),
  };
}

async function cmdStats(db) {
  const [c] = await db.query(`
    select (select count(*) from projects where status = 'active')                              as active_projects,
           (select coalesce(sum(revised_contract), 0) from v_projects where status = 'active')   as work_in_hand,
           (select coalesce(sum(forecast_margin), 0) from v_projects where status = 'active')    as forecast_margin,
           (select coalesce(sum(owed_to_us), 0) from v_projects)                                  as owed_to_us,
           (select count(*) from v_head_claims where state = 'OVERDUE')                            as claims_overdue,
           (select count(*) from v_sub_claims where state = 'MISSED')                              as schedules_missed,
           (select count(*) from v_sub_claims where state = 'DUE NOW')                             as schedules_due,
           (select coalesce(sum(claimed_amount), 0) from v_sub_claims where state in ('MISSED', 'DUE NOW', 'awaiting schedule')) as sub_claims_open,
           (select coalesce(sum(price), 0) from variations where status in ('instructed', 'submitted')) as variations_pending,
           (select count(*) from v_rfis where state = 'OVERDUE')                                   as rfis_overdue,
           (select count(*) from v_delays where state in ('NOTICE LATE', 'NOTICE DUE'))           as notices_due,
           (select count(*) from v_attention)                                                      as attention_items
  `);
  const json = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
  return {
    json,
    text:
      heading('The business') +
      `\n  ${json.active_projects} active project(s), ${money0(json.work_in_hand)} of work in hand, forecast margin ${money0(json.forecast_margin)}` +
      `\n  ${money0(json.owed_to_us)} owed to us on progress claims${json.claims_overdue ? ` (${json.claims_overdue} OVERDUE)` : ''}` +
      `\n  ${money0(json.sub_claims_open)} of subcontractor claims waiting on a schedule: ${json.schedules_missed} MISSED, ${json.schedules_due} due inside 3 days` +
      `\n  ${money0(json.variations_pending)} of variations not yet approved, ${json.rfis_overdue} RFI(s) overdue, ${json.notices_due} delay notice(s) due or late` +
      `\n  ${json.attention_items} item(s) on the attention list`,
  };
}

// ---------------------------------------------------------------------------
// Writes: projects and the cost plan

async function cmdProjectVerb(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') return projectAdd(db, rest, flags);
  if (verb === 'award') return projectAward(db, rest, flags);
  if (verb === 'pc') return projectPc(db, rest, flags);
  if (verb === 'close') return projectClose(db, rest, flags);
  if (verb === 'lost') return projectLost(db, rest, flags);
  if (verb === 'set') return projectSet(db, rest, flags);
  return cmdProject(db, args, flags);
}

async function projectAdd(db, args, flags) {
  const name = args.join(' ');
  if (!name) throw new CliError('project add "<name>" --client= --value= [--jurisdiction=NZ|NSW|QLD --form= --site= --tender-due=]');
  const client = await resolve(db, 'company', str(flags.client));
  const value = parseMoney(flags.value, 'The tender or contract value (--value=)');
  const jurisdiction = (str(flags.jurisdiction) || 'NZ').toUpperCase();
  if (!JURISDICTIONS.includes(jurisdiction)) throw new CliError(`--jurisdiction= is one of: ${JURISDICTIONS.join(', ')}`);
  const ref = await nextRef(db, 'PRJ', 'projects', 200);
  const [p] = await db.query(
    `insert into projects (ref, name, client_id, site_address, jurisdiction, contract_form, status, tender_due_on, contract_value)
     values ($1, $2, $3, $4, $5, $6, 'tender', $7, $8) returning *`,
    [ref, name, client.id, str(flags.site) || null, jurisdiction, str(flags.form) || null, parseDate(flags['tender-due']), value],
  );
  return { json: p, text: `${p.ref} ${p.name} at tender for ${client.name}, ${money0(value)}, ${jurisdiction}. Won it: project award ${p.ref} --on=<date>.` };
}

async function projectAward(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  if (p.status !== 'tender') throw new CliError(`${p.ref} is ${p.status}, not at tender.`);
  const on = parseDate(flags.on) || today();
  const value = flags.value ? parseMoney(flags.value, '--value=') : num(p.contract_value);
  const [u] = await db.query(
    `update projects set status = 'active', awarded_on = $1::date, started_on = coalesce($2::date, $1::date), contract_value = $3, pc_due_on = $4::date where id = $5 returning *`,
    [on, parseDate(flags.start), value, parseDate(flags['pc-due']), p.id],
  );
  return { json: u, text: `${u.ref} awarded ${on} at ${money0(value)}. Load the cost plan: budget add ${u.ref} --code= --name= --budget=` };
}

async function projectPc(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  if (p.status !== 'active') throw new CliError(`${p.ref} is ${p.status}; practical completion is recorded on an active project.`);
  const on = parseDate(flags.on) || today();
  const defectsDays = Number(str(flags['defects-days']) || 365);
  const [u] = await db.query(
    `update projects set status = 'defects', pc_on = $1, defects_ends_on = $2 where id = $3 returning *`,
    [on, addDays(on, defectsDays), p.id],
  );
  return { json: u, text: `${u.ref} reached practical completion ${on}. Defects period runs to ${isoDate(u.defects_ends_on)}. Claim the first half of retention if your contract releases it at completion.` };
}

async function projectClose(db, args) {
  const p = await resolve(db, 'project', args.join(' '));
  const [block] = await db.query(
    `select (select count(*) from sub_claims sc join commitments c on c.id = sc.commitment_id where c.project_id = $1 and sc.schedule_issued_on is null) as unanswered,
            (select count(*) from variations where project_id = $1 and status in ('instructed', 'submitted')) as undecided,
            (select count(*) from defects where project_id = $1 and status = 'open') as defects_open,
            (select count(*) from head_claims where project_id = $1 and status <> 'paid') as unpaid`,
    [p.id],
  );
  const reasons = [];
  if (num(block.unanswered)) reasons.push(`${block.unanswered} subcontractor claim(s) with no payment schedule`);
  if (num(block.undecided)) reasons.push(`${block.undecided} variation(s) not decided`);
  if (num(block.defects_open)) reasons.push(`${block.defects_open} defect(s) open`);
  if (num(block.unpaid)) reasons.push(`${block.unpaid} progress claim(s) unpaid`);
  if (reasons.length) throw new CliError(`${p.ref} does not close with loose ends: ${reasons.join(', ')}. Every one of them is money or liability. No force flag.`);
  const [u] = await db.query("update projects set status = 'closed' where id = $1 returning *", [p.id]);
  return { json: u, text: `${u.ref} closed. The record stays: it is your liability tail.` };
}

async function projectLost(db, args) {
  const p = await resolve(db, 'project', args.join(' '));
  if (p.status !== 'tender') throw new CliError(`${p.ref} is ${p.status}; only a tender can be lost.`);
  const [u] = await db.query("update projects set status = 'lost' where id = $1 returning *", [p.id]);
  return { json: u, text: `${u.ref} marked lost. Log why: log ${u.ref} "<what the client said>"` };
}

async function projectSet(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  const sets = [];
  const params = [];
  const add = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
  if (flags['retention-account']) add('retention_account', str(flags['retention-account']));
  if (flags['schedule-days']) add('schedule_days', Number(flags['schedule-days']));
  if (flags['payment-days']) add('payment_days', Number(flags['payment-days']));
  if (flags['eot-days']) add('eot_notice_days', Number(flags['eot-days']));
  if (flags['pc-due']) add('pc_due_on', parseDate(flags['pc-due']));
  if (flags.form) add('contract_form', str(flags.form));
  if (!sets.length) throw new CliError('project set <ref> [--retention-account= --schedule-days= --payment-days= --eot-days= --pc-due= --form=]');
  params.push(p.id);
  const [u] = await db.query(`update projects set ${sets.join(', ')} where id = $${params.length} returning *`, params);
  return { json: u, text: `${u.ref} updated.` };
}

async function cmdBudget(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb !== 'add') throw new CliError('budget add <project> --code= --name= --budget=');
  const p = await resolve(db, 'project', rest.join(' '));
  const code = str(flags.code);
  const name = str(flags.name);
  if (!code || !name) throw new CliError('A cost line needs --code= and --name=.');
  const budget = parseMoney(flags.budget, '--budget=');
  const [line] = await db.query(
    `insert into budget_lines (project_id, cost_code, name, budget) values ($1, $2, $3, $4)
     on conflict (project_id, cost_code) do update set name = excluded.name, budget = excluded.budget returning *`,
    [p.id, code, name, budget],
  );
  return { json: line, text: `${p.ref} ${code} ${name}: ${money0(budget)}.` };
}

async function cmdForecast(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  const line = await resolveLine(db, p.id, flags.line);
  const final = flags.final === 'clear' ? null : parseMoney(flags.final, '--final=');
  await db.query('update budget_lines set forecast_final = $1 where id = $2', [final, line.id]);
  const [r] = await db.query('select * from v_cost_report where line_id = $1', [line.id]);
  return { json: r, text: `${p.ref} ${r.cost_code} ${r.line}: forecast final ${money0(r.forecast_final)} against ${money0(r.budget)} (${r.state}).` };
}

async function cmdCostAdd(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  const line = await resolveLine(db, p.id, flags.line);
  const amount = parseMoney(flags.amount, '--amount=');
  const [c] = await db.query(
    `insert into costs (project_id, budget_line_id, incurred_on, supplier, invoice_ref, amount, note) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [p.id, line.id, parseDate(flags.on) || today(), str(flags.supplier) || null, str(flags.invoice) || null, amount, str(flags.note) || null],
  );
  return { json: c, text: `${money0(amount)} booked to ${p.ref} ${line.cost_code} ${line.name}.` };
}

// ---------------------------------------------------------------------------
// Subcontracts, with the insurance gate

async function insuranceGate(company) {
  if (!['subcontractor', 'supplier'].includes(company.kind)) return;
  const exp = company.liability_expires_on ? isoDate(company.liability_expires_on) : null;
  if (!exp || exp < today()) {
    throw new CliError(
      `${company.name} has ${exp ? `public liability that expired ${exp}` : 'no public liability insurance on record'}. ` +
        `A subcontract is not executed with an uninsured subcontractor. Get the certificate: insurance "${company.name}" --expires=<date>. No force flag.`,
    );
  }
}

async function cmdCommit(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  const company = await resolve(db, 'company', str(flags.company));
  const line = await resolveLine(db, p.id, flags.line);
  const value = parseMoney(flags.value, '--value=');
  const title = str(flags.title) || `${company.trade || 'Subcontract'} works`;
  const draft = Boolean(flags.draft);
  if (!draft) await insuranceGate(company);
  const ref = await nextRef(db, 'SC', 'commitments', 300);
  const [c] = await db.query(
    `insert into commitments (ref, project_id, company_id, budget_line_id, title, kind, value, retention_pct, status, executed_on)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [ref, p.id, company.id, line.id, title, flags.po ? 'purchase_order' : 'subcontract', value,
     flags.retention ? Number(flags.retention) : null, draft ? 'draft' : 'executed', draft ? null : parseDate(flags.on) || today()],
  );
  const [r] = await db.query('select * from v_cost_report where line_id = $1', [line.id]);
  let text = `${c.ref} ${draft ? 'drafted' : 'executed'}: ${company.name}, ${title}, ${money0(value)} on ${p.ref} ${line.cost_code} ${line.name}.`;
  if (r.state === 'OVER') text += `\n  The line is now forecast ${money0(-r.variance)} OVER budget. Name the cause this week.`;
  return { json: c, text };
}

async function cmdExecute(db, args, flags) {
  const c = await resolve(db, 'commitment', args.join(' '));
  if (c.status !== 'draft') throw new CliError(`${c.ref} is ${c.status}, not a draft.`);
  const [company] = await db.query('select * from companies where id = $1', [c.company_id]);
  await insuranceGate(company);
  const [u] = await db.query("update commitments set status = 'executed', executed_on = $1 where id = $2 returning *", [parseDate(flags.on) || today(), c.id]);
  return { json: u, text: `${u.ref} executed with ${company.name}.` };
}

async function cmdInsurance(db, args, flags) {
  const c = await resolve(db, 'company', args.join(' '));
  const exp = parseDate(flags.expires, 'expiry date');
  if (!exp) throw new CliError('insurance <company> --expires=<date>');
  await db.query('update companies set liability_expires_on = $1 where id = $2', [exp, c.id]);
  return { json: { company: c.name, liability_expires_on: exp }, text: `${c.name}: public liability current to ${exp}.` };
}

// ---------------------------------------------------------------------------
// Subcontractor claims in, with the schedule clock

async function cmdSubClaim(db, args, flags) {
  const c = await resolve(db, 'commitment', args.join(' '));
  const amount = parseMoney(flags.amount, 'The claimed amount (--amount=)');
  const received = parseDate(flags.received) || today();
  const [p] = await db.query('select * from projects where id = $1', [c.project_id]);
  const period = scheduleDays(p);
  const due = await addWorkingDays(db, received, period, p.jurisdiction);
  const payDue = await addWorkingDays(db, received, Number(p.payment_days || 20), p.jurisdiction);
  const [n] = await db.query('select coalesce(max(claim_no), 0) + 1 as n from sub_claims where commitment_id = $1', [c.id]);
  const ref = await nextRef(db, 'SCL', 'sub_claims', 700);
  const [sc] = await db.query(
    `insert into sub_claims (ref, commitment_id, claim_no, received_on, claimed_amount, schedule_due_on, payment_due_on)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [ref, c.id, n.n, received, amount, due, payDue],
  );
  const [cc] = await db.query('select * from v_commitments where commitment_id = $1', [c.id]);
  let text = `${sc.ref} recorded: ${cc.company} claim ${sc.claim_no} for ${money0(amount)}, received ${received}.` +
    `\n  Payment schedule due ${due} (${period} working days, ${p.jurisdiction}${p.schedule_days ? ', contract period applied' : ', statutory period'}).` +
    ' Miss it and the full claimed amount becomes payable.';
  if (num(cc.claimed) > num(cc.revised_value)) text += `\n  Claims to date (${money0(cc.claimed)}) now pass the subcontract value (${money0(cc.revised_value)}). Schedule what is actually due, with reasons.`;
  return { json: sc, text };
}

async function cmdSchedule(db, args, flags) {
  const sc = await resolve(db, 'subclaim', args.join(' '));
  if (sc.schedule_issued_on) throw new CliError(`${sc.ref} already has a payment schedule (${isoDate(sc.schedule_issued_on)}, ${money0(sc.scheduled_amount)}).`);
  const amount = parseMoney(flags.amount, 'The scheduled amount (--amount=)');
  const reasons = str(flags.reasons);
  if (amount < num(sc.claimed_amount) && !reasons) {
    throw new CliError(
      `${money0(amount)} is less than the ${money0(sc.claimed_amount)} claimed. A payment schedule for less must say how it was calculated and why it is less ` +
        '(NZ CCA s21, NSW SOPA s14(3), QLD BIF Act s69). Add --reasons="...". No force flag.',
    );
  }
  const on = parseDate(flags.on) || today();
  const [c] = await db.query('select m.*, p.sub_retention_pct from commitments m join projects p on p.id = m.project_id where m.id = $1', [sc.commitment_id]);
  const retPct = c.retention_pct === null ? num(c.sub_retention_pct) : num(c.retention_pct);
  const retention = flags.retention !== undefined ? parseMoney(flags.retention, '--retention=') : Math.round((amount * retPct) / 100 * 100) / 100;
  const [u] = await db.query(
    `update sub_claims set scheduled_amount = $1, schedule_issued_on = $2, schedule_reasons = $3, retention_withheld = $4, status = 'scheduled' where id = $5 returning *`,
    [amount, on, reasons || null, retention, sc.id],
  );
  let text = `${u.ref} scheduled at ${money0(amount)} on ${on}, retention ${money0(retention)}, pay ${money0(amount - retention)} by ${isoDate(u.payment_due_on)}.`;
  if (on > isoDate(sc.schedule_due_on)) text += `\n  LATE: the schedule was due ${isoDate(sc.schedule_due_on)}. Under the Act the claimed amount may already be payable in full. Talk to your adviser.`;
  text += '\n  Render it for the subcontractor: npm run docs -- payment-schedule';
  return { json: u, text };
}

async function cmdPay(db, args, flags) {
  const sc = await resolve(db, 'subclaim', args.join(' '));
  if (!sc.schedule_issued_on) throw new CliError(`${sc.ref} has no payment schedule yet. Schedule it first: schedule ${sc.ref} --amount=`);
  const amount = flags.amount ? parseMoney(flags.amount, '--amount=') : num(sc.scheduled_amount) - num(sc.retention_withheld);
  const [u] = await db.query("update sub_claims set paid_on = $1, amount_paid = $2, status = 'paid' where id = $3 returning *", [parseDate(flags.on) || today(), amount, sc.id]);
  return { json: u, text: `${u.ref} paid ${money0(amount)}.` };
}

// ---------------------------------------------------------------------------
// Progress claims out, with the ceiling and the NSW supporting statement

async function cmdClaim(db, args, flags) {
  const p = await resolve(db, 'project', args.join(' '));
  if (p.status !== 'active' && p.status !== 'defects') throw new CliError(`${p.ref} is ${p.status}; claims go on active projects or in the defects period.`);
  const amount = parseMoney(flags.amount, 'The amount claimed this period (--amount=)');
  const [card] = await db.query('select * from v_projects where project_id = $1', [p.id]);
  const after = num(card.claimed) + amount;
  if (after > num(card.revised_contract)) {
    throw new CliError(
      `That claim takes ${p.ref} to ${money0(after)} against a ceiling of ${money0(card.revised_contract)}\n` +
        `(${money0(card.contract_value)} contract + ${money0(card.approved_variations)} approved variations). It does not go out, and there is no force flag.\n` +
        (num(card.pending_variations) ? `${money0(card.pending_variations)} of variations are still waiting on approval: get them approved, then claim them.` : 'A claim beyond the contract is the payment schedule dispute you lose.'),
    );
  }
  if (p.jurisdiction === 'NSW' && !flags['supporting-statement']) {
    throw new CliError(
      `${p.ref} is an NSW project. A head contractor's payment claim is not served without a supporting statement declaring the subcontractors have been paid ` +
        '(Building and Construction Industry Security of Payment Act 1999 s13(7)). Prepare it, then add --supporting-statement. No force flag.',
    );
  }
  const served = parseDate(flags.served) || today();
  const period = STATUTORY_SCHEDULE_DAYS[p.jurisdiction] ?? 20;
  const scheduleDue = await addWorkingDays(db, served, period, p.jurisdiction);
  const payDue = flags.due ? parseDate(flags.due) : await addWorkingDays(db, served, Number(str(flags.terms) || 20), p.jurisdiction);
  const [n] = await db.query('select coalesce(max(claim_no), 0) + 1 as n from head_claims where project_id = $1', [p.id]);
  const ref = await nextRef(db, 'PC', 'head_claims', 600);
  const [h] = await db.query(
    `insert into head_claims (ref, project_id, claim_no, served_on, amount, supporting_statement, schedule_due_on, payment_due_on)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [ref, p.id, n.n, served, amount, Boolean(flags['supporting-statement']), scheduleDue, payDue],
  );
  return {
    json: h,
    text: `${h.ref} served on ${p.ref}: claim ${h.claim_no}, ${money0(amount)}. Claimed to date ${money0(after)} of ${money0(card.revised_contract)}.` +
      `\n  The client's payment schedule is due ${scheduleDue} (the statutory period unless the contract is shorter), payment by ${payDue}.` +
      '\n  Render the paperwork: npm run docs -- progress-claim',
  };
}

async function cmdClientSchedule(db, args, flags) {
  const h = await resolve(db, 'claim', args.join(' '));
  const amount = parseMoney(flags.amount, 'The amount the client scheduled (--amount=)');
  const [u] = await db.query(
    `update head_claims set scheduled_amount = $1, schedule_received_on = $2, schedule_reasons = $3, retention_held = $4, status = 'scheduled' where id = $5 returning *`,
    [amount, parseDate(flags.on) || today(), str(flags.reasons) || null, flags.retention ? parseMoney(flags.retention, '--retention=') : num(h.retention_held), h.id],
  );
  let text = `${u.ref}: the client scheduled ${money0(amount)} of the ${money0(h.amount)} claimed.`;
  if (amount < num(h.amount)) text += ` The ${money0(num(h.amount) - amount)} difference is disputed${u.schedule_reasons ? ': ' + u.schedule_reasons : ' and they gave no reasons, which the Act requires'}. Adjudication is the remedy if it matters.`;
  return { json: u, text };
}

async function cmdReceived(db, args, flags) {
  const h = await resolve(db, 'claim', args.join(' '));
  const due = num(h.scheduled_amount ?? h.amount) - num(h.retention_held);
  const amount = flags.amount ? parseMoney(flags.amount, '--amount=') : due;
  const [u] = await db.query("update head_claims set paid_on = $1, amount_paid = $2, status = 'paid' where id = $3 returning *", [parseDate(flags.on) || today(), amount, h.id]);
  let text = `${u.ref} paid: ${money0(amount)} received.`;
  if (amount < due) text += ` That is ${money0(due - amount)} short of the scheduled amount after retention.`;
  return { json: u, text };
}

// ---------------------------------------------------------------------------
// Variations

async function cmdVariation(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') {
    const p = await resolve(db, 'project', rest.join(' '));
    const title = str(flags.title);
    if (!title) throw new CliError('variation add <project> --title= --price= [--cost= --commitment= --origin= --si= --rfi= --on=]');
    const price = flags.price ? parseMoney(flags.price, '--price=') : 0;
    const commitment = str(flags.commitment) ? await resolve(db, 'commitment', flags.commitment) : null;
    const rfi = str(flags.rfi) ? await resolve(db, 'rfi', flags.rfi) : null;
    const ref = await nextRef(db, 'VAR', 'variations', 500);
    const [v] = await db.query(
      `insert into variations (ref, project_id, commitment_id, rfi_id, title, origin, instruction_ref, instructed_on, price, cost)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [ref, p.id, commitment?.id || null, rfi?.id || null, title, str(flags.origin) || (rfi ? 'rfi' : 'client_instruction'), str(flags.si) || null,
       parseDate(flags.on) || today(), price, flags.cost ? parseMoney(flags.cost, '--cost=') : 0],
    );
    return { json: v, text: `${v.ref} instructed on ${p.ref}: ${title}${price ? `, about ${money0(price)}` : ''}. Price it and submit it: variation submit ${v.ref} --price=` };
  }
  const v = await resolve(db, 'variation', rest.join(' '));
  if (verb === 'submit') {
    if (v.status !== 'instructed') throw new CliError(`${v.ref} is ${v.status}.`);
    const price = flags.price ? parseMoney(flags.price, '--price=') : num(v.price);
    if (!price) throw new CliError(`${v.ref} has no price. Submit it with --price=.`);
    const [u] = await db.query("update variations set status = 'submitted', submitted_on = $1, price = $2, cost = coalesce($3, cost) where id = $4 returning *",
      [parseDate(flags.on) || today(), price, flags.cost ? parseMoney(flags.cost, '--cost=') : null, v.id]);
    return { json: u, text: `${u.ref} submitted to the client at ${money0(price)}.` };
  }
  if (verb === 'approve') {
    const by = str(flags.by);
    if (!by) throw new CliError(`Who approved ${v.ref}, in writing? --by="name, and how (email, signed variation)". Only approved variations raise the claim ceiling.`);
    if (!['instructed', 'submitted'].includes(v.status)) throw new CliError(`${v.ref} is ${v.status}.`);
    const [u] = await db.query("update variations set status = 'approved', decided_on = $1, approved_by = $2, price = coalesce($3, price) where id = $4 returning *",
      [parseDate(flags.on) || today(), by, flags.price ? parseMoney(flags.price, '--price=') : null, v.id]);
    return { json: u, text: `${u.ref} approved by ${by} at ${money0(u.price)}. The claim ceiling rises by that amount.` };
  }
  if (verb === 'reject') {
    const [u] = await db.query("update variations set status = 'rejected', decided_on = $1 where id = $2 returning *", [parseDate(flags.on) || today(), v.id]);
    return { json: u, text: `${u.ref} rejected. If the work was done, log what was instructed and by whom.` };
  }
  throw new CliError('variation add|submit|approve|reject ...');
}

// ---------------------------------------------------------------------------
// RFIs, submittals, delays, defects

async function cmdRfi(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') {
    const p = await resolve(db, 'project', rest.join(' '));
    const subject = str(flags.subject);
    const due = parseDate(flags.due);
    if (!subject || !due) throw new CliError('rfi add <project> --subject= --to=<consultant> --due=<date> [--question= --time --cost]. An RFI without a due date never gets chased.');
    const to = str(flags.to) ? await resolve(db, 'company', flags.to) : null;
    const ref = await nextRef(db, 'RFI', 'rfis', 400);
    const [r] = await db.query(
      `insert into rfis (ref, project_id, to_company_id, subject, question, asked_on, due_on, cost_impact, time_impact) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [ref, p.id, to?.id || null, subject, str(flags.question) || null, parseDate(flags.on) || today(), due, Boolean(flags.cost), Boolean(flags.time)],
    );
    return { json: r, text: `${r.ref} raised on ${p.ref}${to ? ' to ' + to.name : ''}, answer due ${due}.` };
  }
  const r = await resolve(db, 'rfi', rest.join(' '));
  if (verb === 'answer') {
    const [u] = await db.query("update rfis set status = 'answered', answered_on = $1, answer = $2 where id = $3 returning *", [parseDate(flags.on) || today(), str(flags.answer) || null, r.id]);
    let text = `${u.ref} answered.`;
    if (u.cost_impact) text += ` It has a cost impact: raise the variation, variation add <project> --rfi=${u.ref} --title=`;
    return { json: u, text };
  }
  if (verb === 'close') {
    const [u] = await db.query("update rfis set status = 'closed' where id = $1 returning *", [r.id]);
    return { json: u, text: `${u.ref} closed.` };
  }
  throw new CliError('rfi add|answer|close ...');
}

async function cmdSubmittal(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') {
    const p = await resolve(db, 'project', rest.join(' '));
    const title = str(flags.title);
    if (!title) throw new CliError('submittal add <project> --title= --reviewer= --required-by= [--commitment= --return-due= --spec=]');
    const reviewer = str(flags.reviewer) ? await resolve(db, 'company', flags.reviewer) : null;
    const commitment = str(flags.commitment) ? await resolve(db, 'commitment', flags.commitment) : null;
    const ref = await nextRef(db, 'SUB', 'submittals', 800);
    const [s] = await db.query(
      `insert into submittals (ref, project_id, commitment_id, reviewer_id, title, spec_section, submitted_on, return_due_on, required_by, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted') returning *`,
      [ref, p.id, commitment?.id || null, reviewer?.id || null, title, str(flags.spec) || null, parseDate(flags.on) || today(), parseDate(flags['return-due']), parseDate(flags['required-by'])],
    );
    return { json: s, text: `${s.ref} submitted on ${p.ref}${reviewer ? ' to ' + reviewer.name : ''}${s.required_by ? `, approval needed by ${isoDate(s.required_by)}` : ''}.` };
  }
  if (verb === 'return') {
    const s = await resolve(db, 'submittal', rest.join(' '));
    const status = str(flags.status);
    const ok = ['approved', 'approved_as_noted', 'revise_resubmit', 'rejected'];
    if (!ok.includes(status)) throw new CliError(`--status= is one of: ${ok.join(', ')}`);
    const [u] = await db.query('update submittals set status = $1, returned_on = $2 where id = $3 returning *', [status, parseDate(flags.on) || today(), s.id]);
    return { json: u, text: `${u.ref} returned ${status}.` };
  }
  throw new CliError('submittal add|return ...');
}

async function cmdDelay(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') {
    const p = await resolve(db, 'project', rest.join(' '));
    const cause = str(flags.cause);
    if (!cause) throw new CliError('delay add <project> --cause= [--started=<date> --rfi=]');
    const started = parseDate(flags.started) || today();
    const noticeDue = await addWorkingDays(db, started, Number(p.eot_notice_days || 20), p.jurisdiction);
    const rfi = str(flags.rfi) ? await resolve(db, 'rfi', flags.rfi) : null;
    const ref = await nextRef(db, 'EOT', 'delays', 900);
    const [d] = await db.query(
      `insert into delays (ref, project_id, rfi_id, cause, started_on, notice_due_on) values ($1, $2, $3, $4, $5, $6) returning *`,
      [ref, p.id, rfi?.id || null, cause, started, noticeDue],
    );
    let text = `${d.ref} logged on ${p.ref}: ${cause}. Notice due ${noticeDue} (${p.eot_notice_days} working days from ${started}, the head contract's time bar as recorded).`;
    if (noticeDue < today()) text += '\n  That window has ALREADY closed. Notify now and take advice on the time bar.';
    text += '\n  Draft it: /draft-delay-notice';
    return { json: d, text };
  }
  const d = await resolve(db, 'delay', rest.join(' '));
  if (verb === 'notify') {
    const on = parseDate(flags.on) || today();
    const [u] = await db.query("update delays set status = 'notified', notified_on = $1, days_claimed = $2 where id = $3 returning *", [on, flags.days ? Number(flags.days) : null, d.id]);
    let text = `${u.ref} notified ${on}${u.days_claimed ? `, ${u.days_claimed} days claimed` : ''}.`;
    if (on > isoDate(d.notice_due_on)) text += ` That is after the ${isoDate(d.notice_due_on)} time bar: expect the client to rely on it.`;
    return { json: u, text };
  }
  if (verb === 'decide') {
    const granted = Number(str(flags.granted) || 0);
    const [u] = await db.query('update delays set status = $1, days_granted = $2 where id = $3 returning *', [granted > 0 ? 'granted' : 'rejected', granted, d.id]);
    return { json: u, text: `${u.ref} ${u.status}${granted ? `: ${granted} days` : ''}.` };
  }
  throw new CliError('delay add|notify|decide ...');
}

async function cmdDefect(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') {
    const p = await resolve(db, 'project', rest.join(' '));
    const description = str(flags.description);
    if (!description) throw new CliError('defect add <project> --description= [--location= --company= --due=]');
    const company = str(flags.company) ? await resolve(db, 'company', flags.company) : null;
    const ref = await nextRef(db, 'DEF', 'defects', 1000);
    const [d] = await db.query(
      `insert into defects (ref, project_id, company_id, location, description, raised_on, due_on) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [ref, p.id, company?.id || null, str(flags.location) || null, description, today(), parseDate(flags.due) || addDays(today(), 14)],
    );
    return { json: d, text: `${d.ref} raised on ${p.ref}${company ? ', for ' + company.name : ''}, due ${isoDate(d.due_on)}.` };
  }
  if (verb === 'close') {
    const d = await resolve(db, 'defect', rest.join(' '));
    const [u] = await db.query("update defects set status = 'closed', closed_on = $1 where id = $2 returning *", [parseDate(flags.on) || today(), d.id]);
    return { json: u, text: `${u.ref} closed.` };
  }
  throw new CliError('defect add|close ...');
}

// ---------------------------------------------------------------------------
// Housekeeping

async function cmdAdd(db, args, flags) {
  const [kind, ...rest] = args;
  const name = rest.join(' ');
  if (kind !== 'company' || !name) throw new CliError('add company "<name>" --kind=client|subcontractor|consultant|supplier [--trade= --contact= --email= --phone= --expires=]');
  const k = str(flags.kind) || 'subcontractor';
  if (!['client', 'subcontractor', 'consultant', 'supplier'].includes(k)) throw new CliError('--kind= is client, subcontractor, consultant or supplier.');
  const [c] = await db.query(
    `insert into companies (name, kind, trade, contact_name, email, phone, liability_expires_on) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [name, k, str(flags.trade) || null, str(flags.contact) || null, str(flags.email) || null, str(flags.phone) || null, parseDate(flags.expires)],
  );
  let text = `${c.name} added (${k}).`;
  if (['subcontractor', 'supplier'].includes(k) && !c.liability_expires_on) text += ` No public liability on record yet: insurance "${c.name}" --expires=<date> before any subcontract.`;
  return { json: c, text };
}

async function cmdLog(db, args, flags) {
  const [target, ...words] = args;
  const note = words.join(' ');
  if (!target || !note) throw new CliError('log <project> "what happened" [--weather= --workers= --company=]');
  const p = await resolve(db, 'project', target);
  const company = str(flags.company) ? await resolve(db, 'company', flags.company) : null;
  const [d] = await db.query(
    `insert into diary (project_id, company_id, noted_on, weather, workers, note) values ($1, $2, $3, $4, $5, $6) returning *`,
    [p.id, company?.id || null, parseDate(flags.on) || today(), str(flags.weather) || null, flags.workers ? Number(flags.workers) : null, note],
  );
  return { json: d, text: `Diary: ${p.ref}, ${isoDate(d.noted_on)}. Logged.` };
}

async function cmdHoliday(db, args, flags) {
  const [verb, date, ...name] = args;
  if (verb !== 'add' || !date || !name.length) throw new CliError('holiday add <date> "<name>" [--jurisdiction=ALL|NZ|NSW|QLD]');
  const day = parseDate(date);
  await db.query('insert into holidays (day, jurisdiction, name) values ($1, $2, $3) on conflict (day) do update set name = excluded.name, jurisdiction = excluded.jurisdiction',
    [day, (str(flags.jurisdiction) || 'ALL').toUpperCase(), name.join(' ')]);
  return { json: { day }, text: `${day} is now a non-working day for the clocks.` };
}

// ---------------------------------------------------------------------------
// Compliance: the rule book, run against the records. docs/compliance.md
// carries each rule's source; this is the executable half.

const RULES = [
  {
    key: 'schedules_on_time',
    title: 'Every subcontractor payment claim is answered by a payment schedule before its deadline',
    source: 'NZ Construction Contracts Act 2002 ss 21 to 24; NSW Security of Payment Act 1999 s14; QLD Building Industry Fairness (Security of Payment) Act 2017 ss 76 to 77. No schedule in time makes the full claimed amount payable',
    sql: `select ref || ' ' || company as label, to_char(claimed_amount, 'FM999,999,990') || ' claimed, schedule due ' || to_char(schedule_due_on, 'YYYY-MM-DD') ||
            case when state = 'MISSED' then ', none issued' else ', issued late ' || to_char(schedule_issued_on, 'YYYY-MM-DD') end as detail
          from v_sub_claims where state in ('MISSED', 'scheduled LATE') or (state = 'paid' and schedule_issued_on > schedule_due_on)`,
    fix: 'Issue the schedule today if it is not out, and take advice: the subcontractor can recover the full claimed amount.',
  },
  {
    key: 'schedule_reasons',
    title: 'Every payment schedule for less than the claim states its reasons',
    source: 'NZ CCA s21(3); NSW SOPA s14(3); QLD BIF Act s69. A schedule that does not say why it is less leaves you arguing without a case',
    sql: `select ref || ' ' || company as label, to_char(scheduled_amount, 'FM999,999,990') || ' scheduled against ' || to_char(claimed_amount, 'FM999,999,990') || ' claimed, no reasons on record' as detail
          from v_sub_claims where scheduled_amount < claimed_amount and coalesce(schedule_reasons, '') = ''`,
    fix: 'Record the reasons that went out (or find the schedule). The gate at schedule refuses new ones without them.',
  },
  {
    key: 'supporting_statement',
    title: 'Every NSW progress claim carries a supporting statement',
    source: 'NSW Building and Construction Industry Security of Payment Act 1999 s13(7): a head contractor must not serve a payment claim on the principal without a supporting statement that the subcontractors have been paid',
    sql: `select ref || ' ' || project_ref as label, 'claim ' || claim_no || ' served ' || to_char(served_on, 'YYYY-MM-DD') || ' with no supporting statement on record' as detail
          from v_head_claims where jurisdiction = 'NSW' and not supporting_statement`,
    fix: 'Serve the statement with the next claim. The gate at claim refuses NSW claims without it.',
  },
  {
    key: 'retention_trust',
    title: 'Retentions held from subcontractors on NZ projects sit in a recorded trust account',
    source: 'NZ Construction Contracts Act 2002 subpart 2A (retention money), strengthened by the Construction Contracts (Retention Money) Amendment Act 2023: retention money is held on trust, kept separate, and recorded',
    sql: `select ref || ' ' || project as label, to_char(retention_we_hold, 'FM999,999,990') || ' retention held from subcontractors and no trust account recorded on the project' as detail
          from v_projects where jurisdiction = 'NZ' and retention_we_hold > 0 and coalesce(retention_account, '') = ''`,
    fix: 'Record the account: project set <ref> --retention-account="<bank, account name>". If there is no such account, open one before the next schedule.',
  },
  {
    key: 'claims_within_contract',
    title: 'Progress claims never pass the contract plus approved variations',
    source: 'Your head contract, and every security of payment Act: a claim is for work under the contract. Claiming past the ceiling invites a schedule for less, and loses the argument',
    sql: `select ref || ' ' || project as label, to_char(claimed, 'FM999,999,990') || ' claimed against a ceiling of ' || to_char(revised_contract, 'FM999,999,990') as detail
          from v_projects where status in ('active', 'defects', 'closed') and claimed > revised_contract`,
    fix: 'The gate at claim refuses this with no force flag; a breach means imported history needs correcting.',
  },
  {
    key: 'variations_submitted',
    title: 'Instructed variations are priced and submitted within 14 days',
    source: 'Your head contract\'s variation clause (NZS 3910 and AS 4000 both require the contractor to price instructed variations) and this business\'s own standard: unsubmitted work is unpaid work',
    sql: `select ref || ' ' || project_ref as label, title || ', instructed ' || to_char(instructed_on, 'YYYY-MM-DD') || ', ' || days_waiting || ' days and not submitted' as detail
          from v_variations where status = 'instructed' and days_waiting > 14`,
    fix: 'Price it and submit it this week: variation submit <ref> --price=.',
  },
  {
    key: 'delay_notices',
    title: 'Every delay is notified inside the head contract\'s time bar',
    source: 'Your head contract\'s extension of time clause. NZS 3910 and AS 4000 both bar a claim not notified in time; the period is recorded per project (eot_notice_days)',
    sql: `select ref || ' ' || project_ref as label, cause || ': notice was due ' || to_char(notice_due_on, 'YYYY-MM-DD') ||
            case when notified_on is null then ', not given' else ', given late ' || to_char(notified_on, 'YYYY-MM-DD') end as detail
          from v_delays where (notified_on is null and notice_due_on < current_date) or notified_on > notice_due_on`,
    fix: 'Notify today, attach the diary entries, and take advice on whether the bar can be argued.',
  },
  {
    key: 'insurance_current',
    title: 'Every subcontractor on a live subcontract carries current public liability insurance',
    source: 'Your subcontract terms and the head contract\'s insurance clause: trades on site carry current public liability. An uninsured subcontractor\'s incident lands on you',
    sql: `select company as label, trade || ' on ' || ref || ' (' || project_ref || '), public liability ' ||
            case when liability_expires_on is null then 'not on record' else 'expired ' || to_char(liability_expires_on, 'YYYY-MM-DD') end as detail
          from v_commitments where status = 'executed' and project_status = 'active' and insurance in ('EXPIRED', 'NONE')`,
    fix: 'Get the current certificate today or stand them down: insurance "<company>" --expires=. The gate refuses new subcontracts.',
  },
  {
    key: 'rfi_delays',
    title: 'An overdue RFI that holds work has a delay logged against it',
    source: 'This business\'s own standard: an RFI with a time impact that is past due is the start of an extension of time claim, and the time bar is already running',
    sql: `select r.ref || ' ' || r.project_ref as label, r.subject || ', ' || r.days_overdue || ' days overdue with a time impact and no delay logged' as detail
          from v_rfis r
          where r.state = 'OVERDUE' and r.time_impact and not exists (select 1 from delays d where d.rfi_id = r.rfi_id)`,
    fix: 'Log it: delay add <project> --cause= --started=<the day work stopped> --rfi=<ref>.',
  },
  {
    key: 'cost_watch',
    title: 'No cost line forecast over budget without a decision',
    source: 'This business\'s own standard: a line over budget is a variation to price, a buying loss to name, or a forecast to correct, this week, never a surprise at the final account',
    sql: `select project_ref || ' ' || cost_code || ' ' || line as label, 'forecast ' || to_char(forecast_final, 'FM999,999,990') || ' against ' || to_char(budget, 'FM999,999,990') as detail
          from v_cost_report where state = 'OVER' and project_status = 'active'`,
    fix: 'Name the cause. If the client caused it, it is a variation to submit.',
  },
];

async function cmdCompliance(db, args) {
  const only = args[0];
  const rules = only ? RULES.filter((r) => r.key === only) : RULES;
  if (!rules.length) throw new CliError(`No rule "${only}". Rules: ${RULES.map((r) => r.key).join(', ')}`);
  const results = [];
  for (const rule of rules) {
    const breaches = await db.query(rule.sql);
    results.push({ key: rule.key, title: rule.title, source: rule.source, fix: rule.fix, breaches });
  }
  let text = heading('The rule book, run against the records');
  for (const r of results) {
    text += `\n\n${r.breaches.length ? 'FAIL' : ' ok '} ${r.key}: ${r.title}`;
    text += `\n      ${r.source}`;
    for (const b of r.breaches) text += `\n      - ${b.label}: ${b.detail}`;
    if (r.breaches.length) text += `\n      fix: ${r.fix}`;
  }
  const failed = results.filter((r) => r.breaches.length).length;
  text += `\n\n${results.length - failed} of ${results.length} rules pass. Sources and the fuller reading: docs/compliance.md. None of this is legal advice.`;
  return { json: results, text };
}

// ---------------------------------------------------------------------------
// Import and export
//
// Procore exports each tool's log per project: the Commitments list, the RFI
// log and the Submittals log all export to CSV. So the import takes one
// project at a time: --project=<existing ref> plus any of the three files.

const money = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '') || 0);

function mapStatus(raw, map, dflt) {
  const s = String(raw || '').toLowerCase();
  for (const [re, v] of map) if (re.test(s)) return v;
  return dflt;
}

async function cmdImport(db, args, flags) {
  const source = args[0];
  if (!['procore', 'csv'].includes(source || '')) {
    throw new CliError('import procore|csv --project=<PRJ-ref> [--commitments=file.csv --rfis=file.csv --submittals=file.csv] [--dry-run]');
  }
  const dryRun = Boolean(flags['dry-run']);
  const p = await resolve(db, 'project', str(flags.project));
  const readCsvFile = (flag) => {
    const file = str(flags[flag]);
    if (!file) return null;
    if (!existsSync(file)) throw new CliError(`No ${flag} file at ${file}.`);
    return parseCsv(readFileSync(file, 'utf8'));
  };
  const commitmentRows = readCsvFile('commitments');
  const rfiRows = readCsvFile('rfis');
  const submittalRows = readCsvFile('submittals');
  if (!commitmentRows && !rfiRows && !submittalRows) throw new CliError('Nothing to import. Pass at least one of --commitments= --rfis= --submittals=.');

  const counts = { companies: 0, commitments: 0, rfis: 0, submittals: 0, skipped: 0, uninsured: 0, overdue_rfis: 0, unbudgeted: 0 };
  const skips = [];
  const pendingCompanies = new Map();

  const findCompany = async (name, kind) => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (pendingCompanies.has(key)) return pendingCompanies.get(key);
    const [hit] = await db.query('select * from companies where lower(name) = lower($1)', [name]);
    if (hit) return hit;
    counts.companies++;
    if (kind === 'subcontractor') counts.uninsured++;
    const created = dryRun
      ? { id: null, name, __pending: true }
      : (await db.query('insert into companies (name, kind) values ($1, $2) returning *', [name, kind]))[0];
    pendingCompanies.set(key, created);
    return created;
  };

  let importLine = null;
  const lineFor = async () => {
    if (importLine) return importLine;
    if (dryRun) return (importLine = { id: null });
    [importLine] = await db.query(
      `insert into budget_lines (project_id, cost_code, name, budget) values ($1, '99', 'Imported commitments', 0)
       on conflict (project_id, cost_code) do update set name = budget_lines.name returning *`,
      [p.id],
    );
    return importLine;
  };

  if (commitmentRows) {
    for (const row of commitmentRows) {
      const company = pick(row, 'Contract Company', 'Vendor', 'Company', 'Subcontractor');
      const title = pick(row, 'Title', 'Description', 'Scope');
      const number = pick(row, '#', 'Number', 'Contract #', 'No.');
      if (!company || !title) {
        counts.skipped++;
        skips.push(`commitment "${title || number || '(no title)'}" with no ${company ? 'title' : 'company'}`);
        continue;
      }
      const c = await findCompany(company, 'subcontractor');
      const value = money(pick(row, 'Original Contract Amount', 'Original Amount', 'Contract Amount', 'Value', 'Amount'));
      const status = mapStatus(pick(row, 'Status'), [[/draft|out for|bid/, 'draft'], [/complete|closed/, 'complete'], [/terminat|void/, 'terminated']], 'executed');
      counts.commitments++;
      counts.unbudgeted++;
      if (!dryRun) {
        const line = await lineFor();
        const ref = await nextRef(db, 'SC', 'commitments', 300);
        await db.query(
          `insert into commitments (ref, project_id, company_id, budget_line_id, title, kind, value, status, executed_on, external_ref)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (external_ref) do nothing`,
          [ref, p.id, c.id, line.id, title, /purchase|po\b/i.test(pick(row, 'Type', 'Contract Type')) ? 'purchase_order' : 'subcontract', value, status,
           pick(row, 'Executed', 'Executed Date', 'Signed Date') && !/^(yes|no|true|false)$/i.test(pick(row, 'Executed')) ? parseDate(pick(row, 'Executed', 'Executed Date', 'Signed Date')) : null,
           number ? `procore:${p.ref}:commitment:${number}` : null],
        );
      }
    }
  }

  if (rfiRows) {
    for (const row of rfiRows) {
      const subject = pick(row, 'Subject', 'Title', 'Question');
      const number = pick(row, '#', 'Number', 'RFI #', 'No.');
      const dueRaw = pick(row, 'Due Date', 'Due', 'Required By');
      if (!subject) {
        counts.skipped++;
        skips.push(`RFI ${number || '(no number)'} with no subject`);
        continue;
      }
      const toName = pick(row, 'Received From', 'Ball In Court', 'Responsible Contractor', 'Assignees', 'To');
      const to = toName ? await findCompany(toName.split(/[;(]/)[0].trim(), 'consultant') : null;
      const asked = pick(row, 'Date Initiated', 'Created', 'Created At', 'Date') ? parseDate(pick(row, 'Date Initiated', 'Created', 'Created At', 'Date')) : today();
      const due = dueRaw ? parseDate(dueRaw) : addDays(asked, 7);
      const status = mapStatus(pick(row, 'Status'), [[/closed/, 'closed'], [/answer|respond/, 'answered']], 'open');
      counts.rfis++;
      if (status === 'open' && due < today()) counts.overdue_rfis++;
      if (!dryRun) {
        const ref = await nextRef(db, 'RFI', 'rfis', 400);
        await db.query(
          `insert into rfis (ref, project_id, to_company_id, subject, asked_on, due_on, cost_impact, time_impact, status, external_ref)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (external_ref) do nothing`,
          [ref, p.id, to?.id || null, subject, asked, due, yesNo(pick(row, 'Cost Impact')), yesNo(pick(row, 'Schedule Impact', 'Time Impact')), status,
           number ? `procore:${p.ref}:rfi:${number}` : null],
        );
      }
    }
  }

  if (submittalRows) {
    for (const row of submittalRows) {
      const title = pick(row, 'Title', 'Description', 'Name');
      const number = pick(row, '#', 'Number', 'Submittal #');
      if (!title) {
        counts.skipped++;
        skips.push(`submittal ${number || '(no number)'} with no title`);
        continue;
      }
      const statusRaw = pick(row, 'Status', 'Response');
      const status = mapStatus(statusRaw, [[/as noted/, 'approved_as_noted'], [/approv/, 'approved'], [/revise|resubmit/, 'revise_resubmit'], [/reject/, 'rejected'], [/draft/, 'pending']], 'submitted');
      const reviewerName = pick(row, 'Ball In Court', 'Approvers', 'Reviewer');
      const reviewer = reviewerName ? await findCompany(reviewerName.split(/[;(]/)[0].trim(), 'consultant') : null;
      const requiredBy = pick(row, 'Required On Site', 'Final Due Date', 'Required By', 'Due Date');
      counts.submittals++;
      if (!dryRun) {
        const ref = await nextRef(db, 'SUB', 'submittals', 800);
        await db.query(
          `insert into submittals (ref, project_id, reviewer_id, title, spec_section, submitted_on, required_by, status, external_ref)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (external_ref) do nothing`,
          [ref, p.id, reviewer?.id || null, title, pick(row, 'Spec Section', 'Specification Section') || null,
           pick(row, 'Submit By', 'Sent Date', 'Submitted') ? parseDate(pick(row, 'Submit By', 'Sent Date', 'Submitted')) : null,
           requiredBy ? parseDate(requiredBy) : null, status, number ? `procore:${p.ref}:submittal:${number}` : null],
        );
      }
    }
  }

  const json = { ...counts, dry_run: dryRun, project: p.ref, skips };
  let text = `${dryRun ? 'DRY RUN, nothing written. Would import' : 'Imported'} into ${p.ref}: ${counts.commitments} commitments, ${counts.rfis} RFIs, ${counts.submittals} submittals, ${counts.companies} new companies.`;
  if (counts.uninsured) text += `\n${counts.uninsured} subcontractor(s) arrived with no public liability on record: compliance will say so until each certificate is entered (insurance "<company>" --expires=).`;
  if (counts.unbudgeted) text += `\n${counts.unbudgeted} commitment(s) landed on cost line 99 "Imported commitments" with no budget: move each to its real cost line and load the budget, or the cost report shows them OVER.`;
  if (counts.overdue_rfis) text += `\n${counts.overdue_rfis} open RFI(s) are already past due: check which are holding work and log the delays.`;
  if (skips.length) text += `\nSkipped ${counts.skipped}:\n` + skips.map((x) => `  - ${x}`).join('\n');
  text += dryRun ? '\nRun again without --dry-run to write it.' : '\nCheck it: attention, compliance, cost ' + p.ref;
  return { json, text };
}

async function cmdExport(db, args, flags) {
  const tables = ['companies', 'projects', 'budget_lines', 'commitments', 'rfis', 'variations', 'head_claims', 'sub_claims', 'costs', 'submittals', 'delays', 'defects', 'diary', 'holidays'];
  const out = {};
  for (const t of tables) out[t] = await db.query(`select * from ${t}${t === 'holidays' ? ' order by day' : ' order by created_at'}`);
  const counts = Object.fromEntries(tables.map((t) => [t, out[t].length]));
  const file = str(flags.out) || path.join(REPO_ROOT, 'exports', `construction-export-${today()}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 2));
  return {
    json: { file, counts },
    text: `Exported the whole database to ${file}.\n  ` + Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(', ') +
      '\nPlain JSON of plain tables. The project record is your liability tail; keep the exports.',
  };
}

// ---------------------------------------------------------------------------
// Help and dispatch

const HELP = `
Construction Projects for Claude Code: the CLI behind the slash commands.

  node scripts/construction.mjs <command> [args] [--flags]     (or: npm run construction -- <command>)

Projects and the cost plan:
  project add "<name>" --client= --value= [--jurisdiction=NZ|NSW|QLD --form= --site= --tender-due=]
  project award <ref> [--on= --start= --pc-due= --value=]  |  project lost <ref>
  project pc <ref> [--on= --defects-days=365]  |  project close <ref>    close refuses loose ends, no force flag
  project set <ref> [--retention-account= --schedule-days= --payment-days= --eot-days= --pc-due= --form=]
  budget add <project> --code= --name= --budget=  |  forecast <project> --line= --final=<amount|clear>
  cost-add <project> --line= --amount= [--supplier= --invoice= --on=]

Subcontracts and their claims (the clock):
  commit <project> --company= --line= --value= [--title= --po --draft --retention=]   refuses expired insurance
  execute <SC-ref>  |  insurance <company> --expires=<date>
  sub-claim <SC-ref> --amount= [--received=]     computes the payment schedule deadline in working days
  schedule <SCL-ref> --amount= [--reasons= --retention=]   less than claimed needs reasons, no force flag
  pay <SCL-ref> [--amount= --on=]

Progress claims to the client:
  claim <project> --amount= [--supporting-statement --terms=20 --due=]   ceiling = contract + APPROVED variations
  client-schedule <PC-ref> --amount= [--reasons= --retention=]  |  received <PC-ref> [--amount= --on=]

Variations, RFIs, submittals, delays, defects:
  variation add <project> --title= [--price= --cost= --commitment= --si= --rfi= --origin=]
  variation submit <VAR> [--price=]  |  variation approve <VAR> --by="who, in writing"  |  variation reject <VAR>
  rfi add <project> --subject= --to= --due= [--question= --time --cost]  |  rfi answer <RFI> [--answer=]  |  rfi close <RFI>
  submittal add <project> --title= --reviewer= --required-by= [--commitment= --return-due= --spec=]
  submittal return <SUB> --status=approved|approved_as_noted|revise_resubmit|rejected
  delay add <project> --cause= [--started= --rfi=]   computes the notice time bar
  delay notify <EOT> [--days= --on=]  |  delay decide <EOT> --granted=<days>
  defect add <project> --description= [--location= --company= --due=]  |  defect close <DEF>

Reads:
  attention                 everything that wants a decision, worst first
  stats  |  margin          the business, and forecast margin by project worst first
  projects [--all]  |  project <ref>  |  cost <project>
  commitments [--all --project=]  |  sub-claims [--all --project=]  |  claims [--all --project=]
  variations [--all --project=]  |  rfis [--all --project=]  |  submittals [--all --project=]
  delays [--all --project=]  |  defects [--all --project=]  |  subbies [--all]  |  companies [--kind=]  |  company <name>
  diary <project> [--days=14]
  compliance [rule]         ten rules from the Acts, your contracts and your own standards, sources cited

Housekeeping:
  add company "<name>" --kind=client|subcontractor|consultant|supplier [--trade= --expires=]
  log <project> "what happened" [--weather= --workers= --company=]     the site diary
  holiday add <date> "<name>" [--jurisdiction=]      a day the working-day clocks skip
  import procore|csv --project=<ref> [--commitments= --rfis= --submittals=] [--dry-run]
  export [--out=file.json]

Any command takes --json. Refs match case-insensitively ("201" finds PRJ-201); an ambiguous name
lists the candidates rather than guessing.
A subcontractor's claim is answered before its deadline, and a schedule for less says why.
A progress claim never passes the contract plus approved variations. An uninsured subcontractor does not sign.
Nothing here connects to a bank or a client, and nothing sends: paperwork drafts to files, a person sends.
`;

const COMMANDS = {
  projects: cmdProjects,
  project: cmdProjectVerb,
  cost: cmdCost,
  'cost-add': cmdCostAdd,
  budget: cmdBudget,
  forecast: cmdForecast,
  commitments: cmdCommitments,
  commit: cmdCommit,
  execute: cmdExecute,
  insurance: cmdInsurance,
  'sub-claims': cmdSubClaims,
  'sub-claim': cmdSubClaim,
  schedule: cmdSchedule,
  pay: cmdPay,
  claims: cmdClaims,
  claim: cmdClaim,
  'client-schedule': cmdClientSchedule,
  received: cmdReceived,
  variations: cmdVariations,
  variation: cmdVariation,
  rfis: cmdRfis,
  rfi: cmdRfi,
  submittals: cmdSubmittals,
  submittal: cmdSubmittal,
  delays: cmdDelays,
  delay: cmdDelay,
  defects: cmdDefects,
  defect: cmdDefect,
  subbies: cmdSubbies,
  companies: cmdCompanies,
  company: cmdCompany,
  margin: cmdMargin,
  diary: cmdDiary,
  attention: cmdAttention,
  stats: cmdStats,
  compliance: cmdCompliance,
  add: cmdAdd,
  log: cmdLog,
  holiday: cmdHoliday,
  import: cmdImport,
  export: cmdExport,
};

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const [command, ...rest] = args;
  if (!command || command === 'help' || flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const fn = COMMANDS[command];
  if (!fn) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  const db = await getDb();
  try {
    const result = await fn(db, rest, flags);
    if (flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + '\n');
    else process.stdout.write(result.text.replace(/^\n/, '') + '\n');
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`${e.message}\n`);
      return e.code;
    }
    if (/relation "?\w+"? does not exist/.test(e.message)) {
      process.stderr.write('The database has no tables yet. Run: npm run migrate\n');
      return 1;
    }
    throw e;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
