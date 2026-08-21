import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import type { QualityTier, StationConfig } from "./world-map.ts";
import { qualitySettings } from "./world-map.ts";

export function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const noises = new Map<number, ReturnType<typeof createNoise2D>>();
function noiseFor(seed: number) {
  let noise = noises.get(seed);
  if (!noise) {
    noise = createNoise2D(seeded(seed));
    noises.set(seed, noise);
  }
  return noise;
}

function edge(station: StationConfig, angle: number) {
  const noise = noiseFor(station.seed);
  return 1 + noise(Math.cos(angle) * 0.9, Math.sin(angle) * 0.9) * 0.12 + noise(Math.cos(angle) * 2.4 + 7, Math.sin(angle) * 2.4 - 5) * 0.045;
}

export function terrainHeight(station: StationConfig, x: number, z: number) {
  const noise = noiseFor(station.seed);
  const radial = Math.min(1.15, Math.hypot(x, z) / station.radius);
  const broad = noise(x * 0.085, z * 0.085) * 0.8;
  const middle = noise(x * 0.22 + 11, z * 0.22 - 8) * 0.34;
  const detail = noise(x * 0.62 - 3, z * 0.62 + 9) * 0.11;
  const plateau = Math.tanh((broad + middle) * 1.35) * station.biome.elevation;
  const erosion = Math.pow(radial, 4.5) * (0.8 + station.biome.elevation * 0.25);
  return 1.35 + plateau + detail + (1 - radial) * 0.48 - erosion;
}

