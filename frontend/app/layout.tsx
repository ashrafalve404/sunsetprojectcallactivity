import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sunset Group — Daily Call Activity Dashboard",
  description:
    "Enterprise dashboard for tracking daily call activity, meetings, sales, collections, and commitments.",
  icons: {
    icon: [
      { url: "/Sunset-Group-Logo.png?v=2", sizes: "any" },
      { url: "/Sunset-Group-Logo.png?v=2", type: "image/png" },
    ],
    shortcut: "/Sunset-Group-Logo.png?v=2",
    apple: "/Sunset-Group-Logo.png?v=2",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/Sunset-Group-Logo.png?v=2" type="image/png" />
        <link rel="shortcut icon" href="/Sunset-Group-Logo.png?v=2" type="image/png" />
        <link rel="apple-touch-icon" href="/Sunset-Group-Logo.png?v=2" />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
