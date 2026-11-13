// Mock Apps Script web app: runs Code.gs + Portal.gs from the test harness.
import http from 'node:http';
import {createEnv, HEADERS} from '../../apps-script/test/harness.mjs';
const env = createEnv();
const send = (res, code, obj) => { res.writeHead(code, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    try {
      if (req.url === '/exec' && req.method === 'POST') return send(res, 200, env.ctx.doPost({postData: {contents: body}}).body);
      if (req.url === '/admin') { // {op, row?, header?, value?}
        const a = JSON.parse(body || '{}');
        if (a.op === 'process') env.ctx.processPending();
        if (a.op === 'set') env.sheets.MASTER.set(a.row, HEADERS.MASTER.indexOf(a.header) + 1, a.value);
        if (a.op === 'enable') require_enable(a.task);
        if (a.op === 'clock') vm.runInContext(`PORTAL.clock = ${JSON.stringify(a.value)}`, env.ctx);
        if (a.op === 'school') env.sheets.SCHOOLS.appendRow(a.row);
        return send(res, 200, {ok: true, sheets: Object.fromEntries(Object.entries(env.sheets).map(([k, s]) => [k, s.rows])), mails: env.mails, files: env.savedFiles.map(f => ({folder: f.folder, name: f.name}))});
      }
      send(res, 404, {});
    } catch (e) { send(res, 500, {error: String(e.stack)}); }
  });
}).listen(8791, () => console.log('mock exec on 8791'));
import vm from 'node:vm';
function require_enable(task) { vm.runInContext(`PORTAL.tasks.${task}.open = true`, env.ctx); }
// Start with onboarding closed; the test opens it when it gets there.
vm.runInContext('PORTAL.tasks.onboarding.open = false', env.ctx);
