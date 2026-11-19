(() => {
  "use strict";

  const SIZE = 100;
  const CELL_EDGE = 1e-3;
  const CELL_VOLUME = CELL_EDGE ** 3;
  const POWER_WATTS = 10;
  const DENSITY = 7870;
  const SPECIFIC_HEAT = 456;
  const CONDUCTIVITY = 80.2;
  const DIFFUSIVITY = CONDUCTIVITY / (DENSITY * SPECIFIC_HEAT);
  const STEP_SECONDS = 0.005;
  const DIFFUSION_STEP =
    (DIFFUSIVITY * STEP_SECONDS) / (CELL_EDGE * CELL_EDGE);
  const MAX_STEPS_PER_FRAME = 20;

  const canvas = document.getElementById("webgl-reactor-canvas");
  const toggleButton = document.getElementById("webgl-reactor-toggle");
  const status = document.getElementById("webgl-reactor-status");
  if (!canvas || !toggleButton || !status) return;

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
    return;
  }

  if (!gl.getExtension("EXT_color_buffer_float")) {
    status.textContent =
      "This browser does not support the floating-point render target required for the heat grid.";
    toggleButton.disabled = true;
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
uniform float u_diffusionStep;
uniform float u_stepSeconds;
uniform float u_heatingRate;
uniform int u_heaterEnabled;
uniform ivec2 u_heaterCell;

layout(location = 0) out float nextTemperature;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);

  if (
    cell.x == 0 || cell.y == 0 ||
    cell.x == 99 || cell.y == 99
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

  bool inHeater =
    u_heaterEnabled == 1 &&
    abs(cell.x - u_heaterCell.x) <= 1 &&
    abs(cell.y - u_heaterCell.y) <= 1;

  if (inHeater) {
    temperature += u_heatingRate * u_stepSeconds;
  }

  nextTemperature = temperature;
}`;

  const displaySource = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_temperature;
uniform vec2 u_canvasSize;
uniform int u_heaterEnabled;
uniform ivec2 u_heaterCell;

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
    floor(gl_FragCoord.xy / u_canvasSize * float(100))
  );
  cell = clamp(cell, ivec2(0), ivec2(99));

  float temperature = texelFetch(u_temperature, cell, 0).r;
  vec3 displayColor = heatColor(temperature);

  bool inHeater =
    u_heaterEnabled == 1 &&
    abs(cell.x - u_heaterCell.x) <= 1 &&
    abs(cell.y - u_heaterCell.y) <= 1;

  if (inHeater) {
    bool edgeOfSpot =
      abs(cell.x - u_heaterCell.x) == 1 ||
      abs(cell.y - u_heaterCell.y) == 1;
    displayColor = mix(
      displayColor,
      vec3(1.0, 0.78, 0.12),
      edgeOfSpot ? 0.72 : 0.20
    );
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

  let playing = false;
  let simulationTime = 0;
  let accumulator = 0;
  let lastTimestamp = null;
  let animationFrame = null;
  let currentTarget = 0;
  let heaterEnabled = false;
  let heaterX = 50;
  let heaterY = 50;
  let heatingRate = 0;

  function countHeatedInteriorCells() {
    let count = 0;
    for (let y = Math.max(1, heaterY - 1); y <= Math.min(98, heaterY + 1); y++) {
      for (let x = Math.max(1, heaterX - 1); x <= Math.min(98, heaterX + 1); x++) {
        count += 1;
      }
    }
    return count;
  }

  function updateHeatingRate() {
    const heatedCells = countHeatedInteriorCells();
    heatingRate = POWER_WATTS / (heatedCells * DENSITY * SPECIFIC_HEAT * CELL_VOLUME);
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  let heatProgram;
  let displayProgram;
  let targets;

  try {
    heatProgram = createProgram(heatSource);
    displayProgram = createProgram(displaySource);

    const initialTemperatures = new Float32Array(SIZE * SIZE);
    initialTemperatures.fill(300.0);

    targets = [0, 1].map(() => {
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
        SIZE,
        SIZE,
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

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Could not create the floating-point heat grid.");
      }

      return { texture, framebuffer };
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } catch (error) {
    status.textContent = `WebGL setup failed: ${error.message}`;
    toggleButton.disabled = true;
    return;
  }

  const heatUniforms = {
    previous: gl.getUniformLocation(heatProgram, "u_previous"),
    diffusionStep: gl.getUniformLocation(heatProgram, "u_diffusionStep"),
    stepSeconds: gl.getUniformLocation(heatProgram, "u_stepSeconds"),
    heatingRate: gl.getUniformLocation(heatProgram, "u_heatingRate"),
    heaterEnabled: gl.getUniformLocation(heatProgram, "u_heaterEnabled"),
    heaterCell: gl.getUniformLocation(heatProgram, "u_heaterCell"),
  };

  const displayUniforms = {
    temperature: gl.getUniformLocation(displayProgram, "u_temperature"),
    canvasSize: gl.getUniformLocation(displayProgram, "u_canvasSize"),
    heaterEnabled: gl.getUniformLocation(displayProgram, "u_heaterEnabled"),
    heaterCell: gl.getUniformLocation(displayProgram, "u_heaterCell"),
  };

  function drawTemperature() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1 - currentTarget].framebuffer);
    gl.viewport(0, 0, SIZE, SIZE);
    gl.useProgram(heatProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].texture);
    gl.uniform1i(heatUniforms.previous, 0);
    gl.uniform1f(heatUniforms.diffusionStep, DIFFUSION_STEP);
    gl.uniform1f(heatUniforms.stepSeconds, STEP_SECONDS);
    gl.uniform1f(heatUniforms.heatingRate, heatingRate);
    gl.uniform1i(heatUniforms.heaterEnabled, heaterEnabled ? 1 : 0);
    gl.uniform2i(heatUniforms.heaterCell, heaterX, heaterY);
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
    gl.uniform1i(displayUniforms.heaterEnabled, heaterEnabled ? 1 : 0);
    gl.uniform2i(displayUniforms.heaterCell, heaterX, heaterY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
      while (accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
        drawTemperature();
        simulationTime += STEP_SECONDS;
        accumulator -= STEP_SECONDS;
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

  toggleButton.addEventListener("click", () => setPlaying(!playing));

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

    heaterX = Math.max(0, Math.min(99, Math.floor(x * SIZE)));
    heaterY = SIZE - 1 - Math.max(0, Math.min(99, Math.floor(y * SIZE)));
    heaterEnabled = true;
    updateHeatingRate();

    if (!playing) render();
  });

  canvas.addEventListener("pointerleave", () => {
    heaterEnabled = false;
    if (!playing) render();
  });

  updateHeatingRate();
  render();
})();
