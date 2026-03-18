import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "ShieldHer — AI-Powered Women's Safety Platform",
  description:
    "Upload chat screenshots for instant AI analysis. Detect manipulation, threats, and harmful patterns to stay safe.",
  keywords: ["women safety", "chat analysis", "AI protection", "threat detection"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
