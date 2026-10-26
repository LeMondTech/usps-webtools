'use strict';

const { toOrcaPreset, fileName } = require('./orca');

// Builds a single self-contained HTML catalog of every profile, with each
// Snapmaker Orca preset embedded so it can be downloaded straight from the page.
function buildSite(db) {
  const data = db.profiles.map(p => ({
    id: p.id,
    brand: p.brand,
    name: p.name,
    material: p.material,
    nozzle: p.nozzle,
    bed: p.bed,
    fan: p.fan,
    maxVolumetricSpeed: p.maxVolumetricSpeed,
    flowRatio: p.flowRatio,
    pressureAdvance: p.pressureAdvance,
    retraction: p.retraction,
    density: p.density,
    dry: p.dry,
    enclosure: p.enclosure,
    hardenedNozzle: !!p.hardenedNozzle,
    notes: p.notes || '',
    verified: !!p.verified,
    tuning: p.tuning,
    lastTuned: p.lastTuned,
    bedMax: db.printer.bed.maxTemp,
    file: fileName(p, db.printer),
    preset: toOrcaPreset(p, db.printer)
  }));
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const generated = new Date().toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>U1 Filament Profiles</title>
<style>
:root {
  --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de;
  --accent: #0b6bcb; --accent-ink: #ffffff; --ok: #1a7f37; --warn: #9a6700; --chip: #efefea;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161615; --panel: #1f1f1d; --text: #ecece8; --muted: #a3a39c; --line: #33332f;
    --accent: #4d9bf0; --accent-ink: #0b0b0a; --ok: #4ac26b; --warn: #d4a72c; --chip: #2a2a27;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #161615; --panel: #1f1f1d; --text: #ecece8; --muted: #a3a39c; --line: #33332f;
  --accent: #4d9bf0; --accent-ink: #0b0b0a; --ok: #4ac26b; --warn: #d4a72c; --chip: #2a2a27;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; }
header, main { max-width: 1100px; margin: 0 auto; padding-block: 16px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.layout > * { min-width: 0; }
h1 { font-size: 22px; margin: 8px 0 2px; }
.sub { color: var(--muted); margin: 0; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.controls input, .controls select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--text); font: inherit; }
.controls input { flex: 1 1 220px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
.list { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.row { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); cursor: pointer; }
.row:last-child { border-bottom: 0; }
.row:hover, .row.sel { background: var(--chip); }
.row .t { font-weight: 600; }
.row .m { color: var(--muted); font-size: 13px; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--chip); font-size: 12px; color: var(--muted); }
.chip.ok { color: var(--ok); } .chip.warn { color: var(--warn); }
.detail { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: sticky; top: 12px; }
.detail h2 { margin: 0 0 4px; font-size: 18px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 14px 0; }
dt { color: var(--muted); } dd { margin: 0; font-variant-numeric: tabular-nums; }
button { padding: 8px 14px; border-radius: 8px; border: 0; background: var(--accent); color: var(--accent-ink); font: inherit; font-weight: 600; cursor: pointer; }
button.secondary { background: var(--chip); color: var(--text); }
button:focus-visible, .row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.actions span { color: var(--muted); font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--line); }
.empty { color: var(--muted); padding: 16px; }
.note { color: var(--muted); font-size: 13px; white-space: pre-wrap; }
</style>
</head>
<body>
<header>
  <h1>Snapmaker U1 filament profiles</h1>
  <p class="sub" id="summary"></p>
</header>
<main>
  <div class="controls">
    <input id="q" type="search" placeholder="Search brand or filament" aria-label="Search">
    <select id="brand" aria-label="Brand"><option value="">All brands</option></select>
    <select id="material" aria-label="Material"><option value="">All materials</option></select>
    <select id="status" aria-label="Status"><option value="">Any status</option><option value="tuned">Tuned</option><option value="untuned">Untuned</option></select>
  </div>
  <div class="layout">
    <div class="list" id="list"></div>
    <div class="detail" id="detail"><p class="empty">Select a filament to see its settings.</p></div>
  </div>
</main>
<script>
const DATA = ${json};
const GENERATED = ${JSON.stringify(generated)};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let selected = null;
const EMBEDDED = window.self !== window.top;

function fill(select, values) {
  [...new Set(values)].sort().forEach(v => select.add(new Option(v, v)));
}
fill($('brand'), DATA.map(d => d.brand));
fill($('material'), DATA.map(d => d.material));
$('summary').textContent = DATA.length + ' profiles from ' + new Set(DATA.map(d => d.brand)).size + ' brands, ' +
  DATA.filter(d => d.tuning.length).length + ' tuned. Generated ' + GENERATED + '.';

function filtered() {
  const q = $('q').value.trim().toLowerCase();
  return DATA.filter(d =>
    (!q || (d.brand + ' ' + d.name + ' ' + d.material).toLowerCase().includes(q)) &&
    (!$('brand').value || d.brand === $('brand').value) &&
    (!$('material').value || d.material === $('material').value) &&
    (!$('status').value || ($('status').value === 'tuned') === d.tuning.length > 0));
}

function renderList() {
  const rows = filtered();
  $('list').innerHTML = rows.length ? rows.map(d =>
    '<div class="row' + (d.id === selected ? ' sel' : '') + '" tabindex="0" data-id="' + esc(d.id) + '">' +
      '<span class="t">' + esc(d.brand) + ' ' + esc(d.name) + '</span>' +
      '<span>' + (d.tuning.length ? '<span class="chip ok">tuned</span>' : '<span class="chip">untuned</span>') + '</span>' +
      '<span class="m">' + esc(d.material) + ' · ' + d.nozzle.print + '°C / bed ' + Math.min(d.bed.print, d.bedMax) + '°C · ' + d.maxVolumetricSpeed + ' mm³/s</span>' +
    '</div>').join('') : '<p class="empty">No filaments match.</p>';
}

function renderDetail(d) {
  const pa = d.pressureAdvance == null ? 'off' : d.pressureAdvance;
  const bedNote = d.bed.print > d.bedMax ? ' (clamped to ' + d.bedMax + ')' : '';
  const flags = [
    d.hardenedNozzle ? '<span class="chip warn">hardened nozzle</span>' : '',
    d.enclosure === 'required' ? '<span class="chip warn">enclosure</span>' : '',
    d.verified ? '<span class="chip ok">verified</span>' : '<span class="chip">unverified values</span>'
  ].join(' ');
  const tuning = d.tuning.length ? '<h3>Tuning log</h3><table><tr><th>Date</th><th>Head</th><th>Flow</th><th>PA</th><th>MVS</th><th>Notes</th></tr>' +
    d.tuning.map(t => '<tr><td>' + esc(t.date || '') + '</td><td>' + esc(t.toolhead || '') + '</td><td>' + esc(t.flowRatio ?? '') +
      '</td><td>' + esc(t.pressureAdvance ?? '') + '</td><td>' + esc(t.maxVolumetricSpeed ?? '') + '</td><td>' + esc(t.notes || '') + '</td></tr>').join('') +
    '</table>' : '';
  $('detail').innerHTML =
    '<h2>' + esc(d.brand) + ' ' + esc(d.name) + '</h2><div>' + flags + '</div>' +
    '<dl>' +
      '<dt>Material</dt><dd>' + esc(d.material) + '</dd>' +
      '<dt>Nozzle</dt><dd>' + d.nozzle.print + '°C (first layer ' + d.nozzle.firstLayer + '°C, range ' + d.nozzle.min + '–' + d.nozzle.max + ')</dd>' +
      '<dt>Bed</dt><dd>' + d.bed.print + '°C (first layer ' + d.bed.firstLayer + '°C)' + bedNote + '</dd>' +
      '<dt>Fan</dt><dd>' + d.fan.min + '–' + d.fan.max + '%, overhang ' + d.fan.overhang + '%, off for ' + d.fan.offFirstLayers + ' layer(s)</dd>' +
      '<dt>Max flow</dt><dd>' + d.maxVolumetricSpeed + ' mm³/s</dd>' +
      '<dt>Flow ratio</dt><dd>' + d.flowRatio + '</dd>' +
      '<dt>Pressure adv.</dt><dd>' + pa + '</dd>' +
      '<dt>Retraction</dt><dd>' + d.retraction.length + ' mm @ ' + d.retraction.speed + ' mm/s</dd>' +
      '<dt>Density</dt><dd>' + d.density + ' g/cm³</dd>' +
      (d.dry ? '<dt>Drying</dt><dd>' + d.dry.temp + '°C for ' + d.dry.hours + ' h</dd>' : '') +
    '</dl>' +
    (d.notes ? '<p class="note">' + esc(d.notes) + '</p>' : '') +
    '<div class="actions"><button id="dl"' + (EMBEDDED ? ' hidden' : '') + '>Download Snapmaker Orca preset</button>' +
    '<button id="copy" class="' + (EMBEDDED ? '' : 'secondary') + '">Copy preset JSON</button><span id="copied" role="status"></span></div>' + tuning;
  const presetText = JSON.stringify(d.preset, null, 4);
  $('copy').onclick = () => {
    const done = msg => { $('copied').textContent = msg; };
    navigator.clipboard.writeText(presetText)
      .then(() => done('Copied. Save it as "' + d.file + '" and import it in Snapmaker Orca.'))
      .catch(() => done('Copy was blocked here. Use "filadb export" to get the file.'));
  };
  $('dl').onclick = () => {
    const blob = new Blob([JSON.stringify(d.preset, null, 4)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = d.file;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

$('list').addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (!row) return;
  selected = row.dataset.id;
  renderDetail(DATA.find(d => d.id === selected));
  renderList();
});
$('list').addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('row')) { e.preventDefault(); e.target.click(); }
});
['q', 'brand', 'material', 'status'].forEach(id => $(id).addEventListener('input', renderList));
renderList();
</script>
</body>
</html>
`;
}

module.exports = { buildSite };
