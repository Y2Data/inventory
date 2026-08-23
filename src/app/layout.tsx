import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Dai Inventory",
  description: "扫码管理书籍、纸箱和家庭库存。",
  applicationName: "Dai Inventory",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dai Inventory",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#10221c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
