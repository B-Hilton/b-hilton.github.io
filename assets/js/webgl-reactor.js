(() => {
  "use strict";

  const PLATE_SIZE = 10;
  const PLATE_THICKNESS = 0.001;
  const HEATER_SIZE = 0.003;
  const HEATER_HALF_SIZE = HEATER_SIZE / 2;
  const POWER_WATTS = 1000;
  const MATERIALS = [
    { name: "Vacuum", conductivity: 0, volumetricHeatCapacity: 0 },
    { name: "Concrete", conductivity: 1.4, volumetricHeatCapacity: 2300 * 880 },
    { name: "Steel", conductivity: 54, volumetricHeatCapacity: 7850 * 465 },
    { name: "Water", conductivity: 0.61, volumetricHeatCapacity: 996.7 * 4179.7 },
    { name: "Air", conductivity: 0.02624, volumetricHeatCapacity: 1.1774 * 1005.7 },
  ];
  const MAX_DIFFUSIVITY = Math.max(
    ...MATERIALS.slice(1).map(
      (material) => material.conductivity / material.volumetricHeatCapacity
    )
  );
  const DIFFUSION_NUMBER = 0.20;
  const MAX_HEAT_STEP_SECONDS = 1 / 30;
  const SIMULATION_SPEED = 12;
  const MAX_FLOW_SPEED_METERS_PER_SECOND = 4;
  const DEFAULT_HEAT_FLASH_RATE = 20;
  const MIN_HEAT_FLASH_RATE = 0;
  const MAX_HEAT_FLASH_RATE = 1000;
  const HEAT_FLASH_POWER_WATTS = 50;
  const MAX_HEAT_FLASHES_PER_FRAME = 2000;
  const THERMAL_EFFICIENCY = 0.4;
  const FLOW_DIRECTIONS = ["Up", "Down", "Right", "Left"];
  const heatFlashPositions = new Float32Array(MAX_HEAT_FLASHES_PER_FRAME * 2);
  const canvas = document.getElementById("webgl-reactor-canvas");
  const toggleButton = document.getElementById("webgl-reactor-toggle");
  const status = document.getElementById("webgl-reactor-status");
  const gridInfo = document.getElementById("webgl-reactor-grid-info");
  const heatRateInput = document.getElementById("webgl-reactor-heat-rate");
  const flowDirectionInput = document.getElementById("webgl-reactor-flow-direction");
  const flowDirectionValue = document.getElementById("webgl-reactor-flow-direction-value");
  const flowSpeedInput = document.getElementById("webgl-reactor-flow-speed");
  const flowSpeedValue = document.getElementById("webgl-reactor-flow-speed-value");
  const stepsPerFrameInput = document.getElementById("webgl-reactor-steps-per-frame");
  const stepsPerFrameValue = document.getElementById("webgl-reactor-steps-per-frame-value");
  const actualStepsPerFrame = document.getElementById("webgl-reactor-actual-steps-per-frame");
  const thermalOutput = document.getElementById("webgl-reactor-thermal-output");
  const drawingControls = document.getElementById("webgl-reactor-drawing-controls");
  const simulationControls = document.getElementById("webgl-reactor-simulation-controls");
  const materialInput = document.getElementById("webgl-reactor-material");
  const brushInput = document.getElementById("webgl-reactor-brush");
  const brushValue = document.getElementById("webgl-reactor-brush-value");
  const simulateButton = document.getElementById("webgl-reactor-simulate");
  const resetButton = document.getElementById("webgl-reactor-reset");
  const editButton = document.getElementById("webgl-reactor-edit");
  const averageTemperature = document.getElementById("webgl-reactor-average");
  const engineStatus = document.getElementById("webgl-reactor-engine-status");
  if (
    !canvas ||
    !toggleButton ||
    !status ||
    !gridInfo ||
    !heatRateInput ||
    !flowDirectionInput ||
    !flowDirectionValue ||
    !flowSpeedInput ||
    !flowSpeedValue ||
    !stepsPerFrameInput ||
    !stepsPerFrameValue ||
    !actualStepsPerFrame ||
    !thermalOutput ||
    !drawingControls ||
    !simulationControls ||
    !materialInput ||
    !brushInput ||
    !brushValue ||
    !simulateButton ||
    !resetButton ||
    !editButton ||
    !averageTemperature ||
    !engineStatus
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
    engineStatus.textContent = "WebGL 2 is unavailable in this browser; the reactor simulation cannot start.";
    toggleButton.disabled = true;
    simulateButton.disabled = true;
    resetButton.disabled = true;
    editButton.disabled = true;
    heatRateInput.disabled = true;
    flowDirectionInput.disabled = true;
    flowSpeedInput.disabled = true;
    stepsPerFrameInput.disabled = true;
    materialInput.disabled = true;
    brushInput.disabled = true;
    return;
  }

  if (!gl.getExtension("EXT_color_buffer_float")) {
    engineStatus.textContent =
      "This browser does not support the floating-point render target required for the heat grid.";
    toggleButton.disabled = true;
    simulateButton.disabled = true;
    resetButton.disabled = true;
    editButton.disabled = true;
    heatRateInput.disabled = true;
    flowDirectionInput.disabled = true;
    flowSpeedInput.disabled = true;
    stepsPerFrameInput.disabled = true;
    materialInput.disabled = true;
    brushInput.disabled = true;
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
precision highp usampler2D;

uniform sampler2D u_previous;
uniform sampler2D u_heatFlashPower;
uniform usampler2D u_materials;
uniform int u_gridSize;
uniform float u_cellEdge;
uniform float u_cellVolume;
uniform float u_diffusionStep;
uniform float u_heatingScale;
uniform float u_powerToTemperatureScale;
uniform float u_heaterArea;
uniform vec2 u_heaterCenter;
uniform int u_heaterEnabled;
uniform int u_flowDirection;
uniform float u_flowSpeed;

layout(location = 0) out vec4 nextState;

float conductivity(uint material) {
  if (material == 1u) return 1.4;
  if (material == 2u) return 54.0;
  if (material == 3u) return 0.61;
  if (material == 4u) return 0.02624;
  return 0.0;
}

float volumetricHeatCapacity(uint material) {
  if (material == 1u) return 2300.0 * 880.0;
  if (material == 2u) return 7850.0 * 465.0;
  if (material == 3u) return 996.7 * 4179.7;
  if (material == 4u) return 1.1774 * 1005.7;
  return 0.0;
}

ivec2 flowSourceCell(ivec2 cell) {
  if (u_flowDirection == 0) return cell + ivec2(0, -1);
  if (u_flowDirection == 1) return cell + ivec2(0, 1);
  if (u_flowDirection == 2) return cell + ivec2(-1, 0);
  return cell + ivec2(1, 0);
}

bool insideGrid(ivec2 cell) {
  return cell.x >= 0 && cell.y >= 0 && cell.x < u_gridSize && cell.y < u_gridSize;
}

vec4 flowStateAt(ivec2 cell) {
  vec4 currentState = texelFetch(u_previous, cell, 0);
  if (u_flowSpeed <= 0.0) return currentState;

  ivec2 sourceCell = flowSourceCell(cell);
  vec4 upstreamState = insideGrid(sourceCell)
    ? texelFetch(u_previous, sourceCell, 0)
    : vec4(300.0, 300.0, 300.0, 0.0);
  return vec4(
    currentState.r,
    mix(currentState.g, upstreamState.g, u_flowSpeed),
    mix(currentState.b, upstreamState.b, u_flowSpeed),
    currentState.a
  );
}

float temperatureFor(uint material, vec4 state) {
  if (material == 3u) return state.g;
  if (material == 4u) return state.b;
  return state.r;
}

float faceHeatTransfer(uint neighborMaterial, float neighborTemperature, uint material, float center) {
  float neighborK = conductivity(neighborMaterial);
  if (neighborK <= 0.0) return 0.0;
  float materialK = conductivity(material);
  float faceK = 2.0 * materialK * neighborK / (materialK + neighborK);
  return faceK * (neighborTemperature - center);
}

float expelledHeatEnergy() {
  float energy = 0.0;
  for (int index = 0; index < 200; index++) {
    ivec2 outletCell;
    if (u_flowDirection == 0) outletCell = ivec2(index, u_gridSize - 1);
    else if (u_flowDirection == 1) outletCell = ivec2(index, 0);
    else if (u_flowDirection == 2) outletCell = ivec2(u_gridSize - 1, index);
    else outletCell = ivec2(0, index);
    vec4 state = texelFetch(u_previous, outletCell, 0);
    energy += u_flowSpeed * max(state.g - 300.0, 0.0) * volumetricHeatCapacity(3u) * u_cellVolume;
    energy += u_flowSpeed * max(state.b - 300.0, 0.0) * volumetricHeatCapacity(4u) * u_cellVolume;
  }
  return energy;
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  uint material = texelFetch(u_materials, cell, 0).r;
  vec4 previousState = texelFetch(u_previous, cell, 0);
  vec4 flowedState = flowStateAt(cell);
  float staticTemperature = material == 0u ? 300.0 : previousState.r;
  float waterTemperature = flowedState.g;
  float airTemperature = flowedState.b;

  if (material != 0u) {
    ivec2 lastCell = ivec2(u_gridSize - 1);
    ivec2 leftCell = max(cell + ivec2(-1, 0), ivec2(0));
    ivec2 rightCell = min(cell + ivec2(1, 0), lastCell);
    ivec2 lowerCell = max(cell + ivec2(0, -1), ivec2(0));
    ivec2 upperCell = min(cell + ivec2(0, 1), lastCell);
    float center = temperatureFor(material, flowedState);
    float cellCapacity = volumetricHeatCapacity(material);
    uint leftMaterial = texelFetch(u_materials, leftCell, 0).r;
    uint rightMaterial = texelFetch(u_materials, rightCell, 0).r;
    uint lowerMaterial = texelFetch(u_materials, lowerCell, 0).r;
    uint upperMaterial = texelFetch(u_materials, upperCell, 0).r;
    float heatTransfer =
      faceHeatTransfer(leftMaterial, temperatureFor(leftMaterial, flowStateAt(leftCell)), material, center) +
      faceHeatTransfer(rightMaterial, temperatureFor(rightMaterial, flowStateAt(rightCell)), material, center) +
      faceHeatTransfer(lowerMaterial, temperatureFor(lowerMaterial, flowStateAt(lowerCell)), material, center) +
      faceHeatTransfer(upperMaterial, temperatureFor(upperMaterial, flowStateAt(upperCell)), material, center);
    float temperature = center + u_diffusionStep * heatTransfer / cellCapacity;

    if (u_heaterEnabled == 1 && u_heaterArea > 0.0) {
      vec2 cellMin = vec2(cell) * u_cellEdge;
      vec2 cellMax = cellMin + vec2(u_cellEdge);
      vec2 spotMin = u_heaterCenter - vec2(0.0015);
      vec2 spotMax = u_heaterCenter + vec2(0.0015);
      vec2 overlap = max(vec2(0.0), min(cellMax, spotMax) - max(cellMin, spotMin));
      float overlapArea = overlap.x * overlap.y;
      temperature += u_heatingScale * overlapArea / cellCapacity;
    }

    float heatFlashPower = texelFetch(u_heatFlashPower, cell, 0).r;
    temperature += heatFlashPower * u_powerToTemperatureScale / cellCapacity;

    bool isDynamic = material == 3u || material == 4u;
    bool isEdge = cell.x == 0 || cell.y == 0 || cell.x == u_gridSize - 1 || cell.y == u_gridSize - 1;
    if (isEdge && !isDynamic) {
      float edgeHeatLossWatts = 1.23e-11 * (pow(center, 4.0) - 8.1e9);
      temperature -= edgeHeatLossWatts * u_powerToTemperatureScale / cellCapacity;
    }

    if (material == 3u) waterTemperature = temperature;
    else if (material == 4u) airTemperature = temperature;
    else staticTemperature = temperature;
  }

  float cumulativeExpelledEnergy = (cell.x == 0 && cell.y == 0) ? previousState.a : 0.0;
  if (u_flowSpeed > 0.0 && cell.x == 0 && cell.y == 0) {
    cumulativeExpelledEnergy += expelledHeatEnergy();
  }
  nextState = vec4(staticTemperature, waterTemperature, airTemperature, cumulativeExpelledEnergy);
}`;

  const displaySource = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_temperature;
uniform usampler2D u_materials;
uniform vec2 u_canvasSize;
uniform int u_gridSize;
uniform float u_cellEdge;
uniform float u_heaterArea;
uniform vec2 u_heaterCenter;
uniform int u_heaterEnabled;
uniform int u_viewMaterials;

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

vec3 materialColor(uint material) {
  if (material == 1u) return vec3(0.48, 0.47, 0.43);
  if (material == 2u) return vec3(0.66, 0.76, 0.86);
  if (material == 3u) return vec3(0.06, 0.32, 0.88);
  if (material == 4u) return vec3(0.42, 0.76, 0.73);
  return vec3(0.015, 0.025, 0.045);
}

void main() {
  ivec2 cell = ivec2(
    floor(gl_FragCoord.xy / u_canvasSize * float(u_gridSize))
  );
  cell = clamp(cell, ivec2(0), ivec2(u_gridSize - 1));
  uint material = texelFetch(u_materials, cell, 0).r;
  vec4 state = texelFetch(u_temperature, cell, 0);
  float temperature = material == 3u ? state.g : material == 4u ? state.b : state.r;
  vec3 displayColor = u_viewMaterials == 1
    ? materialColor(material)
    : heatColor(temperature);

  if (u_viewMaterials == 0 && u_heaterEnabled == 1 && u_heaterArea > 0.0) {
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

  color = vec4(displayColor, 1.0);
}`;

  const averageSource = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_source;
uniform usampler2D u_materials;
uniform ivec2 u_sourceSize;
uniform int u_firstPass;
layout(location = 0) out vec4 total;

void main() {
  ivec2 first = ivec2(gl_FragCoord.xy) * 2;
  vec2 sumAndCount = vec2(0.0);
  for (int y = 0; y < 2; y++) {
    for (int x = 0; x < 2; x++) {
      ivec2 sourceCell = first + ivec2(x, y);
      if (sourceCell.x >= u_sourceSize.x || sourceCell.y >= u_sourceSize.y) continue;
      if (u_firstPass == 1) {
        uint material = texelFetch(u_materials, sourceCell, 0).r;
        if (material != 0u) {
          vec4 state = texelFetch(u_source, sourceCell, 0);
          float temperature = material == 3u ? state.g : material == 4u ? state.b : state.r;
          sumAndCount += vec2(temperature, 1.0);
        }
      } else {
        sumAndCount += texelFetch(u_source, sourceCell, 0).rg;
      }
    }
  }
  total = vec4(sumAndCount, 0.0, 1.0);
}`;

  const heatFlashVertexSource = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
uniform float u_plateSize;

void main() {
  vec2 clipPosition = (a_position / u_plateSize) * 2.0 - 1.0;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
  gl_PointSize = 5.0;
}`;

  const heatFlashFragmentSource = `#version 300 es
precision highp float;

out vec4 color;

void main() {
  color = vec4(1.0, 0.58, 0.12, 1.0);
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

  function createProgram(fragmentSource, programVertexSource = vertexSource) {
    const program = gl.createProgram();
    const vertexShader = compileShader(gl.VERTEX_SHADER, programVertexSource);
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
  let heatFlashProgram;
  let averageProgram;
  let heatFlashBuffer;
  let heatFlashPowerTexture;
  let materialTexture;
  let heatFlashPowerField;
  let materialIds;
  let targets = [];
  let averageTargets = [];
  let heatFlashRemainder = 0;
  let heatFlashRate = DEFAULT_HEAT_FLASH_RATE;
  let heatFlashCount = 0;
  let powerToTemperatureScale = 0;
  let randomState = ((Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
  if (randomState === 0) randomState = 1;
  let gridSize = 200;
  let cellEdge = PLATE_SIZE / gridSize;
  materialIds = new Uint8Array(gridSize * gridSize);
  let stepSeconds = 0;
  let diffusionStep = 0;
  let heatingScale = 0;
  let phase = "drawing";
  let pointerPainting = false;
  let lastPaintCellX = null;
  let lastPaintCellY = null;
  let averageUpdateElapsed = 0;
  let lastMeasuredExpelledEnergy = 0;
  let brushSize = 1;

  let playing = false;
  let simulationTime = 0;
  let accumulator = 0;
  let lastTimestamp = null;
  let lastFrameTimestamp = null;
  let slowFrameStreak = 0;
  let animationFrame = null;
  let currentTarget = 0;
  let heaterEnabled = false;
  let heaterX = PLATE_SIZE / 2;
  let heaterY = PLATE_SIZE / 2;
  let heaterArea = HEATER_SIZE * HEATER_SIZE;

  function updateGridPhysics(size) {
    gridSize = size;
    cellEdge = PLATE_SIZE / gridSize;
    stepSeconds = Math.min(
      DIFFUSION_NUMBER * cellEdge * cellEdge / MAX_DIFFUSIVITY,
      MAX_HEAT_STEP_SECONDS
    );
    diffusionStep = stepSeconds / (cellEdge * cellEdge);
    const cellVolume = cellEdge * cellEdge * PLATE_THICKNESS;
    powerToTemperatureScale = stepSeconds / cellVolume;
    updateHeaterGeometry();
  }

  function updateHeaterGeometry() {
    const minX = Math.max(0, heaterX - HEATER_HALF_SIZE);
    const maxX = Math.min(PLATE_SIZE, heaterX + HEATER_HALF_SIZE);
    const minY = Math.max(0, heaterY - HEATER_HALF_SIZE);
    const maxY = Math.min(PLATE_SIZE, heaterY + HEATER_HALF_SIZE);
    heaterArea = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);

    if (heaterArea > 0) {
      heatingScale =
        POWER_WATTS * powerToTemperatureScale / heaterArea;
    } else {
      heatingScale = 0;
    }
  }

  function createTargets(size) {
    const initialTemperatures = new Float32Array(size * size * 4);
    for (let i = 0; i < initialTemperatures.length; i += 4) {
      initialTemperatures[i] = 300.0;
      initialTemperatures[i + 1] = 300.0;
      initialTemperatures[i + 2] = 300.0;
    }
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
          gl.RGBA32F,
          size,
          size,
          0,
          gl.RGBA,
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

  function createHeatFlashPowerTexture(size) {
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
      new Float32Array(size * size)
    );
    return texture;
  }

  function createMaterialTexture(size, pixels) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8UI, size, size, 0,
      gl.RED_INTEGER, gl.UNSIGNED_BYTE, pixels
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    return texture;
  }

  function createAverageTargets(size) {
    const created = [];
    let sourceWidth = size;
    let sourceHeight = size;

    try {
      while (sourceWidth > 1 || sourceHeight > 1) {
        const width = Math.ceil(sourceWidth / 2);
        const height = Math.ceil(sourceHeight / 2);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0,
          gl.RGBA, gl.FLOAT, null
        );
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0
        );
        const target = { texture, framebuffer, width, height };
        created.push(target);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error("Could not create the temperature-average reduction grid.");
        }
        sourceWidth = width;
        sourceHeight = height;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return created;
    } catch (error) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      disposeAverageTargets(created);
      throw error;
    }
  }

  function disposeAverageTargets(items) {
    for (const target of items) {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
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
    heatFlashProgram = createProgram(heatFlashFragmentSource, heatFlashVertexSource);
    averageProgram = createProgram(averageSource);
    targets = createTargets(gridSize);
    heatFlashPowerTexture = createHeatFlashPowerTexture(gridSize);
    materialTexture = createMaterialTexture(gridSize, materialIds);
    heatFlashPowerField = new Float32Array(gridSize * gridSize);
    averageTargets = createAverageTargets(gridSize);

    heatFlashBuffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, heatFlashBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, heatFlashPositions.byteLength, gl.DYNAMIC_DRAW);
    const positionLocation = gl.getAttribLocation(heatFlashProgram, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  } catch (error) {
    engineStatus.textContent = `WebGL setup failed: ${error.message}`;
    toggleButton.disabled = true;
    simulateButton.disabled = true;
    resetButton.disabled = true;
    editButton.disabled = true;
    heatRateInput.disabled = true;
    flowDirectionInput.disabled = true;
    flowSpeedInput.disabled = true;
    stepsPerFrameInput.disabled = true;
    materialInput.disabled = true;
    brushInput.disabled = true;
    return;
  }

  const heatUniforms = {
    previous: gl.getUniformLocation(heatProgram, "u_previous"),
    heatFlashPower: gl.getUniformLocation(heatProgram, "u_heatFlashPower"),
    powerToTemperatureScale: gl.getUniformLocation(heatProgram, "u_powerToTemperatureScale"),
    gridSize: gl.getUniformLocation(heatProgram, "u_gridSize"),
    cellEdge: gl.getUniformLocation(heatProgram, "u_cellEdge"),
    diffusionStep: gl.getUniformLocation(heatProgram, "u_diffusionStep"),
    heatingScale: gl.getUniformLocation(heatProgram, "u_heatingScale"),
    materials: gl.getUniformLocation(heatProgram, "u_materials"),
    heaterArea: gl.getUniformLocation(heatProgram, "u_heaterArea"),
    heaterCenter: gl.getUniformLocation(heatProgram, "u_heaterCenter"),
    heaterEnabled: gl.getUniformLocation(heatProgram, "u_heaterEnabled"),
    flowDirection: gl.getUniformLocation(heatProgram, "u_flowDirection"),
    flowSpeed: gl.getUniformLocation(heatProgram, "u_flowSpeed"),
    cellVolume: gl.getUniformLocation(heatProgram, "u_cellVolume"),
  };

  const displayUniforms = {
    temperature: gl.getUniformLocation(displayProgram, "u_temperature"),
    materials: gl.getUniformLocation(displayProgram, "u_materials"),
    viewMaterials: gl.getUniformLocation(displayProgram, "u_viewMaterials"),
    canvasSize: gl.getUniformLocation(displayProgram, "u_canvasSize"),
    gridSize: gl.getUniformLocation(displayProgram, "u_gridSize"),
    cellEdge: gl.getUniformLocation(displayProgram, "u_cellEdge"),
    heaterArea: gl.getUniformLocation(displayProgram, "u_heaterArea"),
    heaterCenter: gl.getUniformLocation(displayProgram, "u_heaterCenter"),
    heaterEnabled: gl.getUniformLocation(displayProgram, "u_heaterEnabled"),
  };

  const heatFlashUniforms = {
    plateSize: gl.getUniformLocation(heatFlashProgram, "u_plateSize"),
  };

  const averageUniforms = {
    source: gl.getUniformLocation(averageProgram, "u_source"),
    materials: gl.getUniformLocation(averageProgram, "u_materials"),
    sourceSize: gl.getUniformLocation(averageProgram, "u_sourceSize"),
    firstPass: gl.getUniformLocation(averageProgram, "u_firstPass"),
  };

  function uploadHeatFlashPowerField() {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heatFlashPowerTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gridSize,
      gridSize,
      gl.RED,
      gl.FLOAT,
      heatFlashPowerField
    );
    gl.activeTexture(gl.TEXTURE0);
  }

  function prepareHeatFlashesForStep() {
    heatFlashPowerField.fill(0);
    heatFlashRemainder += stepSeconds * heatFlashRate;
    const flashesThisStep = Math.floor(heatFlashRemainder);
    heatFlashRemainder -= flashesThisStep;

    for (let index = 0; index < flashesThisStep; index++) {
      const x = Math.floor(randomUnit() * gridSize);
      const y = Math.floor(randomUnit() * gridSize);
      heatFlashPowerField[y * gridSize + x] += HEAT_FLASH_POWER_WATTS;

      if (heatFlashCount < MAX_HEAT_FLASHES_PER_FRAME) {
        const offset = heatFlashCount * 2;
        heatFlashPositions[offset] = (x + 0.5) * cellEdge;
        heatFlashPositions[offset + 1] = (y + 0.5) * cellEdge;
        heatFlashCount += 1;
      }
    }

    uploadHeatFlashPowerField();
  }

  function drawTemperature() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1 - currentTarget].framebuffer);
    gl.viewport(0, 0, gridSize, gridSize);
    gl.useProgram(heatProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].texture);
    gl.uniform1i(heatUniforms.previous, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heatFlashPowerTexture);
    gl.uniform1i(heatUniforms.heatFlashPower, 1);
    gl.uniform1f(heatUniforms.powerToTemperatureScale, powerToTemperatureScale);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.uniform1i(heatUniforms.materials, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(heatUniforms.gridSize, gridSize);
    gl.uniform1f(heatUniforms.cellEdge, cellEdge);
    gl.uniform1f(heatUniforms.diffusionStep, diffusionStep);
    gl.uniform1f(heatUniforms.heatingScale, heatingScale);
    gl.uniform1f(heatUniforms.heaterArea, heaterArea);
    gl.uniform2f(heatUniforms.heaterCenter, heaterX, heaterY);
    gl.uniform1i(heatUniforms.heaterEnabled, heaterEnabled ? 1 : 0);
    gl.uniform1i(heatUniforms.flowDirection, Number(flowDirectionInput.value));
    const flowSpeedMetersPerSecond = Number(flowSpeedInput.value);
    const flowStepFraction = flowSpeedMetersPerSecond * stepSeconds / (cellEdge * SIMULATION_SPEED);
    gl.uniform1f(heatUniforms.flowSpeed, flowStepFraction);
    gl.uniform1f(heatUniforms.cellVolume, cellEdge * cellEdge * PLATE_THICKNESS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    currentTarget = 1 - currentTarget;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function updateAverageTemperature() {
    if (averageTargets.length === 0) return;

    let sourceTexture = targets[currentTarget].texture;
    let sourceWidth = gridSize;
    let sourceHeight = gridSize;
    const result = new Float32Array(4);

    for (let i = 0; i < averageTargets.length; i++) {
      const target = averageTargets[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.useProgram(averageProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.uniform1i(averageUniforms.source, 0);
      gl.uniform2i(averageUniforms.sourceSize, sourceWidth, sourceHeight);
      gl.uniform1i(averageUniforms.firstPass, i === 0 ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, materialTexture);
      gl.uniform1i(averageUniforms.materials, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      sourceTexture = target.texture;
      sourceWidth = target.width;
      sourceHeight = target.height;
    }

    const finalTarget = averageTargets[averageTargets.length - 1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, finalTarget.framebuffer);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, result);
    const outputEnergy = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[currentTarget].framebuffer);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, outputEnergy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const energyDelta = Math.max(0, outputEnergy[3] - lastMeasuredExpelledEnergy);
    const outputElapsed = averageUpdateElapsed;
    const outputWatts = outputElapsed > 0
      ? THERMAL_EFFICIENCY * energyDelta / outputElapsed
      : 0;
    thermalOutput.textContent =
      `Thermal power output (40% efficient): ${outputWatts.toFixed(2)} W`;
    lastMeasuredExpelledEnergy = outputEnergy[3];

    if (result[1] > 0) {
      averageTemperature.textContent =
        `Average temperature: ${(result[0] / result[1]).toFixed(2)} K`;
    } else {
      averageTemperature.textContent = "Average temperature: — (no material)";
    }
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
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.uniform1i(displayUniforms.materials, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(displayUniforms.viewMaterials, phase === "drawing" ? 1 : 0);
    gl.uniform1f(displayUniforms.heaterArea, heaterArea);
    gl.uniform2f(displayUniforms.heaterCenter, heaterX, heaterY);
    gl.uniform1i(displayUniforms.heaterEnabled, heaterEnabled && phase === "simulating" ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawHeatFlashes() {
    if (phase !== "simulating" || heatFlashCount === 0) return;

    gl.useProgram(heatFlashProgram);
    gl.uniform1f(heatFlashUniforms.plateSize, PLATE_SIZE);
    gl.bindBuffer(gl.ARRAY_BUFFER, heatFlashBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      heatFlashPositions.subarray(0, heatFlashCount * 2)
    );
    gl.drawArrays(gl.POINTS, 0, heatFlashCount);
  }

  function updateGridInfo() {
    gridInfo.textContent =
      `${gridSize} × ${gridSize} cells · ${(cellEdge * 1000).toFixed(3)} mm per cell`;
  }

  function render() {
    drawCanvas();
    drawHeatFlashes();
    if (phase === "simulating") {
      status.textContent =
        `${playing ? "Playing" : "Paused"} · ${simulationTime.toFixed(2)} s`;
    }
  }

  function randomUnit() {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  }

  function tick(timestamp) {
    animationFrame = null;
    const frameDurationMs = lastFrameTimestamp === null
      ? 0
      : timestamp - lastFrameTimestamp;
    lastFrameTimestamp = timestamp;
    let steps = 0;

    if (playing) {
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const elapsed = Math.min(timestamp - lastTimestamp, 100) / 1000;
      lastTimestamp = timestamp;
      const maxStepsPerFrame = Number(stepsPerFrameInput.value);
      const maxSimulationElapsed = stepSeconds * maxStepsPerFrame;
      const simulationElapsed = Math.min(
        elapsed * SIMULATION_SPEED,
        maxSimulationElapsed
      );
      heatFlashCount = 0;
      accumulator = Math.min(
        accumulator + simulationElapsed,
        maxSimulationElapsed
      );
      averageUpdateElapsed += simulationElapsed;

      while (
        accumulator >= stepSeconds &&
        steps < maxStepsPerFrame
      ) {
        prepareHeatFlashesForStep();
        drawTemperature();
        simulationTime += stepSeconds;
        accumulator -= stepSeconds;
        steps += 1;
      }
      actualStepsPerFrame.textContent = String(steps);
      if (averageUpdateElapsed >= 0.5) {
        updateAverageTemperature();
        averageUpdateElapsed = 0;
      }
    }

    render();

    if (document.visibilityState === "visible" && frameDurationMs > 1000 / 30) {
      slowFrameStreak += 1;
      if (slowFrameStreak > 1 && playing) {
        const currentLimit = Number(stepsPerFrameInput.value);
        const estimatedLimit = Math.floor(
          steps * (1000 / 30) / frameDurationMs
        );
        const nextLimit = Math.max(0, Math.min(currentLimit - 1, estimatedLimit));
        if (nextLimit < currentLimit) {
          stepsPerFrameInput.value = String(nextLimit);
          stepsPerFrameValue.textContent = String(nextLimit);
        }
        slowFrameStreak = 0;
      }
    } else {
      slowFrameStreak = 0;
    }

    if (playing) animationFrame = requestAnimationFrame(tick);
  }

  function scheduleFrame() {
    if (animationFrame === null) {
      animationFrame = requestAnimationFrame(tick);
    }
  }

  function setPlaying(nextPlaying) {
    if (phase !== "simulating") return;
    playing = nextPlaying;
    accumulator = 0;
    lastTimestamp = null;
    lastFrameTimestamp = null;
    slowFrameStreak = 0;
    toggleButton.textContent = playing ? "Pause" : "Play";
    toggleButton.setAttribute("aria-pressed", String(playing));
    render();

    if (playing) scheduleFrame();
  }

  function setBrushSize(value) {
    brushSize = Number(value);
    brushValue.textContent = `${brushSize} × ${brushSize}`;
  }

  function uploadMaterialIds() {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gridSize,
      gridSize,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      materialIds
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  function paintAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(0.999999, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(0.999999, (event.clientY - bounds.top) / bounds.height));
    const targetX = Math.floor(x * gridSize);
    const targetY = Math.min(
      gridSize - 1,
      Math.floor((1 - y) * gridSize)
    );
    const steps = lastPaintCellX === null
      ? 0
      : Math.max(
          Math.abs(targetX - lastPaintCellX),
          Math.abs(targetY - lastPaintCellY)
        );
    const materialId = Number(materialInput.value);
    let changed = false;

    for (let step = 0; step <= steps; step++) {
      const cellX = steps === 0
        ? targetX
        : Math.round(lastPaintCellX + (targetX - lastPaintCellX) * step / steps);
      const cellY = steps === 0
        ? targetY
        : Math.round(lastPaintCellY + (targetY - lastPaintCellY) * step / steps);
      const startX = Math.max(0, cellX - Math.floor(brushSize / 2));
      const startY = Math.max(0, cellY - Math.floor(brushSize / 2));
      const endX = Math.min(gridSize, startX + brushSize);
      const endY = Math.min(gridSize, startY + brushSize);

      for (let row = startY; row < endY; row++) {
        for (let column = startX; column < endX; column++) {
          const index = row * gridSize + column;
          if (materialIds[index] !== materialId) {
            materialIds[index] = materialId;
            changed = true;
          }
        }
      }
    }

    lastPaintCellX = targetX;
    lastPaintCellY = targetY;
    if (changed) {
      uploadMaterialIds();
      render();
    }
  }

  function resetSimulation(startPlaying) {
    playing = false;
    toggleButton.textContent = "Play";
    toggleButton.setAttribute("aria-pressed", "false");
    accumulator = 0;
    lastTimestamp = null;
    lastFrameTimestamp = null;
    slowFrameStreak = 0;
    simulationTime = 0;
    averageUpdateElapsed = 0;
    lastMeasuredExpelledEnergy = 0;
    actualStepsPerFrame.textContent = "0";
    thermalOutput.textContent = "Thermal power output (40% efficient): 0.00 W";
    heatFlashRemainder = 0;
    heatFlashCount = 0;
    heatFlashPowerField.fill(0);
    uploadHeatFlashPowerField();

    const ambient = new Float32Array([300, 300, 300, 0]);
    for (const target of targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clearBufferfv(gl.COLOR, 0, ambient);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    currentTarget = 0;
    updateAverageTemperature();
    render();
    if (startPlaying) setPlaying(true);
  }

  function startSimulation() {
    phase = "simulating";
    drawingControls.hidden = true;
    simulationControls.hidden = false;
    resetSimulation(true);
  }

  function editDrawing() {
    resetSimulation(false);
    phase = "drawing";
    drawingControls.hidden = false;
    simulationControls.hidden = true;
    heaterEnabled = false;
    render();
  }

  function updateHeaterFromPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    heaterX = Math.max(0, Math.min(PLATE_SIZE, x * PLATE_SIZE));
    heaterY = PLATE_SIZE - Math.max(0, Math.min(1, y)) * PLATE_SIZE;
    heaterEnabled = true;
    updateHeaterGeometry();
  }

  flowDirectionInput.addEventListener("input", () => {
    const direction = Math.max(0, Math.min(3, Number(flowDirectionInput.value)));
    flowDirectionInput.value = String(direction);
    flowDirectionValue.textContent = FLOW_DIRECTIONS[direction];
    flowDirectionInput.setAttribute("aria-valuetext", FLOW_DIRECTIONS[direction]);
  });
  flowSpeedInput.addEventListener("input", () => {
    const speed = Math.max(0, Math.min(MAX_FLOW_SPEED_METERS_PER_SECOND, Number(flowSpeedInput.value)));
    flowSpeedInput.value = String(speed);
    flowSpeedValue.textContent = `${speed.toFixed(1)} m/s`;
  });

  stepsPerFrameInput.addEventListener("input", () => {
    const value = Math.max(0, Math.min(100, Math.round(Number(stepsPerFrameInput.value))));
    stepsPerFrameInput.value = String(value);
    stepsPerFrameValue.textContent = String(value);
    slowFrameStreak = 0;
  });

  heatRateInput.addEventListener("input", () => {
    const requestedRate = Number(heatRateInput.value);
    if (
      !Number.isInteger(requestedRate) ||
      requestedRate < MIN_HEAT_FLASH_RATE ||
      requestedRate > MAX_HEAT_FLASH_RATE
    ) {
      heatRateInput.setAttribute("aria-invalid", "true");
      return;
    }

    heatRateInput.removeAttribute("aria-invalid");
    heatFlashRate = requestedRate;
  });

  brushInput.addEventListener("input", () => setBrushSize(brushInput.value));
  simulateButton.addEventListener("click", startSimulation);
  resetButton.addEventListener("click", () => resetSimulation(true));
  editButton.addEventListener("click", editDrawing);
  toggleButton.addEventListener("click", () => setPlaying(!playing));
  document.addEventListener("keydown", (event) => {
    if (phase !== "simulating" || event.repeat || event.isComposing) return;

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
    ) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      setPlaying(!playing);
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (phase === "drawing") {
      pointerPainting = true;
      lastPaintCellX = null;
      lastPaintCellY = null;
      paintAt(event);
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Painting still works when pointer capture is unavailable.
      }
    } else {
      updateHeaterFromPointer(event);
    }
  });

  canvas.addEventListener("click", (event) => {
    if (phase === "drawing") paintAt(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (phase === "drawing") {
      if (pointerPainting) paintAt(event);
      return;
    }

    updateHeaterFromPointer(event);
    if (!playing) render();
  });

  const stopPainting = () => {
    pointerPainting = false;
    lastPaintCellX = null;
    lastPaintCellY = null;
  };
  canvas.addEventListener("pointerup", stopPainting);
  canvas.addEventListener("pointercancel", stopPainting);
  canvas.addEventListener("lostpointercapture", stopPainting);

  canvas.addEventListener("pointerleave", () => {
    if (phase === "simulating") {
      heaterEnabled = false;
      if (!playing) render();
    }
  });

  updateGridPhysics(gridSize);
  updateGridInfo();
  flowDirectionValue.textContent = FLOW_DIRECTIONS[Number(flowDirectionInput.value)];
  flowDirectionInput.setAttribute("aria-valuetext", flowDirectionValue.textContent);
  flowSpeedValue.textContent = `${Number(flowSpeedInput.value).toFixed(1)} m/s`;
  stepsPerFrameValue.textContent = stepsPerFrameInput.value;
  setBrushSize(brushInput.value);
  drawCanvas();
  averageTemperature.textContent = "Average temperature: — (no material)";
})();
