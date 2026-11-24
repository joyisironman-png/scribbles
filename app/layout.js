import "./globals.css";
import { THEMES } from "@/lib/themes";

export const metadata = {
  title: "Scribbles",
  description: "Little drawings, sent to each other.",
  appleWebApp: { capable: true, title: "Scribbles", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F4F4F6",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before anything is drawn (no flash of the default colours). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var T=${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t])))};var t=T[localStorage.getItem("scribbles-theme")];if(t){var r=document.documentElement.style;[["--paper",t.bg],["--card",t.card],["--ink",t.ink],["--soft",t.soft],["--accent",t.accent],["--chip",t.chip],["--chip2",t.chip2],["--g1",t.g1],["--g2",t.g2],["--tapec",t.tape],["--line",t.dark?"rgba(255,255,255,.10)":"rgba(31,27,24,.09)"]].forEach(function(p){r.setProperty(p[0],p[1])});if(t.dark)document.documentElement.dataset.dark="1";}}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Caveat:wght@600&family=Playfair+Display:ital,wght@1,700&family=Pacifico&family=DM+Sans:wght@500;700&family=Bebas+Neue&family=Special+Elite&family=Space+Grotesk:wght@700&family=Dancing+Script:wght@700&family=Abril+Fatface&family=Comfortaa:wght@700&family=Righteous&family=Permanent+Marker&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
