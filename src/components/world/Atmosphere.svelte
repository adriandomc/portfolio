<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { Sparkles, Stars } from "@threlte/extras";
  import * as THREE from "three";
  import type { QualityTier } from "../../lib/world-map";

  let { quality, reducedMotion }: { quality: QualityTier; reducedMotion: boolean } = $props();
  const fogSize = 64;
  const fogPixels = new Uint8Array(fogSize * fogSize * 4);
  for (let y = 0; y < fogSize; y++) {
    for (let x = 0; x < fogSize; x++) {
      const offset = (y * fogSize + x) * 4;
      const distance = Math.hypot(x / fogSize - 0.5, y / fogSize - 0.5) * 2;
      const alpha = Math.max(0, 1 - distance) ** 2;
      fogPixels.set([190, 205, 196, Math.round(alpha * 94)], offset);
    }
  }
  const fogTexture = new THREE.DataTexture(fogPixels, fogSize, fogSize, THREE.RGBAFormat);
  fogTexture.magFilter = THREE.LinearFilter;
  fogTexture.minFilter = THREE.LinearFilter;
  fogTexture.needsUpdate = true;
  const fogMaterial = new THREE.SpriteMaterial({ map: fogTexture, color: 0x809c91, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.NormalBlending });
  const fogSprites = Array.from({ length: quality === "high" ? 8 : quality === "medium" ? 4 : 3 }, (_, index) => {
    const sprite = new THREE.Sprite(fogMaterial);
    const side = index % 2 ? -1 : 1;
    sprite.position.set(side * (8 + index * 1.7), 2.2 + index % 3, -8 - index * 15);
    sprite.scale.set(16 + index % 3 * 5, 5 + index % 2 * 2, 1);
    sprite.userData.baseX = sprite.position.x;
    sprite.userData.phase = index * 0.8;
    return sprite;
  });
  const uniforms = {
    time: { value: 0 },
    top: { value: new THREE.Color(0x171028) },
    middle: { value: new THREE.Color(0x30213d) },
    bottom: { value: new THREE.Color(0x07060c) },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `varying vec3 vWorld; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorld=normalize(world.xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vWorld; uniform float time; uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; void main(){ float h=vWorld.y*.5+.5; vec3 color=mix(bottom,middle,smoothstep(.05,.52,h)); color=mix(color,top,smoothstep(.48,1.,h)); float bands=sin(vWorld.x*1.9+vWorld.z*1.3+time*.02)*.5+.5; color+=vec3(.07,.05,.11)*smoothstep(.35,.95,bands)*(1.-h)*.22; gl_FragColor=vec4(color,1.); }`,
  });

  useTask((delta) => {
    if (!reducedMotion && quality !== "low") {
      uniforms.time.value += delta;
      fogSprites.forEach((sprite) => { sprite.position.x = sprite.userData.baseX + Math.sin(uniforms.time.value * 0.08 + sprite.userData.phase) * 1.8; });
    }
  });
</script>

<T is={THREE.Mesh} material={skyMaterial} frustumCulled={false}>
  <T is={THREE.SphereGeometry} args={[180, quality === "high" ? 48 : 28, quality === "high" ? 24 : 16]} />
</T>

{#each fogSprites as sprite}
  <T is={sprite} />
{/each}

<Stars
  radius={72}
  depth={95}
  count={quality === "high" ? 1600 : quality === "medium" ? 900 : 420}
  factor={quality === "high" ? 3.4 : 2.6}
  saturation={0.25}
  lightness={0.82}
  speed={reducedMotion ? 0 : 0.025}
  opacity={0.72}
  fade
/>

{#if quality !== "low"}
  <Sparkles
    count={quality === "high" ? 260 : 120}
    speed={reducedMotion ? 0 : 0.16}
    opacity={0.36}
    color={0xbde4a8}
    size={quality === "high" ? 1.1 : 0.8}
    scale={[50, 22, 150]}
    position={[0, 6, -62]}
    noise={[1, 0.45, 1]}
  />
{/if}
