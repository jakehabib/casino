'use client';
import { Suspense } from 'react';
import { AdminUsersList } from '@/components/admin/users-list';

export default function AdminUsersPage() {
  return (
    <Suspense>
      <AdminUsersList />
    </Suspense>
  );
}
