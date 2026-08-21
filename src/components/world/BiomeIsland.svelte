<script lang="ts" module>
  import * as THREE from "three";
  import type { QualityTier, StationConfig } from "../../lib/world-map";
  import { createBiomeInstances, createFragments, createTerrain, createTerrainMaterial, seeded, terrainHeight } from "../../lib/world-geometry";

  // `detailed` flips on every station transition while scrolling, and Threlte never
  // disposes swapped-out geometries/materials — cache every variant instead of rebuilding.
  const cache = new Map<string, unknown>();
  function cached<Value>(key: string, create: () => Value): Value {
    if (!cache.has(key)) cache.set(key, create());
    return cache.get(key) as Value;
  }
</script>

<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { navigate } from "astro:transitions/client";
  import EnvironmentalSign from "./EnvironmentalSign.svelte";

  let { station, quality, detailed, showSigns }: { station: StationConfig; quality: QualityTier; detailed: boolean; showSigns: boolean } = $props();
  const { canvas } = useThrelte();
  const terrain = $derived.by(() => cached(`terrain-${station.id}-${detailed ? quality : "low"}`, () => createTerrain(station, detailed ? quality : "low")));
  const terrainMaterial = cached(`terrain-material-${station.id}`, () => createTerrainMaterial(station));
  const terrainBase = cached(`terrain-base-${station.id}`, () => new THREE.MeshStandardMaterial({ color: station.palette.ground, roughness: 0.92, metalness: 0.02, envMapIntensity: 0.5 }));
  const biome = $derived.by(() => cached(`biome-${station.id}-${quality}-${detailed}`, () => createBiomeInstances(station, quality, detailed)));
  const fragments = $derived.by(() => cached(`fragments-${station.id}-${detailed ? quality : "low"}`, () => createFragments(station, detailed ? quality : "low")));

  function landmark() {
    const root = new THREE.Group();
    const glow = new THREE.MeshStandardMaterial({ color: station.palette.glow, emissive: station.palette.glow, emissiveIntensity: 1.25, roughness: 0.35, transparent: true, opacity: 0.86 });
    const stone = new THREE.MeshStandardMaterial({ color: station.palette.rock, roughness: 0.86 });
    const water = new THREE.MeshPhysicalMaterial({ color: station.palette.glow, roughness: 0.08, metalness: 0.08, transmission: 0.45, thickness: 0.6, transparent: true, opacity: 0.72 });
    const y = terrainHeight(station, 0, -2.6) + 0.04;

    if (station.landmark === "water-garden" || station.landmark === "spring") {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(station.landmark === "water-garden" ? 2.3 : 1.4, 48), water);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(station.landmark === "water-garden" ? 1.4 : -1.2, y, -2.2);
      pool.receiveShadow = true;
      root.add(pool);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.038, 7, 64), new THREE.MeshStandardMaterial({ color: station.palette.glow, emissive: station.palette.glow, emissiveIntensity: 0.55, roughness: 0.4, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(pool.position).add(new THREE.Vector3(0, 0.05, 0));
      root.add(ring);
    }

    if (station.landmark === "ruin-arch" || station.landmark === "moon-gate") {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.4, 0, 0), new THREE.Vector3(-1.9, 2.3, 0), new THREE.Vector3(0, 3.2, 0), new THREE.Vector3(1.9, 2.3, 0), new THREE.Vector3(2.4, 0, 0),
      ]);
      const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, station.landmark === "moon-gate" ? 0.16 : 0.25, 7, false), stone);
      arch.position.set(0, y, -3.35);
      arch.castShadow = true;
      root.add(arch);
    }

    if (station.landmark === "route" || station.landmark === "market-path") {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-5.6, 0, 2), new THREE.Vector3(-2.2, 0.18, -0.3), new THREE.Vector3(0, 0, -2.3), new THREE.Vector3(3.1, 0.25, -0.4), new THREE.Vector3(5.4, 0, -2.1),
      ]);
      const route = new THREE.Mesh(new THREE.TubeGeometry(path, 72, station.landmark === "market-path" ? 0.34 : 0.24, 6, false), stone);
      route.position.y = y + 0.03;
      route.receiveShadow = true;
      root.add(route);
      if (station.landmark === "route") {
        const lane = new THREE.Mesh(new THREE.TubeGeometry(path, 72, 0.035, 5, false), glow);
        lane.position.y = y + 0.14;
        root.add(lane);
      }
    }

    if (station.landmark === "storm-veins") {
      const random = seeded(station.seed + 800);
      for (let index = 0; index < 4; index++) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3((random() - 0.5) * 6, y, -3 + random() * 4),
          new THREE.Vector3((random() - 0.5) * 5, y + 0.15, -2 + random() * 3),
          new THREE.Vector3((random() - 0.5) * 6, y + 0.05, -3 + random() * 5),
        ]);
        root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.022, 5, false), glow));
      }
    }
    return root;
  }

  const dominantLandmark = $derived.by(() => landmark());
  let elapsed = 0;
  useTask((delta) => {
    if (quality === "low" || !detailed) return;
    elapsed += delta;
    const shader = (biome.flora.material as THREE.Material).userData.shader;
    if (shader) shader.uniforms.time.value = elapsed;
  });

  function visit() { navigate(station.route); }
</script>

<T is={THREE.Group} position={station.position} rotation={[0, Math.sin(station.seed) * 0.018, Math.sin(station.seed * 0.7) * 0.012]}>
  {#if detailed}
    <T is={THREE.Mesh} geometry={terrain} material={terrainBase} position={[0, -0.055, 0]} receiveShadow />
  {/if}
  <T is={THREE.Mesh} geometry={terrain} material={terrainMaterial} castShadow receiveShadow />
  <!-- Invisible click proxy: interactivity raycasts registered objects per pointermove,
       so clicks land on this 24-segment disc instead of the ~12k-triangle terrain. -->
  <T
    is={THREE.Mesh}
    geometry={cached("click-proxy", () => new THREE.CylinderGeometry(1, 1, 1, 24))}
    material={cached("click-proxy-material", () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))}
    scale={[station.radius, 2.6, station.radius]}
    position={[0, 0.1, 0]}
    onclick={visit}
    onpointerenter={() => { canvas.style.cursor = "pointer"; }}
    onpointerleave={() => { canvas.style.cursor = ""; }}
  />
  {#if detailed || quality !== "low"}
    <T is={biome.flora} />
    <T is={biome.rocks} />
    <T is={biome.accents} />
    <T is={fragments} />
    <T is={dominantLandmark} />
  {/if}

  {#if detailed}
    <T is={THREE.PointLight} args={[station.palette.glow, 3.6 * station.biome.accents, 15, 2]} position={[0, 4.3, -1.8]} />
  {:else if quality !== "low"}
    <T is={THREE.PointLight} args={[station.palette.glow, 1.2, 11, 2]} position={[0, 2.6, 0]} />
  {/if}
  {#each station.signage.filter((sign) => sign.title || showSigns) as sign (sign.text)}
    <EnvironmentalSign {sign} palette={station.palette} />
  {/each}
</T>
