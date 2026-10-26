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
| `materials.json` | Defaults per material type (PLA, PLA-HS, PLA-Silk, PLA-CF, PETG, PETG-HF, PETG-CF, PETG-GF, PCTG, ABS, ASA, TPU, TPU-HF, PA, PA-CF, PC, PVA, BVOH), taken from Snapmaker's official U1 presets. A material can `extends` another. |
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

Presets are set to `Snapmaker U1 (0.4 nozzle)`, Snapmaker Orca's U1 printer preset. If you use a different nozzle size, change `slicer.compatiblePrinters` in `printers/snapmaker-u1.json`.

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

## Where the data comes from

| Data | Source | Status |
| --- | --- | --- |
| Material defaults (`materials.json`) | Snapmaker's official U1 Generic presets (0.4 nozzle) in [Snapmaker/OrcaSlicer](https://github.com/Snapmaker/OrcaSlicer/tree/main/resources/profiles/Snapmaker/filament): temperatures, fan, flow ratio, pressure advance, max volumetric speed, retraction, density. | Read from the preset files. Drying, enclosure and hardened-nozzle flags are general guidance. |
| Snapmaker filaments (`brands/snapmaker.json`) | Snapmaker's official U1 presets for its own filaments; each entry links its preset file. | `verified: true` |
| Other brands | Manufacturer product pages and TDS PDFs, linked in each entry's `sources`. | `verified: false`. These sites were unreachable from the environment that built this, so values came from search-engine excerpts of those official pages. Check them against the spool label or TDS. |
| U1 limits (`printers/snapmaker-u1.json`) | Snapmaker's [spec page](https://www.snapmaker.com/snapmaker-u1/specs) and the official U1 machine preset (printer preset name, 1.5 mm @ 30 mm/s retraction). | |

How brand entries are filled in:

- The nozzle range comes from the manufacturer.
- The print temperature is the manufacturer's recommendation if they give one. Otherwise it's Snapmaker's U1 default for that material, kept inside the manufacturer's range.
- Bed temperature works the same way. Where a brand gives plate-specific ranges, the textured PEI range is used, since that's the U1's plate.
- Flow, pressure advance and max volumetric speed use Snapmaker's U1 defaults unless the manufacturer states a value. Calibrate them on your printer and log the results with `tune`.

Exported presets inherit the matching official Snapmaker preset (`slicerPreset`), so Snapmaker's other settings carry over. To export standalone presets instead, set `slicer.inheritOfficialPresets` to `false` in `printers/snapmaker-u1.json`.

To refresh the Snapmaker data when Snapmaker updates its presets, re-read the preset files under `resources/profiles/Snapmaker/filament/` (names containing `@U1`, or compatible with `Snapmaker U1 (0.4 nozzle)`). Follow each file's `inherits` chain to get its full values.

Product changes found during research:

- **Polymaker:** PolyTerra PLA is now sold as Panchroma Matte PLA. PolyLite PETG is being replaced by the new Polymaker PETG, which has its own entry. PolyLite ASA is now Polymaker ASA.
- **Bambu Lab:** PETG HF is discontinued.
- **Overture:** the main PETG product is now High Speed PETG.
