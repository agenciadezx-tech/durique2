import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Durique", template: "%s · Durique" },
  description: "Agenda, pacientes e turmas para clínicas de fisioterapia e estúdios de pilates.",
  applicationName: "Durique",
  appleWebApp: { capable: true, title: "Durique", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
