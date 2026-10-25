import type { Metadata } from "next";
import "./globals.css";
import { COMMON, HOME } from "@/lib/copy";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: COMMON.logoFull,
  description: HOME.heroOneliner,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
