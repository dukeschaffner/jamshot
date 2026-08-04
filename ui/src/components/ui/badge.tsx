import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default:
          'border-grey-2 bg-grey-1 text-[var(--text-secondary)]',
        secondary:
          'border-seafoam/60 bg-seafoam/15 text-[var(--text-primary)]',
        destructive:
          'border-rustic-pink/60 bg-rustic-pink/20 text-rustic-pink',
        outline:
          'border-grey-2 bg-transparent text-[var(--text-secondary)]',
        ghost: 'border-transparent bg-transparent text-[var(--text-secondary)]',
        link: 'border-transparent bg-transparent text-seafoam underline-offset-4',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = (asChild ? Slot.Root : 'span') as React.ElementType;

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
