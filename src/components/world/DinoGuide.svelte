<script lang="ts" module>
  import * as THREE from "three";
  export interface DinoVisualState {
    position: THREE.Vector3;
    ground: THREE.Vector3;
    scale: THREE.Vector3;
    roll: number;
    flying: boolean;
    station: number;
  }

  // Textures shared across remounts (the guide unmounts on /projects and comes back).
  const textureCache = new Map<string, THREE.Texture>();
  function loadPose(url: string) {
    let texture = textureCache.get(url);
    if (!texture) {
      texture = new THREE.TextureLoader().load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(url, texture);
    }
    return texture;
  }
</script>

<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { HTML } from "@threlte/extras";
  import type { QualityTier, StationConfig } from "../../lib/world-map";

  let { visualState, station, quality, mode = "journey", openArchive }: { visualState: DinoVisualState; station: StationConfig; quality: QualityTier; mode?: "journey" | "space"; openArchive: () => void } = $props();
  const { camera } = useThrelte();

  // Paper cutout: unlit sticker with a paper-white outline and a gentle flutter.
  const WIDTH = 1.94;
  const HEIGHT = 2.72;
  const fallback = loadPose("/images/cosmic-dinodog/reference.png");
  const material = new THREE.MeshBasicMaterial({ map: fallback, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.paperTime = { value: 0 };
    shader.uniforms.outlineTexel = { value: new THREE.Vector2(1 / 516, 1 / 736) };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float paperTime; varying vec2 vPaperUv;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vPaperUv = uv;
        // Living-paper flutter: a slow ripple across the sheet, stronger away from the string.
        transformed.z += sin(uv.x * 3.14159 + paperTime * 1.6) * 0.05 * (0.25 + (1.0 - uv.y) * 0.75);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec2 outlineTexel; varying vec2 vPaperUv;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        if (diffuseColor.a < 0.5) {
          float ring = 0.0;
          for (int tap = 0; tap < 8; tap++) {
            float angle = float(tap) * 0.7853982;
            ring = max(ring, texture2D(map, vPaperUv + vec2(cos(angle), sin(angle)) * outlineTexel * 7.0).a);
          }
          // Paper-white sticker border just outside the drawing.
          if (ring > 0.5) diffuseColor = vec4(0.96, 0.97, 0.92, 1.0);
        }`);
  };
  material.customProgramCacheKey = () => "dino-cutout";
  const plane = new THREE.PlaneGeometry(WIDTH, HEIGHT, 24, 1);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x020104, transparent: true, opacity: 0.3, depthWrite: false });

  $effect(() => {
    const pose = station.pose;
    material.map = loadPose(pose === "reference" ? "/images/cosmic-dinodog/reference.png" : `/images/cosmic-dinodog/${pose}.png`);
    material.needsUpdate = true;
  });

  // Marionette string: a sagging line from an overhead anchor down to the hat tip.
  const STRING_POINTS = 14;
  const stringGeometry = new THREE.BufferGeometry();
  const stringPositions = new Float32Array(STRING_POINTS * 3);
  stringGeometry.setAttribute("position", new THREE.BufferAttribute(stringPositions, 3));
  const stringMaterial = new THREE.LineBasicMaterial({ color: 0xd7f2ba, transparent: true, opacity: 0.5 });
  const stringLine = new THREE.Line(stringGeometry, stringMaterial);
  stringLine.frustumCulled = false;

  const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let root: THREE.Group; // yaw-billboard at the character position
  let rig: THREE.Group; // pendulum pivot at the string attachment
  let shadow: THREE.Mesh;
  let landedFor = 0;
  let wasFlying = true;
  let lastStation = visualState.station;
  let showBubble = $state(false);
  let side = $state<"left" | "right">("left");
  let compact = $state(false);

  // Pendulum state: the sheet hangs from the string and lags behind lateral motion.
  const PIVOT_Y = HEIGHT * 0.5 + 0.12;
  let swing = 0;
  let swingVelocity = 0;
  const previous = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const anchorGoal = new THREE.Vector3();
  const attachment = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  let primed = false;
  let time = 0;

  function updateString() {
    // Quadratic bezier from the sky anchor down to the hat, with a little slack.
    const sag = visualState.flying ? 0.05 : 0.35;
    for (let index = 0; index < STRING_POINTS; index++) {
      const t = index / (STRING_POINTS - 1);
      const inverse = 1 - t;
      const midX = (anchor.x + attachment.x) / 2 + swing * 0.4;
      const midY = (anchor.y + attachment.y) / 2 - sag;
      const midZ = (anchor.z + attachment.z) / 2;
      stringPositions[index * 3] = inverse * inverse * anchor.x + 2 * inverse * t * midX + t * t * attachment.x;
      stringPositions[index * 3 + 1] = inverse * inverse * anchor.y + 2 * inverse * t * midY + t * t * attachment.y;
      stringPositions[index * 3 + 2] = inverse * inverse * anchor.z + 2 * inverse * t * midZ + t * t * attachment.z;
    }
    stringGeometry.attributes.position.needsUpdate = true;
    stringGeometry.computeBoundingSphere();
  }

  useTask((delta) => {
    if (!root || !rig || !shadow) return;
    compact = innerWidth < 768;
    time += delta;
    const shader = material.userData.shader;
    if (shader && !reducedMotion) shader.uniforms.paperTime.value = time;

    root.position.copy(visualState.position);
    root.scale.copy(visualState.scale);
    const dx = camera.current.position.x - root.position.x;
    const dz = camera.current.position.z - root.position.z;
    root.rotation.set(0, Math.atan2(dx, dz), 0);

    // Pendulum: horizontal velocity projected on the camera's right axis drives the tilt.
    if (!primed) {
      previous.copy(visualState.position);
      primed = true;
    }
    const safeDelta = Math.max(delta, 1 / 240);
    velocity.copy(visualState.position).sub(previous).divideScalar(safeDelta);
    previous.copy(visualState.position);
    if (visualState.station !== lastStation) {
      // View change: yank the string — the puppet springs to action.
      lastStation = visualState.station;
      if (!reducedMotion) swingVelocity += swing >= 0 ? -2.6 : 2.6;
    }
    if (reducedMotion) {
      swing = 0;
    } else {
      cameraRight.setFromMatrixColumn(camera.current.matrixWorld, 0);
      const lateral = velocity.dot(cameraRight);
      const restTilt = THREE.MathUtils.clamp(-lateral * 0.055, -0.55, 0.55);
      const idleSway = Math.sin(time * 1.35) * 0.028;
      const stiffness = visualState.flying ? 26 : 34;
      const damping = visualState.flying ? 3.4 : 4.6;
      swingVelocity += (stiffness * (restTilt + idleSway - swing) - damping * swingVelocity) * Math.min(delta, 1 / 30);
      swing += swingVelocity * Math.min(delta, 1 / 30);
    }
    rig.rotation.z = swing + visualState.roll;

    // String endpoints: anchor drifts above the pivot; attachment is the hat tip in world space.
    rig.getWorldPosition(scratch);
    anchorGoal.set(scratch.x + swing * (visualState.flying ? -2.2 : -1.4), scratch.y + 8.5, scratch.z);
    anchor.lerp(anchorGoal, Math.min(1, delta * (visualState.flying ? 2.2 : 3.5)));
    attachment.set(0.1, 0.02, 0.02);
    rig.localToWorld(attachment);
    updateString();

    shadow.position.set(visualState.ground.x, visualState.ground.y - 1.05, visualState.ground.z);
    const air = Math.max(0, visualState.position.y - visualState.ground.y);
    const shadowScale = 1 - Math.min(0.5, air * 0.1);
    shadow.scale.setScalar(shadowScale);
    shadowMaterial.opacity = visualState.flying ? 0.08 : 0.3 * shadowScale;

    if (visualState.flying) {
      landedFor = 0;
      showBubble = false;
    } else {
      if (wasFlying) landedFor = 0;
      landedFor += delta;
      // On phones the space routes are full-bleed content — the bubble would cover the page.
      showBubble = landedFor > (quality === "low" ? 0.05 : 0.48) && !(compact && mode === "space");
      const projected = root.getWorldPosition(scratch).project(camera.current);
      side = projected.x > 0.42 ? "right" : "left";
    }
    wasFlying = visualState.flying;
  });
</script>

<T is={THREE.Group} bind:ref={root}>
  <T is={THREE.Group} bind:ref={rig} position={[0, PIVOT_Y, 0]}>
    <T is={THREE.Mesh} geometry={plane} {material} position={[0, -PIVOT_Y + HEIGHT * 0.5, 0]} castShadow />
  </T>
  <HTML
    position={[side === "right" ? -(compact ? 3.4 : 2.3) : compact ? 3.4 : 2.3, 2.1, 0]}
    center
    distanceFactor={compact ? 19 : 9}
    zIndexRange={[18, 8]}
    pointerEvents="auto"
    portal={typeof document !== "undefined" ? document.getElementById("world-html-layer") ?? undefined : undefined}
  >
    <aside class:from-right={side === "right"} class:visible={showBubble} class="dino-speech" aria-live="polite" lang="es">
      {#if showBubble}
        <button type="button" onclick={openArchive} aria-label="¿Quién soy? Abrir archivo del Dinoperro">?</button>
        <p>{station.speech}</p>
      {/if}
    </aside>
  </HTML>
</T>

<T is={stringLine} />

<T is={THREE.Mesh} bind:ref={shadow} rotation={[-Math.PI / 2, 0, 0]} material={shadowMaterial}>
  <T is={THREE.CircleGeometry} args={[0.7, 28]} />
</T>

<style>
  .dino-speech {
    position: relative;
    width: clamp(13rem, 22vw, 20rem);
    padding: .85rem 1rem .9rem;
    color: #17280d;
    border: 2px solid #253207;
    border-radius: 1rem 1rem 1rem .18rem;
    background: #d7f2ba;
    box-shadow: .45rem .55rem 0 rgba(37, 50, 7, .52), 0 1rem 2rem rgba(7, 6, 12, .24);
    font: 650 clamp(.72rem, 1.4vw, .92rem)/1.45 "JetBrains Mono", monospace;
    pointer-events: auto;
    opacity: 0;
    transform: scale(.7) translateY(.5rem);
    transform-origin: bottom left;
    transition: opacity .18s ease, transform .34s cubic-bezier(.34, 1.56, .64, 1);
  }
  .dino-speech.visible {
    opacity: 1;
    transform: none;
  }
  .dino-speech.from-right { border-radius: 1rem 1rem .18rem 1rem; transform-origin: bottom right; }
  .dino-speech p { margin: 0; }
  .dino-speech button {
    position: absolute;
    top: -.8rem;
    right: -.8rem;
    width: 2rem;
    height: 2rem;
    border: 2px solid #253207;
    border-radius: 50%;
    color: #d7f2ba;
    background: #253207;
    font: 900 1rem/1 "JetBrains Mono", monospace;
    cursor: pointer;
    transition: transform .2s cubic-bezier(.34, 1.56, .64, 1);
  }
  .dino-speech button:hover { transform: scale(1.12) rotate(8deg); }
  .dino-speech button:focus-visible { outline: 3px solid #b892db; outline-offset: 3px; }
  @media (max-width: 48rem) { .dino-speech { width: min(15rem, 62vw); } }
  @media (prefers-reduced-motion: reduce) {
    .dino-speech { transition: opacity .18s ease; transform: none; }
  }
</style>
