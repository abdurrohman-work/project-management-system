import type { Metadata } from 'next'
import './globals.css'
import Sidebar from './components/Sidebar'

export const metadata: Metadata = {
  title: 'Project Management',
  description: 'Mohir.dev project management system',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>{`
          @font-face {
            font-family: 'Gilroy';
            src: local('Gilroy'), local('Gilroy-Regular');
            font-weight: 400;
            font-style: normal;
          }
          body { font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        `}</style>
      </head>
      <body className="flex min-h-screen" style={{ backgroundColor: '#18232d' }}>
        <Sidebar />
        <main className="flex-1 min-h-screen md:ml-[250px]">
          {children}
        </main>
      </body>
    </html>
  )
}
