#!/usr/bin/env node
// Loads supabase/seed.sql: Ridgeline Construction Ltd, a fictional Hamilton
// commercial head contractor with four projects (two active, one in its
// defects period, one at tender), cost plans, subcontracts, claims both ways,
// variations, RFIs, submittals, delays, defects and a site diary. Every row
// has a derived id and inserts with ON CONFLICT DO NOTHING, so re-running it
// is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from companies)    as companies,
           (select count(*) from projects)     as projects,
           (select count(*) from budget_lines) as budget_lines,
           (select count(*) from commitments)  as commitments,
           (select count(*) from variations)   as variations,
           (select count(*) from head_claims)  as head_claims,
           (select count(*) from sub_claims)   as sub_claims,
           (select count(*) from rfis)         as rfis,
           (select count(*) from submittals)   as submittals,
           (select count(*) from delays)       as delays,
           (select count(*) from defects)      as defects,
           (select count(*) from diary)        as diary
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const db = await getDb();
  try {
    const counts = await seed(db);
    console.log('seeded:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  } finally {
    await db.close();
  }
}
