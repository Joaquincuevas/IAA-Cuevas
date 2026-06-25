import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fija la raíz de Turbopack a esta carpeta. Sin esto, Next infiere mal la raíz
  // (toma un package-lock.json de una carpeta superior) y escanea todo el árbol,
  // lo que cuelga la compilación.
  turbopack: {
    root: path.resolve(),
  },
};

export default nextConfig;
