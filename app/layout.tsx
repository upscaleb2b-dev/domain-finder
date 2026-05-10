import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Legacy Google Finder',
  description: 'Automated scanner for legacy Google Apps domains',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white">{children}</body>
    </html>
  );
}
