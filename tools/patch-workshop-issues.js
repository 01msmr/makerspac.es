// tools/patch-workshop-issues.js
// One-shot: adds "- [ ] Freigegeben zur Integration" checkbox to all open
// workshop-data issues that don't have it yet.
// Run via GitHub Actions: "🔧 Patch Workshop Issues"

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const issues = JSON.parse(execSync(
  'gh issue list --label workshop-data --state open --json number,body --limit 500',
  { encoding: 'utf8' }
));

const CHECKBOX = '- [ ] Freigegeben zur Integration';
let patched = 0;

for (const issue of issues) {
  if (issue.body.includes('Freigegeben')) {
    console.log(`#${issue.number}: already has checkbox, skipping`);
    continue;
  }

  const newBody = issue.body.trimEnd() + '\n\n' + CHECKBOX + '\n';

  // Write body to temp file to avoid shell escaping issues
  const tmp = path.join(os.tmpdir(), `issue-${issue.number}.md`);
  fs.writeFileSync(tmp, newBody, 'utf8');
  execSync(`gh issue edit ${issue.number} --body-file "${tmp}"`, { stdio: 'pipe' });
  fs.unlinkSync(tmp);

  console.log(`#${issue.number}: patched`);
  patched++;
}

console.log(`\nDone: ${patched} issues patched, ${issues.length - patched} skipped`);
