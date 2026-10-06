'use client';
import { PageHeader } from './ui';
import { ModerationLogPanel } from './moderation-log';

export function ModerationView() {
  return (
    <div>
      <PageHeader eyebrow="Staff" title="Moderation" description="Chat reports and the moderation log. Moderators and admins can access this section." />
      <div className="space-y-4">
        <ModerationLogPanel />
      </div>
    </div>
  );
}
