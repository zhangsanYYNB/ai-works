import { readFileSync } from 'fs';
const html = readFileSync(new URL('./answer_shift.html', import.meta.url), 'utf8');
const dataSrc = html.match(/\/\*DATA-START\*\/([\s\S]*?)\/\*DATA-END\*\//)[1];
const algoSrc = html.match(/\/\*ALGO-START\*\/([\s\S]*?)\/\*ALGO-END\*\//)[1];
const CIRC = ["①","②","③","④"];
eval(dataSrc + "\n" + algoSrc + "\n;globalThis.__X={RESULT,DATA,PARTNAMES};");
const { RESULT } = globalThis.__X;

// 校验:每个块显示串与原串的差异位置数 === 偏移数
let total = 0, ok = true;
const byPage = {};
RESULT.forEach((r, i) => {
  let diff = 0;
  r.b.g.forEach((g, gi) => {
    const o = g[1], d = r.disp[gi];
    for (let k = 0; k < o.length; k++) if (o[k] !== d[k]) diff++;
  });
  if (diff !== r.shifts.length) { ok = false; console.error("MISMATCH block", i + 1); }
  r.shifts.forEach(s => { if (s.from === s.to) { ok = false; console.error("SAME LETTER block", i + 1); } });
  total += r.shifts.length;
  (byPage[r.b.pg] = byPage[r.b.pg] || []).push([i, r]);
});
console.log(`blocks=${RESULT.length} shifts=${total} verify=${ok ? "OK" : "FAIL"}`);
for (const pg of Object.keys(byPage).map(Number).sort((a, b) => a - b)) {
  console.log(`\n== P${pg} ==`);
  for (const [i, r] of byPage[pg]) {
    const b = r.b;
    const zuS = b.zn > 0 ? ("题组" + b.zn) : b.zu.replace(" ", "");
    const dayS = b.day ? ("·" + b.day.replace(" ", "")) : "";
    const desc = r.shifts.map(s =>
      (b.g.length > 1 ? ("组" + CIRC[s.gi]) : "") + `「${s.range}」第${s.pos + 1}题 ${s.from}→${s.to}(正确${s.to})`
    ).join("; ");
    const disp = b.g.map((g, gi) => `${g[0]} ${r.disp[gi]}`).join("  ");
    console.log(`- #${i + 1} ${zuS}${dayS} ${b.ty}: ${desc}`);
    console.log(`    显示: ${disp}`);
  }
}
