import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

/**
 * Dialog (E5): radius 24, focus trap, Esc closes and focus returns to the trigger.
 * On phones it becomes a bottom sheet.
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
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[rgb(17_17_17/0.48)]" />
        <RadixDialog.Content
          className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-lg bg-white p-6 shadow-float-strong outline-none md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <RadixDialog.Title className="text-[24px] font-medium leading-8">{title}</RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="mt-2 text-secondary">{description}</RadixDialog.Description>
          )}
          <div className="mt-6">{children}</div>
          {footer && (
            <div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:justify-end">{footer}</div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
