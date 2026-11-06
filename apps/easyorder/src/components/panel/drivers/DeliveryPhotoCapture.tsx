"use client";

import "./delivery-photo-capture.css";
import { useEffect, useRef, useState } from "react";
import {
  DELIVERY_PHOTO_MODE,
  type DeliveryPhotoMode,
  describePhotoUploadError,
  photoFileProblem,
} from "@/lib/panel/delivery-photo";
import type { Delivery } from "@/lib/panel/drivers";
import { Icon } from "../Icon";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

type Props = {
  readonly delivery: Pick<Delivery, "id" | "fotos_entrega">;
  readonly mode: DeliveryPhotoMode;
  /** La guía del panel señala este bloque (solo el de la primera entrega de la lista). */
  readonly tour?: boolean;
  /** Se llama tras subir la foto para recargar la lista. */
  readonly onUploaded: () => void | Promise<void>;
};

/**
 * «Foto de entrega»: abre la cámara del móvil, enseña una vista previa y sube la foto al pulsar
 * «Subir foto». Con la foto obligatoria avisa de que hace falta para marcar «Entregado».
 */
export function DeliveryPhotoCapture({ delivery, mode, tour = false, onUploaded }: Props) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    const problem = photoFileProblem(chosen);
    setError(problem);
    setFile(problem ? null : chosen);
  }

  function discard() {
    setFile(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await api.uploadDeliveryPhoto(slug, delivery.id, file);
    setUploading(false);
    if (!result.ok) {
      setError(describePhotoUploadError(result.status, result.body));
      return;
    }
    discard();
    await onUploaded();
  }

  const uploaded = delivery.fotos_entrega;
  const required = mode === DELIVERY_PHOTO_MODE.Required;

  return (
    <div className="k-photo-capture" data-tour={tour ? "repartos-foto" : undefined}>
      <div className="k-photo-capture-head">
        <button
          type="button"
          className="k-btn k-btn-secondary"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          <Icon name="camera" size={18} />
          {uploaded > 0 ? "Otra foto de entrega" : "Foto de entrega"}
        </button>
        {uploaded > 0 ? (
          <span className="k-chip k-photo-capture-done">
            <Icon name="check" size={14} />
            {uploaded === 1 ? "Foto subida" : `${uploaded} fotos subidas`}
          </span>
        ) : required ? (
          <span className="k-small k-photo-capture-required">Obligatoria para entregar</span>
        ) : null}
      </div>
      <input
        ref={input}
        className="k-photo-capture-input"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Hacer foto de la entrega"
        onChange={(event) => choose(event.target.files?.[0])}
      />
      {file && preview ? (
        <div className="k-photo-capture-preview">
          {/* biome-ignore lint/performance/noImgElement: vista previa local (blob:) de la foto elegida */}
          <img src={preview} alt="Vista previa de la foto de entrega" />
          <div className="k-photo-capture-actions">
            <button
              type="button"
              className="k-btn k-btn-go"
              disabled={uploading}
              onClick={() => void upload()}
            >
              {uploading ? "Subiendo…" : "Subir foto"}
            </button>
            <button
              type="button"
              className="k-btn k-btn-secondary"
              disabled={uploading}
              onClick={discard}
            >
              Descartar
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="k-photo-capture-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