export function createTerrain(station: StationConfig, quality: QualityTier) {
  const segments = quality === "high" ? 96 : quality === "medium" ? 64 : 40;
  const topRings = quality === "high" ? 38 : quality === "medium" ? 28 : 18;
  const sideRings = quality === "low" ? 7 : 12;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= topRings; ring++) {
    const radial = ring / topRings;
    for (let segment = 0; segment <= segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const radius = station.radius * radial * (1 + (edge(station, angle) - 1) * radial);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, terrainHeight(station, x, z), z);
    }
  }

  for (let ring = 1; ring <= sideRings; ring++) {
    const depth = ring / sideRings;
    for (let segment = 0; segment <= segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const pinch = Math.max(0.2, 1 - depth * (0.62 + depth * 0.18));
      const radius = station.radius * edge(station, angle) * pinch * (1 + Math.sin(depth * 18 + angle * 3 + station.seed) * 0.025);
      const edgeX = Math.cos(angle) * station.radius * edge(station, angle);
      const edgeZ = Math.sin(angle) * station.radius * edge(station, angle);
      positions.push(Math.cos(angle) * radius, terrainHeight(station, edgeX, edgeZ) - depth * (4.4 + station.biome.elevation * 0.8), Math.sin(angle) * radius);
    }
  }

  // Close the underside with a keel point so the island reads as a solid rock slab.
  const keelDepth = 5.6 + station.biome.elevation;
  for (let segment = 0; segment <= segments; segment++) {
    const angle = segment / segments * Math.PI * 2;
    positions.push(Math.cos(angle) * 0.35, terrainHeight(station, 0, 0) - keelDepth, Math.sin(angle) * 0.35);
  }

  const rows = topRings + sideRings + 1;
  for (let ring = 0; ring < rows; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * (segments + 1) + segment;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTerrainMaterial(station: StationConfig) {
  const material = new THREE.MeshStandardMaterial({ color: station.palette.ground, roughness: 0.88, metalness: 0.04, envMapIntensity: 0.65 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainMoss = { value: new THREE.Color(station.palette.moss) };
    shader.uniforms.terrainRock = { value: new THREE.Color(station.palette.rock) };
    shader.uniforms.terrainGlow = { value: new THREE.Color(station.palette.glow) };
    shader.uniforms.terrainMoisture = { value: station.biome.moisture };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vTerrainLocal; varying vec3 vTerrainNormal; varying vec3 vTerrainWorld; varying vec3 vTerrainWorldNormal;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvTerrainLocal = position; vTerrainNormal = normal; vTerrainWorld = (modelMatrix * vec4(position, 1.0)).xyz; vTerrainWorldNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vTerrainLocal; varying vec3 vTerrainNormal; varying vec3 vTerrainWorld; varying vec3 vTerrainWorldNormal; uniform vec3 terrainMoss; uniform vec3 terrainRock; uniform vec3 terrainGlow; uniform float terrainMoisture;
        float terrainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float terrainNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), f.x), mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
        // Moss only where the surface faces up AND sits at plateau height — the
        // shallow skirt slopes read as "up" by normal alone and must stay rock.
        float up = smoothstep(0.52, 0.82, vTerrainNormal.y) * smoothstep(-0.1, 0.45, vTerrainLocal.y);
        // Mossy top: patchy two-tone ground cover, brighter toward the rim of the island.
        float patches = terrainNoise(vTerrainLocal.xz * 0.55) * 0.6 + terrainNoise(vTerrainLocal.xz * 1.7 + 31.0) * 0.4;
        float wet = smoothstep(-0.2, 1.2, vTerrainLocal.y) * terrainMoisture;
        vec3 topColor = mix(diffuse * 1.12, terrainMoss * (0.95 + wet * 0.25), smoothstep(0.22, 0.8, patches));
        // Rocky underside: darker with depth, with soft horizontal strata bands.
        float depth = clamp(-vTerrainLocal.y * 0.22, 0.0, 1.0);
        float strata = 0.86 + 0.14 * smoothstep(0.35, 0.65, fract(vTerrainLocal.y * 0.85 + terrainNoise(vTerrainLocal.xz * 0.4) * 0.35));
        vec3 sideColor = terrainRock * mix(1.0, 0.34, depth) * strata;
        vec4 diffuseColor = vec4(mix(sideColor, topColor, up), opacity);`)
      .replace("vec3 totalEmissiveRadiance = emissive;", `
        // Soft cool rim so the silhouette separates from the night sky; no streaks.
        float rimFacing = 1.0 - clamp(dot(normalize(cameraPosition - vTerrainWorld), normalize(vTerrainWorldNormal)), 0.0, 1.0);
        float rim = pow(rimFacing, 3.0);
        // Sparse tiny mineral glints on the rocky sides only.
        float glint = smoothstep(0.965, 1.0, terrainNoise(vTerrainLocal.xy * 2.6 + vTerrainLocal.zx * 1.9));
        vec3 totalEmissiveRadiance = emissive + terrainGlow * (rim * 0.085 + glint * (1.0 - up) * 0.55);`);
  };
  // One shared program for every island — only uniforms differ per station.
  material.customProgramCacheKey = () => "adc-organic";
  return material;
}

function irregularRock(seed: number) {
  const geometry = new THREE.IcosahedronGeometry(0.38, 1);
  const random = seeded(seed);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const amount = 0.72 + random() * 0.5;
    position.setXYZ(index, x * amount, y * (0.72 + random() * 0.65), z * amount);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function grassCluster() {
  const positions: number[] = [];
  for (let blade = 0; blade < 7; blade++) {
    const angle = blade / 7 * Math.PI * 2;
    const width = 0.045 + (blade % 3) * 0.008;
    const length = 0.46 + (Math.sin(blade * 4.7) * 0.5 + 0.5) * 0.24;
    const sideX = Math.cos(angle + Math.PI / 2) * width;
    const sideZ = Math.sin(angle + Math.PI / 2) * width;
    const leanX = Math.cos(angle) * 0.13;
    const leanZ = Math.sin(angle) * 0.13;
    positions.push(-sideX, 0, -sideZ, sideX, 0, sideZ, leanX * 0.45 + sideX * 0.45, length * 0.58, leanZ * 0.45 + sideZ * 0.45);
    positions.push(-sideX, 0, -sideZ, leanX * 0.45 + sideX * 0.45, length * 0.58, leanZ * 0.45 + sideZ * 0.45, leanX, length, leanZ);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function fernCluster() {
  const positions: number[] = [];
  for (let leaf = 0; leaf < 8; leaf++) {
    const y = 0.12 + leaf * 0.1;
    const width = (1 - leaf / 9) * 0.34;
    const reach = 0.12 + leaf * 0.014;
    positions.push(0, y - 0.06, 0, -width, y, reach, 0, y + 0.08, 0);
    positions.push(0, y - 0.06, 0, width, y, -reach, 0, y + 0.08, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function flowerCluster() {
  const positions: number[] = [-0.025, 0, 0, 0.025, 0, 0, 0, 0.78, 0];
  for (let petal = 0; petal < 7; petal++) {
    const angle = petal / 7 * Math.PI * 2;
    const next = angle + Math.PI / 7;
    positions.push(0, 0.75, 0, Math.cos(angle) * 0.28, 0.88, Math.sin(angle) * 0.28, Math.cos(next) * 0.12, 0.9, Math.sin(next) * 0.12);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function mushroomGeometry() {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.11, 0.04), new THREE.Vector2(0.1, 0.48), new THREE.Vector2(0.16, 0.54),
    new THREE.Vector2(0.42, 0.6), new THREE.Vector2(0.3, 0.78), new THREE.Vector2(0, 0.86),
  ], 12);
}

function branchGeometry(seed: number) {
  const random = seeded(seed);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.48, 0, 0), new THREE.Vector3(-0.12, 0.12 + random() * 0.1, 0.08), new THREE.Vector3(0.2, 0.04, -0.06), new THREE.Vector3(0.5, 0.16, 0),
  ]);
  return new THREE.TubeGeometry(curve, 10, 0.055, 5, false);
}

function floraGeometry(station: StationConfig) {
  if (station.biome.kind === "ruins") return fernCluster();
  if (station.biome.kind === "heath" || station.biome.kind === "lunar") return flowerCluster();
  return grassCluster();
}

function accentGeometry(station: StationConfig) {
  if (station.biome.kind === "moss" || station.biome.kind === "heath" || station.biome.kind === "wind") return flowerCluster();
  if (station.biome.kind === "ruins" || station.biome.kind === "lunar") return mushroomGeometry();
  if (station.biome.kind === "market") return branchGeometry(station.seed + 220);
  return irregularRock(station.seed + 140);
}

function place(station: StationConfig, random: () => number, minRadius = 0.12, maxRadius = 0.86) {
  const angle = random() * Math.PI * 2;
  const radius = (minRadius + Math.sqrt(random()) * (maxRadius - minRadius)) * station.radius;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return new THREE.Vector3(x, terrainHeight(station, x, z), z);
}

export function createBiomeInstances(station: StationConfig, quality: QualityTier, detailed: boolean) {
  const density = Math.min(qualitySettings[quality].vegetation, station.lod[quality]) * (detailed ? 1 : 0.08);
  const random = seeded(station.seed * 101);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const floraCount = Math.max(detailed ? 18 : 4, Math.round(165 * station.biome.flora * density));
  const plantGeometry = floraGeometry(station);
  const floraMaterial = new THREE.MeshStandardMaterial({ color: station.palette.moss, roughness: 0.92, side: THREE.DoubleSide });
  floraMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.uniforms.wind = { value: station.biome.wind };
    floraMaterial.userData.shader = shader;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float time; uniform float wind;").replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.x += sin(time * 1.7 + position.y * 4.0 + instanceMatrix[3].x) * position.y * 0.07 * wind;");
  };
  const flora = new THREE.InstancedMesh(plantGeometry, floraMaterial, floraCount);
  for (let index = 0; index < floraCount; index++) {
    const p = place(station, random, 0.16, 0.88);
    quaternion.setFromEuler(new THREE.Euler((random() - 0.5) * 0.08, random() * Math.PI, (random() - 0.5) * 0.12));
    const size = 0.42 + random() * 0.68;
    scale.set(size, size * (0.72 + random() * 0.55), size);
    matrix.compose(p, quaternion, scale);
    flora.setMatrixAt(index, matrix);
  }
  flora.instanceMatrix.needsUpdate = true;
  flora.castShadow = detailed && quality !== "low";

  const rockCount = Math.max(detailed ? 8 : 3, Math.round(42 * station.biome.rocks * density));
  const rocks = new THREE.InstancedMesh(irregularRock(station.seed + 70), new THREE.MeshStandardMaterial({ color: station.palette.rock, roughness: 0.9, metalness: station.biome.kind === "heath" ? 0.18 : 0.03 }), rockCount);
  for (let index = 0; index < rockCount; index++) {
    const p = place(station, random, 0.22, 0.9);
    quaternion.setFromEuler(new THREE.Euler(random(), random() * Math.PI, random()));
    const size = 0.48 + random() * 0.92;
    scale.set(size, size * (0.55 + random() * 0.7), size * (0.7 + random() * 0.5));
    matrix.compose(p.add(new THREE.Vector3(0, 0.12, 0)), quaternion, scale);
    rocks.setMatrixAt(index, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = detailed && quality !== "low";

  const accentCount = Math.max(detailed ? 6 : 2, Math.round(28 * station.biome.accents * density));
  const detailGeometry = accentGeometry(station);
  const accents = new THREE.InstancedMesh(detailGeometry, new THREE.MeshStandardMaterial({ color: station.palette.glow, emissive: station.palette.glow, emissiveIntensity: 1.8, roughness: 0.36, side: THREE.DoubleSide }), accentCount);
  for (let index = 0; index < accentCount; index++) {
    const p = place(station, random, 0.25, 0.84);
    quaternion.setFromEuler(new THREE.Euler(random() * 0.3, random() * Math.PI, (random() - 0.5) * 0.35));
    const size = 0.16 + random() * 0.34;
    scale.set(size, size * (1.4 + random() * 1.6), size);
    matrix.compose(p.add(new THREE.Vector3(0, 0.12, 0)), quaternion, scale);
    accents.setMatrixAt(index, matrix);
  }
  accents.instanceMatrix.needsUpdate = true;
  return { flora, rocks, accents };
}

export function createFragments(station: StationConfig, quality: QualityTier) {
  const count = quality === "low" ? 4 : quality === "medium" ? 8 : 12;
  const random = seeded(station.seed + 400);
  const geometry = irregularRock(station.seed + 300);
  const material = new THREE.MeshStandardMaterial({ color: station.palette.rock, roughness: 0.92 });
  const fragments = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const radius = station.radius * (0.35 + random() * 0.62);
    const p = new THREE.Vector3(Math.cos(angle) * radius, -2.4 - random() * 4.8, Math.sin(angle) * radius);
    q.setFromEuler(new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI));
    const size = 0.25 + random() * 0.9;
    s.set(size, size * (0.5 + random()), size);
    matrix.compose(p, q, s);
    fragments.setMatrixAt(index, matrix);
  }
  fragments.instanceMatrix.needsUpdate = true;
  fragments.castShadow = quality !== "low";
  return fragments;
}
