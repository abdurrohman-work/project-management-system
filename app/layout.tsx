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
      <body className="flex min-h-screen" style={{ backgroundColor: '#1A1D23' }}>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ marginLeft: 250 }}>
          {children}
        </main>
      </body>
    </html>
  )
}
