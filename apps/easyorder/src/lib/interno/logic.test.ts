import { describe, expect, it } from "vitest";
import {
  activeDependents,
  canCancelModule,
  EMPTY_OPENING_DATA,
  inactivePermissions,
  invitationLink,
  menuImportMessage,
  methodsThatWouldBeRemoved,
  moduleToggle,
  type NewRestaurantForm,
  parseDecimal,
  platformErrorMessage,
  samePaymentSelection,
  slugMessage,
  suggestSlug,
  toNewRestaurantBody,
  validateNewRestaurant,
  validateRoleForm,
} from "./logic";
import type { ModuleRow } from "./types";

const valid: NewRestaurantForm = {
  nombre: "Bar Nuevo",
  slug: "bar-nuevo",
  zonaHoraria: "Atlantic/Canary",
  plan: "basico",
  localNombre: "Bar Nuevo Centro",
  direccion: "",
  telefono: "",
  propietarioEmail: "dueno@nuevo.test",
  ...EMPTY_OPENING_DATA,
};

const module = (overrides: Partial<ModuleRow>): ModuleRow => ({
  code: "tables",
  nombre: "Mesas",
  tipo: "plan",
  depende_de: ["core.orders"],
  estado: null,
  origen: null,
  en_plan: false,
  gestionable: true,
  ...overrides,
});

describe("alta de restaurante: validación", () => {
  it("un formulario completo no tiene errores", () => {
    expect(validateNewRestaurant(valid)).toEqual({});
  });

  it("valida el slug: formato, longitud y reservados", () => {
    expect(slugMessage("bar-nuevo")).toBeNull();
    expect(slugMessage("ab")).toMatch(/al menos 3/);
    expect(slugMessage("Bar Nuevo")).toMatch(/minúsculas/);
    for (const reserved of [
      "panel",
      "interno",
      "api",
      "admin",
      "www",
      "plataforma",
      "privacidad",
    ]) {
      expect(slugMessage(reserved), reserved).toMatch(/reservado/);
    }
    expect(validateNewRestaurant({ ...valid, slug: "interno" }).slug).toMatch(/reservado/);
  });

  it("exige nombre, local, plan, email y zona horaria válidos", () => {
    const errors = validateNewRestaurant({
      ...valid,
      nombre: "  ",
      localNombre: "",
      plan: "",
      propietarioEmail: "sin-arroba",
      zonaHoraria: "Canarias",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "localNombre",
      "nombre",
      "plan",
      "propietarioEmail",
      "zonaHoraria",
    ]);
  });

  it("limita la longitud de los textos opcionales", () => {
    const errors = validateNewRestaurant({
      ...valid,
      direccion: "x".repeat(201),
      telefono: "9".repeat(31),
    });
    expect(Object.keys(errors).sort()).toEqual(["direccion", "telefono"]);
  });

  it("el cuerpo limpia espacios, pasa el email a minúsculas y omite lo vacío", () => {
    expect(
      toNewRestaurantBody({
        ...valid,
        nombre: "  Bar Nuevo ",
        propietarioEmail: " Dueno@Nuevo.test ",
        telefono: " 900000000 ",
      }),
    ).toEqual({
      nombre: "Bar Nuevo",
      slug: "bar-nuevo",
      zona_horaria: "Atlantic/Canary",
      plan: "basico",
      local: { nombre: "Bar Nuevo Centro", telefono: "900000000" },
      propietario_email: "dueno@nuevo.test",
      metodos_pago: ["efectivo", "tarjeta"],
    });
  });

  describe("datos para abrir al público", () => {
    const opening: NewRestaurantForm = {
      ...valid,
      lat: "28,9780689",
      lng: "-13.5697294",
      semanaApertura: "08:00",
      semanaCierre: "23:00",
      findeApertura: "09:00",
      findeCierre: "23:00",
      recogidaMinutos: "30",
      radioKm: "5",
      tarifa: "2",
      minimo: "30",
      repartoMinutos: "30",
      efectivo: true,
      tarjeta: false,
    };

    it("un formulario completo no tiene errores y genera el cuerpo de la API", () => {
      expect(validateNewRestaurant(opening)).toEqual({});
      const body = toNewRestaurantBody(opening);
      expect(body.ubicacion).toEqual({ lat: 28.9780689, lng: -13.5697294 });
      expect(body.horario).toHaveLength(7);
      expect(body.horario?.[0]).toEqual({
        dia: "Lunes",
        disponible: true,
        apertura: "08:00",
        cierre: "23:00",
      });
      expect(body.horario?.[5]).toMatchObject({ dia: "Sábado", apertura: "09:00" });
      expect(body.recogida_minutos).toBe(30);
      expect(body.zona_reparto).toEqual({ radio_km: 5, tarifa: 2, minimo: 30, minutos: 30 });
      expect(body.metodos_pago).toEqual(["efectivo"]);
    });

    it("cada grupo va completo o vacío", () => {
      expect(validateNewRestaurant({ ...opening, lng: "" })).toHaveProperty("lng");
      expect(validateNewRestaurant({ ...opening, semanaCierre: "" })).toHaveProperty(
        "semanaCierre",
      );
      expect(validateNewRestaurant({ ...opening, tarifa: "" })).toHaveProperty("tarifa");
      expect(validateNewRestaurant({ ...opening, lat: "", lng: "" })).toHaveProperty("lat");
    });

    it("valida rangos, horas y métodos", () => {
      expect(validateNewRestaurant({ ...opening, lat: "91" })).toHaveProperty("lat");
      expect(validateNewRestaurant({ ...opening, findeApertura: "9:00" })).toHaveProperty(
        "findeApertura",
      );
      expect(validateNewRestaurant({ ...opening, recogidaMinutos: "0" })).toHaveProperty(
        "recogidaMinutos",
      );
      expect(validateNewRestaurant({ ...opening, radioKm: "0" })).toHaveProperty("radioKm");
      expect(validateNewRestaurant({ ...opening, efectivo: false, tarjeta: false })).toHaveProperty(
        "efectivo",
      );
    });

    it("lee decimales con coma o punto", () => {
      expect(parseDecimal("2,5")).toBe(2.5);
      expect(parseDecimal(" 2.5 ")).toBe(2.5);
      expect(parseDecimal("dos")).toBeNull();
      expect(parseDecimal("")).toBeNull();
    });
  });

  it("propone el slug desde el nombre", () => {
    expect(suggestSlug("Pizzería «La Isla»")).toBe("pizzeria-la-isla");
  });
});

