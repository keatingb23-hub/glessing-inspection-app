import type { Metadata } from "next";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "Glessing Inspection App",
  description: "Mobile inspection entry app",
  applicationName: "Glessing Inspection App",
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0b1220" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
