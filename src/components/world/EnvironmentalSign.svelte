<script lang="ts" module>
  import * as THREE from "three";
  // Signs mount/unmount as showSigns flips mid-scroll; cache the extruded geometry and
  // palette materials so remounts never rebuild (or leak) GPU resources.
  const signCache = new Map<string, unknown>();
  function signCached<Value>(key: string, create: () => Value): Value {
    if (!signCache.has(key)) signCache.set(key, create());
    return signCache.get(key) as Value;
  }
</script>

<script lang="ts">
  import { T, useThrelte } from "@threlte/core";
  import { Text, Text3DGeometry } from "@threlte/extras";
  import { navigate } from "astro:transitions/client";
  import fontUrl from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url";
  import type { PaletteConfig, SignConfig } from "../../lib/world-map";

  let { sign, palette }: { sign: SignConfig; palette: PaletteConfig } = $props();
  const { canvas } = useThrelte();

  function surfaceGeometry() {
    const shape = new THREE.Shape();
    const width = sign.title ? 4.6 : 3.3;
    const height = sign.title ? 1.45 : 0.92;
    if (sign.surface === "arch") {
      shape.moveTo(-width / 2, -height / 2);
      shape.lineTo(-width / 2, height * 0.2);
      shape.quadraticCurveTo(0, height, width / 2, height * 0.2);
      shape.lineTo(width / 2, -height / 2);
    } else if (sign.surface === "banner") {
      shape.moveTo(-width / 2, height / 2);
      shape.lineTo(width / 2, height * 0.4);
      shape.lineTo(width * 0.43, -height / 2);
      shape.quadraticCurveTo(0, -height * 0.3, -width / 2, -height * 0.42);
    } else if (sign.surface === "post") {
      shape.moveTo(-width / 2, height / 2);
      shape.lineTo(width / 2, height * 0.43);
      shape.lineTo(width * 0.46, -height * 0.33);
      shape.lineTo(0.18, -height * 0.35);
      shape.lineTo(0.1, -height * 1.5);
      shape.lineTo(-0.1, -height * 1.5);
      shape.lineTo(-0.18, -height * 0.35);
      shape.lineTo(-width / 2, -height * 0.42);
    } else if (sign.surface === "shrine") {
      shape.moveTo(0, height * 0.7);
      shape.lineTo(width / 2, height * 0.2);
      shape.lineTo(width * 0.42, -height / 2);
      shape.lineTo(-width * 0.42, -height / 2);
      shape.lineTo(-width / 2, height * 0.2);
    } else {
      shape.moveTo(-width * 0.46, height * 0.45);
      shape.quadraticCurveTo(0, height * 0.65, width * 0.48, height * 0.38);
      shape.lineTo(width / 2, -height * 0.28);
      shape.quadraticCurveTo(0, -height * 0.62, -width / 2, -height * 0.3);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: sign.title ? 0.26 : 0.16, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.07, bevelThickness: 0.05, curveSegments: 4 });
  }

  const geometry = signCached(`geo-${sign.surface}-${sign.title ? "title" : "small"}`, () => {
    const built = surfaceGeometry();
    built.center();
    return built;
  });
  const surface = signCached(`surface-${sign.surface}-${palette.rock}-${palette.glow}`, () =>
    new THREE.MeshStandardMaterial({ color: palette.rock, roughness: 0.8, metalness: sign.surface === "shrine" ? 0.22 : 0.04, emissive: palette.glow, emissiveIntensity: 0.04 }));
  const titleMaterial = signCached(`title-${palette.moss}-${palette.glow}`, () =>
    new THREE.MeshStandardMaterial({ color: palette.moss, roughness: 0.48, metalness: 0.12, emissive: palette.glow, emissiveIntensity: 0.18 }));
  const lines = sign.text.split("\n");

  function centerTitle(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    geometry.translate(-(geometry.boundingBox.max.x - geometry.boundingBox.min.x) / 2, 0, 0);
  }

  function activate(event: { stopPropagation?: () => void }) {
    if (!sign.route) return;
    event.stopPropagation?.();
    navigate(sign.route);
  }

  let hovered = $state(false);
  function pointerEnter(event: { stopPropagation?: () => void }) {
    if (!sign.route) return;
    event.stopPropagation?.();
    hovered = true;
    canvas.style.cursor = "pointer";
  }
  function pointerLeave() {
    if (!sign.route) return;
    hovered = false;
    canvas.style.cursor = "";
  }
</script>

<T is={THREE.Group} position={sign.position} rotation={sign.rotation} scale={sign.scale * (hovered ? 1.07 : 1)}>
  <T is={THREE.Mesh} {geometry} material={surface} castShadow receiveShadow onclick={activate} onpointerenter={pointerEnter} onpointerleave={pointerLeave}>
    {#if sign.title}
      {#each lines as line, index}
        <T is={THREE.Mesh} position={[0, 0.22 - index * 0.72, 0.22]} material={titleMaterial} castShadow>
          <Text3DGeometry text={line} font="/fonts/jetbrains-mono-extrabold.typeface.json" size={0.58} depth={0.1} curveSegments={3} bevelEnabled bevelSize={0.016} bevelThickness={0.025} bevelSegments={2} onrendered={centerTitle} />
        </T>
      {/each}
    {:else}
      <Text
        text={sign.text}
        font={fontUrl}
        fontSize={0.42}
        maxWidth={3}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={palette.moss}
        outlineWidth="3%"
        outlineColor={palette.rock}
        position={[0, 0.04, 0.17]}
      />
    {/if}
  </T>
</T>
