import { PRODUCTS } from "@/content/site";

export function Products() {
  return (
    <section id="productos" className="py-20">
      <div className="wrap">
        <div className="mb-10 max-w-[640px]">
          <p className="eyebrow">Productos Konnecttia</p>
          <h2 className="section-title mb-4">Soluciones sencillas para negocios locales.</h2>
          <p className="copy">
            Cada producto resuelve una necesidad concreta y comparte la misma forma de trabajar: tu
            marca primero, sin complicaciones y con acompañamiento cercano.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {PRODUCTS.map((product) => (
            <article
              key={product.name}
              className={`flex flex-col rounded-[22px] border p-8 ${
                product.available ? "border-[#cfe3fb] bg-ice" : "border-line bg-white"
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-2xl font-extrabold tracking-tight">
                  {product.name}{" "}
                  <span className="block text-sm font-bold text-muted sm:inline">
                    by Konnecttia
                  </span>
                </h3>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-extrabold tracking-wider uppercase ${
                    product.available ? "bg-white text-ocean" : "bg-[#f2f6f8] text-muted"
                  }`}
                >
                  {product.status}
                </span>
              </div>
              <p className="copy mb-6 flex-1">{product.description}</p>
              <a
                href={product.href}
                className={`btn self-start ${product.available ? "" : "btn-outline"}`}
              >
                {product.cta} <span aria-hidden="true">→</span>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
