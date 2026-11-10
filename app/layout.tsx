import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const ibmSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-sans",
  subsets: ["latin"],
});

const ibmMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  variable: "--font-ibm-mono",
  subsets: ["latin"],
});

const serif = Source_Serif_4({
  weight: ["400", "500", "600"],
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shock Lab",
  description: "Quant terminal dashboard for post-shock event studies using Yahoo Finance data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${ibmSans.variable} ${ibmMono.variable} ${serif.variable} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
