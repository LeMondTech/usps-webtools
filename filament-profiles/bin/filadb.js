#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { toOrcaPreset, fileName } = require('../lib/orca');
const { buildSite } = require('../lib/site');

const HELP = `filadb - Snapmaker U1 filament profile database

Usage: filadb <command> [options]

Commands:
  list [--brand B] [--material M] [--tuned|--untuned]   List profiles
  show <id>                                              Show the resolved settings for one profile
  materials                                              List material types and their defaults
  validate                                               Check every profile against the printer limits
  add --brand B --name N --material M [settings]         Add a filament (material defaults fill the rest)
  tune <id> [--flow X] [--pa X] [--mvs X] [--nozzle T]   Log a calibration result; latest values win
       [--bed T] [--retract MM] [--toolhead T0-T3] [--notes "..."] [--date YYYY-MM-DD]
  export [--out DIR] [--brand B] [--material M] [--id ID] Write Snapmaker Orca filament presets (JSON)
  site [--out FILE]                                      Build a browsable HTML catalog

Settings for add: --nozzle T --nozzle-min T --nozzle-max T --bed T --mvs X --density X
                  --cost PRICE_PER_KG --notes "..." --url URL

Set FILADB_ROOT to use a database directory other than the one next to this script.`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function num(args, key) {
  if (args[key] === undefined) return undefined;
  const n = Number(args[key]);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number, got "${args[key]}"`);
  return n;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length);
}

function filterProfiles(profiles, args) {
  return profiles.filter(p =>
    (!args.brand || p.brand.toLowerCase() === String(args.brand).toLowerCase()) &&
    (!args.material || p.material.toLowerCase() === String(args.material).toLowerCase()) &&
    (!args.id || p.id === args.id) &&
    (!args.tuned || p.tuned) &&
    (!args.untuned || !p.tuned));
}

function cmdList(data, args) {
  const rows = filterProfiles(data.profiles, args);
  console.log(pad('ID', 34) + pad('MATERIAL', 9) + pad('NOZZLE', 8) + pad('BED', 6) + pad('MVS', 6) + pad('FLOW', 6) + pad('PA', 7) + 'TUNED');
  for (const p of rows) {
    console.log(pad(p.id, 34) + pad(p.material, 9) + pad(p.nozzle.print + 'C', 8) + pad(p.bed.print + 'C', 6) +
      pad(p.maxVolumetricSpeed, 6) + pad(p.flowRatio, 6) + pad(p.pressureAdvance === null ? 'off' : p.pressureAdvance, 7) +
      (p.lastTuned || (p.tuned ? 'yes' : '-')));
  }
  console.log(`\n${rows.length} of ${data.profiles.length} profiles`);
}

function cmdShow(data, args) {
  if (!args._[1]) throw new Error('Usage: filadb show <id>');
  const p = db.findProfile(data, args._[1]);
  console.log(JSON.stringify(p, null, 2));
}

function cmdMaterials(data) {
  for (const [name, m] of Object.entries(data.materials)) {
    console.log(`${pad(name, 9)}nozzle ${m.nozzle.min}-${m.nozzle.max} (print ${m.nozzle.print})  bed ${m.bed.print}  mvs ${m.maxVolumetricSpeed}` +
      `${m.hardenedNozzle ? '  [hardened nozzle]' : ''}${m.enclosure === 'required' ? '  [enclosure]' : ''}`);
  }
}

function report(result) {
  result.warnings.forEach(w => console.log(`warning: ${w}`));
  result.errors.forEach(e => console.log(`error:   ${e}`));
}

function cmdValidate(data) {
  const result = db.validate(data);
  report(result);
  console.log(`\n${data.profiles.length} profiles, ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  return result.errors.length ? 1 : 0;
}

function brandFile(data, brand) {
  const existing = data.brands.find(b => b.brand.toLowerCase() === brand.toLowerCase());
  if (existing) return existing;
  return { file: path.join(data.root, 'brands', `${db.slug(brand)}.json`), brand, filaments: [] };
}

function saveBrand(doc) {
  const { file, ...content } = doc;
  db.writeJson(file, content);
}

