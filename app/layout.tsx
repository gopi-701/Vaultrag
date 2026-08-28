import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VaultRAG | Secure Banking Intelligence",
  description: "An authorization-aware banking knowledge assistant.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>{children}</body>
    </html>
  );
}
