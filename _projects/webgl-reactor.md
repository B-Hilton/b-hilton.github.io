---
layout: page
title: WebGL Reactor
description: A WebGL heat-transport benchmark on a 100 by 100 pure-iron grid.
img: assets/img/no_image.png
importance: 5
category: STEM
---

<p>
  Move the cursor over the grid to apply <strong>10 W total</strong> across a
  3×3 spot. Press <kbd>Space</kbd> to play or pause.
</p>

<canvas
  id="webgl-reactor-canvas"
  width="600"
  height="600"
  role="img"
  aria-label="Heat map of a 100 by 100 iron grid. Move the cursor here to heat a 3 by 3 spot."
  style="display: block; width: 100%; max-width: 600px; height: auto; aspect-ratio: 1; border: 1px solid #64748b; box-sizing: border-box; touch-action: none;"
></canvas>

<div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-top: 0.75rem;">
  <button type="button" id="webgl-reactor-toggle" aria-pressed="false">Play</button>
  <span id="webgl-reactor-status" role="status" aria-live="polite">Paused · 0.00 s</span>
</div>

<p id="webgl-reactor-help" style="margin-top: 0.75rem;">
  Grid: 100×100 cells, 1 mm per side. The model treats each cell as a 1 mm-thick
  slice, uses constant near-room-temperature pure-iron properties, and holds
  the outermost cells at 300 K. Colors span 300–380 K; red means 380 K or
  higher.
</p>

<script src="{{ '/assets/js/webgl-reactor.js' | relative_url }}" defer></script>
