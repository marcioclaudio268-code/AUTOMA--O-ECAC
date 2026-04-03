'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { requireSession } from '@/lib/auth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await requireSession();

        if (active) {
          router.replace('/dashboard');
        }
      } catch {
        if (active) {
          router.replace('/login');
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-sm text-slate-600">
      <span>Carregando...</span>
    </main>
  );
}