describe("roles propios", () => {
  it("valida nombre y permisos", () => {
    expect(validateRoleForm("Cajero", ["orders.view"])).toEqual({});
    expect(validateRoleForm(" a ", [])).toEqual({
      nombre: "El nombre necesita al menos 2 caracteres.",
      permisos: "Elige al menos un permiso.",
    });
    expect(validateRoleForm("x".repeat(61), ["orders.view"])).toHaveProperty("nombre");
  });

  it("detecta permisos marcados de módulos inactivos", () => {
    const catalog = [
      { activo: true, permisos: [{ code: "orders.view" }] },
      { activo: false, permisos: [{ code: "tables.view" }, { code: "tables.manage" }] },
    ];
    expect(inactivePermissions(new Set(["orders.view", "tables.manage"]), catalog)).toEqual([
      "tables.manage",
    ]);
    expect(inactivePermissions(new Set(["orders.view"]), catalog)).toEqual([]);
  });

  it("traduce los motivos de la API", () => {
    expect(platformErrorMessage(409, { reason: "role_in_use" } as never)).toContain("Hay personas");
    expect(platformErrorMessage(409, { reason: "duplicate_name" } as never)).toContain(
      "Ya hay un rol",
    );
  });
});

describe("importación de carta: mensajes", () => {
  it("una frase por error, con su línea", () => {
    expect(
      menuImportMessage(422, {
        reason: "invalid_menu",
        errores: [
          { line: 2, code: "invalid_price" },
          { line: 0, code: "empty" },
        ],
      } as never),
    ).toEqual([
      "Línea 2: el precio no es válido (usa por ejemplo 4,90 y mayor que 0).",
      "No hay ninguna fila con datos.",
    ]);
  });

  it("avisa si ya hay carta y cae en el mensaje general", () => {
    expect(menuImportMessage(409, { reason: "menu_already_loaded" } as never)[0]).toContain(
      "ya tiene carta",
    );
    expect(menuImportMessage(403, null)[0]).toContain("permiso");
  });
});

