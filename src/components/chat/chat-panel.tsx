'use client';
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/states';

/** Placeholder — replaced by the live chat implementation. */
export function ChatPanel({ onClose }: { variant?: 'panel' | 'drawer'; onClose?: () => void }) {
  void onClose;
  return <EmptyState icon={<MessageSquare size={18} />} title="Chat" body="Live chat is starting up." />;
}
