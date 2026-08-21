export type Vector3Tuple = readonly [number, number, number];
export type EulerTuple = readonly [number, number, number];
export type QualityTier = "high" | "medium" | "low";
export type StationId = "base" | "web" | "waak" | "zapapos" | "adc" | "volt" | "outro";
export type BiomeKind = "moss" | "ruins" | "wind" | "market" | "geometry" | "heath" | "lunar";
export type SignSurface = "stone" | "post" | "arch" | "banner" | "shrine";
export type LandmarkKind = "spring" | "ruin-arch" | "route" | "market-path" | "water-garden" | "storm-veins" | "moon-gate";

export interface PaletteConfig {
  ground: number;
  moss: number;
  rock: number;
  glow: number;
  fog: number;
  sky: number;
}

export interface BiomeConfig {
  kind: BiomeKind;
  elevation: number;
  moisture: number;
  flora: number;
  rocks: number;
  accents: number;
  fog: number;
  wind: number;
  key: readonly [number, number];
}

export interface SignConfig {
  text: string;
  surface: SignSurface;
  position: Vector3Tuple;
  rotation: EulerTuple;
  scale: number;
  route?: string;
  title?: boolean;
}

export interface StationConfig {
  id: StationId;
  title: string;
  position: Vector3Tuple;
  camera: Vector3Tuple;
  target: Vector3Tuple;
  dino: Vector3Tuple;
  seed: number;
  radius: number;
  pose: string;
  route: string;
  speech: string;
  palette: PaletteConfig;
  biome: BiomeConfig;
  landmark: LandmarkKind;
  editorial: { camera: Vector3Tuple; target: Vector3Tuple; dino: Vector3Tuple; fov: number };
  lod: Record<QualityTier, number>;
  signage: readonly SignConfig[];
}

const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere, nibh vitae luctus fermentum, justo sapien sodales tellus.";
const defaultLod = { high: 1, medium: 0.62, low: 0.3 } as const;

