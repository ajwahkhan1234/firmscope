import type { Metadata } from "next";
import { Geist, Geist_Mono, Libre_Caslon_Display } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Caslon is the historic typeface of legal printing and law books, which is
 * why it carries the display role here rather than a generic editorial serif.
 */
const caslon = Libre_Caslon_Display({
  variable: "--font-caslon",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "FirmScope — SEO teardowns for law firm websites",
  description:
    "A LangGraph Deep Agent that audits a US law firm's website, scores it against legal-specific criteria, and drafts the outreach email that opens the conversation.",
  openGraph: {
    title: "FirmScope — SEO teardowns for law firm websites",
    description:
      "Paste a law firm URL. Get a scored, evidence-backed teardown and a cold email worth sending.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caslon.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
