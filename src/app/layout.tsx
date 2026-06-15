import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DialerPro Workspace",
  description: "SaaS Real Estate Power Dialer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
