---
layout: page
title: WebGL Reactor
description: A browser-based 2D reactor simulation.
img: assets/img/no_image.png
importance: 5
category: STEM
---

<p>Press <kbd>R</kbd> to change the box color.</p>

<div
  id="webgl-reactor-test-box"
  role="img"
  aria-label="Interactive test box. Press R to change its color."
  aria-keyshortcuts="R"
  data-active="false"
  style="width: 100%; max-width: 720px; aspect-ratio: 16 / 9; min-height: 240px; margin: 1rem auto; border: 1px solid #6b7280; border-radius: 0.5rem; background-color: #202a36; transition: background-color 160ms ease;"
></div>

<script>
  document.addEventListener("keydown", (event) => {
    if (
      event.key.toLowerCase() !== "r" ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    const box = document.getElementById("webgl-reactor-test-box");
    if (!box) return;

    const active = box.dataset.active !== "true";
    box.dataset.active = String(active);
    box.style.backgroundColor = active ? "#168aad" : "#202a36";
  });
</script>
