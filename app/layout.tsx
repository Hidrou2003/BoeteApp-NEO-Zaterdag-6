import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NEO Zat6',
  description: 'De officiële boete-app van NEO Zaterdag 6',
  icons: {
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    title: 'NEO Zat6',
    capable: true,
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}