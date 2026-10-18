import { Footer } from "./footer";
import { Navbar } from "./navbar";
import {
  EarlyAccess,
  Faq,
  Features,
  Hero,
  HowItWorks,
  ProductShowcase,
  Trust,
  UseCases,
} from "./sections";
import { FOCUS_RING } from "./shared";

export function Landing() {
  return (
    <div className="min-h-screen bg-wash text-foreground">
      <a
        href="#main"
        className={`sr-only ${FOCUS_RING} focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg`}
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <ProductShowcase />
        <HowItWorks />
        <UseCases />
        <Features />
        <Trust />
        <EarlyAccess />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
