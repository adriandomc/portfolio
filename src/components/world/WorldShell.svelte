<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Canvas } from "@threlte/core";
  import * as THREE from "three";
  import { lowerQualityTier, qualitySettings, selectQualityTier, type QualityTier } from "../../lib/world-map";
  import WorldScene from "./WorldScene.svelte";

  let { route }: { route: string } = $props();
  let routeState = $state(route);
  let quality = $state<QualityTier>("low");
  let reducedMotion = $state(true);
  let mounted = $state(false);
  let webgl = $state(true);
  let renderState = $state<"loading" | "ready" | "degraded" | "fallback">("loading");
  let archive: HTMLDialogElement;
  let shell: HTMLDivElement;
  let loadTimeout: ReturnType<typeof setTimeout> | undefined;

  function setRender(state: typeof renderState) {
    renderState = state;
    document.documentElement.dataset.worldRender = state;
  }

  function createRenderer(canvas: HTMLCanvasElement) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "low", alpha: false, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
  }

  function setTravel(state: "flying" | "landed") {
    document.documentElement.dataset.worldTravel = state;
  }

  function ready() {
    clearTimeout(loadTimeout);
    setRender("ready");
  }

  function metrics(calls: number, triangles: number) {
    if (!shell) return;
    shell.dataset.renderCalls = String(calls);
    shell.dataset.triangles = String(triangles);
    const canvas = shell.querySelector("canvas");
    if (canvas) {
      canvas.dataset.renderCalls = String(calls);
      canvas.dataset.triangles = String(triangles);
    }
    if (renderState === "degraded" && calls > 0) setRender("ready");
  }

  function demote() {
    quality = lowerQualityTier(quality);
    document.documentElement.dataset.worldQuality = quality;
  }

  function degraded() {
    if (renderState !== "fallback") setRender("degraded");
  }

  function sceneError(error: unknown) {
    console.error("ADC world renderer failed; semantic fallback enabled.", error);
    clearTimeout(loadTimeout);
    setRender("fallback");
    webgl = false;
  }

  onMount(() => {
    const html = document.documentElement;
    setRender("loading");
    html.dataset.worldTravel = "flying";
    reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", { powerPreference: "high-performance" }) as WebGL2RenderingContext | null;
    webgl = Boolean(gl || probe.getContext("webgl"));
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    if (!webgl) {
      setRender("fallback");
      html.dataset.worldTravel = "landed";
    } else {
      const device = navigator as Navigator & { deviceMemory?: number };
      quality = selectQualityTier({ reducedMotion, width: innerWidth, memory: device.deviceMemory, cores: navigator.hardwareConcurrency, webgl2: Boolean(gl) });
      html.dataset.worldQuality = quality;
    }
    mounted = true;
    // Hidden tabs suspend requestAnimationFrame, so the scene legitimately cannot
    // produce a frame there — only arm the watchdog while the page is visible.
    function armWatchdog() {
      clearTimeout(loadTimeout);
      if (!webgl || document.hidden) return;
      loadTimeout = setTimeout(() => {
        if (renderState === "loading") sceneError(new Error("World scene did not render within 8 seconds."));
      }, 8000);
    }
    function onVisibility() {
      if (renderState === "loading") armWatchdog();
      else clearTimeout(loadTimeout);
    }
    document.addEventListener("visibilitychange", onVisibility);
    armWatchdog();

    let contextCanvas: HTMLCanvasElement | null = null;
    let lostTimeout: ReturnType<typeof setTimeout> | undefined;
    const lost = (event: Event) => {
      event.preventDefault();
      degraded();
      setTravel("flying");
      // If the context never comes back, surface the readable HTML instead of a black void.
      clearTimeout(lostTimeout);
      lostTimeout = setTimeout(() => sceneError(new Error("WebGL context lost and not restored.")), 9000);
    };
    const restored = () => {
      clearTimeout(lostTimeout);
      degraded();
      setTravel("landed");
    };
    void tick().then(() => {
      contextCanvas = shell?.querySelector("canvas") ?? null;
      contextCanvas?.addEventListener("webglcontextlost", lost);
      contextCanvas?.addEventListener("webglcontextrestored", restored);
    });

    function beforeSwap() { html.dataset.worldTravel = "flying"; }
    function afterSwap() {
      routeState = location.pathname;
      html.dataset.worldRender = renderState;
      html.dataset.worldQuality = quality;
    }
    document.addEventListener("astro:before-swap", beforeSwap);
    document.addEventListener("astro:after-swap", afterSwap);
    return () => {
      document.removeEventListener("astro:before-swap", beforeSwap);
      document.removeEventListener("astro:after-swap", afterSwap);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(loadTimeout);
      clearTimeout(lostTimeout);
      contextCanvas?.removeEventListener("webglcontextlost", lost);
      contextCanvas?.removeEventListener("webglcontextrestored", restored);
      delete html.dataset.worldRender;
      delete html.dataset.worldTravel;
      delete html.dataset.worldQuality;
    };
  });
