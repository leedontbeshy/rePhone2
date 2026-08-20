import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AuthProvider } from './auth-provider';

export const metadata: Metadata = {
  title: 'rePhone',
  description: 'iPhone cũ minh bạch, kiểm định rõ ràng.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
