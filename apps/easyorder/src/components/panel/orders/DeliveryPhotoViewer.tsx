"use client";

import "./delivery-photo-viewer.css";
import { useState } from "react";
import {
  describePhotoViewError,
  type OrderDeliveryPhoto,
  photoIndicator,
  photoLinkLabel,
} from "@/lib/panel/delivery-photo";
import { Icon } from "../Icon";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

type Props = {
  readonly orderId: number;
  /** Fotos de entrega que ha subido el repartidor (0 = no se muestra nada). */
  readonly count: number;
};

/**
 * «Ver foto de entrega». El panel no guarda ninguna URL: cada vez que se pulsa el botón pide a
 * la API URLs firmadas de pocos minutos y las enseña como enlaces.
 */
export function DeliveryPhotoViewer({ orderId, count }: Props) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<readonly OrderDeliveryPhoto[] | null>(null);
  const [expires, setExpires] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const indicator = photoIndicator(count);
  if (!indicator) return null;

  async function open() {
    setLoading(true);
    setError(null);
    const result = await api.deliveryPhotos(slug, orderId);
    setLoading(false);
    if (!result.ok) {
      setPhotos(null);
      setError(describePhotoViewError(result.status, result.body));
      return;
    }
    setPhotos(result.data.fotos);
    setExpires(result.data.expira_en_segundos);
  }

  return (
    <div className="k-delivery-photo">
      <span className="k-chip k-delivery-photo-chip">
        <Icon name="camera" size={14} />
        {indicator}
      </span>
      <button
        type="button"
        className="k-btn k-btn-secondary k-btn-sm"
        disabled={loading}
        onClick={open}
      >
        {loading ? "Abriendo…" : "Ver foto de entrega"}
      </button>
      {photos ? (
        <div className="k-delivery-photo-links">
          <ul>
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <a href={photo.url} target="_blank" rel="noreferrer noopener">
                  {photoLinkLabel(index, photos.length)}
                </a>
              </li>
            ))}
          </ul>
          <p className="k-small k-muted">
            Los enlaces caducan en {Math.round(expires / 60)} min. Vuelve a pulsar para renovarlos.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="k-delivery-photo-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
