# apps/easyorder

Carta pública (`/[slug]`), checkout en una pantalla, seguimiento por token y panel del restaurante.

**Estado:** pendiente (fase 2). Se trasladará desde `cesarsan7/easyorder/web` aplicando:
- Next.js 16 y componentes de `packages/ui`;
- precios desde la API (nunca calculados en el navegador);
- alérgenos visibles por producto y en el resumen;
- panel con eventos en directo (SSE) y acceso por `packages/access`.
