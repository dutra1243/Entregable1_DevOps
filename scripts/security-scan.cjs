// Exit 0: clean; 10: findings; 2: scanner/configuration failure.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const dir = 'security-results';
function classify(tool, status, report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw Error('Invalid report');
  if (tool === 'audit') {
    if (report.error || !report.metadata || !report.metadata.vulnerabilities || !report.vulnerabilities || ![0,1].includes(status)) throw Error('npm audit failed');
    const total = report.metadata.vulnerabilities.total;
    if (!Number.isInteger(total) || total < 0 || (status === 1 && total === 0)) throw Error('Invalid audit outcome');
    return total > 0;
  }
  if (status !== 0 || !Array.isArray(report.results) || !Array.isArray(report.errors) || report.errors.length) throw Error('Semgrep failed or scan was incomplete');
  return report.results.length > 0;
}
module.exports = {classify};
if (require.main === module) {
  const tool = process.argv[2];
  fs.mkdirSync(dir, {recursive:true});
  const reportPath = path.join(dir, tool + '.json');
  fs.rmSync(reportPath, {force:true});
  function run(command, args, name) {
    const r = spawnSync(command, args, {encoding:'utf8', maxBuffer:64*1024*1024});
    fs.writeFileSync(path.join(dir, name + '.log'), (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : ''));
    if (r.error || r.signal || r.status === null) throw Error(name + ' could not execute');
    return r;
  }
  try {
    if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Node.js 24 required');
    let result;
    if (tool === 'audit') {
      if (run('npm', ['ci','--ignore-scripts','--no-audit'], 'npm-ci').status !== 0) throw Error('npm ci failed');
      result = run('npm', ['audit','--json'], 'audit');
      fs.writeFileSync(reportPath, result.stdout);
    } else if (tool === 'semgrep') {
      const version = run('semgrep',['--version'],'semgrep-version');
      if (version.status !== 0 || version.stdout.trim() !== '1.181.1') throw Error('Semgrep 1.181.1 required');
      result = run('semgrep', ['scan','--config','p/javascript','--config','p/nodejs','--config','p/dockerfile','--metrics=off','--strict','--json','--output',reportPath,'src','Dockerfile'], 'semgrep');
    } else throw Error('Unknown scanner');
    const findings = classify(tool, result.status, JSON.parse(fs.readFileSync(reportPath,'utf8')));
    console.log(tool + (findings ? ': findings; see archived report' : ': clean'));
    process.exitCode = findings ? 10 : 0;
  } catch (e) {
    console.error(tool + ': execution failure: ' + e.message);
    process.exitCode = 2;
  }
}
