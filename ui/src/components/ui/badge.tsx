import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
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
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
