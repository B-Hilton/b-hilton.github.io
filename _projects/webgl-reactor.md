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
  Neutrons spawn from U235 and Pu-239 cells every fourth physics step.
</p>
<p id="webgl-reactor-engine-status" role="status" aria-live="polite"></p>

<div style="display: grid; grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr); align-items: start; gap: 1.25rem;">
  <canvas
    id="webgl-reactor-canvas"
    data-neutron-xs-grid="{{ '/assets/data/neutron_total_xs_linearized.csv' | relative_url }}"
    width="600"
    height="600"
    role="img"
    aria-label="Material drawing and heat simulation grid for a 10 meter square plate."
    style="display: block; width: 100%; max-width: 600px; height: auto; aspect-ratio: 1; border: 1px solid #64748b; box-sizing: border-box; touch-action: none;"
  ></canvas>

  <div id="webgl-reactor-side-controls" style="display: flex; flex-direction: column; gap: 1rem; min-width: 0;">
    <aside id="webgl-reactor-drawing-controls" style="min-width: 0;">
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
        <option value="5">Pure U235</option>
        <option value="6">Cadmium-113</option>
        <option value="7">Lead-208</option>
        <option value="8">Plutonium-239</option>
        <option value="9">Sodium-23 (dynamic)</option>
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
      <button type="button" id="webgl-reactor-export-grid">Export TXT</button>
      <label for="webgl-reactor-import-grid" style="display: block; margin-top: 0.5rem;"><strong>Upload TXT</strong></label>
      <input
        id="webgl-reactor-import-grid"
        type="file"
        accept=".txt,text/plain"
        aria-describedby="webgl-reactor-grid-file-status"
        style="display: block; width: 100%; margin: 0.35rem 0 0.5rem;"
      >
      <p id="webgl-reactor-grid-file-status" role="status" aria-live="polite"></p>
      <button type="button" id="webgl-reactor-simulate">Simulate</button>
    </aside>

    <aside id="webgl-reactor-simulation-controls" style="min-width: 0;" hidden>
      <label for="webgl-reactor-neutron-rate"><strong>Neutrons/sec</strong></label>
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
      <p id="webgl-reactor-neutron-info">Neutrons: 0 / 4096</p>
      <button type="button" id="webgl-reactor-toggle" aria-pressed="true">Pause</button>
      <p id="webgl-reactor-status" role="status" aria-live="polite">Playing · 0.00 s</p>
      <p id="webgl-reactor-average" role="status" aria-live="polite">Average temperature: —</p>
      <button type="button" id="webgl-reactor-reset">Reset</button>
      <button type="button" id="webgl-reactor-edit" style="display: block; margin-top: 0.5rem;">Back to Drawing</button>
    </aside>

    <aside id="webgl-reactor-flow-controls" style="min-width: 0;">
      <label for="webgl-reactor-flow-direction"><strong>Flow Direction: <output id="webgl-reactor-flow-direction-value">Up</output></strong></label>
      <input id="webgl-reactor-flow-direction" type="range" min="0" max="3" step="1" value="0" aria-valuetext="Up" style="display: block; width: 100%; margin: 0.4rem 0 0.75rem;">
      <label for="webgl-reactor-flow-speed"><strong>Flow Speed: <output id="webgl-reactor-flow-speed-value">0.0 m/s</output></strong></label>
      <input id="webgl-reactor-flow-speed" type="range" min="0" max="4" step="0.1" value="0" style="display: block; width: 100%; margin: 0.4rem 0 0.75rem;">
      <label for="webgl-reactor-heat-transport"><strong>Universal Heat Transport Multiplier</strong></label>
      <input
        id="webgl-reactor-heat-transport"
        type="number"
        min="0"
        max="100"
        step="0.1"
        value="1"
        inputmode="decimal"
        style="display: block; width: 100%; margin: 0.4rem 0 0.75rem;"
      >
      <label for="webgl-reactor-steps-per-frame"><strong>Steps/Frame: <output id="webgl-reactor-steps-per-frame-value">6</output></strong></label>
      <input id="webgl-reactor-steps-per-frame" type="range" min="0" max="100" step="1" value="6" style="display: block; width: 100%; margin: 0.4rem 0 0.5rem;">
      <p style="margin-top: 0.25rem;"><strong>Actual Steps/Frame: <output id="webgl-reactor-actual-steps-per-frame">0</output></strong></p>
      <p id="webgl-reactor-thermal-output">Thermal power output (40% efficient): 0.00 W</p>
    </aside>
  </div>
</div>

<p id="webgl-reactor-help" style="margin-top: 0.75rem;">
  The plate is 10 m × 10 m and 1 mm thick, with a 200 × 200 material grid. It
  starts as vacuum; paint concrete, steel, water, air, U235, Cd-113, Pb-208,
  Pu-239, or Na-23 with a 1–50 cell square brush. Export TXT or upload a
  200 × 200 text grid using one hex digit (0–F) per cell, with the top row
  first; 0 is vacuum. IDs A–F are reserved and currently simulate as insulating
  cells with concrete heat capacity. Concrete, steel, U235, Cd-113, Pb-208, and
  Pu-239 are static; water, air, and Na-23 flow at the selected speed and
  direction. The universal heat transport multiplier scales
  conduction, boundary heat loss, and fluid advection. Steps/Frame sets the
  number of physics steps per display frame, from 0 to 100.
  The Neutrons/sec control accumulates its rate between spawn checks.
  Spawn checks run every fourth physics step and choose random cells containing
  U235 or Pu-239; the live-particle cap is 4,096. Neutron energy is sampled
  uniformly from 1 eV to 10 MeV and sets its velocity. Absorption is sampled
  from the supplied macroscopic cross sections. The compact table uses a 2% adaptive error target and
  logarithmic hash lookup. Absorption deposits a 500 W impulse for one physics
  step; fission is not implemented. Neutrons are not drawn.
  Exported/imported material grids preserve all hexadecimal IDs. New fluid
  entering the grid is 300 K; heat leaving the outlet is shown as thermal power
  at 40% efficiency. Static edge materials exchange heat with 300 K surroundings.
  Steps/Frame controls neutron flight resolution as well as heat updates. Press
  Space to pause or play.
</p>

<script src="{{ '/assets/js/webgl-reactor.js' | relative_url | bust_file_cache }}" defer></script>


