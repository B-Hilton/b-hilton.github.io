(() => {
  "use strict";

  const PLATE_SIZE = 10;
  const PLATE_THICKNESS = 0.001;
  // Volumetric capacities use the supplied specific heats and bulk density.
  const MATERIALS = [
    { name: "Vacuum", conductivity: 0, volumetricHeatCapacity: 0 },
    { name: "Concrete", conductivity: 1.4, volumetricHeatCapacity: 2300 * 880 },
    { name: "Steel", conductivity: 54, volumetricHeatCapacity: 7850 * 465 },
    { name: "Water", conductivity: 0.61, volumetricHeatCapacity: 996.7 * 4179.7 },
    { name: "Air", conductivity: 0.02624, volumetricHeatCapacity: 1.1774 * 1005.7 },
    { name: "Pure U235", conductivity: 27.5, volumetricHeatCapacity: 18730 * 116 },
    { name: "Cadmium-113", conductivity: 96.9, volumetricHeatCapacity: 8650 * 231 },
    { name: "Lead-208", conductivity: 35.3, volumetricHeatCapacity: 11310 * 129 },
    { name: "Plutonium-239", conductivity: 6.74, volumetricHeatCapacity: 19840 * 140 },
    { name: "Sodium-23", conductivity: 141, volumetricHeatCapacity: 971 * 1386 },
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
  const MAX_HEAT_TRANSPORT_MULTIPLIER = 100;
  const DEFAULT_NEUTRON_SPAWN_RATE = 20;
  const MIN_NEUTRON_SPAWN_RATE = 0;
  const MAX_NEUTRON_SPAWN_RATE = 1000;
  const NEUTRON_ABSORPTION_POWER_WATTS = 500;
  const MAX_NEUTRONS = 4096;
  const NEUTRON_SPAWN_STEP_INTERVAL = 4;
  const LOG_HASH_SIZE = 4096;
  const NEUTRON_ENERGY_MIN_EV = 1;
  const NEUTRON_ENERGY_MAX_EV = 1e7;
  const NEUTRON_MASS_KG = 1.67492749804e-27;
  const ELECTRON_VOLT_JOULES = 1.602176634e-19;
  const ENERGY_RETENTION_LUT_SIZE = 256;
  const MAX_SCATTERS_PER_NEUTRON_STEP = 64;
  const SODIUM_CAPTURE_THRESHOLD_MEV = 0.08e-6;
  const SODIUM_CAPTURE_PROBABILITY = 0.18;
  const THERMAL_CAPTURE_THRESHOLD_MEV = 0.025e-6;
  const WATER_CAPTURE_PROBABILITY = 0.02;
  const AIR_CAPTURE_PROBABILITY = 0.14;
  const CONCRETE_CAPTURE_THRESHOLD_MEV = 0.03e-6;
  const CONCRETE_CAPTURE_PROBABILITY = 0.017;
  const CONCRETE_RETENTION = 1 - 0.0588;
  const STEEL_CAPTURE_THRESHOLD_MEV = 0.03e-6;
  const STEEL_CAPTURE_PROBABILITY = 0.175;
  const STEEL_RETENTION = 1 - 0.0183;
  const CADMIUM_CAPTURE_THRESHOLD_MEV = 0.8e-6;
  const CADMIUM_SCATTER_THRESHOLD_MEV = 0.01;
  const CADMIUM_INTERMEDIATE_CAPTURE_PROBABILITY = 0.80;
  const CADMIUM_RETENTION = 1 - 0.008;
  const LEAD_RETENTION = 1 - 0.00485;
  const MIN_NEUTRON_ENERGY_MEV = 1e-15; // 1e-9 eV keeps a zero-retention draw numerically mobile.

  function inverseNormalCdf(p) {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
      138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
      66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
      -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143,
      3.75440866190742];
    const low = 0.02425;
    const high = 1 - low;
    if (p < low) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > high) {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function makeRetentionTable(minimum, maximum) {
    const table = new Float32Array(ENERGY_RETENTION_LUT_SIZE);
    const mean = (minimum + maximum) * 0.5;
    const lowZ = inverseNormalCdf(0.5 / ENERGY_RETENTION_LUT_SIZE);
    for (let i = 0; i < ENERGY_RETENTION_LUT_SIZE / 2; i++) {
      const z = inverseNormalCdf((i + 0.5) / ENERGY_RETENTION_LUT_SIZE);
      const value = mean + (z / -lowZ) * (mean - minimum);
      table[i] = value;
      table[ENERGY_RETENTION_LUT_SIZE - 1 - i] = 2 * mean - value;
    }
    table[0] = minimum;
    table[ENERGY_RETENTION_LUT_SIZE - 1] = maximum;
    return table;
  }

  const WATER_RETENTION_LUT = makeRetentionTable(0, 1);
  const AIR_RETENTION_LUT = makeRetentionTable(0.758, 1);
  const SODIUM_RETENTION_LUT = makeRetentionTable(0.84, 1);
  const SCATTER_DIRECTION_LUT = Array.from({ length: ENERGY_RETENTION_LUT_SIZE }, (_, i) => {
    const angle = (i + 0.5) * Math.PI * 2 / ENERGY_RETENTION_LUT_SIZE;
    return [Math.cos(angle), Math.sin(angle)];
  });


  const THERMAL_EFFICIENCY = 0.4;
  const FLOW_DIRECTIONS = ["Up", "Down", "Right", "Left"];
  const canvas = document.getElementById("webgl-reactor-canvas");
  const toggleButton = document.getElementById("webgl-reactor-toggle");
  const status = document.getElementById("webgl-reactor-status");
  const gridInfo = document.getElementById("webgl-reactor-grid-info");
  const neutronRateInput = document.getElementById("webgl-reactor-neutron-rate");
  const neutronInfo = document.getElementById("webgl-reactor-neutron-info");
  const flowDirectionInput = document.getElementById("webgl-reactor-flow-direction");
  const flowDirectionValue = document.getElementById("webgl-reactor-flow-direction-value");
  const flowSpeedInput = document.getElementById("webgl-reactor-flow-speed");
  const flowSpeedValue = document.getElementById("webgl-reactor-flow-speed-value");
  const heatTransportInput = document.getElementById("webgl-reactor-heat-transport");
  const stepsPerFrameInput = document.getElementById("webgl-reactor-steps-per-frame");
  const stepsPerFrameValue = document.getElementById("webgl-reactor-steps-per-frame-value");
  const actualStepsPerFrame = document.getElementById("webgl-reactor-actual-steps-per-frame");
  const thermalOutput = document.getElementById("webgl-reactor-thermal-output");
  const drawingControls = document.getElementById("webgl-reactor-drawing-controls");
  const simulationControls = document.getElementById("webgl-reactor-simulation-controls");
  const materialInput = document.getElementById("webgl-reactor-material");
  const exportGridButton = document.getElementById("webgl-reactor-export-grid");
  const importGridInput = document.getElementById("webgl-reactor-import-grid");
  const gridFileStatus = document.getElementById("webgl-reactor-grid-file-status");
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
    !neutronRateInput ||
    !neutronInfo ||
    !flowDirectionInput ||
    !flowDirectionValue ||
    !flowSpeedInput ||
    !flowSpeedValue ||
    !heatTransportInput ||
    !stepsPerFrameInput ||
    !stepsPerFrameValue ||
    !actualStepsPerFrame ||
    !thermalOutput ||
    !drawingControls ||
    !simulationControls ||
    !materialInput ||
    !exportGridButton ||
    !importGridInput ||
    !gridFileStatus ||
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
    neutronRateInput.disabled = true;
    flowDirectionInput.disabled = true;
    flowSpeedInput.disabled = true;
    heatTransportInput.disabled = true;
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
    neutronRateInput.disabled = true;
    flowDirectionInput.disabled = true;
    flowSpeedInput.disabled = true;
    heatTransportInput.disabled = true;
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
uniform sampler2D u_neutronPower;
uniform sampler2D u_sodiumPrevious;
uniform usampler2D u_materials;
uniform int u_gridSize;
uniform float u_cellEdge;
uniform float u_cellVolume;
uniform float u_diffusionStep;
uniform float u_powerToTemperatureScale;
uniform int u_flowDirection;
uniform float u_flowSpeed;
uniform float u_heatTransportMultiplier;

layout(location = 0) out vec4 nextState;
layout(location = 1) out float nextSodiumTemperature;

float conductivity(uint material) {
  if (material == 1u) return 1.4;
  if (material == 2u) return 54.0;
  if (material == 3u) return 0.61;
  if (material == 4u) return 0.02624;
  if (material == 5u) return 27.5;
  if (material == 6u) return 96.9;
  if (material == 7u) return 35.3;
  if (material == 8u) return 6.74;
  if (material == 9u) return 141.0;
  return 0.0;
}

float volumetricHeatCapacity(uint material) {
  if (material == 1u) return 2300.0 * 880.0;
  if (material == 2u) return 7850.0 * 465.0;
  if (material == 3u) return 996.7 * 4179.7;
  if (material == 4u) return 1.1774 * 1005.7;
  if (material == 5u) return 18730.0 * 116.0;
  if (material == 6u) return 8650.0 * 231.0;
  if (material == 7u) return 11310.0 * 129.0;
  if (material == 8u) return 19840.0 * 140.0;
  if (material == 9u) return 971.0 * 1386.0;
  // Reserved material IDs use a safe placeholder capacity until defined.
  return 2300.0 * 880.0;
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

float sodiumFlowAt(ivec2 cell) {
  float currentTemperature = texelFetch(u_sodiumPrevious, cell, 0).r;
  if (u_flowSpeed <= 0.0) return currentTemperature;
  ivec2 sourceCell = flowSourceCell(cell);
  float upstreamTemperature = insideGrid(sourceCell)
    ? texelFetch(u_sodiumPrevious, sourceCell, 0).r
    : 300.0;
  return mix(currentTemperature, upstreamTemperature, u_flowSpeed);
}

float temperatureFor(uint material, vec4 state, ivec2 cell) {
  if (material == 3u) return state.g;
  if (material == 4u) return state.b;
  if (material == 9u) return sodiumFlowAt(cell);
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
    float sodiumTemperature = texelFetch(u_sodiumPrevious, outletCell, 0).r;
    energy += u_flowSpeed * max(sodiumTemperature - 300.0, 0.0) * volumetricHeatCapacity(9u) * u_cellVolume;
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
  float sodiumTemperature = sodiumFlowAt(cell);

  if (material != 0u) {
    ivec2 lastCell = ivec2(u_gridSize - 1);
    ivec2 leftCell = max(cell + ivec2(-1, 0), ivec2(0));
    ivec2 rightCell = min(cell + ivec2(1, 0), lastCell);
    ivec2 lowerCell = max(cell + ivec2(0, -1), ivec2(0));
    ivec2 upperCell = min(cell + ivec2(0, 1), lastCell);
    float center = temperatureFor(material, flowedState, cell);
    float cellCapacity = volumetricHeatCapacity(material);
    uint leftMaterial = texelFetch(u_materials, leftCell, 0).r;
    uint rightMaterial = texelFetch(u_materials, rightCell, 0).r;
    uint lowerMaterial = texelFetch(u_materials, lowerCell, 0).r;
    uint upperMaterial = texelFetch(u_materials, upperCell, 0).r;
    float heatTransfer =
      faceHeatTransfer(leftMaterial, temperatureFor(leftMaterial, flowStateAt(leftCell), leftCell), material, center) +
      faceHeatTransfer(rightMaterial, temperatureFor(rightMaterial, flowStateAt(rightCell), rightCell), material, center) +
      faceHeatTransfer(lowerMaterial, temperatureFor(lowerMaterial, flowStateAt(lowerCell), lowerCell), material, center) +
      faceHeatTransfer(upperMaterial, temperatureFor(upperMaterial, flowStateAt(upperCell), upperCell), material, center);
    float temperature = center + u_diffusionStep * heatTransfer * u_heatTransportMultiplier / cellCapacity;

    float neutronPower = texelFetch(u_neutronPower, cell, 0).r;
    temperature += neutronPower * u_powerToTemperatureScale / cellCapacity;

    bool isDynamic = material == 3u || material == 4u || material == 9u;
    bool isEdge = cell.x == 0 || cell.y == 0 || cell.x == u_gridSize - 1 || cell.y == u_gridSize - 1;
    if (isEdge && !isDynamic) {
      float edgeHeatLossWatts = u_heatTransportMultiplier * 1.23e-11 * (pow(center, 4.0) - 8.1e9);
      temperature -= edgeHeatLossWatts * u_powerToTemperatureScale / cellCapacity;
    }

    if (material == 3u) waterTemperature = temperature;
    else if (material == 4u) airTemperature = temperature;
    else if (material == 9u) sodiumTemperature = temperature;
    else staticTemperature = temperature;
  }

  float cumulativeExpelledEnergy = (cell.x == 0 && cell.y == 0) ? previousState.a : 0.0;
  if (u_flowSpeed > 0.0 && cell.x == 0 && cell.y == 0) {
    cumulativeExpelledEnergy += expelledHeatEnergy();
  }
  nextState = vec4(staticTemperature, waterTemperature, airTemperature, cumulativeExpelledEnergy);
  nextSodiumTemperature = sodiumTemperature;
}`;

  const displaySource = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_temperature;
uniform sampler2D u_sodiumTemperature;
uniform usampler2D u_materials;
uniform vec2 u_canvasSize;
uniform int u_gridSize;
uniform float u_cellEdge;
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
  if (material == 5u) return vec3(0.90, 0.70, 0.18);
  if (material == 6u) return vec3(0.82, 0.35, 0.74);
  if (material == 7u) return vec3(0.95, 0.48, 0.20);
  if (material == 8u) return vec3(0.55, 0.72, 0.22);
  if (material == 9u) return vec3(0.88, 0.28, 0.35);
  if (material == 10u) return vec3(0.16, 0.68, 0.63);
  if (material == 11u) return vec3(0.56, 0.42, 0.88);
  if (material == 12u) return vec3(0.86, 0.70, 0.20);
  if (material == 13u) return vec3(0.86, 0.38, 0.58);
  if (material == 14u) return vec3(0.25, 0.64, 0.88);
  if (material == 15u) return vec3(0.64, 0.78, 0.32);
  return vec3(0.015, 0.025, 0.045);
}

void main() {
  ivec2 cell = ivec2(
    floor(gl_FragCoord.xy / u_canvasSize * float(u_gridSize))
  );
  cell = clamp(cell, ivec2(0), ivec2(u_gridSize - 1));
  uint material = texelFetch(u_materials, cell, 0).r;
  vec4 state = texelFetch(u_temperature, cell, 0);
  float sodiumTemperature = texelFetch(u_sodiumTemperature, cell, 0).r;
  float temperature = material == 3u ? state.g : material == 4u ? state.b : material == 9u ? sodiumTemperature : state.r;
  vec3 displayColor = u_viewMaterials == 1
    ? materialColor(material)
    : heatColor(temperature);

  color = vec4(displayColor, 1.0);
}`;

  const averageSource = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_source;
uniform sampler2D u_sodiumSource;
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
          float sodiumTemperature = texelFetch(u_sodiumSource, sourceCell, 0).r;
          float temperature = material == 3u ? state.g : material == 4u ? state.b : material == 9u ? sodiumTemperature : state.r;
          sumAndCount += vec2(temperature, 1.0);
        }
      } else {
        sumAndCount += texelFetch(u_source, sourceCell, 0).rg;
      }
    }
  }
  total = vec4(sumAndCount, 0.0, 1.0);
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
  let averageProgram;
  let neutronPowerTexture;
  let neutronPowerField;
  let materialTexture;
  let materialIds;
  let targets = [];
  let averageTargets = [];
  let neutronSpawnRemainder = 0;
  let neutronSpawnRate = DEFAULT_NEUTRON_SPAWN_RATE;
  let neutronPhysicsStepCount = 0;
  let heatTransportMultiplier = 1;
  let powerToTemperatureScale = 0;
  let randomState = ((Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
  if (randomState === 0) randomState = 1;
  let gridSize = 200;
  let cellEdge = PLATE_SIZE / gridSize;
  materialIds = new Uint8Array(gridSize * gridSize);
  let stepSeconds = 0;
  let diffusionStep = 0;
  let phase = "drawing";
  let pointerPainting = false;
  let lastPaintCellX = null;
  let lastPaintCellY = null;
  let averageUpdateElapsed = 0;
  let lastMeasuredExpelledEnergy = 0;
  let brushSize = 1;
  const neutronPositions = new Float32Array(MAX_NEUTRONS * 2);
  const neutronVelocities = new Float32Array(MAX_NEUTRONS * 2);
  const neutronEnergyMeV = new Float32Array(MAX_NEUTRONS);
  let neutronCount = 0;
  const fissileCellIndices = new Int32Array(gridSize * gridSize);
  const fissileCellSlotByGridIndex = new Int32Array(gridSize * gridSize);
  fissileCellSlotByGridIndex.fill(-1);
  let fissileCellCount = 0;
  let crossSectionEnergies = null;
  let crossSectionsByMaterial = null;
  let logarithmicHash = null;
  let hashLogMinimum = 0;
  let hashLogStep = 0;

  let playing = false;
  let simulationTime = 0;
  let animationFrame = null;
  let currentTarget = 0;

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
  }

  function createTargets(size) {
    const initialTemperatures = new Float32Array(size * size * 4);
    for (let i = 0; i < initialTemperatures.length; i += 4) {
      initialTemperatures[i] = 300.0;
      initialTemperatures[i + 1] = 300.0;
      initialTemperatures[i + 2] = 300.0;
    }
    const initialSodium = new Float32Array(size * size);
    initialSodium.fill(300.0);
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

        const sodiumTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, sodiumTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, size, size, 0, gl.RED, gl.FLOAT, initialSodium);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, sodiumTexture, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        const target = { texture, sodiumTexture, framebuffer };
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

  function createNeutronPowerTexture(size) {
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
      if (target.sodiumTexture) gl.deleteTexture(target.sodiumTexture);
    }
  }

  try {
    heatProgram = createProgram(heatSource);
    displayProgram = createProgram(displaySource);
    averageProgram = createProgram(averageSource);
    targets = createTargets(gridSize);
    neutronPowerTexture = createNeutronPowerTexture(gridSize);
    materialTexture = createMaterialTexture(gridSize, materialIds);
    neutronPowerField = new Float32Array(gridSize * gridSize);
    averageTargets = createAverageTargets(gridSize);


  } catch (error) {
    engineStatus.textContent = `WebGL setup failed: ${error.message}`;
    toggleButton.disabled = true;
    simulateButton.disabled = true;
    resetButton.disabled = true;
    editButton.disabled = true;
    neutronRateInput.disabled = true;
    flowDirectionInput.disabled = true;
    flowSpeedInput.disabled = true;
    heatTransportInput.disabled = true;
    stepsPerFrameInput.disabled = true;
    materialInput.disabled = true;
    brushInput.disabled = true;
    return;
  }

  const heatUniforms = {
    previous: gl.getUniformLocation(heatProgram, "u_previous"),
    neutronPower: gl.getUniformLocation(heatProgram, "u_neutronPower"),
    sodiumPrevious: gl.getUniformLocation(heatProgram, "u_sodiumPrevious"),
    powerToTemperatureScale: gl.getUniformLocation(heatProgram, "u_powerToTemperatureScale"),
    gridSize: gl.getUniformLocation(heatProgram, "u_gridSize"),
    cellEdge: gl.getUniformLocation(heatProgram, "u_cellEdge"),
    diffusionStep: gl.getUniformLocation(heatProgram, "u_diffusionStep"),
    materials: gl.getUniformLocation(heatProgram, "u_materials"),
    flowDirection: gl.getUniformLocation(heatProgram, "u_flowDirection"),
    flowSpeed: gl.getUniformLocation(heatProgram, "u_flowSpeed"),
    heatTransportMultiplier: gl.getUniformLocation(heatProgram, "u_heatTransportMultiplier"),
    cellVolume: gl.getUniformLocation(heatProgram, "u_cellVolume"),
  };

  const displayUniforms = {
    temperature: gl.getUniformLocation(displayProgram, "u_temperature"),
    sodiumTemperature: gl.getUniformLocation(displayProgram, "u_sodiumTemperature"),
    materials: gl.getUniformLocation(displayProgram, "u_materials"),
    viewMaterials: gl.getUniformLocation(displayProgram, "u_viewMaterials"),
    canvasSize: gl.getUniformLocation(displayProgram, "u_canvasSize"),
    gridSize: gl.getUniformLocation(displayProgram, "u_gridSize"),
    cellEdge: gl.getUniformLocation(displayProgram, "u_cellEdge"),
  };

  const averageUniforms = {
    source: gl.getUniformLocation(averageProgram, "u_source"),
    sodiumSource: gl.getUniformLocation(averageProgram, "u_sodiumSource"),
    materials: gl.getUniformLocation(averageProgram, "u_materials"),
    sourceSize: gl.getUniformLocation(averageProgram, "u_sourceSize"),
    firstPass: gl.getUniformLocation(averageProgram, "u_firstPass"),
  };

  function uploadNeutronPowerField() {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, neutronPowerTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridSize, gridSize, gl.RED, gl.FLOAT, neutronPowerField);
    gl.activeTexture(gl.TEXTURE0);
  }

  function isFissileMaterial(materialId) {
    return materialId === 5 || materialId === 8;
  }

  function updateFissileCell(index, nextMaterialId) {
    const oldMaterialId = materialIds[index];
    const wasFissile = isFissileMaterial(oldMaterialId);
    const isFissile = isFissileMaterial(nextMaterialId);
    if (wasFissile && !isFissile) {
      const slot = fissileCellSlotByGridIndex[index];
      const lastIndex = fissileCellIndices[--fissileCellCount];
      fissileCellIndices[slot] = lastIndex;
      fissileCellSlotByGridIndex[lastIndex] = slot;
      fissileCellSlotByGridIndex[index] = -1;
    } else if (!wasFissile && isFissile) {
      fissileCellSlotByGridIndex[index] = fissileCellCount;
      fissileCellIndices[fissileCellCount++] = index;
    }
    materialIds[index] = nextMaterialId;
  }

  function rebuildFissileCellList() {
    fissileCellCount = 0;
    fissileCellSlotByGridIndex.fill(-1);
    for (let index = 0; index < materialIds.length; index++) {
      if (isFissileMaterial(materialIds[index])) {
        fissileCellSlotByGridIndex[index] = fissileCellCount;
        fissileCellIndices[fissileCellCount++] = index;
      }
    }
  }

  function crossSectionAt(materialId, energyEv) {
    if (!crossSectionEnergies || !logarithmicHash || materialId < 0 || materialId > 15) return 0;
    const last = crossSectionEnergies.length - 1;
    const boundedEnergy = Math.max(crossSectionEnergies[0], Math.min(crossSectionEnergies[last], energyEv));
    const bucket = Math.max(0, Math.min(LOG_HASH_SIZE - 1,
      Math.floor((Math.log(boundedEnergy) - hashLogMinimum) / hashLogStep)));
    let left = logarithmicHash[bucket];
    while (left < last - 1 && crossSectionEnergies[left + 1] < boundedEnergy) left++;
    while (left > 0 && crossSectionEnergies[left] > boundedEnergy) left--;
    const e0 = crossSectionEnergies[left];
    const e1 = crossSectionEnergies[left + 1];
    const fraction = (boundedEnergy - e0) / (e1 - e0);
    const values = crossSectionsByMaterial[materialId];
    return values[left] + (values[left + 1] - values[left]) * fraction;
  }

  async function loadCrossSectionGrid() {
    const response = await fetch(canvas.dataset.neutronXsGrid);
    if (!response.ok) throw new Error("Cross-section table request failed (" + response.status + ").");
    const lines = (await response.text()).trim().split(/\r?\n/);
    const header = lines[0].split(",");
    const materialIdsByName = {
      vacuum: 0, concrete: 1, steel: 2, water: 3, air: 4, u235: 5,
      cd113: 6, pb208: 7, pu239: 8, na23: 9,
      blank_5: 10, blank_6: 11, blank_7: 12, blank_8: 13, blank_9: 14, blank_10: 15,
    };
    if (header[0] !== "energy_eV") throw new Error("Unexpected cross-section grid header.");
    const columnMaterialIds = header.slice(1).map((name) => materialIdsByName[name.toLowerCase()]);
    if (columnMaterialIds.some((id) => id === undefined)) throw new Error("Unknown material in cross-section table.");
    crossSectionEnergies = new Float32Array(lines.length - 1);
    crossSectionsByMaterial = Array.from({ length: 16 }, () => new Float32Array(lines.length - 1));
    for (let row = 1; row < lines.length; row++) {
      const fields = lines[row].split(",");
      crossSectionEnergies[row - 1] = Number(fields[0]);
      for (let column = 1; column < fields.length; column++) {
        crossSectionsByMaterial[columnMaterialIds[column - 1]][row - 1] = Number(fields[column]);
      }
    }
    if (crossSectionEnergies.length < 2 || crossSectionEnergies[0] <= 0) {
      throw new Error("Cross-section table needs at least two positive energy values.");
    }
    logarithmicHash = new Uint16Array(LOG_HASH_SIZE);
    hashLogMinimum = Math.log(crossSectionEnergies[0]);
    hashLogStep = (Math.log(crossSectionEnergies[crossSectionEnergies.length - 1]) - hashLogMinimum) / LOG_HASH_SIZE;
    let gridIndex = 0;
    for (let bucket = 0; bucket < LOG_HASH_SIZE; bucket++) {
      const energy = Math.exp(hashLogMinimum + bucket * hashLogStep);
      while (gridIndex < crossSectionEnergies.length - 2 &&
        crossSectionEnergies[gridIndex + 1] < energy) gridIndex++;
      logarithmicHash[bucket] = gridIndex;
    }
  }

  function removeNeutron(index) {
    const last = --neutronCount;
    if (index !== last) {
      neutronPositions[index * 2] = neutronPositions[last * 2];
      neutronPositions[index * 2 + 1] = neutronPositions[last * 2 + 1];
      neutronVelocities[index * 2] = neutronVelocities[last * 2];
      neutronVelocities[index * 2 + 1] = neutronVelocities[last * 2 + 1];
      neutronEnergyMeV[index] = neutronEnergyMeV[last];
    }
  }

  function neutronSpeedForEnergy(energyMeV) {
    return Math.sqrt(2 * energyMeV * 1e6 * ELECTRON_VOLT_JOULES / NEUTRON_MASS_KG);
  }

  function addNeutron(x, y, energyMeV, directionIndex) {
    if (neutronCount >= MAX_NEUTRONS) return;
    const index = neutronCount++;
    const speed = neutronSpeedForEnergy(energyMeV);
    const direction = SCATTER_DIRECTION_LUT[directionIndex];
    neutronPositions[index * 2] = x;
    neutronPositions[index * 2 + 1] = y;
    neutronVelocities[index * 2] = direction[0] * speed;
    neutronVelocities[index * 2 + 1] = direction[1] * speed;
    neutronEnergyMeV[index] = energyMeV;
  }

  function spawnNeutron() {
    if (fissileCellCount === 0) return;
    const cellIndex = fissileCellIndices[Math.min(fissileCellCount - 1, Math.floor(randomUnit() * fissileCellCount))];
    const cellX = cellIndex % gridSize;
    const cellY = Math.floor(cellIndex / gridSize);
    const energyMeV = (NEUTRON_ENERGY_MIN_EV +
      randomUnit() * (NEUTRON_ENERGY_MAX_EV - NEUTRON_ENERGY_MIN_EV)) * 1e-6;
    addNeutron((cellX + randomUnit()) * cellEdge, (cellY + randomUnit()) * cellEdge,
      energyMeV, Math.floor(randomUnit() * ENERGY_RETENTION_LUT_SIZE));
  }

  function advanceNeutron(index) {
    const offset = index * 2;
    let x = neutronPositions[offset];
    let y = neutronPositions[offset + 1];
    let remainingTime = stepSeconds;
    let scatterCount = 0;

    while (remainingTime > 1e-12 && scatterCount < MAX_SCATTERS_PER_NEUTRON_STEP) {
      const velocityX = neutronVelocities[offset];
      const velocityY = neutronVelocities[offset + 1];
      const speed = Math.hypot(velocityX, velocityY);
      if (!(speed > 0)) break;
      const directionX = velocityX / speed;
      const directionY = velocityY / speed;
      const exitX = directionX > 0
        ? (PLATE_SIZE - x) / directionX
        : directionX < 0 ? -x / directionX : Infinity;
      const exitY = directionY > 0
        ? (PLATE_SIZE - y) / directionY
        : directionY < 0 ? -y / directionY : Infinity;
      let remainingDistance = Math.min(speed * remainingTime, exitX, exitY);

      while (remainingDistance > 1e-10) {
        const adjustedX = directionX < 0 ? x - 1e-10 : x;
        const adjustedY = directionY < 0 ? y - 1e-10 : y;
        const cellX = Math.max(0, Math.min(gridSize - 1, Math.floor(adjustedX / cellEdge)));
        const cellY = Math.max(0, Math.min(gridSize - 1, Math.floor(adjustedY / cellEdge)));
        const nextBoundaryX = directionX > 0
          ? (cellX + 1) * cellEdge : directionX < 0 ? cellX * cellEdge : Infinity;
        const nextBoundaryY = directionY > 0
          ? (cellY + 1) * cellEdge : directionY < 0 ? cellY * cellEdge : Infinity;
        const distanceX = directionX === 0 ? Infinity : (nextBoundaryX - x) / directionX;
        const distanceY = directionY === 0 ? Infinity : (nextBoundaryY - y) / directionY;
        const segmentLength = Math.min(remainingDistance,
          Math.max(1e-10, distanceX), Math.max(1e-10, distanceY));
        const cellIndex = cellY * gridSize + cellX;
        const materialId = materialIds[cellIndex];
        const energyMeV = neutronEnergyMeV[index];
        const macroscopicSigmaPerCm =
          crossSectionAt(materialId, energyMeV * 1e6);
        const opticalDepth = macroscopicSigmaPerCm * segmentLength * 100;
        const probability = -Math.expm1(-opticalDepth);
        const interactionRoll = randomUnit();

        if (probability > 0 && interactionRoll < probability) {
          const distanceToInteraction = Math.min(segmentLength,
            -Math.log1p(-interactionRoll) / (macroscopicSigmaPerCm * 100));
          x += directionX * distanceToInteraction;
          y += directionY * distanceToInteraction;
          remainingTime = Math.max(0, remainingTime - distanceToInteraction / speed);

          if (materialId === 1 || materialId === 2 || materialId === 3 ||
              materialId === 4 || materialId === 6 || materialId === 7 || materialId === 9) {
            let captureProbability = 0;
            let retention = 0;
            let retentionTable = null;

            if (materialId === 1) {
              retention = CONCRETE_RETENTION;
              if (energyMeV < CONCRETE_CAPTURE_THRESHOLD_MEV) {
                captureProbability = CONCRETE_CAPTURE_PROBABILITY;
              }
            } else if (materialId === 2) {
              retention = STEEL_RETENTION;
              if (energyMeV < STEEL_CAPTURE_THRESHOLD_MEV) {
                captureProbability = STEEL_CAPTURE_PROBABILITY;
              }
            } else if (materialId === 6) {
              retention = CADMIUM_RETENTION;
              if (energyMeV < CADMIUM_CAPTURE_THRESHOLD_MEV) {
                captureProbability = 1;
              } else if (energyMeV < CADMIUM_SCATTER_THRESHOLD_MEV) {
                captureProbability = CADMIUM_INTERMEDIATE_CAPTURE_PROBABILITY;
              }
            } else if (materialId === 7) {
              retention = LEAD_RETENTION;
            } else {
              const captureThresholdMeV = materialId === 9
                ? SODIUM_CAPTURE_THRESHOLD_MEV : THERMAL_CAPTURE_THRESHOLD_MEV;
              captureProbability = materialId === 9 ? SODIUM_CAPTURE_PROBABILITY
                : materialId === 3 ? WATER_CAPTURE_PROBABILITY : AIR_CAPTURE_PROBABILITY;
              if (energyMeV >= captureThresholdMeV) captureProbability = 0;
              retentionTable = materialId === 3 ? WATER_RETENTION_LUT
                : materialId === 4 ? AIR_RETENTION_LUT : SODIUM_RETENTION_LUT;
            }

            if (captureProbability >= 1 ||
                (captureProbability > 0 && randomUnit() < captureProbability)) {
              neutronPowerField[cellIndex] += NEUTRON_ABSORPTION_POWER_WATTS;
              neutronPositions[offset] = x;
              neutronPositions[offset + 1] = y;
              return false;
            }

            if (retentionTable) {
              retention = retentionTable[Math.floor(randomUnit() * ENERGY_RETENTION_LUT_SIZE)];
            }
            const newEnergyMeV = Math.max(MIN_NEUTRON_ENERGY_MEV, energyMeV * retention);
            const newSpeed = neutronSpeedForEnergy(newEnergyMeV);
            const newDirection =
              SCATTER_DIRECTION_LUT[Math.floor(randomUnit() * ENERGY_RETENTION_LUT_SIZE)];
            neutronEnergyMeV[index] = newEnergyMeV;
            neutronVelocities[offset] = newDirection[0] * newSpeed;
            neutronVelocities[offset + 1] = newDirection[1] * newSpeed;
            scatterCount++;
            remainingDistance = 0;
            break;
          }

          // Interactions in remaining materials remain total absorption for now.
          neutronPowerField[cellIndex] += NEUTRON_ABSORPTION_POWER_WATTS;
          neutronPositions[offset] = x;
          neutronPositions[offset + 1] = y;
          return false;
        }

        x += directionX * segmentLength;
        y += directionY * segmentLength;
        remainingDistance -= segmentLength;
        remainingTime = Math.max(0, remainingTime - segmentLength / speed);
      }
    }

    neutronPositions[offset] = x;
    neutronPositions[offset + 1] = y;
    return x > 0 && y > 0 && x < PLATE_SIZE && y < PLATE_SIZE;
  }
  function prepareNeutronsForStep() {
    neutronPowerField.fill(0);
    for (let index = 0; index < neutronCount;) {
      if (!advanceNeutron(index)) {
        removeNeutron(index);
        continue;
      }
      index++;
    }

    neutronPhysicsStepCount++;
    if (fissileCellCount > 0) {
      neutronSpawnRemainder += stepSeconds * neutronSpawnRate;
      if (neutronPhysicsStepCount % NEUTRON_SPAWN_STEP_INTERVAL === 0) {
        let spawnCount = Math.floor(neutronSpawnRemainder);
        neutronSpawnRemainder -= spawnCount;
        spawnCount = Math.min(spawnCount, MAX_NEUTRONS - neutronCount);
        for (let i = 0; i < spawnCount; i++) spawnNeutron();
      }
    } else {
      neutronSpawnRemainder = 0;
    }
    uploadNeutronPowerField();
  }

  function drawTemperature() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1 - currentTarget].framebuffer);
    gl.viewport(0, 0, gridSize, gridSize);
    gl.useProgram(heatProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].texture);
    gl.uniform1i(heatUniforms.previous, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, neutronPowerTexture);
    gl.uniform1i(heatUniforms.neutronPower, 1);
    gl.uniform1f(heatUniforms.powerToTemperatureScale, powerToTemperatureScale);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.uniform1i(heatUniforms.materials, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].sodiumTexture);
    gl.uniform1i(heatUniforms.sodiumPrevious, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(heatUniforms.gridSize, gridSize);
    gl.uniform1f(heatUniforms.cellEdge, cellEdge);
    gl.uniform1f(heatUniforms.diffusionStep, diffusionStep);
    gl.uniform1i(heatUniforms.flowDirection, Number(flowDirectionInput.value));
    const flowSpeedMetersPerSecond = Number(flowSpeedInput.value);
    const baseFlowFraction = Math.min(
      1,
      flowSpeedMetersPerSecond * stepSeconds / (cellEdge * SIMULATION_SPEED)
    );
    const flowStepFraction = baseFlowFraction === 0
      ? 0
      : 1 - Math.pow(1 - baseFlowFraction, heatTransportMultiplier);
    gl.uniform1f(heatUniforms.flowSpeed, flowStepFraction);
    gl.uniform1f(heatUniforms.heatTransportMultiplier, heatTransportMultiplier);
    gl.uniform1f(heatUniforms.cellVolume, cellEdge * cellEdge * PLATE_THICKNESS);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
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
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].sodiumTexture);
      gl.uniform1i(averageUniforms.sodiumSource, 2);
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
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, targets[currentTarget].sodiumTexture);
    gl.uniform1i(displayUniforms.sodiumTemperature, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(displayUniforms.canvasSize, canvas.width, canvas.height);
    gl.uniform1i(displayUniforms.gridSize, gridSize);
    gl.uniform1f(displayUniforms.cellEdge, cellEdge);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.uniform1i(displayUniforms.materials, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(displayUniforms.viewMaterials, phase === "drawing" ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function updateGridInfo() {
    gridInfo.textContent =
      `${gridSize} × ${gridSize} cells · ${(cellEdge * 1000).toFixed(3)} mm per cell`;
  }

  function render() {
    drawCanvas();
    neutronInfo.textContent = "Neutrons: " + neutronCount + " / " + MAX_NEUTRONS;
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
    let steps = 0;

    if (playing) {
      const stepsPerFrame = Number(stepsPerFrameInput.value);
      while (steps < stepsPerFrame) {
        prepareNeutronsForStep();
        drawTemperature();
        simulationTime += stepSeconds;
        averageUpdateElapsed += stepSeconds;
        steps += 1;
      }
      actualStepsPerFrame.textContent = String(steps);
      if (averageUpdateElapsed >= 0.5) {
        updateAverageTemperature();
        averageUpdateElapsed = 0;
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
    if (phase !== "simulating") return;
    playing = nextPlaying;
    toggleButton.textContent = playing ? "Pause" : "Play";
    toggleButton.setAttribute("aria-pressed", String(playing));
    render();

    if (playing) scheduleFrame();
  }

  function setBrushSize(value) {
    brushSize = Number(value);
    brushValue.textContent = `${brushSize} × ${brushSize}`;
  }

  function encodeGridText() {
    const rows = [];
    for (let y = gridSize - 1; y >= 0; y--) {
      let row = "";
      for (let x = 0; x < gridSize; x++) {
        const materialId = materialIds[y * gridSize + x];
        if (materialId > 15) {
          throw new Error(`Material ID ${materialId} cannot be encoded in one hexadecimal digit.`);
        }
        row += materialId.toString(16).toUpperCase();
      }
      rows.push(row);
    }
    return rows.join("\n") + "\n";
  }

  function parseGridText(text) {
    const normalized = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const rows = normalized.split(/\r\n|\n|\r/);
    if (rows[rows.length - 1] === "") rows.pop();
    if (rows.length !== gridSize) {
      throw new Error(`Expected ${gridSize} rows, found ${rows.length}.`);
    }

    const importedIds = new Uint8Array(gridSize * gridSize);
    for (let row = 0; row < gridSize; row++) {
      if (rows[row].length !== gridSize) {
        throw new Error(`Row ${row + 1} must contain exactly ${gridSize} characters.`);
      }
      for (let x = 0; x < gridSize; x++) {
        const character = rows[row][x];
        if (!/^[0-9a-f]$/i.test(character)) {
          throw new Error(`Invalid material code "${character}" at row ${row + 1}, column ${x + 1}.`);
        }
        const y = gridSize - row - 1;
        importedIds[y * gridSize + x] = Number.parseInt(character, 16);
      }
    }
    return importedIds;
  }

  function exportGrid() {
    const contents = encodeGridText();
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reactor-grid-${gridSize}x${gridSize}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    gridFileStatus.textContent = `Exported a ${gridSize} × ${gridSize} grid.`;
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
            updateFissileCell(index, materialId);
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
    simulationTime = 0;
    averageUpdateElapsed = 0;
    lastMeasuredExpelledEnergy = 0;
    actualStepsPerFrame.textContent = "0";
    thermalOutput.textContent = "Thermal power output (40% efficient): 0.00 W";
    neutronSpawnRemainder = 0;
    neutronPhysicsStepCount = 0;
    neutronCount = 0;
    neutronPowerField.fill(0);
    uploadNeutronPowerField();

    const ambient = new Float32Array([300, 300, 300, 0]);
    for (const target of targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clearBufferfv(gl.COLOR, 0, ambient);
      gl.clearBufferfv(gl.COLOR, 1, new Float32Array([300, 0, 0, 0]));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    currentTarget = 0;
    updateAverageTemperature();
    render();
    if (startPlaying) setPlaying(true);
  }

  function startSimulation() {
    if (!crossSectionsByMaterial) {
      engineStatus.textContent = "Waiting for the cross-section table to load.";
      return;
    }
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
    render();
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

  heatTransportInput.addEventListener("input", () => {
    const multiplier = heatTransportInput.valueAsNumber;
    if (
      !Number.isFinite(multiplier) ||
      multiplier < 0 ||
      multiplier > MAX_HEAT_TRANSPORT_MULTIPLIER
    ) {
      heatTransportInput.setAttribute("aria-invalid", "true");
      return;
    }

    heatTransportInput.removeAttribute("aria-invalid");
    heatTransportMultiplier = multiplier;
  });

  stepsPerFrameInput.addEventListener("input", () => {
    const value = Math.max(0, Math.min(100, Math.round(Number(stepsPerFrameInput.value))));
    stepsPerFrameInput.value = String(value);
    stepsPerFrameValue.textContent = String(value);
  });

  neutronRateInput.addEventListener("input", () => {
    const requestedRate = Number(neutronRateInput.value);
    if (
      !Number.isInteger(requestedRate) ||
      requestedRate < MIN_NEUTRON_SPAWN_RATE ||
      requestedRate > MAX_NEUTRON_SPAWN_RATE
    ) {
      neutronRateInput.setAttribute("aria-invalid", "true");
      return;
    }
    neutronRateInput.removeAttribute("aria-invalid");
    neutronSpawnRate = requestedRate;
  });

  brushInput.addEventListener("input", () => setBrushSize(brushInput.value));
  exportGridButton.addEventListener("click", exportGrid);
  importGridInput.addEventListener("change", async () => {
    const file = importGridInput.files && importGridInput.files[0];
    if (!file) return;
    try {
      if (phase !== "drawing") throw new Error("Return to drawing mode before importing a grid.");
      const importedIds = parseGridText(await file.text());
      materialIds.set(importedIds);
      rebuildFissileCellList();
      uploadMaterialIds();
      render();
      gridFileStatus.textContent = `Imported a ${gridSize} × ${gridSize} grid from ${file.name}.`;
    } catch (error) {
      gridFileStatus.textContent = `Import failed: ${error.message}`;
    } finally {
      importGridInput.value = "";
    }
  });
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
    }
  });

  canvas.addEventListener("click", (event) => {
    if (phase === "drawing") paintAt(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (phase === "drawing" && pointerPainting) paintAt(event);
  });

  const stopPainting = () => {
    pointerPainting = false;
    lastPaintCellX = null;
    lastPaintCellY = null;
  };
  canvas.addEventListener("pointerup", stopPainting);
  canvas.addEventListener("pointercancel", stopPainting);
  canvas.addEventListener("lostpointercapture", stopPainting);

  updateGridPhysics(gridSize);
  updateGridInfo();
  neutronRateInput.value = String(DEFAULT_NEUTRON_SPAWN_RATE);
  neutronInfo.textContent = "Neutrons: 0 / " + MAX_NEUTRONS;
  simulateButton.disabled = true;
  engineStatus.textContent = "Loading neutron cross-section data…";
  loadCrossSectionGrid().then(() => {
    simulateButton.disabled = false;
    engineStatus.textContent = "Cross-section table ready (" + crossSectionEnergies.length + " energy points).";
  }).catch((error) => {
    engineStatus.textContent = "Neutron cross-section loading failed: " + error.message;
    simulateButton.disabled = true;
  });
  flowDirectionValue.textContent = FLOW_DIRECTIONS[Number(flowDirectionInput.value)];
  flowDirectionInput.setAttribute("aria-valuetext", flowDirectionValue.textContent);
  flowSpeedValue.textContent = `${Number(flowSpeedInput.value).toFixed(1)} m/s`;
  stepsPerFrameValue.textContent = stepsPerFrameInput.value;
  setBrushSize(brushInput.value);
  drawCanvas();
  averageTemperature.textContent = "Average temperature: — (no material)";
})();


