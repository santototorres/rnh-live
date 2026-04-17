import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

import { SocketProvider } from "@/components/SocketProvider";

export const metadata: Metadata = {
  title: "Roll Not Hate | Live",
  description: "Sistema de Torneos en Tiempo Real",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col">
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
