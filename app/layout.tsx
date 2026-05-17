import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker"
import Link from "next/link"
import Image from "next/image"

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
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  themeColor: "#174B2C",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const year = new Date().getFullYear()
  return (
    <html
      lang="nb"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        <div className="flex min-h-full flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <Image
                  src="/logo.png"
                  alt="Optimal Biehelse Norge (OBNO)"
                  width={128}
                  height={128}
                  className="h-10 w-auto"
                  priority
                />
              </Link>
              <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
                <Link href="/om-oss" className="hover:text-foreground">
                  Om oss
                </Link>
                <Link href="/biehelse" className="hover:text-foreground">
                  Biehelse
                </Link>
                <Link href="/lodd" className="hover:text-foreground">
                  Loddsalg
                </Link>
                <Link href="/skrapelodd" className="hover:text-foreground">
                  Skrapelodd
                </Link>
                <Link href="/bli-medlem" className="hover:text-foreground">
                  Bli medlem
                </Link>
              </nav>
              <div className="flex items-center gap-2">
                <Link
                  href="/min-side"
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Min side
                </Link>
                <Link
                  href="/bli-medlem"
                  className="hidden items-center justify-center rounded-lg border bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted md:inline-flex"
                >
                  Bli medlem
                </Link>
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col">{children}</div>

          <footer className="border-t">
            <div className="mx-auto grid max-w-6xl gap-3 px-4 py-10 text-sm text-muted-foreground sm:grid-cols-3 sm:items-center">
              <div>© {year} Optimal Biehelse Norge (OBNO)</div>
              <div>
                Org.nr: <span className="font-medium text-foreground">937 528 191</span>
              </div>
              <div>
                Kontakt:{" "}
                <a
                  href="mailto:post@obno.no"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  post@obno.no
                </a>
              </div>
              <div className="sm:col-span-3">
                Kontonummer:{" "}
                <span className="font-medium text-foreground">3626 75 74418</span>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
