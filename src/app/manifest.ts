import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dai Inventory",
    short_name: "Inventory",
    description: "扫码管理书籍和纸箱",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f1ea",
    theme_color: "#10221c",
    orientation: "portrait-primary",
  };
}