export const stations = [
  {
    id: "base", title: "ADRIÁN DOMÍNGUEZ CASASOLA", position: [0, 0, 0], camera: [-13.7, 7, 16.1], target: [0.2, 1.2, -0.8], dino: [3.05, 2.48, 0.1], seed: 3, radius: 9.4, pose: "reference", route: "/", speech: lorem,
    palette: { ground: 0x6f9868, moss: 0xa8d493, rock: 0x273526, glow: 0x8de4bb, fog: 0x243632, sky: 0x0c0a16 },
    biome: { kind: "moss", elevation: 1.1, moisture: 0.88, flora: 1, rocks: 0.72, accents: 1, fog: 0.44, wind: 0.28, key: [0xd9ffd0, 3.2] },
    landmark: "spring", editorial: { camera: [7.6, 4.8, 9.4], target: [-2.8, 1.1, -1.4], dino: [3.4, 2.5, -0.5], fov: 43 }, lod: defaultLod,
    signage: [
      { text: "ADRIÁN\nDOMÍNGUEZ\nCASASOLA", surface: "stone", position: [-3.7, 3.35, -3.7], rotation: [-0.04, 0.18, 0], scale: 0.68, title: true },
      { text: "MAPA DEL VIAJE", surface: "post", position: [-1.3, 1.9, 1.4], rotation: [0, 0.3, 0], scale: 0.32, route: "/projects" },
      { text: "COSMIC DINODOG", surface: "stone", position: [3.45, 1.75, -1.5], rotation: [0, -0.3, 0], scale: 0.28 },
    ],
  },
  {
    id: "web", title: "WEB TEMPRANA", position: [19, -1, -21], camera: [13.5, 7, 15.8], target: [-0.6, 1.2, -1], dino: [-2.7, 2.45, 0.35], seed: 11, radius: 9.1, pose: "reference", route: "/projects", speech: lorem,
    palette: { ground: 0x537b58, moss: 0x87bb78, rock: 0x353933, glow: 0x91d5b9, fog: 0x26372f, sky: 0x0d1014 },
    biome: { kind: "ruins", elevation: 1.28, moisture: 0.78, flora: 1, rocks: 1, accents: 0.72, fog: 0.52, wind: 0.38, key: [0xc7f4be, 2.8] },
    landmark: "ruin-arch", editorial: { camera: [7.4, 4.7, 9.1], target: [-2.7, 1.1, -1.5], dino: [3.2, 2.5, -0.4], fov: 44 }, lod: defaultLod,
    signage: [
      { text: "WEB TEMPRANA", surface: "arch", position: [1.2, 2.55, -3.4], rotation: [0, -0.16, 0], scale: 0.62, title: true },
      { text: "CONCORDIA", surface: "stone", position: [-3.5, 1.75, -0.6], rotation: [0, 0.45, 0], scale: 0.29, route: "/projects/markal" },
      { text: "JIUJITSU", surface: "post", position: [0.2, 1.9, 1.8], rotation: [0, -0.1, 0], scale: 0.3, route: "/projects/jiujitsukravmaga" },
      { text: "PORTFOLIO 2024", surface: "banner", position: [3.6, 2.3, -0.4], rotation: [0, -0.48, 0], scale: 0.27, route: "/projects/adriandomc" },
    ],
  },
  {
    id: "waak", title: "WAAK", position: [-9, 0, -42], camera: [-13.8, 7, 16.2], target: [0.7, 1.2, -1.2], dino: [2.8, 2.45, 0.15], seed: 19, radius: 9.8, pose: "reference", route: "/projects/all-in-one", speech: lorem,
    palette: { ground: 0x718d55, moss: 0xb3d877, rock: 0x30392a, glow: 0x8fd9cb, fog: 0x334333, sky: 0x11111a },
    biome: { kind: "wind", elevation: 0.92, moisture: 0.54, flora: 1, rocks: 0.52, accents: 0.64, fog: 0.36, wind: 1, key: [0xe3ffd1, 3] },
    landmark: "route", editorial: { camera: [7.8, 4.7, 9.5], target: [-2.8, 1.1, -1.5], dino: [3.4, 2.5, -0.3], fov: 44 }, lod: defaultLod,
    signage: [
      { text: "WAAK", surface: "arch", position: [-1.4, 2.6, -3.4], rotation: [0, 0.15, 0], scale: 0.82, title: true },
      { text: "SEGUIMIENTO DE UNIDADES", surface: "post", position: [-3.8, 1.9, 0.2], rotation: [0, 0.45, 0], scale: 0.24, route: "/projects/all-in-one" },
      { text: "GPS / FACTURACIÓN", surface: "post", position: [2.4, 1.9, 1.2], rotation: [0, -0.32, 0], scale: 0.25, route: "/projects/gps-invoicing" },
    ],
  },
  {
    id: "zapapos", title: "ZAPAPOS", position: [-22, -1, -63], camera: [-14, 7, 16], target: [0.45, 1.2, -1.1], dino: [2.9, 2.5, 0.3], seed: 29, radius: 10.1, pose: "reference", route: "/projects/zapa-pos", speech: lorem,
    palette: { ground: 0x7b7454, moss: 0xa5a46c, rock: 0x3f3328, glow: 0xffbd69, fog: 0x473426, sky: 0x150d16 },
    biome: { kind: "market", elevation: 1.05, moisture: 0.36, flora: 0.5, rocks: 0.74, accents: 1, fog: 0.42, wind: 0.34, key: [0xffd29b, 3.6] },
    landmark: "market-path", editorial: { camera: [8, 4.9, 9.8], target: [-3, 1.1, -1.4], dino: [3.5, 2.5, -0.4], fov: 44 }, lod: defaultLod,
    signage: [
      { text: "ZAPAPOS", surface: "banner", position: [-0.8, 3, -3.4], rotation: [0, 0.15, 0], scale: 0.78, title: true, route: "/projects/zapa-pos" },
      { text: "WINDOW NAVIGATION", surface: "post", position: [3.5, 2.05, 0.5], rotation: [0, -0.42, 0], scale: 0.26, route: "/projects/zapa-pos" },
      { text: "DESKTOP UI", surface: "stone", position: [-3.2, 1.8, -0.2], rotation: [0, 0.48, 0], scale: 0.3, route: "/projects/zapa-pos" },
    ],
  },
  {
    id: "adc", title: "ADC DESIGN SYSTEM", position: [-3, 1, -84], camera: [13.6, 7, 15.9], target: [-0.55, 1.2, -1], dino: [-2.7, 2.48, 0.1], seed: 37, radius: 9.6, pose: "reference", route: "/projects/portfolio", speech: lorem,
    palette: { ground: 0x829b6b, moss: 0xc8e7a8, rock: 0x354135, glow: 0x83dacf, fog: 0x32443d, sky: 0x0d0d18 },
    biome: { kind: "geometry", elevation: 0.72, moisture: 0.82, flora: 0.7, rocks: 0.46, accents: 1, fog: 0.32, wind: 0.18, key: [0xe4ffd2, 3.2] },
    landmark: "water-garden", editorial: { camera: [7.6, 4.7, 9.4], target: [-2.8, 1.1, -1.5], dino: [3.3, 2.5, -0.4], fov: 44 }, lod: defaultLod,
    signage: [
      { text: "ADC DESIGN SYSTEM", surface: "shrine", position: [0.4, 2.8, -3.6], rotation: [0, -0.05, 0], scale: 0.62, title: true },
      { text: "PORTFOLIO", surface: "stone", position: [3.5, 1.8, -0.4], rotation: [0, -0.45, 0], scale: 0.29, route: "/projects/portfolio" },
      { text: "ADMIN", surface: "post", position: [0.1, 1.85, 1.4], rotation: [0, 0, 0], scale: 0.29 },
      { text: "QASTOR", surface: "stone", position: [-3.5, 1.75, -0.6], rotation: [0, 0.42, 0], scale: 0.3, route: "/projects/qastor" },
    ],
  },
  {
    id: "volt", title: "VOLTALFA DESIGN SYSTEM", position: [20, 0, -105], camera: [13.9, 7, 16.2], target: [-0.8, 1.2, -1.1], dino: [-2.9, 2.5, 0.15], seed: 43, radius: 9.9, pose: "reference", route: "/projects/voltalfa", speech: lorem,
    palette: { ground: 0x594a61, moss: 0x8a6aa2, rock: 0x251c2d, glow: 0xd09cff, fog: 0x33243f, sky: 0x110918 },
    biome: { kind: "heath", elevation: 1.34, moisture: 0.48, flora: 0.88, rocks: 1, accents: 1, fog: 0.58, wind: 0.68, key: [0xd7b7ff, 3.3] },
    landmark: "storm-veins", editorial: { camera: [7.8, 4.8, 9.7], target: [-2.9, 1.1, -1.5], dino: [3.4, 2.5, -0.4], fov: 44 }, lod: defaultLod,
    signage: [
      { text: "VOLTALFA\nDESIGN SYSTEM", surface: "arch", position: [0.6, 2.85, -3.6], rotation: [0, -0.08, 0], scale: 0.62, title: true, route: "/projects/voltalfa" },
      { text: "VOLTALFA", surface: "stone", position: [-3.6, 1.75, 0], rotation: [0, 0.45, 0], scale: 0.3, route: "/projects/voltalfa" },
      { text: "VOLTSHOW", surface: "post", position: [3.1, 2, 0.7], rotation: [0, -0.45, 0], scale: 0.31, route: "/projects/voltalfa" },
    ],
  },
  {
    id: "outro", title: "CONTACTO", position: [2, 1, -126], camera: [-13.1, 7, 15.7], target: [0.8, 1.2, -1], dino: [2.8, 2.45, 0], seed: 53, radius: 9.2, pose: "reference", route: "/contact", speech: lorem,
    palette: { ground: 0x777a73, moss: 0xc4cfb3, rock: 0x30303a, glow: 0xbfb1ff, fog: 0x373546, sky: 0x090914 },
    biome: { kind: "lunar", elevation: 0.82, moisture: 0.18, flora: 0.68, rocks: 0.84, accents: 1, fog: 0.5, wind: 0.2, key: [0xe7e7ff, 3.1] },
    landmark: "moon-gate", editorial: { camera: [7.3, 4.6, 9.1], target: [-2.6, 1, -1.5], dino: [3.3, 2.5, -0.4], fov: 44 }, lod: defaultLod,
    signage: [
      { text: "CONTACTO", surface: "shrine", position: [0, 2.9, -3.6], rotation: [0, 0, 0], scale: 0.78, title: true, route: "/contact" },
      { text: "TERMINAL", surface: "stone", position: [-3.4, 1.75, -0.3], rotation: [0, 0.4, 0], scale: 0.3, route: "/contact" },
      { text: "PANORAMA COMPLETO", surface: "post", position: [3.1, 1.95, 0.5], rotation: [0, -0.42, 0], scale: 0.26, route: "/projects" },
    ],
  },
] as const satisfies readonly StationConfig[];

