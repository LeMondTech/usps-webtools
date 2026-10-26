'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../lib/db');
const { toOrcaPreset, fileName } = require('../lib/orca');
const { buildSite } = require('../lib/site');
const { main } = require('../bin/filadb');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filadb-'));
  fs.cpSync(path.join(db.DEFAULT_ROOT, 'printers'), path.join(dir, 'printers'), { recursive: true });
  fs.cpSync(path.join(db.DEFAULT_ROOT, 'brands'), path.join(dir, 'brands'), { recursive: true });
  fs.copyFileSync(path.join(db.DEFAULT_ROOT, 'materials.json'), path.join(dir, 'materials.json'));
  return dir;
}

function run(root, ...argv) {
  const prev = process.env.FILADB_ROOT;
  const log = console.log;
  process.env.FILADB_ROOT = root;
  console.log = () => {};
  try {
    return main(argv);
  } finally {
    console.log = log;
    if (prev === undefined) delete process.env.FILADB_ROOT;
    else process.env.FILADB_ROOT = prev;
  }
}

test('the shipped database validates with no errors', () => {
  const data = db.load();
  assert.ok(data.profiles.length > 0);
  assert.deepEqual(db.validate(data).errors, []);
});

test('materials support extends and skip _ metadata keys', () => {
  const materials = db.resolveMaterials({
    _about: 'ignored',
    ABS: { nozzle: { min: 240, max: 280, print: 270, firstLayer: 270 }, enclosure: 'required' },
    ASA: { extends: 'ABS', nozzle: { print: 260 } }
  });
  assert.deepEqual(Object.keys(materials), ['ABS', 'ASA']);
  assert.equal(materials.ASA.enclosure, 'required');
  assert.equal(materials.ASA.nozzle.print, 260);
  assert.equal(materials.ASA.nozzle.max, 280);
});

test('every material maps to an official Snapmaker U1 preset', () => {
  for (const [name, m] of Object.entries(db.load().materials)) {
    assert.ok(m.slicerPreset, `${name} has no slicerPreset`);
  }
});

test('brand values override material defaults and keep the rest', () => {
  const p = db.findProfile(db.load(), 'polymaker-polyterra-pla');
  assert.equal(p.nozzle.print, 210);
  assert.equal(p.density, 1.31);
  assert.equal(p.flowRatio, 0.98);
  assert.equal(p.tuned, false);
});

test('the latest tuning entry wins regardless of order in the file', () => {
  const { materials } = db.load();
  const p = db.resolveProfile({ brand: 'Test' }, {
    name: 'PLA', material: 'PLA',
    tuning: [
      { date: '2026-03-01', flowRatio: 0.95, pressureAdvance: 0.03 },
      { date: '2026-01-01', flowRatio: 1.01, nozzleTemp: 205 }
    ]
  }, materials);
  assert.equal(p.flowRatio, 0.95);
  assert.equal(p.pressureAdvance, 0.03);
  assert.equal(p.nozzle.print, 205);
  assert.equal(p.lastTuned, '2026-03-01');
});

test('validation catches temps beyond the printer limits', () => {
  const data = db.load();
  const { materials } = data;
  const hot = db.resolveProfile({ brand: 'Test' }, { name: 'Hot PC', material: 'PC', nozzle: { min: 280, max: 320, print: 310, firstLayer: 310 } }, materials);
  const result = db.validate({ ...data, brands: [], profiles: [hot] });
  assert.ok(result.errors.some(e => e.includes('nozzle.print 310°C exceeds')));
});

test('Orca export clamps bed temperature and uses string arrays', () => {
  const data = db.load();
  const p = db.findProfile(data, 'prusament-asa');
  const preset = toOrcaPreset(p, data.printer);
  assert.equal(preset.type, 'filament');
  assert.equal(preset.name, 'Prusament ASA @U1');
  assert.deepEqual(preset.textured_plate_temp, ['100']);
  assert.deepEqual(preset.nozzle_temperature, ['260']);
  assert.deepEqual(preset.filament_type, ['ASA']);
  assert.equal(fileName(p, data.printer), 'Prusament ASA @U1.json');
});

test('pressure advance follows the enabled flag, and a tuned PA value turns it on', () => {
  const data = db.load();
  const { materials, printer } = data;
  const off = db.resolveProfile({ brand: 'Test' }, { name: 'PLA', material: 'PLA', pressureAdvanceEnabled: false }, materials);
  assert.deepEqual(toOrcaPreset(off, printer).enable_pressure_advance, ['0']);
  const tuned = db.resolveProfile({ brand: 'Test' }, { name: 'PLA', material: 'PLA', pressureAdvanceEnabled: false, tuning: [{ date: '2026-10-01', pressureAdvance: 0.03 }] }, materials);
  const preset = toOrcaPreset(tuned, printer);
  assert.deepEqual(preset.enable_pressure_advance, ['1']);
  assert.deepEqual(preset.pressure_advance, ['0.03']);
});

test('exported presets inherit the official preset and target the U1', () => {
  const data = db.load();
  const preset = toOrcaPreset(db.findProfile(data, 'snapmaker-pla-basic'), data.printer);
  assert.equal(preset.inherits, 'Snapmaker PLA Basic @U1');
  assert.deepEqual(preset.compatible_printers, ['Snapmaker U1 (0.4 nozzle)']);
  const generic = toOrcaPreset(db.findProfile(data, 'hatchbox-pla'), data.printer);
  assert.equal(generic.inherits, 'Generic PLA');
});

test('add then tune round-trips through the brand files', () => {
  const root = tempDb();
  run(root, 'add', '--brand', 'Kingroon', '--name', 'PLA Silk', '--material', 'pla', '--nozzle', '215', '--cost', '18');
  let p = db.findProfile(db.load(root), 'kingroon-pla-silk');
  assert.equal(p.nozzle.print, 215);
  assert.equal(p.costPerKg, 18);
  assert.ok(fs.existsSync(path.join(root, 'brands', 'kingroon.json')));

  run(root, 'tune', 'kingroon-pla-silk', '--flow', '0.96', '--pa', '0.032', '--toolhead', 't2', '--date', '2026-10-01');
  p = db.findProfile(db.load(root), 'kingroon-pla-silk');
  assert.equal(p.flowRatio, 0.96);
  assert.equal(p.pressureAdvance, 0.032);
  assert.equal(p.tuning[0].toolhead, 'T2');

  assert.throws(() => run(root, 'add', '--brand', 'Kingroon', '--name', 'PLA Silk', '--material', 'PLA'), /already exists/);
  assert.throws(() => run(root, 'tune', 'kingroon-pla-silk', '--flow', '2'), /flowRatio/);
});

test('export writes one preset per valid profile', () => {
  const root = tempDb();
  const out = path.join(root, 'out');
  run(root, 'export', '--out', out, '--brand', 'Polymaker');
  const files = fs.readdirSync(out);
  assert.equal(files.length, db.load(root).profiles.filter(p => p.brand === 'Polymaker').length);
  assert.ok(files.includes('Polymaker PolyTerra PLA @U1.json'));
});

test('the site embeds every profile', () => {
  const data = db.load();
  const html = buildSite(data);
  assert.match(html, /<title>U1 Filament Profiles<\/title>/);
  for (const p of data.profiles) assert.ok(html.includes(JSON.stringify(p.id)));
});
