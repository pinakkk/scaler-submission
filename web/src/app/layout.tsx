import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";

// BLUEPRINT §2.7 — Zoom ships a custom face; Inter is the closest free
// substitute. `display: swap` avoids invisible text during font load.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Zoom Workplace",
    template: "%s | Zoom Workplace",
  },
  description:
    "Video meetings with HD audio and video, screen sharing, and chat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