</script>

<div bind:this={shell} class:webgl-fallback={!webgl} class="world-shell">
  {#if mounted && webgl}
    <svelte:boundary onerror={sceneError}>
      <Canvas
        {createRenderer}
        dpr={[1, qualitySettings[quality].dpr]}
        shadows={THREE.PCFSoftShadowMap}
        toneMapping={quality === "low" ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping}
        renderMode="always"
      >
        <WorldScene
          route={routeState}
          {quality}
          {reducedMotion}
          openArchive={() => archive.showModal()}
          onReady={ready}
          onTravel={setTravel}
          onMetrics={metrics}
          onDemote={demote}
          onDegraded={degraded}
          onError={sceneError}
        />
      </Canvas>
      {#snippet failed()}{/snippet}
    </svelte:boundary>
  {/if}
</div>

<div id="world-html-layer" class="world-html-layer"></div>

<dialog bind:this={archive} class="dino-archive" aria-labelledby="archive-title" lang="es">
  <form method="dialog"><button aria-label="Cerrar archivo">×</button></form>
  <small>ARCHIVO · 2010</small>
  <h2 id="archive-title">Dinoperro Productions</h2>
  <p>El Dinoperro existe desde hace 16 años. Antes de recorrer este archipiélago ya presentaba videojuegos hechos por una sola persona.</p>
  <a href="https://www.youtube.com/watch?v=BbSLNZvZv80" target="_blank" rel="noreferrer">One Man Army: El juego ↗</a>
</dialog>

<style>
  .world-shell {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: radial-gradient(circle at 62% 15%, #31213f 0, #120d1c 38%, #07060c 82%);
  }
  .world-shell :global(canvas) { width: 100%; height: 100%; display: block; touch-action: pan-y; }
  :global(body.journey-home) .world-shell :global(canvas) { cursor: grab; }
  .world-html-layer { position: fixed; z-index: 30; inset: 0; pointer-events: none; }
  :global(body.is-dragging) .world-shell :global(canvas) { cursor: grabbing; }
  .webgl-fallback { background: radial-gradient(circle at 50% 25%, #334333 0, #171126 42%, #07060c 84%); }
  .dino-archive { width: min(calc(100% - 2rem), 30rem); padding: 1.4rem; color: #d7f2ba; border: 1px solid #79b4a9; border-radius: .3rem; background: #120d1c; box-shadow: 1rem 1rem 0 rgba(36, 21, 47, .7); }
  .dino-archive::backdrop { background: rgba(7, 6, 12, .82); backdrop-filter: blur(5px); }
  .dino-archive form { position: absolute; top: .6rem; right: .7rem; }
  .dino-archive form button { border: 0; color: #d7f2ba; background: transparent; font: 700 1.6rem/1 monospace; cursor: pointer; }
  .dino-archive small { color: #9cc69b; font-weight: 800; letter-spacing: .08em; }
  .dino-archive h2 { margin: .6rem 0; }
  .dino-archive a { display: inline-block; margin-top: .75rem; color: #bde4a8; font-weight: 800; }
</style>
