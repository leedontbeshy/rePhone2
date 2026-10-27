import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import '../styles/base.css';
import './globals.css';
import { AuthProvider } from './auth-provider';
import { CommerceProvider } from './commerce-provider';
import { AffiliateMembershipProvider } from '@/components/affiliate/affiliate-membership';
import { DemoNotice } from '@/components/demo/demo-notice';
import { demoMode } from '@/lib/demo';

const inter = localFont({
  src: './fonts/inter-latin-vietnamese.woff2',
  variable: '--font-inter',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'rePhone',
  description: 'iPhone cũ minh bạch, kiểm định rõ ràng.',
  ...(demoMode ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={inter.variable} data-scroll-behavior="smooth" lang="vi">
      <body>
        {demoMode ? <DemoNotice /> : null}
        <AuthProvider>
          <AffiliateMembershipProvider>
            <CommerceProvider>{children}</CommerceProvider>
          </AffiliateMembershipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
