'use strict';

// Converts a resolved profile into an OrcaSlicer-format user filament preset,
// which Snapmaker Orca imports via File > Import > Import Configs.
// User presets store every value as an array of strings, one per extruder.

const s = v => [String(v)];

function presetName(profile, printer) {
  const suffix = printer.slicer && printer.slicer.presetSuffix;
  return [profile.brand, profile.name, suffix].filter(Boolean).join(' ');
}

function fileName(profile, printer) {
  return presetName(profile, printer).replace(/[\\/:*?"<>|]+/g, '-') + '.json';
}

function notes(profile) {
  const lines = [];
  if (profile.notes) lines.push(profile.notes);
  if (profile.sources && profile.sources.length) lines.push('Sources: ' + profile.sources.join(' '));
  if (profile.dry) lines.push(`Dry: ${profile.dry.temp}°C for ${profile.dry.hours}h`);
  if (profile.hardenedNozzle) lines.push('Requires a hardened nozzle.');
  if (profile.enclosure === 'required') lines.push('Print enclosed (U1 top cover).');
  const last = profile.tuning[profile.tuning.length - 1];
  if (last) lines.push(`Last tuned ${last.date || '(undated)'}${last.toolhead ? ' on ' + last.toolhead : ''}${last.notes ? ': ' + last.notes : ''}`);
  else lines.push('Untuned starting point: calibrate flow and pressure advance.');
  return lines.join('\n');
}

function toOrcaPreset(profile, printer) {
  const clampBed = t => Math.min(t, printer.bed.maxTemp);
  const bed = clampBed(profile.bed.print);
  const bed1 = clampBed(profile.bed.firstLayer);
  const pa = profile.pressureAdvance;
  const paOn = profile.pressureAdvanceEnabled && pa !== null && pa !== undefined;
  const name = presetName(profile, printer);
  const inherits = printer.slicer && printer.slicer.inheritOfficialPresets && profile.slicerPreset ? profile.slicerPreset : '';

  return {
    type: 'filament',
    name,
    inherits,
    from: 'User',
    instantiation: 'true',
    filament_settings_id: s(name),
    filament_vendor: s(profile.brand),
    filament_type: s(profile.orcaType || profile.material),
    filament_diameter: s(printer.filamentDiameter || 1.75),
    filament_density: s(profile.density),
    filament_cost: s(profile.costPerKg || 0),
    filament_flow_ratio: s(profile.flowRatio),
    enable_pressure_advance: s(paOn ? 1 : 0),
    pressure_advance: s(pa === null || pa === undefined ? 0 : pa),
    filament_max_volumetric_speed: s(profile.maxVolumetricSpeed),
    nozzle_temperature: s(profile.nozzle.print),
    nozzle_temperature_initial_layer: s(profile.nozzle.firstLayer),
    nozzle_temperature_range_low: s(profile.nozzle.min),
    nozzle_temperature_range_high: s(Math.min(profile.nozzle.max, printer.nozzle.maxTemp)),
    hot_plate_temp: s(bed),
    hot_plate_temp_initial_layer: s(bed1),
    textured_plate_temp: s(bed),
    textured_plate_temp_initial_layer: s(bed1),
    eng_plate_temp: s(bed),
    eng_plate_temp_initial_layer: s(bed1),
    cool_plate_temp: s(bed),
    cool_plate_temp_initial_layer: s(bed1),
    fan_min_speed: s(profile.fan.min),
    fan_max_speed: s(profile.fan.max),
    overhang_fan_speed: s(profile.fan.overhang),
    close_fan_the_first_x_layers: s(profile.fan.offFirstLayers),
    filament_retraction_length: s(profile.retraction.length),
    filament_retraction_speed: s(profile.retraction.speed),
    filament_soluble: s(profile.soluble ? 1 : 0),
    filament_is_support: s(profile.support ? 1 : 0),
    required_nozzle_HRC: s(profile.hardenedNozzle ? 40 : 3),
    filament_notes: s(notes(profile)),
    compatible_printers: (printer.slicer && printer.slicer.compatiblePrinters) || []
  };
}

module.exports = { toOrcaPreset, presetName, fileName };
