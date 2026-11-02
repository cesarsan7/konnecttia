import { About } from "@/components/About";
import { Contact } from "@/components/Contact";
import { EasyOrder } from "@/components/EasyOrder";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Products } from "@/components/Products";

export default function HomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
      >
        Saltar al contenido
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Products />
        <EasyOrder />
        <About />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