export type Station = (typeof stations)[number];
export type DestinationKind = "journey" | "space";
export interface SpaceConfig { id: string; anchor: StationId; center: Vector3Tuple; palette: PaletteConfig; seed: number }
export interface WorldDestination { id: string; parent: StationId; kind: DestinationKind; camera: Vector3Tuple; target: Vector3Tuple; dino: Vector3Tuple; fov: number; space?: SpaceConfig }

export const qualitySettings: Record<QualityTier, { dpr: number; shadows: number; vegetation: number; particles: number; post: "full" | "lite" | "off" }> = {
  high: { dpr: 1.5, shadows: 2048, vegetation: 1, particles: 1, post: "full" },
  medium: { dpr: 1.25, shadows: 1024, vegetation: 0.6, particles: 0.6, post: "lite" },
  low: { dpr: 1, shadows: 512, vegetation: 0.3, particles: 0.3, post: "off" },
};

export interface QualityProbe { reducedMotion: boolean; width: number; memory?: number; cores?: number; webgl2: boolean }
export function selectQualityTier({ reducedMotion, width, memory = 4, cores = 4, webgl2 }: QualityProbe): QualityTier {
  if (reducedMotion || !webgl2 || memory < 4 || cores < 4) return "low";
  if (width >= 1100 && memory >= 8 && cores >= 6) return "high";
  return "medium";
}
export function lowerQualityTier(tier: QualityTier): QualityTier { return tier === "high" ? "medium" : "low"; }