function cmdAdd(data, args) {
  for (const key of ['brand', 'name', 'material']) {
    if (!args[key] || args[key] === true) throw new Error(`add needs --${key}`);
  }
  const material = Object.keys(data.materials).find(m => m.toLowerCase() === String(args.material).toLowerCase());
  if (!material) throw new Error(`Unknown material "${args.material}". Known: ${Object.keys(data.materials).join(', ')}`);

  const doc = brandFile(data, args.brand);
  const filament = { name: args.name, material };
  const defaults = data.materials[material];
  const nozzle = num(args, 'nozzle');
  const nozzleMin = num(args, 'nozzle-min');
  const nozzleMax = num(args, 'nozzle-max');
  if (nozzle !== undefined || nozzleMin !== undefined || nozzleMax !== undefined) {
    filament.nozzle = {
      min: nozzleMin !== undefined ? nozzleMin : defaults.nozzle.min,
      max: nozzleMax !== undefined ? nozzleMax : defaults.nozzle.max,
      print: nozzle !== undefined ? nozzle : defaults.nozzle.print,
      firstLayer: nozzle !== undefined ? nozzle : defaults.nozzle.firstLayer
    };
  }
  const bed = num(args, 'bed');
  if (bed !== undefined) filament.bed = { print: bed, firstLayer: bed };
  const mvs = num(args, 'mvs');
  if (mvs !== undefined) filament.maxVolumetricSpeed = mvs;
  const density = num(args, 'density');
  if (density !== undefined) filament.density = density;
  const cost = num(args, 'cost');
  if (cost !== undefined) filament.costPerKg = cost;
  if (typeof args.notes === 'string') filament.notes = args.notes;
  if (typeof args.url === 'string') filament.url = args.url;
  filament.verified = false;

  const id = db.profileId(doc.brand, filament);
  if (data.profiles.some(p => p.id === id)) throw new Error(`${id} already exists; use "filadb tune ${id}" to update it`);

  const candidate = { ...data, brands: [...data.brands.filter(b => b !== doc), { ...doc, filaments: [...doc.filaments, filament] }] };
  candidate.profiles = [...data.profiles, db.resolveProfile(doc, filament, data.materials)];
  const { errors } = db.validate(candidate);
  const own = errors.filter(e => e.startsWith(id));
  if (own.length) throw new Error(own.join('\n'));

  doc.filaments.push(filament);
  saveBrand(doc);
  console.log(`Added ${id} to ${path.relative(process.cwd(), doc.file)}`);
}

function cmdTune(data, args) {
  if (!args._[1]) throw new Error('Usage: filadb tune <id> [--flow X] [--pa X] ...');
  const profile = db.findProfile(data, args._[1]);
  const doc = data.brands.find(b => b.brand === profile.brand);
  const filament = doc.filaments.find(f => db.profileId(doc.brand, f) === profile.id);

  const entry = { date: typeof args.date === 'string' ? args.date : new Date().toISOString().slice(0, 10) };
  if (typeof args.toolhead === 'string') entry.toolhead = args.toolhead.toUpperCase();
  const map = {
    flow: 'flowRatio', pa: 'pressureAdvance', mvs: 'maxVolumetricSpeed', nozzle: 'nozzleTemp',
    'nozzle-first': 'firstLayerNozzleTemp', bed: 'bedTemp', 'bed-first': 'firstLayerBedTemp',
    retract: 'retractionLength', 'retract-speed': 'retractionSpeed'
  };
  for (const [flag, field] of Object.entries(map)) {
    const v = num(args, flag);
    if (v !== undefined) entry[field] = v;
  }
  if (typeof args.notes === 'string') entry.notes = args.notes;
  if (Object.keys(entry).every(k => ['date', 'toolhead', 'notes'].includes(k)) && !entry.notes) {
    throw new Error('Nothing to log: pass at least one of --flow --pa --mvs --nozzle --bed --retract or --notes');
  }

  filament.tuning = [...(filament.tuning || []), entry];
  const updated = db.resolveProfile(doc, filament, data.materials);
  const { errors } = db.validate({ ...data, profiles: data.profiles.map(p => p.id === profile.id ? updated : p) });
  const own = errors.filter(e => e.startsWith(profile.id));
  if (own.length) throw new Error(own.join('\n'));

  saveBrand(doc);
  console.log(`Logged tuning for ${profile.id}: ${JSON.stringify(entry)}`);
}

function cmdExport(data, args) {
  const out = path.resolve(typeof args.out === 'string' ? args.out : path.join(data.root, 'dist', 'orca'));
  const { errors } = db.validate(data);
  const broken = new Set(errors.map(e => e.split(':')[0]));
  fs.mkdirSync(out, { recursive: true });
  let count = 0;
  for (const p of filterProfiles(data.profiles, args)) {
    if (broken.has(p.id)) {
      console.log(`skipped ${p.id} (fails validation; run "filadb validate")`);
      continue;
    }
    fs.writeFileSync(path.join(out, fileName(p, data.printer)), JSON.stringify(toOrcaPreset(p, data.printer), null, 4) + '\n');
    count++;
  }
  console.log(`Wrote ${count} preset(s) to ${out}`);
  console.log('Import in Snapmaker Orca: File > Import > Import Configs, then select the .json files.');
}

function cmdSite(data, args) {
  const out = path.resolve(typeof args.out === 'string' ? args.out : path.join(data.root, 'dist', 'index.html'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildSite(data));
  console.log(`Wrote ${out}`);
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || command === 'help' || args.help) {
    console.log(HELP);
    return 0;
  }
  const data = db.load(process.env.FILADB_ROOT || db.DEFAULT_ROOT);
  const commands = {
    list: cmdList, show: cmdShow, materials: cmdMaterials, validate: cmdValidate,
    add: cmdAdd, tune: cmdTune, export: cmdExport, site: cmdSite
  };
  if (!commands[command]) throw new Error(`Unknown command "${command}". Run "filadb help".`);
  return commands[command](data, args) || 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
