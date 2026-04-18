import type { Metadata } from "next";
import { Big_Shoulders_Text, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const bigShoulders = Big_Shoulders_Text({ 
  subsets: ["latin"], 
  variable: "--font-title",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"]
});

const ibmPlex = IBM_Plex_Mono({ 
  subsets: ["latin"], 
  variable: "--font-body",
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  style: ["normal", "italic"]
});

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
    <html lang="es" className={`${bigShoulders.variable} ${ibmPlex.variable} h-full antialiased dark`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
