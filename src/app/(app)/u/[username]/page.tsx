'use client';
import { use } from 'react';
import { PublicProfileView } from '@/components/profile/public-profile';

export default function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-6 sm:px-6">
      <PublicProfileView username={decodeURIComponent(username)} />
    </div>
  );
}
