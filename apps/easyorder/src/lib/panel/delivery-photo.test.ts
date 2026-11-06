import { describe, expect, it } from "vitest";
import {
  DELIVERY_PHOTO_OPTIONS,
  describePhotoUploadError,
  describePhotoViewError,
  MAX_DELIVERY_PHOTO_BYTES,
  offersPhoto,
  photoBlocksDelivery,
  photoFileProblem,
  photoIndicator,
  photoLinkLabel,
} from "./delivery-photo";

describe("foto de entrega en el panel", () => {
  it("el selector ofrece no, opcional y obligatoria", () => {
    expect(DELIVERY_PHOTO_OPTIONS.map((option) => option.id)).toEqual([
      "no",
      "opcional",
      "obligatoria",
    ]);
  });

  it("solo se ofrece la foto si el local no la tiene en «no»", () => {
    expect(offersPhoto("no")).toBe(false);
    expect(offersPhoto("opcional")).toBe(true);
    expect(offersPhoto("obligatoria")).toBe(true);
  });

  it("«Entregado» se bloquea solo con foto obligatoria y sin ninguna subida", () => {
    expect(photoBlocksDelivery("obligatoria", { fotos_entrega: 0 })).toBe(true);
    expect(photoBlocksDelivery("obligatoria", { fotos_entrega: 1 })).toBe(false);
    expect(photoBlocksDelivery("opcional", { fotos_entrega: 0 })).toBe(false);
    expect(photoBlocksDelivery("no", { fotos_entrega: 0 })).toBe(false);
  });

  it("valida tipo y tamaño del archivo antes de subirlo", () => {
    expect(photoFileProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(photoFileProblem({ type: "image/webp", size: MAX_DELIVERY_PHOTO_BYTES })).toBeNull();
    expect(photoFileProblem({ type: "image/png", size: 0 })).toContain("vacía");
    expect(photoFileProblem({ type: "application/pdf", size: 1000 })).toContain("JPG, PNG o WebP");
    expect(photoFileProblem({ type: "image/jpeg", size: MAX_DELIVERY_PHOTO_BYTES + 1 })).toContain(
      "5 MB",
    );
  });

  it("indicador y enlaces en singular y plural", () => {
    expect(photoIndicator(0)).toBeNull();
    expect(photoIndicator(1)).toBe("Foto de entrega");
    expect(photoIndicator(2)).toBe("2 fotos de entrega");
    expect(photoLinkLabel(0, 1)).toBe("Ver foto de entrega");
    expect(photoLinkLabel(1, 3)).toBe("Foto 2");
  });

  it("mensajes de error de subida comprensibles", () => {
    expect(describePhotoUploadError(0, null)).toContain("Sin conexión");
    expect(describePhotoUploadError(413, null)).toContain("5 MB");
    expect(describePhotoUploadError(415, null)).toContain("JPG");
    expect(
      describePhotoUploadError(409, { error: "unprocessable", reason: "order_not_on_the_way" }),
    ).toContain("en camino");
    expect(
      describePhotoUploadError(409, {
        error: "unprocessable",
        reason: "delivery_photo_limit_reached",
      }),
    ).toContain("máximo");
    expect(describePhotoUploadError(404, null)).toContain("ya no es tuyo");
    expect(describePhotoUploadError(503, { error: "storage_not_configured" })).toContain(
      "no está configurado",
    );
  });

  it("mensajes de error al abrir la foto", () => {
    expect(describePhotoViewError(403, null)).toContain("permiso");
    expect(describePhotoViewError(404, null)).toContain("ya no está disponible");
    expect(describePhotoViewError(0, null)).toContain("Sin conexión");
    expect(describePhotoViewError(503, { error: "storage_not_configured" })).toContain(
      "no está configurado",
    );
  });
});
