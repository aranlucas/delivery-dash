import * as THREE from "three";
import { mulberry32 } from "../../shared/rng";

/** One facade tile covers this much of the world, so windows keep a constant size on every block. */
export const FACADE_TILE_X = 9;
export const FACADE_TILE_Y = 11;

const canvas = (size: number) => {
  const element = document.createElement("canvas");
  element.width = element.height = size;
  return [element, element.getContext("2d")!] as const;
};

const finish = (element: HTMLCanvasElement, repeat = 1) => {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (repeat !== 1) texture.repeat.set(repeat, repeat);
  return texture;
};

/** Speckle a rectangle with fine grain so flat fills never read as plastic. */
function grain(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  size: number,
  count: number,
  alpha: number,
) {
  for (let i = 0; i < count; i++) {
    const shade = Math.floor(rng() * 255);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    ctx.fillRect(rng() * size, rng() * size, 1.5, 1.5);
  }
}

type FacadeStyle = {
  wall: string;
  wallDark: string;
  frame: string;
  glass: string;
  /** Windows per tile, and how much of the bay each one fills. */
  columns: number;
  rows: number;
  fill: [number, number];
  /** Continuous glazing bands instead of punched openings. */
  banded?: boolean;
  seed: number;
};

/**
 * Facade pair: an albedo canvas and a matching emissive canvas that lights the same windows warm.
 * Tiles seamlessly, so a tower is one instanced box with the texture repeated per storey.
 */
export function makeFacade(style: FacadeStyle) {
  const size = 256;
  const [mapCanvas, map] = canvas(size);
  const [glowCanvas, glow] = canvas(size);
  const rng = mulberry32(style.seed);

  map.fillStyle = style.wall;
  map.fillRect(0, 0, size, size);
  glow.fillStyle = "#000";
  glow.fillRect(0, 0, size, size);

  const bayW = size / style.columns,
    bayH = size / style.rows;
  // Storey bands: a slightly darker spandrel under every floor line.
  for (let r = 0; r < style.rows; r++) {
    map.fillStyle = style.wallDark;
    map.fillRect(0, r * bayH + bayH * 0.86, size, bayH * 0.14);
  }
  if (style.banded)
    for (let r = 0; r < style.rows; r++) {
      map.fillStyle = style.frame;
      map.fillRect(0, r * bayH + bayH * 0.1, size, bayH * 0.02);
    }

  for (let c = 0; c < style.columns; c++)
    for (let r = 0; r < style.rows; r++) {
      const w = bayW * style.fill[0],
        h = bayH * style.fill[1];
      const x = c * bayW + (bayW - w) / 2,
        y = r * bayH + (bayH - h) / 2;
      const lit = rng() < 0.34;
      map.fillStyle = style.frame;
      map.fillRect(x - 2, y - 2, w + 4, h + 4);
      map.fillStyle = lit ? "#ffeeb4" : style.glass;
      map.fillRect(x, y, w, h);
      // Glass catches a sliver of sky along its top edge.
      map.fillStyle = "rgba(255,255,255,0.16)";
      map.fillRect(x, y, w, h * 0.22);
      if (lit) {
        glow.fillStyle = `rgb(255, ${196 + Math.floor(rng() * 44)}, ${120 + Math.floor(rng() * 50)})`;
        glow.fillRect(x, y, w, h);
      }
    }
  grain(map, rng, size, 900, 0.05);

  const mapTexture = finish(mapCanvas);
  const glowTexture = finish(glowCanvas);
  return { mapTexture, glowTexture };
}

export const FACADE_STYLES: FacadeStyle[] = [
  // Downtown: curtain wall, wide glazing bands, cool glass.
  {
    wall: "#c9d6e0",
    wallDark: "#a9bccb",
    frame: "#7d8b98",
    glass: "#20455f",
    columns: 4,
    rows: 5,
    fill: [0.86, 0.6],
    banded: true,
    seed: 7,
  },
  // Midtown: masonry with punched windows and deep reveals.
  {
    wall: "#e8cfa6",
    wallDark: "#cbaf87",
    frame: "#8a7154",
    glass: "#173445",
    columns: 4,
    rows: 5,
    fill: [0.5, 0.62],
    seed: 19,
  },
  // Outskirts: stucco, smaller openings, more wall.
  {
    wall: "#f0dcc2",
    wallDark: "#d8c2a6",
    frame: "#9d8467",
    glass: "#1d3a4a",
    columns: 3,
    rows: 4,
    fill: [0.42, 0.5],
    seed: 31,
  },
];

