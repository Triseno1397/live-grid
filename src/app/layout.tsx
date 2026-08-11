import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TopNav } from "@/components/ui/top-nav";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Live Grid",
    template: "%s — Live Grid",
  },
  description:
    "The searchable database and calendar of live broadcast production — award shows, " +
    "sports broadcasts, game shows, concerts, and streaming specials.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Dark only at launch — see AGENTS.md "Design Direction (locked)".
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
