import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { IconClose } from './icons';

/**
 * Dialog (E5): radius 24, focus trap, Esc closes and focus returns to the trigger.
 * On phones it becomes a bottom sheet (with a grab handle); 200 ms fade, none under reduced motion.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="serene-fade fixed inset-0 z-40 bg-[rgb(17_17_17/0.48)]" />
        <RadixDialog.Content
          className="serene-rise fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-lg border border-border-subtle bg-white px-5 pb-6 pt-3 shadow-float-strong outline-none md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-[22px] font-medium leading-8 tracking-[-0.015em]">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close
              className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-secondary transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
              aria-label="Close"
            >
              <IconClose size={18} />
            </RadixDialog.Close>
          </div>
          {description && (
            <RadixDialog.Description className="mt-1.5 text-[15px] leading-6 text-secondary">
              {description}
            </RadixDialog.Description>
          )}
          <div className="mt-5">{children}</div>
          {footer && (
            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 md:flex-row md:justify-end">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
