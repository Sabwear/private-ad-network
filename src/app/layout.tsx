import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500", "600"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Loopline", template: "%s | Loopline" },
  description: "Verified advertising delivery, screen operations, and credit settlement for a private business network.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}><body>{children}</body></html>;
}
