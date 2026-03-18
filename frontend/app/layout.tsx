import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Nexus",
  description: "Multi-model AI chat — three models, one winner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geist.variable} font-sans antialiased h-full bg-[#0f0f0f]`}>
        {children}
      </body>
    </html>
  );
}
