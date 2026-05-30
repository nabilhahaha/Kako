import { MessageCircle } from 'lucide-react';
import { customerWhatsappLink } from '@/lib/erp/contact';
import { cn } from '@/lib/utils';

/** A small "send on WhatsApp" button that opens a chat with the given phone and
 *  a prefilled message. Renders nothing when there's no usable phone number. */
export function WhatsAppButton({
  phone,
  message,
  label = 'واتساب',
  className,
}: {
  phone: string | null | undefined;
  message?: string;
  label?: string;
  className?: string;
}) {
  const href = customerWhatsappLink(phone, message);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-success hover:bg-success/10',
        className,
      )}
    >
      <MessageCircle className="h-3.5 w-3.5" /> {label}
    </a>
  );
}
