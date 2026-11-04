"use client";
import { type RefObject, useEffect } from "react";

/** Muestra con una transición suave los elementos `.reveal` cuando entran en pantalla. */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll(".reveal") ?? [];
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [root]);
}
