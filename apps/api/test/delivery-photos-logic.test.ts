import { describe, expect, it } from "vitest";
import {
  DELIVERY_PHOTO_MODE,
  DELIVERY_PHOTO_REJECTION,
  deliveryNeedsPhoto,
  deliveryPhotoMode,
  deliveryPhotoPath,
  detectDeliveryPhotoType,
  MAX_DELIVERY_PHOTOS_PER_ORDER,
  photoRejection,
} from "../src/repositories/delivery-photos";
import { IMAGE_TYPE } from "../src/repositories/menu-admin";
import { CONFIG_KEY } from "../src/repositories/restaurants";

const config = (value?: string) =>
  new Map(value === undefined ? [] : [[CONFIG_KEY.DeliveryPhoto, value]]);

describe("foto de entrega: reglas puras", () => {
  it("sin clave, o con un valor desconocido, equivale a «no»", () => {
    expect(deliveryPhotoMode(config())).toBe(DELIVERY_PHOTO_MODE.No);
    expect(deliveryPhotoMode(config("siempre"))).toBe(DELIVERY_PHOTO_MODE.No);
    expect(deliveryPhotoMode(config(""))).toBe(DELIVERY_PHOTO_MODE.No);
  });

  it("reconoce no, opcional y obligatoria (sin importar mayúsculas ni espacios)", () => {
    expect(deliveryPhotoMode(config("no"))).toBe("no");
    expect(deliveryPhotoMode(config("opcional"))).toBe("opcional");
    expect(deliveryPhotoMode(config(" Obligatoria "))).toBe("obligatoria");
  });

  it("solo exige la foto si es obligatoria y aún no hay ninguna", () => {
    expect(deliveryNeedsPhoto("obligatoria", 0)).toBe(true);
    expect(deliveryNeedsPhoto("obligatoria", 1)).toBe(false);
    expect(deliveryNeedsPhoto("opcional", 0)).toBe(false);
    expect(deliveryNeedsPhoto("no", 0)).toBe(false);
  });

  it("acepta la subida solo con el ajuste activo, el pedido en camino y sitio", () => {
    const base = { mode: "opcional", estado: "en_camino", subidas: 0 } as const;
    expect(photoRejection(base)).toBeNull();
    expect(photoRejection({ ...base, mode: "obligatoria" })).toBeNull();
    expect(photoRejection({ ...base, mode: "no" })).toBe(DELIVERY_PHOTO_REJECTION.Disabled);
    expect(photoRejection({ ...base, estado: "listo" })).toBe(DELIVERY_PHOTO_REJECTION.NotOnTheWay);
    expect(photoRejection({ ...base, estado: "entregado" })).toBe(
      DELIVERY_PHOTO_REJECTION.NotOnTheWay,
    );
    expect(photoRejection({ ...base, subidas: MAX_DELIVERY_PHOTOS_PER_ORDER - 1 })).toBeNull();
    expect(photoRejection({ ...base, subidas: MAX_DELIVERY_PHOTOS_PER_ORDER })).toBe(
      DELIVERY_PHOTO_REJECTION.LimitReached,
    );
  });

  it("reconoce JPG, PNG y WebP por su firma y rechaza PDF y el resto", () => {
    expect(detectDeliveryPhotoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(IMAGE_TYPE.Jpeg);
    expect(detectDeliveryPhotoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(IMAGE_TYPE.Png);
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBP");
    expect(detectDeliveryPhotoType(webp)).toBe(IMAGE_TYPE.Webp);
    expect(detectDeliveryPhotoType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectDeliveryPhotoType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("la ruta privada cuelga del prefijo entregas/ con restaurante y pedido", () => {
    const path = deliveryPhotoPath(7, 42, IMAGE_TYPE.Webp);
    expect(path).toMatch(/^entregas\/7\/42\/[0-9a-f-]{36}\.webp$/);
    expect(deliveryPhotoPath(7, 42, IMAGE_TYPE.Webp)).not.toBe(path);
  });
});
