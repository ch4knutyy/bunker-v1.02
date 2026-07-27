# Overlay Pack 02 Audit

## Accepted

1. `surface-scratches.png` — universal low-opacity scratch layer.
2. `chips-edge-damage.png` — non-tile edge overlay; use with `background-size: 100% 100%`.
3. `soot-ash.png` — non-tile edge overlay for fire, smoke, ash, and industrial residue.
4. `frost-ice.png` — non-tile edge overlay for cold and cryogenic effects.
5. `biological-contamination.png` — sparse local mold/spore contamination layer.
6. `faded-warning-markings.png` — sparse local industrial warning decoration.

## Rejected / regenerate

- `grime-dust`: looks like pale mineral crust rather than dark grime and dust.
- `oil-smear`: resembles white paint strokes rather than translucent dark oil.
- `corrosion-patina`: resembles pale edge crust and lacks convincing oxidation/pitting.
- `condensation-moisture`: resembles torn white patches and lacks droplets or moisture trails.

## Usage note

Only `surface-scratches` is suitable as a repeating universal layer. The accepted `edge` assets should be stretched once over a panel, not tiled. The `local` assets should be positioned sparsely and must not cover text.
