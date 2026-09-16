import type { BuildKind } from "./building.ts";

export type Sprite = {
  lit: CanvasImageSource;
  dark: CanvasImageSource;
  // Opaque bounds inside the keyed sheet, measured once off the committed PNG. Anchoring
  // on the sheet instead would float every building on its own margin of transparency.
  box: { x: number; y: number; w: number; h: number };
  beacon: { x: number; y: number };
  door: 1 | -1;
};

export type SpriteSet = {
  hut: Sprite | undefined;
  vault: Sprite | undefined;
  ground: HTMLImageElement | undefined;
};

export function assetUrl(name: string, base: string): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}themes/starcraft/${name}.png`;
}

type Sheet = Omit<Sprite, "lit" | "dark"> & { name: string };

const SHEETS: Record<BuildKind, Sheet> = {
  hut: {
    name: "hut",
    box: { x: 76, y: 83, w: 368, h: 335 },
    beacon: { x: 0.356, y: 0.042 },
    door: 1,
  },
  vault: {
    name: "vault",
    box: { x: 85, y: 103, w: 356, h: 306 },
    beacon: { x: 0.444, y: 0.029 },
    door: -1,
  },
};

const NIGHT_WASH = "rgba(20, 28, 46, 0.78)";

// One dark twin per sheet, made once at load. The lit sheet carries glowing windows and a
// doorway, so an asleep building is that same art with the light taken out of it rather
// than a second generated frame.
function darkenSprite(image: HTMLImageElement): CanvasImageSource {
  const shade = document.createElement("canvas");
  shade.width = image.naturalWidth;
  shade.height = image.naturalHeight;
  const ctx = shade.getContext("2d");
  if (ctx === null) {
    return image;
  }
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = NIGHT_WASH;
  ctx.fillRect(0, 0, shade.width, shade.height);
  return shade;
}

export function loadSprites(onReady: () => void): SpriteSet {
  const set: SpriteSet = { hut: undefined, vault: undefined, ground: undefined };

  for (const kind of ["hut", "vault"] as const) {
    const sheet = SHEETS[kind];
    const image = new Image();
    image.addEventListener("load", () => {
      set[kind] = {
        lit: image,
        dark: darkenSprite(image),
        box: sheet.box,
        beacon: sheet.beacon,
        door: sheet.door,
      };
      onReady();
    });
    image.src = assetUrl(sheet.name, import.meta.env.BASE_URL);
  }

  const ground = new Image();
  ground.addEventListener("load", () => {
    set.ground = ground;
    onReady();
  });
  ground.src = assetUrl("ground", import.meta.env.BASE_URL);

  return set;
}
