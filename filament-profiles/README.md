# Snapmaker U1 filament profiles

A small, file-based database of filament settings for the Snapmaker U1, with
an export to Snapmaker Orca (OrcaSlicer-format) filament presets and a
browsable HTML catalog. Plain JSON files plus a zero-dependency Node CLI.

```sh
cd filament-profiles
node bin/filadb.js list                 # everything in the database
node bin/filadb.js validate             # check against U1 limits (300 °C nozzle, 100 °C bed)
node bin/filadb.js export               # presets -> dist/orca/*.json
node bin/filadb.js site                 # catalog -> dist/index.html
npm test
```

## How the data is organised

| File | What it holds |
| --- | --- |
| `printers/snapmaker-u1.json` | Printer limits used for validation and export (nozzle/bed max temps, toolheads, slicer settings). |
| `materials.json` | Defaults per material type (PLA, PLA-HS, PLA-CF, PETG, PETG-CF, ABS, ASA, TPU, PA, PA-CF, PC, PVA). A material can `extends` another. |
| `brands/<brand>.json` | One file per brand. Each filament only lists what differs from its material defaults. |

A profile's effective settings are built in three layers, each overriding the last:

1. **Material defaults** from `materials.json`
2. **Brand values** from `brands/<brand>.json` (usually the manufacturer's temps)
3. **Your tuning log** on that filament: for each field, the most recent entry by date wins

So you never overwrite the manufacturer baseline. Your calibration history
sits next to it, and you can see how a filament's settings changed over time.

### Filament fields

```jsonc
{
  "name": "PolyTerra PLA",
  "material": "PLA",                       // key in materials.json
  "nozzle": { "min": 190, "max": 230, "print": 210, "firstLayer": 215 },
  "bed": { "print": 55, "firstLayer": 55 },
  "fan": { "min": 100, "max": 100, "overhang": 100, "offFirstLayers": 1 },
  "maxVolumetricSpeed": 18,                // mm³/s
  "flowRatio": 0.98,
  "pressureAdvance": 0.035,                // null disables PA
  "retraction": { "length": 0.8, "speed": 30 },
  "density": 1.31,                         // g/cm³
  "costPerKg": 22,
  "dry": { "temp": 50, "hours": 6 },
  "notes": "…",
  "url": "https://…",                      // TDS / product page
  "verified": false,                       // true once you've checked against the TDS/spool label
  "tuning": [
    { "date": "2026-10-25", "toolhead": "T1", "flowRatio": 0.97, "pressureAdvance": 0.032, "notes": "OrcaSlicer flow + PA tower" }
  ]
}
```

Tuning entries can set `flowRatio`, `pressureAdvance`, `maxVolumetricSpeed`,
`nozzleTemp`, `firstLayerNozzleTemp`, `bedTemp`, `firstLayerBedTemp`,
`retractionLength` and `retractionSpeed`.

## Day-to-day workflow

**Add a new spool type.** Anything you leave out comes from the material defaults:

```sh
node bin/filadb.js add --brand "Kingroon" --name "PLA Silk" --material PLA \
  --nozzle 215 --bed 60 --cost 18 --url https://example.com/tds.pdf
```

**Record a calibration.** After running Snapmaker Orca's flow-rate,
pressure-advance or max-flow calibrations:

```sh
node bin/filadb.js tune kingroon-pla-silk --flow 0.96 --pa 0.032 --mvs 20 --toolhead T2 \
  --notes "PA pattern, 0.2mm layer"
```

IDs can be shortened to any unique fragment, e.g. `tune polyterra --flow 0.97`.

**Load into the slicer.**

```sh
node bin/filadb.js export --brand Polymaker     # or --material PETG, --id …, or nothing for all
```

In Snapmaker Orca choose **File > Import > Import Configs** and pick the
files in `dist/orca/`. Presets are named `<Brand> <Name> @U1`. Re-export and
re-import after you tune: importing a preset with the same name replaces it.

By default the presets don't set `compatible_printers`, so they show up for
every printer. To limit them to the U1, set `slicer.compatiblePrinters` in
`printers/snapmaker-u1.json` to your printer preset's exact name in Snapmaker Orca.

**Browse.** Run `node bin/filadb.js site` and open `dist/index.html`. You can
filter by brand, material or tuned status, and each filament has a button to
download its preset.

## Validation

`validate` (also run by `add`, `tune` and `export`) reports:

- **Errors** (blocks export): print or first-layer nozzle temperature above the
  U1's 300 °C, a missing or unknown material, a flow ratio outside 0.8–1.2,
  duplicate IDs.
- **Warnings**: bed temperature above 100 °C (export clamps it to 100 °C), a
  print temperature outside the filament's rated range, abrasive filaments
  that need a hardened nozzle, and materials that need the top cover.

## About the seed data

The brand files start you off with common filaments from Snapmaker, Polymaker,
Bambu Lab, eSUN, Elegoo, SUNLU, Overture, Prusament and HATCHBOX. Temperatures
follow typical manufacturer recommendations. Flow, pressure advance and max
volumetric speed are conservative generic starting points, not measured on a
U1. Every entry is marked `"verified": false`. Before you rely on one, check it
against the spool label or TDS, then calibrate it and log the result with `tune`.

U1 limits come from Snapmaker's [spec page](https://www.snapmaker.com/snapmaker-u1/specs).
