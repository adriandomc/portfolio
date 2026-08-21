<script lang="ts">
  import { onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { interactivity, VirtualEnvironment } from "@threlte/extras";
  import { navigate } from "astro:transitions/client";
  import * as THREE from "three";
  import {
    cameraSegment,
    destinationForRoute,
    flightArcHeight,
    journeyDestination,
    qualitySettings,
    routeForStation,
    spaceForRoute,
    springStep,
    stationIndexForRoute,
    stations,
    type QualityTier,
    type WorldDestination,
  } from "../../lib/world-map";
  import Atmosphere from "./Atmosphere.svelte";
  import BiomeIsland from "./BiomeIsland.svelte";
  import DinoGuide, { type DinoVisualState } from "./DinoGuide.svelte";
  import RouteSpace from "./RouteSpace.svelte";
  import WorldPostFX from "./WorldPostFX.svelte";

  let {
    route,
    quality,
    reducedMotion,
    openArchive,
    onReady,
    onTravel,
    onMetrics,
    onDemote,
    onDegraded,
    onError,
  }: {
    route: string;
    quality: QualityTier;
    reducedMotion: boolean;
    openArchive: () => void;
    onReady: () => void;
    onTravel: (state: "flying" | "landed") => void;
    onMetrics: (calls: number, triangles: number) => void;
    onDemote: () => void;
    onDegraded: () => void;
    onError: (error: unknown) => void;
  } = $props();

  interactivity();
  const { renderer, canvas, scene } = useThrelte();
  const initial = destinationForRoute(route);
  const camera = new THREE.PerspectiveCamera(initial.fov, 1, 0.1, 310);
  camera.position.set(...initial.camera);
  const currentTarget = new THREE.Vector3(...initial.target);
  let current = $state(stationIndexForRoute(route));
  const dinoState: DinoVisualState = {
    position: new THREE.Vector3(...initial.dino),
    ground: new THREE.Vector3(...initial.dino),
    scale: new THREE.Vector3(1, 1, 1),
    roll: 0,
    flying: false,
    station: current,
  };

  const cameraPositions = stations.map((station) => new THREE.Vector3(...station.position).add(new THREE.Vector3(...station.camera)));
  const cameraTargets = stations.map((station) => new THREE.Vector3(...station.position).add(new THREE.Vector3(...station.target)));
  const landingPoints = stations.map((station) => new THREE.Vector3(...station.position).add(new THREE.Vector3(...station.dino)));
  const cameraCurves = cameraPositions.slice(0, -1).map((start, index) => {
    const end = cameraPositions[index + 1];
    const height = flightArcHeight(start.distanceTo(end));
    return new THREE.CatmullRomCurve3([start.clone(), start.clone().lerp(end, 0.26).add(new THREE.Vector3(0, height, 2)), start.clone().lerp(end, 0.72).add(new THREE.Vector3(0, height * 0.76, -2)), end.clone()], false, "catmullrom", 0.55);
  });
  const targetCurves = cameraTargets.slice(0, -1).map((start, index) => new THREE.CatmullRomCurve3([start.clone(), start.clone().lerp(cameraTargets[index + 1], 0.5).add(new THREE.Vector3(0, 2.8, 0)), cameraTargets[index + 1].clone()]));

  const path = new THREE.CatmullRomCurve3(stations.map((station) => new THREE.Vector3(...station.position).add(new THREE.Vector3(0, 1.15, 0))));
  const routeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0x79b4a9) },
      // xyz = island center, w = fade radius; the ribbon dissolves as it reaches each shore.
      stationSpheres: { value: stations.map((station) => new THREE.Vector4(station.position[0], station.position[1], station.position[2], station.radius)) },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vWorld;uniform float time;uniform vec3 color;uniform vec4 stationSpheres[${stations.length}];
      void main(){
        float pulse=pow(max(0.,sin(vUv.x*105.-time*2.8)),22.);
        float shore=1.0;
        for(int i=0;i<${stations.length};i++){
          float d=distance(vWorld.xz,stationSpheres[i].xz);
          shore=min(shore,smoothstep(stationSpheres[i].w*0.55,stationSpheres[i].w*1.08,d));
        }
        gl_FragColor=vec4(color*(.35+pulse*2.5),(.08+pulse*.72)*shore);
      }`,
  });
  const routeGeometry = new THREE.TubeGeometry(path, 320, 0.12, 6, false);
  const fog = new THREE.FogExp2(stations[current].palette.fog, 0.018);
  const key = new THREE.DirectionalLight(stations[current].biome.key[0], stations[current].biome.key[1] * 0.82);
  const keyTarget = new THREE.Object3D();
  key.target = keyTarget;
  key.castShadow = true;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 48;
  key.shadow.camera.left = key.shadow.camera.bottom = -12;
  key.shadow.camera.right = key.shadow.camera.top = 12;
  key.shadow.bias = -0.00025;

  interface Flight {
    camera: THREE.CatmullRomCurve3;
    target: THREE.CatmullRomCurve3;
    dino: THREE.CatmullRomCurve3;
    destination: WorldDestination;
    progress: number;
    duration: number;
    startFov: number;
  }

  let flight: Flight | undefined;
  let activePath = $state("");
  const activeSpace = $derived(activePath ? spaceForRoute(activePath) : null);
  let targetProgress = 0;
  let shownProgress = 0;
  let bounce = 0;
  let bounceVelocity = 0;
  let squash = 0;
  let squashVelocity = 0;
  let lastLanded = current;
  let firstFrame = true;
  let sceneStable = $state(false);
  let sampledFrames = 0;
  let sampledTime = 0;
  let demoted = false;
  let viewportWidth = 1280;
  const mobileOffset = new THREE.Vector3();
  const desiredFogColor = new THREE.Color();
  const desiredKeyColor = new THREE.Color();
  // Scratch vectors — the journey/flight updates run every frame and must not allocate.
  const scratchLanding = new THREE.Vector3();
  const scratchKeyOffset = new THREE.Vector3();
  const scratchParallax = new THREE.Vector3();
  const landedCamera = new THREE.Vector3();
  let landedDestination: WorldDestination | undefined;
  let pointerX = 0;
  let pointerY = 0;
  const lastStation = stations.length - 1;
  function clampStation(value: number) { return Math.min(lastStation, Math.max(0, Math.round(value))); }

  function reportMetrics() {
    let calls = 0;
    let triangles = 0;
    scene.traverse((object) => {
      const renderable = object as THREE.Mesh & { count?: number };
      if (!renderable.visible || !renderable.geometry) return;
      calls += Array.isArray(renderable.material) ? renderable.material.length : 1;
      const geometry = renderable.geometry;
      const base = geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
      triangles += base * (renderable.isInstancedMesh ? renderable.count ?? 1 : 1);
    });
    onMetrics(calls, Math.round(triangles));
  }

  function cameraFor(destination: WorldDestination) {
    const position = new THREE.Vector3(...destination.camera);
    if (viewportWidth < 768) position.add(new THREE.Vector3(0, 1.15, destination.kind === "space" ? 6 : 9.5));
    return position;
  }

  function land(destination: WorldDestination) {
    landedDestination = destination;
    landedCamera.copy(cameraFor(destination));
    currentTarget.set(...destination.target);
    dinoState.ground.set(...destination.dino);
    const index = stations.findIndex((station) => station.id === destination.parent);
    if (index >= 0) current = index;
    dinoState.station = current;
    dinoState.flying = false;
    if (!reducedMotion) {
      bounce = 0.22;
      bounceVelocity = -1.9;
      squash = 0.3;
      squashVelocity = 0;
    }
    onTravel("landed");
    if (activePath === "/") {
      // Scroll events are ignored mid-flight; pick up wherever the user actually scrolled to.
      const range = document.documentElement.scrollHeight - innerHeight;
      targetProgress = range > 0 ? scrollY / range * lastStation : 0;
      shownProgress = current;
    }
    sampledFrames = 0;
    sampledTime = 0;
  }

  function startFlight(destination: WorldDestination, immediate = false) {
    const end = cameraFor(destination);
    if (immediate || reducedMotion) {
      flight = undefined;
      camera.position.copy(end);
      camera.fov = viewportWidth < 768 ? Math.max(destination.fov, 52) : destination.fov;
      camera.updateProjectionMatrix();
      dinoState.position.set(...destination.dino);
      land(destination);
      return;
    }
    const start = camera.position.clone();
    const startTarget = currentTarget.clone();
    const endTarget = new THREE.Vector3(...destination.target);
    const dinoEnd = new THREE.Vector3(...destination.dino);
    const height = flightArcHeight(start.distanceTo(end));
    flight = {
      camera: new THREE.CatmullRomCurve3([start, start.clone().lerp(end, 0.24).add(new THREE.Vector3(0, height, 1.8)), start.clone().lerp(end, 0.74).add(new THREE.Vector3(0, height * 0.78, -1.8)), end], false, "catmullrom", 0.55),
      target: new THREE.CatmullRomCurve3([startTarget, startTarget.clone().lerp(endTarget, 0.5).add(new THREE.Vector3(0, height * 0.22, 0)), endTarget]),
      dino: new THREE.CatmullRomCurve3([dinoState.position.clone(), dinoState.position.clone().lerp(dinoEnd, 0.32).add(new THREE.Vector3(0, height * 0.72, 0)), dinoState.position.clone().lerp(dinoEnd, 0.74).add(new THREE.Vector3(0, height * 0.55, 0)), dinoEnd], false, "catmullrom", 0.55),
      destination,
      progress: 0,
      duration: Math.min(3.1, 1.3 + start.distanceTo(end) / 50),
      startFov: camera.fov,
    };
    dinoState.flying = true;
    onTravel("flying");
  }

  $effect(() => {
    const pathname = route;
    if (pathname === activePath) return;
    const immediate = activePath === "";
    activePath = pathname;
    if (pathname === "/") {
      // Re-entering the journey: resume at whatever station the restored scroll points to,
      // otherwise the camera would fly to the first island and then teleport on the next scroll event.
      const range = document.documentElement.scrollHeight - innerHeight;
      targetProgress = range > 0 ? Math.min(1, Math.max(0, scrollY / range)) * lastStation : 0;
      shownProgress = targetProgress;
      current = clampStation(targetProgress);
      startFlight(journeyDestination(current), immediate);
    } else {
      current = stationIndexForRoute(pathname);
      startFlight(destinationForRoute(pathname), immediate);
    }
  });

  function updateJourney(progress: number) {
    const segment = cameraSegment(progress);
    const compact = viewportWidth < 768;
    mobileOffset.set(0, compact ? 1.15 : 0, compact ? 9.5 : 0);
    if (segment.from === segment.to) {
      camera.position.copy(cameraPositions[segment.from]).add(mobileOffset);
      currentTarget.copy(cameraTargets[segment.from]);
    } else {
      camera.position.copy(cameraCurves[segment.from].getPoint(segment.amount)).add(mobileOffset);
      currentTarget.copy(targetCurves[segment.from].getPoint(segment.amount));
    }
    camera.fov = compact ? 52 : 42;
    camera.updateProjectionMatrix();
    const next = clampStation(progress);
    if (next !== current) current = next;
    dinoState.station = current;
    scratchLanding.copy(landingPoints[segment.from]).lerp(landingPoints[segment.to], segment.amount);
    dinoState.ground.copy(scratchLanding);
    dinoState.position.copy(scratchLanding);
    if (!reducedMotion) dinoState.position.y += Math.sin(Math.PI * segment.amount) * 3.4;
    if (!reducedMotion && Math.abs(progress - next) < 0.018 && next !== lastLanded) {
      lastLanded = next;
      bounce = 0.22;
      bounceVelocity = -1.9;
      squash = 0.3;
    }
  }

  function updateFlight(delta: number) {
    if (!flight) return false;
    flight.progress = Math.min(1, flight.progress + delta / flight.duration);
    const amount = flight.progress * flight.progress * (3 - 2 * flight.progress);
    camera.position.copy(flight.camera.getPoint(amount));
    currentTarget.copy(flight.target.getPoint(amount));
    flight.dino.getPoint(amount, dinoState.ground);
    dinoState.position.copy(dinoState.ground);
    dinoState.position.y += Math.sin(Math.PI * amount) * 1.15;
    const endFov = viewportWidth < 768 ? Math.max(flight.destination.fov, 52) : flight.destination.fov;
    camera.fov = THREE.MathUtils.lerp(flight.startFov, endFov, amount);
    camera.updateProjectionMatrix();
    if (flight.progress >= 1) {
      const destination = flight.destination;
      flight = undefined;
      land(destination);
    }
    return true;
  }

  function updateDino(delta: number, travelling: boolean) {
    if (!travelling) {
      [bounce, bounceVelocity] = springStep(bounce, bounceVelocity, 0, delta, 105, 15);
      [squash, squashVelocity] = springStep(squash, squashVelocity, 0, delta, 125, 17);
      const idle = reducedMotion ? 0 : Math.sin(performance.now() * 0.0022) * 0.045;
      dinoState.position.copy(dinoState.ground);
      dinoState.position.y += bounce + idle;
    }
    dinoState.scale.set(1 + squash, 1 - squash * 0.72, 1);
    dinoState.roll = bounceVelocity * 0.035 + (current % 2 ? -0.025 : 0.025);
  }

  function visit(index: number) {
    if (activePath === "/") document.getElementById(stations[index].id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    else navigate(routeForStation(stations[index].id));
  }

  onMount(() => {
    viewportWidth = innerWidth;
    function onResize() {
      viewportWidth = innerWidth;
      if (!flight && landedDestination && activeSpace) {
        // Space framing depends on the viewport breakpoint; recompute after resizes.
        landedCamera.copy(cameraFor(landedDestination));
        camera.fov = viewportWidth < 768 ? Math.max(landedDestination.fov, 52) : landedDestination.fov;
        camera.updateProjectionMatrix();
      }
    }
    function onScroll() {
      if (activePath !== "/" || flight) return;
      const range = document.documentElement.scrollHeight - innerHeight;
      targetProgress = range > 0 ? scrollY / range * lastStation : 0;
    }
    function onKey(event: KeyboardEvent) {
      if (activePath !== "/" || event.defaultPrevented || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      if (document.querySelector("dialog[open]")) return;
      if (["ArrowDown", "PageDown"].includes(event.key)) { event.preventDefault(); visit(Math.min(current + 1, lastStation)); }
      if (["ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); visit(Math.max(current - 1, 0)); }
    }
    let dragging = false;
    let dragAnchorY = 0;
    function pointerDown(event: PointerEvent) {
      if (activePath !== "/" || event.pointerType === "touch") return;
      dragging = true;
      dragAnchorY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      document.body.classList.add("is-dragging");
    }
    function pointerMove(event: PointerEvent) {
      if (!dragging) return;
      scrollBy({ top: (dragAnchorY - event.clientY) * 1.35 });
      dragAnchorY = event.clientY;
    }
    function pointerUp() { dragging = false; document.body.classList.remove("is-dragging"); }
    function trackPointer(event: PointerEvent) {
      pointerX = (event.clientX / innerWidth - 0.5) * 2;
      pointerY = (event.clientY / innerHeight - 0.5) * 2;
    }
    addEventListener("pointermove", trackPointer, { passive: true });
    onScroll();
    addEventListener("resize", onResize, { passive: true });
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", pointerDown);
    // Move/up live on the window so a pointer released outside the canvas cannot leave the drag stuck.
    addEventListener("pointermove", pointerMove);
    addEventListener("pointerup", pointerUp);
    addEventListener("pointercancel", pointerUp);
    return () => {
      removeEventListener("resize", onResize);
      removeEventListener("scroll", onScroll);
      removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", pointerDown);
      removeEventListener("pointermove", pointerMove);
      removeEventListener("pointermove", trackPointer);
      removeEventListener("pointerup", pointerUp);
      removeEventListener("pointercancel", pointerUp);
      document.body.classList.remove("is-dragging");
    };
  });

  useTask((delta) => {
    try {
      const safeDelta = Math.min(delta, 1 / 20);
      const travelling = updateFlight(safeDelta);
      if (!travelling && activeSpace && !reducedMotion) {
        // The room answers the cursor: a slow parallax drift around the landed framing.
        scratchParallax.set(pointerX * 0.85, -pointerY * 0.5, 0).add(landedCamera);
        camera.position.lerp(scratchParallax, Math.min(1, safeDelta * 2.4));
      }
      if (!travelling && activePath === "/") {
        shownProgress += (targetProgress - shownProgress) * Math.min(1, safeDelta * 4.6);
        dinoState.flying = Math.abs(targetProgress - shownProgress) > 0.012;
        updateJourney(shownProgress);
        if (!dinoState.flying) onTravel("landed");
      }
      updateDino(safeDelta, travelling || dinoState.flying);
      camera.lookAt(currentTarget);
      const station = stations[current];
      // Grading follows the active space when one is open, the current island otherwise.
      const desiredFog = activeSpace ? 0.0075 : 0.0115 + station.biome.fog * 0.003;
      fog.density = THREE.MathUtils.lerp(fog.density, desiredFog, safeDelta * 1.8);
      desiredFogColor.set(activeSpace ? activeSpace.palette.fog : station.palette.fog);
      desiredKeyColor.set(activeSpace ? activeSpace.palette.moss : station.biome.key[0]);
      fog.color.lerp(desiredFogColor, safeDelta * 1.2);
      key.color.lerp(desiredKeyColor, safeDelta * 1.8);
      key.intensity = THREE.MathUtils.lerp(key.intensity, activeSpace ? 2.1 : station.biome.key[1] * 0.82, safeDelta * 1.6);
      key.position.copy(currentTarget).add(scratchKeyOffset.set(current % 2 ? -8 : 8, 13, 8));
      keyTarget.position.copy(currentTarget);
      if (!reducedMotion) routeMaterial.uniforms.time.value += safeDelta;

      if (firstFrame && renderer.info.render.calls > 0) {
        firstFrame = false;
        sceneStable = true;
        onReady();
      }
      sampledFrames++;
      sampledTime += safeDelta;
      if (sampledFrames % 60 === 0) reportMetrics();
      if (!demoted && !flight && sampledFrames >= 180) {
        const fps = sampledFrames / sampledTime;
        if ((quality === "high" && fps < 48) || (quality === "medium" && fps < 36)) {
          demoted = true;
          onDemote();
        }
      }
    } catch (error) {
      onError(error);
    }
  });

  $effect(() => {
    quality;
    sampledFrames = 0;
    sampledTime = 0;
    demoted = false;
  });

  $effect(() => {
    const settings = qualitySettings[quality];
    renderer.setPixelRatio(Math.min(devicePixelRatio, settings.dpr));
    renderer.toneMapping = quality === "low" ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.08;
    key.shadow.mapSize.set(settings.shadows, settings.shadows);
    key.shadow.map?.dispose();
    key.shadow.map = null;
  });
</script>

<T is={camera} makeDefault />
<T is={fog} attach="fog" />
<Atmosphere {quality} {reducedMotion} />

<T is={THREE.AmbientLight} args={[0x89749b, quality === "low" ? 0.62 : 0.3]} />
<T is={THREE.HemisphereLight} args={[0xd4ffc8, 0x130d1c, quality === "low" ? 1.15 : 0.98]} />
<T is={key} />
<T is={keyTarget} />

{#if quality !== "low"}
  <VirtualEnvironment frames={1} resolution={quality === "high" ? 128 : 64}>
    <T is={THREE.Mesh} position={[0, 18, -24]}>
      <T is={THREE.SphereGeometry} args={[10, 12, 8]} />
      <T is={THREE.MeshBasicMaterial} color={0xd7f2ba} />
    </T>
    <T is={THREE.Mesh} position={[18, -8, 10]}>
      <T is={THREE.SphereGeometry} args={[8, 12, 8]} />
      <T is={THREE.MeshBasicMaterial} color={0x49305c} />
    </T>
  </VirtualEnvironment>
{/if}

<T is={THREE.Mesh} geometry={routeGeometry} material={routeMaterial} />

{#each stations as station, index (station.id)}
  <BiomeIsland
    {station}
    {quality}
    detailed={!activeSpace && (index === current || (quality !== "low" && activePath === "/" && index === Math.min(current + 1, stations.length - 1)))}
    showSigns={!activeSpace && (index === current || (activePath === "/" && index === Math.min(current + 1, stations.length - 1)))}
  />
{/each}

{#if activeSpace}
  {#key activeSpace.id}
    <RouteSpace space={activeSpace} {quality} {reducedMotion} />
  {/key}
{/if}

<DinoGuide visualState={dinoState} station={stations[current]} {quality} mode={activeSpace ? "space" : "journey"} {openArchive} />

{#if sceneStable && quality !== "low"}
  {#key quality}
    <WorldPostFX quality={quality as Exclude<QualityTier, "low">} onFailure={onDegraded} />
  {/key}
{/if}
