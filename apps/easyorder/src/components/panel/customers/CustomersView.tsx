"use client";

import { useCallback, useEffect, useState } from "react";
import { ORDER_STATUS_LABEL, paymentLabel } from "@/lib/checkout";
import { euros } from "@/lib/format";
import { describePanelError } from "@/lib/panel/api";
import {
  CHANNEL_LABEL,
  CUSTOMER_SORT,
  type CustomerDetail,
  type CustomerList,
  type CustomerSort,
  formatPhone,
  pageCount,
  promotionsLabel,
  sinceLabel,
} from "@/lib/panel/customers";
import { Icon } from "../Icon";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";
import { DeleteCustomerDialog } from "./DeleteCustomerDialog";
import "./delete-customer.css";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly list: CustomerList }
  | { readonly kind: "error"; readonly message: string };

export function CustomersView() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const tz = access.restaurante.zona_horaria;
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CustomerSort>("recientes");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const allowed = can(PERMISSION.CustomersView);
  const dateFormat = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  });

  // La búsqueda se lanza al dejar de escribir.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const result = await api.customers(slug, { q: search, orden: sort, pagina: page });
    setState(
      result.ok
        ? { kind: "ready", list: result.data }
        : { kind: "error", message: describePanelError(result.status, result.body) },
    );
  }, [api, slug, search, sort, page]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function download() {
    setExporting(true);
    setExportError(null);
    const blob = await api.exportCustomers(slug);
    setExporting(false);
    if (!blob) return setExportError("No se pudo exportar. Inténtalo de nuevo.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clientes-${slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const header = (
    <header className="k-page-head">
      <div>
        <p className="k-eyebrow">{access.restaurante.nombre}</p>
        <h1 className="k-heading">Clientes</h1>
      </div>
      {can(PERMISSION.CustomersExport) ? (
        <div className="k-head-tools">
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            disabled={exporting}
            onClick={download}
          >
            <Icon name="download" size={18} />
            Exportar CSV
          </button>
        </div>
      ) : null}
    </header>
  );

  if (!allowed) {
    return (
      <div className="k-page">
        {header}
        <p className="k-card">Tu usuario no tiene permiso para ver los clientes.</p>
      </div>
    );
  }

  const list = state.kind === "ready" ? state.list : null;
  const pages = list ? pageCount(list.total, list.por_pagina) : 1;

  return (
    <div className="k-page">
      {header}
      {exportError ? <p className="k-alert">{exportError}</p> : null}
      <div className="k-carta-bar">
        <label className="k-search">
          <span className="k-sr-only">Buscar cliente</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o teléfono"
          />
        </label>
        <fieldset className="k-segment k-segment-sm" aria-label="Ordenar">
          {CUSTOMER_SORT.map((option) => (
            <button
              key={option.id}
              type="button"
              className={sort === option.id ? "is-on" : ""}
              aria-pressed={sort === option.id}
              onClick={() => {
                setSort(option.id);
                setPage(1);
              }}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>

      {state.kind === "loading" ? (
        <div className="k-skeleton k-skeleton-tall" aria-busy="true" />
      ) : null}
      {state.kind === "error" ? (
        <div className="k-card">
          <p className="k-alert" role="alert">
            {state.message}
          </p>
        </div>
      ) : null}
      {list ? (
        list.clientes.length === 0 ? (
          <div className="k-card k-empty-state">
            <h2 className="k-title">
              {search ? "Nadie coincide con la búsqueda" : "Aún no hay clientes"}
            </h2>
            <p className="k-muted">
              Los clientes aparecen al hacer su primer pedido por la web, por WhatsApp o desde el
              panel.
            </p>
          </div>
        ) : (
          <section className="k-card k-cat" aria-label="Lista de clientes">
            <header className="k-cat-head">
              <h2 className="k-title">
                {list.total} {list.total === 1 ? "cliente" : "clientes"}
              </h2>
            </header>
            <ul className="k-items">
              {list.clientes.map((customer) => (
                <li key={customer.id} className="k-item k-customer">
                  <span className="k-thumb" aria-hidden="true">
                    <span>{(customer.nombre ?? "?").slice(0, 1).toUpperCase()}</span>
                  </span>
                  <span className="k-item-main">
                    <span className="k-item-name">
                      <button
                        type="button"
                        className="k-item-link"
                        onClick={() => setOpenId(customer.id)}
                      >
                        {customer.nombre ?? "Sin nombre"}
                      </button>
                    </span>
                    <span className="k-item-meta k-small">
                      <a href={`tel:${customer.telefono}`}>{formatPhone(customer.telefono)}</a>
                      {customer.direccion_frecuente ? (
                        <span className="k-muted k-ellipsis">{customer.direccion_frecuente}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="k-customer-stats">
                    <span>
                      <strong>{customer.pedidos}</strong>
                      <span className="k-small k-muted">
                        {" "}
                        {customer.pedidos === 1 ? "pedido" : "pedidos"}
                      </span>
                    </span>
                    <span className="k-amount">{euros(customer.gastado)}</span>
                    <span className="k-small k-muted">{sinceLabel(customer.ultimo_pedido)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : null}
      {list && pages > 1 ? (
        <nav className="k-pager" aria-label="Páginas">
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span className="k-small k-muted">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </nav>
      ) : null}

      {openId !== null ? (
        <CustomerDialog
          id={openId}
          dateFormat={dateFormat}
          onClose={() => setOpenId(null)}
          onDeleted={() => {
            setOpenId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function CustomerDialog({
  id,
  dateFormat,
  onClose,
  onDeleted,
}: {
  readonly id: number;
  readonly dateFormat: Intl.DateTimeFormat;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const { api } = usePanel();
  const { slug, can } = useAccess();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void api.customer(slug, id).then((result) => {
      if (result.ok) setDetail(result.data);
      else setError(describePanelError(result.status, result.body));
    });
  }, [api, slug, id]);

  const name = detail?.cliente.nombre ?? "Cliente";
  return (
    <Modal title={detail ? name : "Cliente"} onClose={onClose} wide>
      {error ? <p className="k-alert">{error}</p> : null}
      {!detail && !error ? <div className="k-skeleton" aria-busy="true" /> : null}
      {detail ? (
        <div className="k-editor">
          <p className="k-customer-contact">
            <a className="k-btn k-btn-secondary k-btn-sm" href={`tel:${detail.cliente.telefono}`}>
              Llamar · {formatPhone(detail.cliente.telefono)}
            </a>
            <a
              className="k-btn k-btn-secondary k-btn-sm"
              href={`https://wa.me/${detail.cliente.telefono.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </p>
          {detail.cliente.direccion_frecuente ? (
            <p className="k-small">
              <span className="k-muted">Dirección habitual: </span>
              {detail.cliente.direccion_frecuente}
            </p>
          ) : null}
          <p className="k-small customer-privacy">
            <span>
              <span className="k-muted">Promociones: </span>
              {promotionsLabel(
                detail.cliente.acepta_promociones,
                detail.cliente.acepta_promociones_at,
                (date) => dateFormat.format(date),
              )}
            </span>
            {can(PERMISSION.CustomersDelete) ? (
              <button
                type="button"
                className="k-link k-link-danger"
                onClick={() => setDeleting(true)}
              >
                Borrar datos del cliente
              </button>
            ) : null}
          </p>
          <dl className="k-customer-summary">
            <div>
              <dt>Pedidos</dt>
              <dd>{detail.resumen.pedidos}</dd>
            </div>
            <div>
              <dt>Gastado</dt>
              <dd>{euros(detail.resumen.gastado)}</dd>
            </div>
            <div>
              <dt>Ticket medio</dt>
              <dd>{euros(detail.resumen.ticket_medio)}</dd>
            </div>
            <div>
              <dt>Cliente desde</dt>
              <dd>
                {detail.resumen.primer_pedido
                  ? dateFormat.format(new Date(detail.resumen.primer_pedido))
                  : "—"}
              </dd>
            </div>
          </dl>
          {detail.favoritos.length > 0 ? (
            <section>
              <h3 className="k-subtitle">Lo que más pide</h3>
              <p className="k-small">
                {detail.favoritos.map((item) => `${item.nombre} (${item.cantidad})`).join(" · ")}
              </p>
            </section>
          ) : null}
          <section>
            <h3 className="k-subtitle">Últimos pedidos</h3>
            {detail.pedidos.length === 0 ? (
              <p className="k-muted k-small">Sin pedidos.</p>
            ) : (
              <ul className="k-holidays">
                {detail.pedidos.map((order) => (
                  <li key={order.id}>
                    <span>
                      <strong>{order.pedido_codigo ?? `#${order.id}`}</strong>
                      <span className="k-muted">
                        {" "}
                        · {dateFormat.format(new Date(order.created_at))}
                      </span>
                    </span>
                    <span className="k-holiday-tags">
                      <span className="k-chip">{CHANNEL_LABEL[order.canal] ?? order.canal}</span>
                      <span className="k-chip">
                        {ORDER_STATUS_LABEL[order.estado] ?? order.estado}
                      </span>
                      {order.metodo_pago ? (
                        <span className="k-small k-muted">{paymentLabel(order.metodo_pago)}</span>
                      ) : null}
                      <strong className="k-amount">{euros(order.total)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
      {deleting ? (
        <DeleteCustomerDialog
          customerId={id}
          name={name}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      ) : null}
    </Modal>
  );
}
