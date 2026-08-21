<script lang="ts">
  import { onMount } from "svelte";
  import { useTask, useThrelte } from "@threlte/core";
  import * as THREE from "three";
  import {
    BlendFunction,
    BloomEffect,
    EffectComposer,
    EffectPass,
    NoiseEffect,
    RenderPass,
    SMAAEffect,
    SMAAPreset,
    ToneMappingEffect,
    ToneMappingMode,
    VignetteEffect,
  } from "postprocessing";
  import type { Effect } from "postprocessing";
  import type { QualityTier } from "../../lib/world-map";

  let { quality, onFailure }: { quality: Exclude<QualityTier, "low">; onFailure: () => void } = $props();
  const { renderer, scene, camera, size, autoRender, renderStage } = useThrelte();
  let composer: EffectComposer | undefined;
  let failed = false;

  function disable(error: unknown) {
    if (failed) return;
    failed = true;
    composer?.dispose();
    composer = undefined;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    autoRender.set(true);
    console.warn("ADC world postprocessing disabled; direct renderer remains active.", error);
    onFailure();
  }

  onMount(() => {
    let candidate: EffectComposer | undefined;
    try {
      candidate = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
      const effects: Effect[] = [];
      candidate.addPass(new RenderPass(scene, camera.current));

      effects.push(
        new BloomEffect({ intensity: quality === "high" ? 0.3 : 0.18, luminanceThreshold: 0.88, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.62, levels: quality === "high" ? 6 : 4 }),
        new SMAAEffect({ preset: quality === "high" ? SMAAPreset.HIGH : SMAAPreset.MEDIUM }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC, middleGrey: 0.7 }),
        new VignetteEffect({ offset: 0.28, darkness: quality === "high" ? 0.4 : 0.3 }),
      );
      if (quality === "high") {
        const grain = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true });
        grain.blendMode.opacity.value = 0.025;
        effects.push(grain);
      }
      candidate.addPass(new EffectPass(camera.current, ...effects));
      candidate.setSize(size.current.width, size.current.height);
      composer = candidate;
      renderer.toneMapping = THREE.NoToneMapping;
      autoRender.set(false);
    } catch (error) {
      candidate?.dispose();
      disable(error);
    }

    return () => {
      composer?.dispose();
      composer = undefined;
      autoRender.set(true);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    };
  });

  $effect(() => composer?.setSize($size.width, $size.height));
  useTask((delta) => {
    try {
      composer?.render(delta);
    } catch (error) {
      disable(error);
    }
  }, { stage: renderStage, autoInvalidate: false });
</script>