describe("enlace de invitación", () => {
  it("usa el de la API y, si falta, arma uno con el origen", () => {
    expect(invitationLink("https://panel.test/panel/unirse/t1", "t1", "https://otro")).toBe(
      "https://panel.test/panel/unirse/t1",
    );
    expect(invitationLink(null, "t1", "https://panel.test/")).toBe(
      "https://panel.test/panel/unirse/t1",
    );
  });
});

describe("mensajes de error", () => {
  it("traduce el motivo y nombra los módulos implicados", () => {
    const names = new Map([["whatsapp.channel", "Conexión de WhatsApp"]]);
    expect(
      platformErrorMessage(
        422,
        { error: "unprocessable", reason: "dependency_missing", modulos: ["whatsapp.channel"] },
        names,
      ),
    ).toBe("Antes hay que activar los módulos de los que depende. (Conexión de WhatsApp)");
    expect(platformErrorMessage(409, { error: "conflict", reason: "slug_taken" })).toMatch(
      /Ya existe/,
    );
    expect(
      platformErrorMessage(403, { error: "forbidden", reason: "platform_role_insufficient" }),
    ).toMatch(/solo puede consultar/);
    expect(platformErrorMessage(0, null)).toMatch(/Sin conexión/);
    expect(platformErrorMessage(401, null)).toMatch(/caducado/);
    expect(platformErrorMessage(500, null)).toMatch(/No se pudo/);
  });
});

describe("módulos", () => {
  it("el interruptor suspende lo activo y activa lo demás", () => {
    expect(moduleToggle(module({ estado: "activo", origen: "plan" }), "cortesia")).toEqual({
      estado: "suspendido",
    });
    // Sin fila: usa el origen elegido.
    expect(moduleToggle(module({}), "cortesia")).toEqual({ estado: "activo", origen: "cortesia" });
    // Con fila suspendida: conserva su origen.
    expect(moduleToggle(module({ estado: "suspendido", origen: "plan" }), "cortesia")).toEqual({
      estado: "activo",
    });
  });

  it("solo se cancela lo que el restaurante tiene y no está cancelado", () => {
    expect(canCancelModule(module({}))).toBe(false);
    expect(canCancelModule(module({ estado: "activo", origen: "plan" }))).toBe(true);
    expect(canCancelModule(module({ estado: "suspendido", origen: "plan" }))).toBe(true);
    expect(canCancelModule(module({ estado: "cancelado", origen: "plan" }))).toBe(false);
    expect(canCancelModule(module({ estado: "activo", origen: "plan", gestionable: false }))).toBe(
      false,
    );
  });

  it("encuentra los activos que dependen de uno", () => {
    const list = [
      module({ code: "whatsapp.channel", depende_de: [], estado: "activo", origen: "complemento" }),
      module({
        code: "whatsapp.agent",
        depende_de: ["whatsapp.channel", "core.orders"],
        estado: "activo",
        origen: "complemento",
      }),
      module({
        code: "notify.whatsapp",
        depende_de: ["whatsapp.channel"],
        estado: "suspendido",
        origen: "complemento",
      }),
    ];
    expect(activeDependents(list, "whatsapp.channel").map((m) => m.code)).toEqual([
      "whatsapp.agent",
    ]);
  });
});

describe("métodos de pago permitidos", () => {
  it("compara la selección sin importar el orden; null es «todos»", () => {
    expect(samePaymentSelection(null, null)).toBe(true);
    expect(samePaymentSelection(null, ["efectivo"])).toBe(false);
    expect(samePaymentSelection(["efectivo", "tarjeta"], ["tarjeta", "efectivo"])).toBe(true);
    expect(samePaymentSelection(["efectivo"], ["efectivo", "tarjeta"])).toBe(false);
  });

  it("avisa de lo activo que se quitaría", () => {
    expect(methodsThatWouldBeRemoved(["efectivo", "bizum"], ["efectivo"])).toEqual(["bizum"]);
    expect(methodsThatWouldBeRemoved(["efectivo", "bizum"], null)).toEqual([]);
  });
});
