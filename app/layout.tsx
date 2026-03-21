import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Optimal Biehelse Norge (OBNO)",
    template: "%s · OBNO",
  },
  description:
    "Optimal Biehelse Norge jobber for bedre biehelse og flere pollinatorer gjennom kunnskap, tiltak og samarbeid.",
  manifest: "/manifest.webmanifest",
}

export const viewport: Viewport = {
  themeColor: "#174B2C",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="nb"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  )
}
