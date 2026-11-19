---
layout: page
title: WebGL Reactor
description: A 2D WebGL heat simulation with a brush-based material editor.
img: assets/img/no_image.png
importance: 5
category: STEM
---

<p>
  Draw a material layout on the grid, then press <strong>Simulate</strong>.
  During simulation, move the cursor over the grid to apply the 1,000 W heater.
</p>
<p id="webgl-reactor-engine-status" role="status" aria-live="polite"></p>

<div style="display: flex; align-items: flex-start; gap: 1.25rem; flex-wrap: wrap;">
  <canvas
    id="webgl-reactor-canvas"
    width="600"
    height="600"
    role="img"
    aria-label="Material drawing and heat simulation grid for a 10 meter square plate."
    style="display: block; flex: 1 1 440px; min-width: 0; width: 100%; max-width: 600px; height: auto; aspect-ratio: 1; border: 1px solid #64748b; box-sizing: border-box; touch-action: none;"
  ></canvas>

  <aside id="webgl-reactor-drawing-controls" style="flex: 0 1 220px; min-width: 180px;">
    <p id="webgl-reactor-grid-info" style="margin-top: 0.75rem;">
      200 × 200 cells · 50.000 mm per cell
    </p>

    <label for="webgl-reactor-material"><strong>Material</strong></label>
    <select id="webgl-reactor-material" style="display: block; width: 100%; margin: 0.4rem 0 0.75rem;">
      <option value="0">Vacuum (eraser)</option>
      <option value="1" selected>Concrete (~1.4 W/m·K)</option>
      <option value="2">Steel (~54 W/m·K)</option>
      <option value="3">Water (~0.61 W/m·K)</option>
      <option value="4">Air (~0.026 W/m·K)</option>
    </select>

    <label for="webgl-reactor-brush"><strong>Brush Size: <output id="webgl-reactor-brush-value">1 × 1</output></strong></label>
    <input
      id="webgl-reactor-brush"
      type="range"
      min="1"
      max="50"
      step="1"
      value="1"
      style="display: block; width: 100%; margin: 0.4rem 0 0.75rem;"
    >
    <button type="button" id="webgl-reactor-simulate">Simulate</button>
  </aside>

  <aside id="webgl-reactor-simulation-controls" style="flex: 0 1 220px; min-width: 180px;" hidden>
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
    <button type="button" id="webgl-reactor-toggle" aria-pressed="true">Pause</button>
    <p id="webgl-reactor-status" role="status" aria-live="polite">Playing · 0.00 s</p>
    <p id="webgl-reactor-average" role="status" aria-live="polite">Average temperature: —</p>
    <p id="webgl-reactor-neutron-info" role="status" aria-live="polite">Neutrons: 0 / 4095</p>
    <button type="button" id="webgl-reactor-reset">Reset</button>
    <button type="button" id="webgl-reactor-edit" style="display: block; margin-top: 0.5rem;">Back to Drawing</button>
  </aside>
</div>

<p id="webgl-reactor-help" style="margin-top: 0.75rem;">
  The plate is 10 m × 10 m and 1 mm thick. It starts as vacuum; paint concrete,
  steel, water, or air with a 1–50 cell square brush. The material grid stores
  IDs 0–4, and vacuum has no heat capacity or conduction. Heat moves between
  neighboring cells according to their material conductivities. Concrete and
  steel are static materials; water and air are dynamic materials. For now,
  all materials use the same stationary solver, with no fluid motion. Edge cells continue to
  exchange heat with 300 K surroundings at 1.23 × 10⁻¹¹ × (T⁴ − 8.1 × 10⁹) W
  per edge cell. The heater remains 3 mm × 3 mm and 1,000 W. Neutrons each add
  50 W to the material cell they occupy. Press Space to pause or play.
</p>

<script src="{{ '/assets/js/webgl-reactor.js' | relative_url | bust_file_cache }}" defer></script>