/** Worn asphalt: grain, darker repair patches, and a few hairline cracks. */
export function makeAsphaltTexture() {
  const size = 256;
  const [element, ctx] = canvas(size);
  const rng = mulberry32(11);
  ctx.fillStyle = "#242b31";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(${18 + rng() * 26},${20 + rng() * 26},${24 + rng() * 26},0.55)`;
    const w = 30 + rng() * 70,
      h = 20 + rng() * 60;
    ctx.beginPath();
    ctx.roundRect(rng() * size, rng() * size, w, h, 8);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(12,14,17,0.7)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    let x = rng() * size,
      y = rng() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (rng() - 0.5) * 34;
      y += (rng() - 0.5) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, rng, size, 2600, 0.09);
  return finish(element, 72);
}

/** Paving slabs for the block surfaces, with joints and a little colour drift per slab. */
export function makePavingTexture() {
  const size = 256,
    cells = 6;
  const [element, ctx] = canvas(size);
  const rng = mulberry32(23);
  ctx.fillStyle = "#8d8578";
  ctx.fillRect(0, 0, size, size);
  const step = size / cells;
  for (let c = 0; c < cells; c++)
    for (let r = 0; r < cells; r++) {
      const shade = 208 + Math.floor(rng() * 26);
      ctx.fillStyle = `rgb(${shade},${shade - 12},${shade - 32})`;
      ctx.fillRect(c * step + 1.5, r * step + 1.5, step - 3, step - 3);
    }
  grain(ctx, rng, size, 1400, 0.06);
  return finish(element, 5);
}

/** Mown grass for the park blocks: banded mowing stripes plus tuft noise. */
export function makeGrassTexture() {
  const size = 256;
  const [element, ctx] = canvas(size);
  const rng = mulberry32(29);
  ctx.fillStyle = "#4aa855";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,40,0,0.08)";
    ctx.fillRect(0, (i * size) / 8, size, size / 8);
  }
  for (let i = 0; i < 2200; i++) {
    const green = 120 + Math.floor(rng() * 90);
    ctx.fillStyle = `rgba(${green * 0.45},${green},${green * 0.5},0.35)`;
    ctx.fillRect(rng() * size, rng() * size, 1.5, 2.5);
  }
  return finish(element, 4);
}

/** Hazard chevrons for the launch ramps: black and construction yellow, pointing up the slope. */
export function makeRampHazardTexture() {
  const size = 128;
  const [element, ctx] = canvas(size);
  ctx.fillStyle = "#1b1d21";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffc61a";
  for (let i = -1; i < 4; i++) {
    const y = i * 36;
    ctx.beginPath();
    ctx.moveTo(0, y + 20);
    ctx.lineTo(size / 2, y);
    ctx.lineTo(size, y + 20);
    ctx.lineTo(size, y + 36);
    ctx.lineTo(size / 2, y + 16);
    ctx.lineTo(0, y + 36);
    ctx.closePath();
    ctx.fill();
  }
  return finish(element);
}

/** Poured concrete for the expressway ramps and deck soffits. */
export function makeConcreteTexture() {
  const size = 256;
  const [element, ctx] = canvas(size);
  const rng = mulberry32(37);
  ctx.fillStyle = "#9aa0a6";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = "rgba(120,126,132,0.5)";
    ctx.fillRect(0, (i * size) / 5, size, 2);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${130 + rng() * 40},${134 + rng() * 40},${140 + rng() * 40},0.4)`;
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, 6 + rng() * 22, 5 + rng() * 16, rng() * 3, 0, 7);
    ctx.fill();
  }
  grain(ctx, rng, size, 1800, 0.07);
  return finish(element);
}

/** Cyan chevrons pointing along the pad, shared by every boost strip. */
export function makeBoostPadTexture() {
  const size = 128;
  const [element, ctx] = canvas(size);
  ctx.fillStyle = "#04222c";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3; i++) {
    const y = 14 + i * 38;
    ctx.fillStyle = i === 2 ? "#b6fbff" : "#5ff0ff";
    ctx.beginPath();
    ctx.moveTo(size / 2, y);
    ctx.lineTo(size - 12, y + 22);
    ctx.lineTo(size - 12, y + 34);
    ctx.lineTo(size / 2, y + 12);
    ctx.lineTo(12, y + 34);
    ctx.lineTo(12, y + 22);
    ctx.closePath();
    ctx.fill();
  }
  return finish(element);
}
