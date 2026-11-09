"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  drawQr,
  QR_DEFAULT_STYLE,
  QR_SIZES,
  type QrLink,
  type QrSize,
  qrFileName,
  qrLinks,
  qrSvg,
} from "@/lib/panel/qr";
import { useAccess } from "../PanelShell";
import "./qr-links.css";

const COPIED_MS = 2500;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function QrCard({ link, slug }: { readonly link: QrLink; readonly slug: string }) {
  const [size, setSize] = useState<QrSize>(1024);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const preview = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(link.url, QR_DEFAULT_STYLE, 240))}`,
    [link.url],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function savePng() {
    setMessage(null);
    const element = canvas.current;
    if (!element) return;
    try {
      drawQr(element, link.url, size);
    } catch {
      return setMessage("Tu navegador no puede generar la imagen. Prueba con el SVG.");
    }
    element.toBlob((blob) => {
      if (blob) download(blob, qrFileName(slug, link.id, "png", size));
      else setMessage("No se pudo generar la imagen. Prueba con el SVG.");
    }, "image/png");
  }

  function saveSvg() {
    setMessage(null);
    download(
      new Blob([qrSvg(link.url, QR_DEFAULT_STYLE, 1024)], { type: "image/svg+xml" }),
      qrFileName(slug, link.id, "svg"),
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setMessage(null);
    } catch {
      setMessage("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  async function share() {
    setMessage(null);
    try {
      await navigator.share({ title: link.label, url: link.url });
    } catch (error) {
      // Cancelar el diálogo de compartir no es un fallo.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("No se pudo compartir. Copia el enlace.");
      }
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <li className="k-card k-qr-card">
      {/* biome-ignore lint/performance/noImgElement: data URL generada en el navegador; next/image no aplica */}
      <img
        className="k-qr-img"
        src={preview}
        width={160}
        height={160}
        alt={`Código QR de ${link.label.toLowerCase()}`}
      />
      <div className="k-qr-body">
        <h3 className="k-title">{link.label}</h3>
        <p className="k-muted k-small">{link.hint}</p>
        <input
          className="k-input k-qr-url"
          readOnly
          value={link.url}
          aria-label={`Enlace de ${link.label.toLowerCase()}`}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="k-qr-actions">
          <label className="k-qr-size">
            <span className="k-sr-only">Tamaño del PNG</span>
            <select
              className="k-input"
              value={size}
              onChange={(event) => setSize(Number(event.target.value) as QrSize)}
            >
              {QR_SIZES.map((option) => (
                <option key={option} value={option}>
                  PNG {option} px
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="k-btn k-btn-primary k-btn-sm" onClick={savePng}>
            Descargar PNG
          </button>
          <button type="button" className="k-btn k-btn-sm" onClick={saveSvg}>
            Descargar SVG
          </button>
          <button type="button" className="k-btn k-btn-sm" onClick={() => void copy()}>
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </button>
          {canShare ? (
            <button type="button" className="k-btn k-btn-sm" onClick={() => void share()}>
              Compartir
            </button>
          ) : null}
        </div>
        {message ? (
          <p className="k-alert" role="status">
            {message}
          </p>
        ) : null}
        <canvas ref={canvas} hidden />
      </div>
    </li>
  );
}

/**
 * «Enlaces y QR» (pieza Y): la carta pública y la entrada al panel con su QR, para imprimir (SVG o
 * PNG grande), subir a redes o compartir desde el móvil. El QR se genera en el navegador.
 */
export function QrLinks() {
  const { slug } = useAccess();
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!origin) return null;
  return (
    <section className="k-qr-section" aria-label="Enlaces y QR">
      <p className="k-muted k-small">
        Imprime el QR en mesas, bolsas o el escaparate, o compártelo en redes. Lo lee cualquier
        móvil con la cámara.
      </p>
      <ul className="k-qr-list">
        {qrLinks(origin, slug).map((link) => (
          <QrCard key={link.id} link={link} slug={slug} />
        ))}
      </ul>
    </section>
  );
}
