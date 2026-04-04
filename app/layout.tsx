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
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/gilroy-free" />
      </head>
      <body className="flex min-h-screen" style={{ backgroundColor: '#18232d' }}>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ marginLeft: 240 }}>
          {children}
        </main>
      </body>
    </html>
  )
}
