import type { Metadata } from 'next'
import './globals.css'
import Sidebar from './components/Sidebar'
import AIAgent from './components/AIAgent'

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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="flex min-h-screen" style={{ backgroundColor: '#1A1D23' }}>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ marginLeft: 250 }}>
          {children}
        </main>
        <AIAgent />
      </body>
    </html>
  )
}