const projectStations: Record<string, StationId> = { "zapa-pos": "zapapos", "gps-invoicing": "waak", "all-in-one": "waak", adriandomc: "adc", portfolio: "adc", qastor: "adc", voltalfa: "volt", jiujitsukravmaga: "web", markal: "web", dinotext: "web" };
const stationRoutes: Record<StationId, string> = { base: "/", web: "/projects/jiujitsukravmaga", waak: "/projects/all-in-one", zapapos: "/projects/zapa-pos", adc: "/projects/portfolio", volt: "/projects/voltalfa", outro: "/contact" };
export function routeForStation(id: StationId) { return stationRoutes[id]; }
export function stationById(id: StationId) { return stations.find((station) => station.id === id)!; }
function worldPoint(station: StationConfig, offset: Vector3Tuple): Vector3Tuple { return [station.position[0] + offset[0], station.position[1] + offset[1], station.position[2] + offset[2]]; }
function stationDestination(station: StationConfig, kind: DestinationKind = "journey"): WorldDestination { return { id: `${station.id}-${kind}`, parent: station.id, kind, camera: worldPoint(station, station.camera), target: worldPoint(station, station.target), dino: worldPoint(station, station.dino), fov: 42 }; }

export function journeyDestination(index: number): WorldDestination {
  const clamped = Math.min(stations.length - 1, Math.max(0, index));
  return stationDestination(stations[clamped]);
}

