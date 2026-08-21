import assert from "node:assert/strict";
import type { BufferGeometry } from "three";
import { cameraSegment, destinationForRoute, flightArcHeight, lowerQualityTier, qualitySettings, routeForStation, selectQualityTier, springStep, stationIndexForRoute, stations } from "./world-map.ts";
import { createBiomeInstances, createFragments, createTerrain } from "./world-geometry.ts";

assert.deepEqual(cameraSegment(-2), { from: 0, to: 1, amount: 0 });
assert.deepEqual(cameraSegment(9), { from: 6, to: 6, amount: 0 });
assert.equal(cameraSegment(2.5).amount, 0.5);
assert.equal(stationIndexForRoute("/projects/zapa-pos"), 3);
assert.equal(stationIndexForRoute("/projects/jiujitsukravmaga"), 1);
assert.equal(stationIndexForRoute("/blog/hello-world"), 4);
assert.equal(destinationForRoute("/projects").kind, "space");
assert.equal(destinationForRoute("/").kind, "journey");
assert.equal(destinationForRoute("/blog/hello-world").parent, "adc");
assert.equal(destinationForRoute("/projects/zapa-pos").parent, "zapapos");
assert.equal(routeForStation("waak"), "/projects/all-in-one");
assert.equal(flightArcHeight(1), 7);
assert.equal(flightArcHeight(100), 20);
assert.ok(stations.every(({ seed, radius, camera, target, dino, pose, biome, landmark, editorial, lod, signage, speech }) => seed && radius > 7 && camera.length === 3 && target.length === 3 && dino.length === 3 && pose && biome.kind && landmark && editorial.camera.length === 3 && editorial.target.length === 3 && editorial.dino.length === 3 && editorial.fov >= 40 && lod.high >= lod.medium && lod.medium >= lod.low && signage.some((sign) => "title" in sign && sign.title) && speech.split(/\s+/).length <= 75));
assert.deepEqual(new Set(stations.map((station) => station.biome.kind)).size, 7);
assert.equal(selectQualityTier({ reducedMotion: true, width: 1440, memory: 16, cores: 10, webgl2: true }), "low");
assert.equal(selectQualityTier({ reducedMotion: false, width: 1440, memory: 16, cores: 10, webgl2: true }), "high");
assert.equal(selectQualityTier({ reducedMotion: false, width: 390, memory: 4, cores: 4, webgl2: true }), "medium");
assert.deepEqual(qualitySettings.high, { dpr: 1.5, shadows: 2048, vegetation: 1, particles: 1, post: "full" });
assert.ok(qualitySettings.high.vegetation > qualitySettings.medium.vegetation && qualitySettings.medium.vegetation > qualitySettings.low.vegetation);
assert.equal(lowerQualityTier("high"), "medium");
assert.equal(lowerQualityTier(lowerQualityTier("high")), "low");
assert.equal(lowerQualityTier("low"), "low");
assert.ok(destinationForRoute("/projects").camera[1] > 40, "projects space floats above the archipelago");
assert.ok(destinationForRoute("/about").camera[1] > 40, "about space floats above the archipelago");
assert.equal(destinationForRoute("/projects/zapa-pos").space?.anchor, "zapapos");

function triangles(geometry: BufferGeometry) {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3;
}

for (const [tier, limit] of [["high", 500_000], ["medium", 250_000], ["low", 120_000]] as const) {
  let total = 0;
  stations.forEach((station, index) => {
    const detailed = index < (tier === "low" ? 1 : 2);
    const terrain = createTerrain(station, detailed ? tier : "low");
    const biome = createBiomeInstances(station, tier, detailed);
    const fragments = createFragments(station, detailed ? tier : "low");
    total += triangles(terrain);
    total += triangles(biome.flora.geometry) * biome.flora.count;
    total += triangles(biome.rocks.geometry) * biome.rocks.count;
    total += triangles(biome.accents.geometry) * biome.accents.count;
    total += triangles(fragments.geometry) * fragments.count;
  });
  assert.ok(total < limit * 0.7, `${tier} geometry budget leaves room for text and post effects`);
}

let value = 1;
let velocity = 0;
for (let index = 0; index < 120; index++) [value, velocity] = springStep(value, velocity, 0, 1 / 60);
assert.ok(Math.abs(value) < 0.001 && Math.abs(velocity) < 0.01);

console.log("world map ok");
