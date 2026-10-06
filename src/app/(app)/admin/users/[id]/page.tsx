'use client';
import { use } from 'react';
import { AdminUserDetailView } from '@/components/admin/user-detail';

export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminUserDetailView userId={id} />;
}
