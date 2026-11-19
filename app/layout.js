import "./globals.css";

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
  themeColor: "#FBF6EC",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Caveat:wght@600&family=Playfair+Display:ital,wght@1,700&family=Pacifico&family=DM+Sans:wght@500;700&family=Bebas+Neue&family=Special+Elite&family=Space+Grotesk:wght@700&family=Dancing+Script:wght@700&family=Abril+Fatface&family=Comfortaa:wght@700&family=Righteous&family=Permanent+Marker&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
