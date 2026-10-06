'use client';
import { Suspense } from 'react';
import { AuditLog } from '@/components/admin/audit-log';

export default function AdminAuditPage() {
  return (
    <Suspense>
      <AuditLog />
    </Suspense>
  );
}
