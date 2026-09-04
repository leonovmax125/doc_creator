import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Компактная сборка для Docker/VPS: Next кладёт в .next/standalone мини-сервер
  // со всеми нужными зависимостями — его и запускаем на сервере.
  output: "standalone",
};

export default nextConfig;
