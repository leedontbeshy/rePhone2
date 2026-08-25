import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../styles/base.css';
import './globals.css';
import { AuthProvider } from './auth-provider';
import { CommerceProvider } from './commerce-provider';

export const metadata: Metadata = {
  title: 'rePhone',
  description: 'iPhone cũ minh bạch, kiểm định rõ ràng.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <CommerceProvider>{children}</CommerceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