// ————— Spaces: every non-journey route lives in a floating room high above its anchor island.
// The journey ('/') is the only pseudo-guided part; content pages get their own place in the sky.
const SPACE_ALTITUDE = 42;

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

function spaceConfig(id: string, anchorId: StationId, drift: Vector3Tuple = [0, 0, 0], palette?: PaletteConfig): SpaceConfig {
  const anchor = stationById(anchorId);
  return {
    id,
    anchor: anchorId,
    center: add(anchor.position, add([0, SPACE_ALTITUDE, 0], drift)),
    palette: palette ?? anchor.palette,
    seed: anchor.seed + 900,
  };
}

// trailingSlash is "ignore", so "/about/" and "/about" are the same page — match them the same.
function normalizePathname(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function spaceForRoute(rawPathname: string): SpaceConfig | null {
  const pathname = normalizePathname(rawPathname);
  if (pathname === "/projects" || pathname === "/projects/all")
    return spaceConfig("space-projects", "waak", [8, 14, -8], { ground: 0x53707d, moss: 0x8fd0cb, rock: 0x22333a, glow: 0x8fd9cb, fog: 0x24363c, sky: 0x0b1016 });
  if (pathname === "/about") return spaceConfig("space-about", "base");
  if (pathname === "/blog") return spaceConfig("space-blog", "adc", [-4, 0, 2]);
  if (pathname.startsWith("/blog/")) return spaceConfig("space-blog-post", "adc", [4, 3, -2]);
  if (pathname === "/contact") return spaceConfig("space-contact", "outro");
  if (pathname.startsWith("/projects/")) {
    const slug = pathname.split("/")[2] ?? "";
    const anchor = projectStations[slug] ?? "web";
    return spaceConfig(`space-project-${slug || "web"}`, anchor, [2, 0, 0]);
  }
  return null;
}

function spaceDestination(space: SpaceConfig, fov = 44): WorldDestination {
  return {
    id: space.id,
    parent: space.anchor,
    kind: "space",
    // The content panel sits on the left of the viewport, so the camera frames the
    // diorama (built toward +x) on the right and the puppet lands beside the panel.
    camera: add(space.center, [-1.6, 2.3, 13.8]),
    target: add(space.center, [1.4, 0.7, 0]),
    dino: add(space.center, [5.1, 0.7, 1.9]),
    fov,
    space,
  };
}

export function destinationForRoute(rawPathname: string): WorldDestination {
  const pathname = normalizePathname(rawPathname);
  const space = spaceForRoute(pathname);
  if (space) return spaceDestination(space, pathname.startsWith("/blog/") || pathname.startsWith("/projects/") ? 46 : 44);
  return stationDestination(stations[0]);
}

export function stationIndexForRoute(pathname: string) { const destination = destinationForRoute(pathname); return stations.findIndex((station) => station.id === destination.parent); }
export function cameraSegment(progress: number) { const clamped = Math.min(Math.max(progress, 0), stations.length - 1); const from = Math.floor(clamped); const amount = clamped - from; return { from, to: Math.min(from + 1, stations.length - 1), amount: amount * amount * (3 - 2 * amount) }; }
export function flightArcHeight(distance: number) { return Math.min(20, Math.max(7, distance * 0.28)); }
export function springStep(value: number, velocity: number, target: number, delta: number, stiffness = 95, damping = 14) { const step = Math.min(delta, 1 / 30); const nextVelocity = velocity + (stiffness * (target - value) - damping * velocity) * step; return [value + nextVelocity * step, nextVelocity] as const; }
