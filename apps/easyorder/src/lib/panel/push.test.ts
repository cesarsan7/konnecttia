import { describe, expect, it } from "vitest";
import { pushSupport, urlBase64ToBytes } from "./push";

const base = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  isIos: false,
  isStandalone: false,
};

describe("avisos push (navegador)", () => {
  it("convierte la clave base64 URL-safe a bytes", () => {
    expect(Array.from(urlBase64ToBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToBytes("-_8"))).toEqual([251, 255]);
  });

  it("decide qué ofrecer según el navegador", () => {
    expect(pushSupport(base)).toBe("ok");
    expect(pushSupport({ ...base, hasPushManager: false })).toBe("unsupported");
    expect(pushSupport({ ...base, permission: "denied" })).toBe("denied");
    expect(pushSupport({ ...base, isIos: true })).toBe("ios-install");
    expect(pushSupport({ ...base, isIos: true, isStandalone: true })).toBe("ok");
  });
});
