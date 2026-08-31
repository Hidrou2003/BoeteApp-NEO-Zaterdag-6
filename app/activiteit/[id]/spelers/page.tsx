'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function SpelersRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/activiteit/${id}/overzicht`);
  }, [id, router]);

  return <div className="text-center py-16 text-gray-400 text-sm">Laden...</div>;
}
