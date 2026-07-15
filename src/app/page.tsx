import { FAQ } from "@/components/layout/FAQ";
import { Header } from "@/components/layout/Header";
import { Studio } from "@/components/studio/Studio";

/**
 * Home page: server component.
 * The static chrome (header, landmarks, FAQ) renders on the server for SEO;
 * only the Studio itself hydrates on the client.
 */
export default function HomePage() {
  return (
    <div className="app">
      <Header />
      <Studio />
      <FAQ />
    </div>
  );
}
