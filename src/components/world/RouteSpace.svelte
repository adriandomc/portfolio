<script lang="ts" module>
  import * as THREE from "three";
  import { seeded } from "../../lib/world-geometry";
  import type { QualityTier, SpaceConfig } from "../../lib/world-map";

  // Diorama pieces are cached per space so revisits never rebuild GPU resources.
  const spaceCache = new Map<string, unknown>();
  function spaceCached<Value>(key: string, create: () => Value): Value {
    if (!spaceCache.has(key)) spaceCache.set(key, create());
    return spaceCache.get(key) as Value;
  }

  function shardGeometry(seed: number) {
    const geometry = new THREE.IcosahedronGeometry(0.55, 1);
    const random = seeded(seed);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index++) {
      const amount = 0.6 + random() * 0.85;
      position.setXYZ(index, position.getX(index) * amount, position.getY(index) * (0.5 + random() * 0.9), position.getZ(index) * amount);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function buildShards(space: SpaceConfig, count: number) {
    const random = seeded(space.seed);
    const mesh = new THREE.InstancedMesh(
      shardGeometry(space.seed + 31),
      new THREE.MeshStandardMaterial({ color: space.palette.ground, roughness: 0.86, metalness: 0.06 }),
      count,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + random() * 0.5;
      const radius = 4.6 + random() * 3.0;
      const size = 0.5 + random() * 1.5;
      quaternion.setFromEuler(new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI));
      scale.set(size, size * (0.6 + random() * 0.8), size);
      matrix.compose(
        new THREE.Vector3(Math.cos(angle) * radius, (random() - 0.5) * 4.2, Math.sin(angle) * radius),
        quaternion,
        scale,
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
</script>

<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { Sparkles } from "@threlte/extras";

  let { space, quality, reducedMotion }: { space: SpaceConfig; quality: QualityTier; reducedMotion: boolean } = $props();

  const shardCount = quality === "high" ? 16 : quality === "medium" ? 11 : 7;
  const shards = $derived(spaceCached(`shards-${space.id}-${shardCount}`, () => buildShards(space, shardCount)));

  const portalMaterial = spaceCached(`portal-${space.palette.glow}`, () =>
    new THREE.MeshStandardMaterial({ color: space.palette.glow, emissive: space.palette.glow, emissiveIntensity: 0.9, roughness: 0.35, transparent: true, opacity: 0.62 }));
  const sheetMaterial = spaceCached(`sheet-${space.palette.moss}`, () =>
    new THREE.MeshStandardMaterial({ color: space.palette.moss, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  const portalGeometry = spaceCached("portal-geometry", () => new THREE.TorusGeometry(5.6, 0.09, 8, 96));
  const sheetGeometry = spaceCached("sheet-geometry", () => new THREE.PlaneGeometry(0.9, 1.24));

  let ring = $state<THREE.Group | undefined>();
  let drift = 0;
  useTask((delta) => {
    if (reducedMotion || !ring) return;
    drift += delta;
    ring.rotation.y = drift * 0.045;
    ring.position.y = Math.sin(drift * 0.4) * 0.35;
  });
</script>

<T is={THREE.Group} position={space.center}>
  <!-- Slowly orbiting shard ring; the room is carved out of drifting rock. -->
  <T is={THREE.Group} bind:ref={ring} position={[4.6, 0, -1.6]}>
    <T is={shards} />
  </T>

  <!-- Portal ring on the back wall of the room. -->
  <T is={THREE.Mesh} geometry={portalGeometry} material={portalMaterial} position={[5.4, 1.7, -8]} rotation={[0.12, 0.22, 0.08]} />

  <!-- A few drifting paper sheets to sell the studio-in-the-sky feeling. -->
  <T is={THREE.Mesh} geometry={sheetGeometry} material={sheetMaterial} position={[5.4, 1.4, 1.8]} rotation={[0.4, 0.7, 0.3]} />
  <T is={THREE.Mesh} geometry={sheetGeometry} material={sheetMaterial} position={[1.9, 3.1, -2.6]} rotation={[-0.3, 0.2, -0.5]} scale={0.75} />
  <T is={THREE.Mesh} geometry={sheetGeometry} material={sheetMaterial} position={[4.4, -1.2, 4.1]} rotation={[0.7, -0.4, 0.2]} scale={0.6} />

  <T is={THREE.PointLight} args={[space.palette.glow, 5.2, 28, 2]} position={[4.2, 3.6, 2]} />

  {#if quality !== "low"}
    <Sparkles count={quality === "high" ? 56 : 30} speed={reducedMotion ? 0 : 0.12} opacity={0.4} color={space.palette.glow} size={1.4} scale={[16, 9, 16]} position={[1.6, 1.2, 0]} noise={[1, 0.5, 1]} />
  {/if}
</T>
