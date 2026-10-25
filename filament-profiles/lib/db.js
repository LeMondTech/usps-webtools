'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

// Tuning-log fields and the profile field each one overrides.
const TUNING_FIELDS = {
  flowRatio: ['flowRatio'],
  pressureAdvance: ['pressureAdvance'],
  maxVolumetricSpeed: ['maxVolumetricSpeed'],
  nozzleTemp: ['nozzle', 'print'],
  firstLayerNozzleTemp: ['nozzle', 'firstLayer'],
  bedTemp: ['bed', 'print'],
  firstLayerBedTemp: ['bed', 'firstLayer'],
  retractionLength: ['retraction', 'length'],
  retractionSpeed: ['retraction', 'speed']
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read ${file}: ${err.message}`);
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(...sources) {
  const out = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [key, val] of Object.entries(src)) {
      out[key] = isPlainObject(val) && isPlainObject(out[key]) ? deepMerge(out[key], val) : val;
    }
  }
  return out;
}

function setPath(obj, keys, value) {
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

// Resolve `extends` chains so every material carries a full set of defaults.
function resolveMaterials(raw) {
  const resolved = {};
  const visit = (name, seen = []) => {
    if (resolved[name]) return resolved[name];
    const mat = raw[name];
    if (!mat) throw new Error(`Unknown material "${name}"`);
    if (seen.includes(name)) throw new Error(`Circular material extends: ${[...seen, name].join(' -> ')}`);
    const { extends: parent, ...own } = mat;
    resolved[name] = parent ? deepMerge(visit(parent, [...seen, name]), own) : own;
    return resolved[name];
  };
  Object.keys(raw).forEach(name => visit(name));
  return resolved;
}

function brandFiles(root) {
  const dir = path.join(root, 'brands');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => path.join(dir, f));
}

function profileId(brand, filament) {
  return filament.id || `${slug(brand)}-${slug(filament.name)}`;
}

// The latest tuning entry wins for each field it sets; older entries fill gaps.
function applyTuning(profile, tuning) {
  const sorted = [...(tuning || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const out = deepMerge(profile);
  for (const entry of sorted) {
    for (const [field, target] of Object.entries(TUNING_FIELDS)) {
      if (entry[field] !== undefined && entry[field] !== null) setPath(out, target, entry[field]);
    }
  }
  return out;
}

function resolveProfile(brandDoc, filament, materials) {
  const defaults = materials[filament.material] || {};
  const { tuning, ...own } = filament;
  const base = deepMerge(defaults, own);
  const profile = applyTuning(base, tuning);
  profile.id = profileId(brandDoc.brand, filament);
  profile.brand = brandDoc.brand;
  profile.tuning = tuning || [];
  profile.tuned = profile.tuning.length > 0;
  profile.lastTuned = profile.tuning.map(t => t.date).filter(Boolean).sort().pop() || null;
  return profile;
}

function load(root = DEFAULT_ROOT, printerId = 'snapmaker-u1') {
  const printer = readJson(path.join(root, 'printers', `${printerId}.json`));
  const rawMaterials = readJson(path.join(root, 'materials.json'));
  const materials = resolveMaterials(rawMaterials);
  const brands = brandFiles(root).map(file => ({ file, ...readJson(file) }));
  const profiles = [];
  for (const brandDoc of brands) {
    for (const filament of brandDoc.filaments || []) {
      profiles.push(resolveProfile(brandDoc, filament, materials));
    }
  }
  return { root, printer, materials, brands, profiles };
}

function validate(db) {
  const errors = [];
  const warnings = [];
  const { printer, materials, brands, profiles } = db;
  const seen = new Map();

  for (const brandDoc of brands) {
    if (!brandDoc.brand) errors.push(`${path.basename(brandDoc.file)}: missing "brand"`);
    if (!Array.isArray(brandDoc.filaments)) errors.push(`${path.basename(brandDoc.file)}: "filaments" must be an array`);
    for (const f of brandDoc.filaments || []) {
      const where = `${brandDoc.brand} ${f.name || '(unnamed)'}`;
      if (!f.name) errors.push(`${where}: missing "name"`);
      if (!f.material) errors.push(`${where}: missing "material"`);
      else if (!materials[f.material]) errors.push(`${where}: unknown material "${f.material}" (known: ${Object.keys(materials).join(', ')})`);
    }
  }

  for (const p of profiles) {
    const where = p.id;
    if (seen.has(p.id)) errors.push(`${where}: duplicate id (also in ${seen.get(p.id)})`);
    seen.set(p.id, p.brand);

    const n = p.nozzle || {};
    for (const key of ['min', 'max', 'print', 'firstLayer']) {
      if (typeof n[key] !== 'number') errors.push(`${where}: nozzle.${key} must be a number`);
    }
    if (n.min > n.max) errors.push(`${where}: nozzle.min (${n.min}) is above nozzle.max (${n.max})`);
    if (n.print < n.min || n.print > n.max) warnings.push(`${where}: nozzle.print ${n.print}°C is outside the ${n.min}-${n.max}°C range`);
    for (const key of ['print', 'firstLayer']) {
      if (n[key] > printer.nozzle.maxTemp) errors.push(`${where}: nozzle.${key} ${n[key]}°C exceeds ${printer.name} max ${printer.nozzle.maxTemp}°C`);
    }
    if (n.max > printer.nozzle.maxTemp) warnings.push(`${where}: rated up to ${n.max}°C but ${printer.name} tops out at ${printer.nozzle.maxTemp}°C`);

    const b = p.bed || {};
    for (const key of ['print', 'firstLayer']) {
      if (typeof b[key] !== 'number') errors.push(`${where}: bed.${key} must be a number`);
      else if (b[key] > printer.bed.maxTemp) warnings.push(`${where}: bed.${key} ${b[key]}°C exceeds ${printer.name} max ${printer.bed.maxTemp}°C; export clamps to ${printer.bed.maxTemp}°C`);
    }

    if (typeof p.flowRatio !== 'number' || p.flowRatio < 0.8 || p.flowRatio > 1.2) errors.push(`${where}: flowRatio ${p.flowRatio} should be between 0.8 and 1.2`);
    if (p.pressureAdvance !== null && p.pressureAdvance !== undefined && (typeof p.pressureAdvance !== 'number' || p.pressureAdvance < 0 || p.pressureAdvance > 1)) {
      errors.push(`${where}: pressureAdvance ${p.pressureAdvance} should be between 0 and 1 (or null to disable)`);
    }
    if (typeof p.maxVolumetricSpeed !== 'number' || p.maxVolumetricSpeed <= 0) errors.push(`${where}: maxVolumetricSpeed must be a positive number`);
    if (typeof p.density !== 'number' || p.density <= 0) errors.push(`${where}: density must be a positive number`);

    if (p.hardenedNozzle && !/hardened/i.test(printer.nozzle.material)) {
      warnings.push(`${where}: abrasive filament; fit a hardened nozzle before printing`);
    }
    if (p.enclosure === 'required' && !printer.enclosure) {
      warnings.push(`${where}: enclosure recommended; fit the U1 top cover to reduce warping`);
    }
  }

  return { errors, warnings };
}

function findProfile(db, id) {
  const exact = db.profiles.find(p => p.id === id);
  if (exact) return exact;
  const matches = db.profiles.filter(p => p.id.includes(slug(id)));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`"${id}" matches several profiles: ${matches.map(p => p.id).join(', ')}`);
  throw new Error(`No profile matches "${id}"`);
}

module.exports = {
  DEFAULT_ROOT,
  TUNING_FIELDS,
  readJson,
  writeJson,
  slug,
  deepMerge,
  resolveMaterials,
  resolveProfile,
  profileId,
  load,
  validate,
  findProfile
};
