(() => {
  "use strict";

  const PLATE_SIZE = 0.1;
  const PLATE_THICKNESS = 0.001;
  const HEATER_SIZE = 0.003;
  const HEATER_HALF_SIZE = HEATER_SIZE / 2;
  const POWER_WATTS = 10;
  const DENSITY = 7870;
  const SPECIFIC_HEAT = 456;
  const CONDUCTIVITY = 80.2;
  const DIFFUSIVITY = CONDUCTIVITY / (DENSITY * SPECIFIC_HEAT);
  const DIFFUSION_NUMBER = 0.20;
  const MIN_GRID_SIZE = 3;
  const MAX_GRID_SIZE = 256;
  const MAX_STEPS_PER_FRAME = 64;

  const canvas = document.getElementById("webgl-reactor-canvas");
  const toggleButton = document.getElementById("webgl-reactor-toggle");
  const status = document.getElementById("webgl-reactor-status");
  const gridInput = document.getElementById("webgl-reactor-grid-size");
  const applyGridButton = document.getElementById("webgl-reactor-apply-grid");
  const gridInfo = document.getElementById("webgl-reactor-grid-info");
  if (
    !canvas ||
    !toggleButton ||
    !status ||
    !gridInput ||
    !applyGridButton ||
    !gridInfo
  ) {
    return;
  }

  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    status.textContent = "WebGL 2 is unavailable in this browser.";
    toggleButton.disabled = true;
    applyGridButton.disabled = true;
    return;
  }

  if (!gl.getExtension("EXT_color_buffer_float")) {
    status.textContent =
      "This browser does not support the floating-point render target required for the heat grid.";
    toggleButton.disabled = true;
    applyGridButton.disabled = true;
    return;
  }

  const vertexSource = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const heatSource = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_previous;
uniform int u_gridSize;
uniform float u_cellEdge;
uniform float u_diffusionStep;
uniform float u_heatingScale;
uniform float u_heaterArea;
uniform vec2 u_heaterCenter;
uniform int u_heaterEnabled;

layout(location = 0) out float nextTemperature;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);

  if (
    cell.x == 0 || cell.y == 0 ||
    cell.x == u_gridSize - 1 || cell.y == u_gridSize - 1
  ) {
    nextTemperature = 300.0;
    return;
  }

  float center = texelFetch(u_previous, cell, 0).r;
  float neighbors =
    texelFetch(u_previous, cell + ivec2(-1, 0), 0).r +
    texelFetch(u_previous, cell + ivec2( 1, 0), 0).r +
    texelFetch(u_previous, cell + ivec2( 0,-1), 0).r +
    texelFetch(u_previous, cell + ivec2( 0, 1), 0).r;

  float temperature = center + u_diffusionStep * (neighbors - 4.0 * center);

  if (u_heaterEnabled == 1 && u_heaterArea > 0.0) {
    vec2 cellMin = vec2(cell) * u_cellEdge;
    vec2 cellMax = cellMin + vec2(u_cellEdge);
    vec2 spotMin = u_heaterCenter - vec2(0.0015);
    vec2 spotMax = u_heaterCenter + vec2(0.0015);
    vec2 overlap = max(
      vec2(0.0),
      min(cellMax, spotMax) - max(cellMin, spotMin)
    );
    float overlapArea = overlap.x * overlap.y;
    temperature += u_heatingScale * overlapArea;
  }

  nextTemperature = temperature;
}`;

  const displaySource = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_temperature;
uniform vec2 u_canvasSize;
uniform int u_gridSize;
uniform float u_cellEdge;
uniform float u_heaterArea;
uniform vec2 u_heaterCenter;
uniform int u_heaterEnabled;

out vec4 color;

vec3 heatColor(float temperature) {
  float value = clamp((temperature - 300.0) / 80.0, 0.0, 1.0);

  if (value < 0.25) {
    return mix(vec3(0.015, 0.07, 0.30), vec3(0.00, 0.78, 1.00), value * 4.0);
  }
  if (value < 0.50) {
    return mix(vec3(0.00, 0.78, 1.00), vec3(0.18, 0.88, 0.24), (value - 0.25) * 4.0);
  }
  if (value < 0.75) {
    return mix(vec3(0.18, 0.88, 0.24), vec3(1.00, 0.86, 0.02), (value - 0.50) * 4.0);
  }
  return mix(vec3(1.00, 0.86, 0.02), vec3(0.95, 0.05, 0.01), (value - 0.75) * 4.0);
}

void main() {
  ivec2 cell = ivec2(
    floor(gl_FragCoord.xy / u_canvasSize * float(u_gridSize))
  );
  cell = clamp(cell, ivec2(0), ivec2(u_gridSize - 1));

  float temperature = texelFetch(u_temperature, cell, 0).r;
  vec3 displayColor = heatColor(temperature);

  if (u_heaterEnabled == 1 && u_heaterArea > 0.0) {
    vec2 cellMin = vec2(cell) * u_cellEdge;
    vec2 cellMax = cellMin + vec2(u_cellEdge);
    vec2 spotMin = u_heaterCenter - vec2(0.0015);
    vec2 spotMax = u_heaterCenter + vec2(0.0015);
    vec2 overlap = max(
      vec2(0.0),
      min(cellMax, spotMax) - max(cellMin, spotMin)
    );

    if (overlap.x > 0.0 && overlap.y > 0.0) {
      displayColor = mix(displayColor, vec3(1.0, 0.78, 0.12), 0.30);
    }
  }

  vec2 cellPixels = u_canvasSize / float(u_gridSize);
  vec2 withinCellPixels = fract(gl_FragCoord.xy / cellPixels) * cellPixels;
  vec2 distanceToCellEdge = min(withinCellPixels, cellPixels - withinCellPixels);
  if (min(distanceToCellEdge.x, distanceToCellEdge.y) < 0.60) {
    displayColor *= 0.62;
  }

  color = vec4(displayColor, 1.0);
}`;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
      gl.deleteShader(shader);
      throw new Error(message);
    }

    return shader;
  }

  function createProgram(fragmentSource) {
    const program = gl.createProgram();
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Unknown program error";
      gl.deleteProgram(program);
      throw new Error(message);
    }

    return program;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  let heatProgram;
  let displayProgram;
  let targets = [];
  let gridSize = 100;
  let cellEdge = PLATE_SIZE / gridSize;
  let stepSeconds = 0;
  let diffusionStep = 0;
  let heatingScale = 0;

  let playing = false;
  let simulationTime = 0;
  let accumulator = 0;
  let lastTimestamp = null;
  let animationFrame = null;
  let currentTarget = 0;
  let heaterEnabled = false;
  let heaterX = PLATE_SIZE / 2;
  let heaterY = PLATE_SIZE / 2;
  let heaterArea = HEATER_SIZE * HEATER_SIZE;

  function updateGridPhysics(size) {
    gridSize = size;
    cellEdge = PLATE_SIZE / gridSize;
    stepSeconds =
      DIFFUSION_NUMBER * cellEdge * cellEdge / DIFFUSIVITY;
    diffusionStep =
      DIFFUSIVITY * stepSeconds / (cellEdge * cellEdge);
    updateHeaterGeometry();
  }

  function updateHeaterGeometry() {
    const minX = Math.max(0, heaterX - HEATER_HALF_SIZE);
    const maxX = Math.min(PLATE_SIZE, heaterX + HEATER_HALF_SIZE);
    const minY = Math.max(0, heaterY - HEATER_HALF_SIZE);
    const maxY = Math.min(PLATE_SIZE, heaterY + HEATER_HALF_SIZE);
    heaterArea = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);

    if (heaterArea > 0) {
      const cellVolume = cellEdge * cellEdge * PLATE_THICKNESS;
      heatingScale =
        POWER_WATTS * stepSeconds /
        (DENSITY * SPECIFIC_HEAT * cellVolume * heaterArea);
    } else {
      heatingScale = 0;
    }
  }

  function createTargets(size) {
    const initialTemperatures = new Float32Array(size * size);
    initialTemperatures.fill(300.0);
    const created = [];

    try {
      for (let i = 0; i < 2; i++) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R32F,
          size,
          size,
          0,
          gl.RED,
          gl.FLOAT,
          initialTemperatures
        );

        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0
        );

        const target = { texture, framebuffer };
        created.push(target);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error("Could not create the floating-point heat grid.");
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return created;
    } catch (error) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      disposeTargets(created);
      throw error;
    }
  }

  function disposeTargets(items) {
    for (const target of items) {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    }
  }

  try {
    heatProgram = createProgram(heatSource);
    displayProgram = createProgram(displaySource);
    targets = createTargets(gridSize);
  } catch (error) {
    status.textContent = `WebGL setup failed: ${error.message}`;
    toggleButton.disabled = true;
    applyGridButton.disabled = true;
    return;
  }

  const heatUniforms = {
    previous: gl.getUniformLocation(heatProgram, "u_previous"),
    gridSize: gl.getUniformLocation(heatProgram, "u_gridSize"),
    cellEdge: gl.getUniformLocation(heatProgram, "u_cellEdge"),
    diffusionStep: gl.getUniformLocation(heatProgram, "u_diffusionStep"),
    heatingScale: gl.getUniformLocation(heatProgram, "u_heatingScale"),
    heaterArea: gl.getUniformLocation(heatProgram, "u_heaterArea"),
    heaterCenter: gl.getUniformLocation(heatProgram, "u_heaterCenter"),
    heaterEnabled: gl.getUniformLocation(heatProgram, "u_heaterEnabled"),
  };

  const displayUniforms = {
    temperature: gl.getUniformLocation(displayProgram, "u_temperature"),
    canvasSize: gl.getUniformLocation(displayProgram, "u_canvasSize"),
    gridSize: gl.getUniformLocation(displayProgram, "u_gridSize"),
    cellEdge: gl.getUniformLocation(displayProgram, "u_cellEdge"),
    heaterArea: gl.getUniformLocation(displayProgram, "u_heaterArea"),
    heaterCenter: gl.getUniformLocation(displayProgram, "u_heaterCenter"),
    heaterEnabled: gl.getUniformLocation(displayProgram, "u_heaterEnabled"),
  };

  function drawTemperature() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1 - currentTarget].framebuffer);
    gl.viewport(0, 0, gridSize, gridSize);
    gl.useProgram(heatProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].texture);
    gl.uniform1i(heatUniforms.previous, 0);
    gl.uniform1i(heatUniforms.gridSize, gridSize);
    gl.uniform1f(heatUniforms.cellEdge, cellEdge);
    gl.uniform1f(heatUniforms.diffusionStep, diffusionStep);
    gl.uniform1f(heatUniforms.heatingScale, heatingScale);
    gl.uniform1f(heatUniforms.heaterArea, heaterArea);
    gl.uniform2f(heatUniforms.heaterCenter, heaterX, heaterY);
    gl.uniform1i(heatUniforms.heaterEnabled, heaterEnabled ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    currentTarget = 1 - currentTarget;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function drawCanvas() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].texture);
    gl.uniform1i(displayUniforms.temperature, 0);
    gl.uniform2f(displayUniforms.canvasSize, canvas.width, canvas.height);
    gl.uniform1i(displayUniforms.gridSize, gridSize);
    gl.uniform1f(displayUniforms.cellEdge, cellEdge);
    gl.uniform1f(displayUniforms.heaterArea, heaterArea);
    gl.uniform2f(displayUniforms.heaterCenter, heaterX, heaterY);
    gl.uniform1i(displayUniforms.heaterEnabled, heaterEnabled ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function updateGridInfo() {
    gridInfo.textContent =
      `${gridSize} × ${gridSize} cells · ${(cellEdge * 1000).toFixed(3)} mm per cell`;
  }

  function render() {
    drawCanvas();
    status.textContent =
      `${playing ? "Playing" : "Paused"} · ${simulationTime.toFixed(2)} s`;
  }

  function tick(timestamp) {
    animationFrame = null;

    if (playing) {
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const elapsed = Math.min(timestamp - lastTimestamp, 100) / 1000;
      lastTimestamp = timestamp;
      accumulator += elapsed;

      let steps = 0;
      while (
        accumulator >= stepSeconds &&
        steps < MAX_STEPS_PER_FRAME
      ) {
        drawTemperature();
        simulationTime += stepSeconds;
        accumulator -= stepSeconds;
        steps += 1;
      }
    }

    render();
    if (playing) animationFrame = requestAnimationFrame(tick);
  }

  function scheduleFrame() {
    if (animationFrame === null) {
      animationFrame = requestAnimationFrame(tick);
    }
  }

  function setPlaying(nextPlaying) {
    playing = nextPlaying;
    accumulator = 0;
    lastTimestamp = null;
    toggleButton.textContent = playing ? "Pause" : "Play";
    toggleButton.setAttribute("aria-pressed", String(playing));
    render();

    if (playing) scheduleFrame();
  }

  function applyGridSize() {
    const requestedSize = Number(gridInput.value);

    if (
      !Number.isInteger(requestedSize) ||
      requestedSize < MIN_GRID_SIZE ||
      requestedSize > MAX_GRID_SIZE
    ) {
      gridInput.setAttribute("aria-invalid", "true");
      status.textContent =
        `Enter a whole number from ${MIN_GRID_SIZE} to ${MAX_GRID_SIZE}.`;
      return;
    }

    gridInput.removeAttribute("aria-invalid");
    if (requestedSize === gridSize) return;

    let nextTargets;
    try {
      nextTargets = createTargets(requestedSize);
    } catch (error) {
      status.textContent = `Could not create that grid: ${error.message}`;
      return;
    }

    setPlaying(false);
    disposeTargets(targets);
    targets = nextTargets;
    currentTarget = 0;
    simulationTime = 0;
    accumulator = 0;
    updateGridPhysics(requestedSize);
    updateGridInfo();
    render();
  }

  toggleButton.addEventListener("click", () => setPlaying(!playing));
  applyGridButton.addEventListener("click", applyGridSize);

  gridInput.addEventListener("change", applyGridSize);
  gridInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyGridSize();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat || event.isComposing) return;

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
    ) {
      return;
    }

    event.preventDefault();
    setPlaying(!playing);
  });

  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;

    heaterX = Math.max(0, Math.min(PLATE_SIZE, x * PLATE_SIZE));
    heaterY = PLATE_SIZE - Math.max(0, Math.min(1, y)) * PLATE_SIZE;
    heaterEnabled = true;
    updateHeaterGeometry();

    if (!playing) render();
  });

  canvas.addEventListener("pointerleave", () => {
    heaterEnabled = false;
    if (!playing) render();
  });

  updateGridPhysics(gridSize);
  updateGridInfo();
  render();
})();
