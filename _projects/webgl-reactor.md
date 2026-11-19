---
layout: page
title: WebGL Reactor
description: A WebGL heat-transport benchmark on a pure-iron grid.
img: assets/img/no_image.png
importance: 5
category: STEM
---

<p>
  Move the cursor over the grid to apply <strong>10 W total</strong> across a
  fixed 3 mm × 3 mm spot. Press <kbd>Space</kbd> to play or pause.
</p>

<div style="display: flex; align-items: flex-start; gap: 1.25rem; flex-wrap: wrap;">
  <canvas
    id="webgl-reactor-canvas"
    width="600"
    height="600"
    role="img"
    aria-label="Heat map of a pure-iron plate. Move the cursor here to heat a 3 millimeter square spot."
    style="display: block; flex: 1 1 440px; min-width: 0; width: 100%; max-width: 600px; height: auto; aspect-ratio: 1; border: 1px solid #64748b; box-sizing: border-box; touch-action: none;"
  ></canvas>

  <aside style="flex: 0 1 200px; min-width: 170px;">
    <label for="webgl-reactor-grid-size"><strong>Cells per side</strong></label>
    <input
      id="webgl-reactor-grid-size"
      type="number"
      min="3"
      max="256"
      step="1"
      value="100"
      inputmode="numeric"
      style="display: block; width: 100%; margin: 0.4rem 0 0.65rem;"
    >
    <label for="webgl-reactor-neutron-rate"><strong>Neutrons per second</strong></label>
    <input
      id="webgl-reactor-neutron-rate"
      type="number"
      min="0"
      max="1000"
      step="1"
      value="20"
      inputmode="numeric"
      style="display: block; width: 100%; margin: 0.4rem 0 0.65rem;"
    >
    <button type="button" id="webgl-reactor-apply-grid">Apply grid size</button>
    <p id="webgl-reactor-grid-info" style="margin-top: 0.75rem;">
      100 × 100 cells · 1 mm per cell
    </p>
    <button type="button" id="webgl-reactor-toggle" aria-pressed="false">Play</button>
    <p id="webgl-reactor-status" role="status" aria-live="polite">Paused · 0.00 s</p>
  </aside>
</div>

<p id="webgl-reactor-neutron-info" role="status" aria-live="polite">
  Neutrons hidden · 0 active (press N)
</p>

<p id="webgl-reactor-help" style="margin-top: 0.75rem;">
  The plate stays 100 mm × 100 mm and 1 mm thick; changing resolution changes
  cell size, not plate size. The heater remains 3 mm × 3 mm. The outermost
  cells stay at 300 K. Applying a new grid size resets the plate to 300 K and
  pauses the simulation. Set the neutron spawn rate with the input above.
  Neutrons spawn randomly with speeds of 3–12 mm/s, disappear at the edges,
  and each adds 1 W to its current grid cell. Press N to toggle their display
  (maximum 4,095). Colors span 300–380 K; red
  means 380 K or higher.
</p>

<script src="{{ '/assets/js/webgl-reactor.js' | relative_url | bust_file_cache }}" defer></script>
