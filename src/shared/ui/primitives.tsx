/*
 * Orca primitives (PR 5 src/shared/ui/primitives.tsx). Orca-style only: they
 * use PR 5's tokens (bg-primary, bg-editor, text-success …) and the scoped
 * .orca-* classes in src/styles/orca/, so in the Default style they would
 * render unstyled. Orca variants (`X.orca.tsx`) build on these.
 */
import React from 'react';
import { X } from 'lucide-react';
import { useModalChrome } from '../hooks/useModalChrome';
import { useT } from '../../features/i18n/language';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg border-primary hover:bg-primary-hover hover:border-primary-hover',
  secondary: 'bg-surface-2 text-ink border-line-strong hover:bg-surface-3',
  tonal: 'bg-accent-soft text-accent-text border-accent/25 hover:bg-accent/20',
  ghost: 'bg-transparent text-muted border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger-soft text-danger border-danger/25 hover:bg-danger/20',
  'danger-solid': 'bg-danger-solid text-danger-fg border-danger-solid hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11.5px] rounded-[5px] gap-1',
  sm: 'h-7 px-2.5 text-xs rounded-[6px] gap-1.5',
  md: 'h-8 px-3 text-[13px] rounded-[6px] gap-1.5',
  lg: 'h-9 px-4 text-[13.5px] rounded-[8px] gap-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap border font-medium transition-colors duration-150 disabled:opacity-45 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: 'sm' | 'md';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, active, size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-active={active ? 'true' : undefined}
      className={cn(
        'orca-icon-btn shrink-0',
        size === 'sm' ? 'w-6 h-6 rounded-[5px]' : 'w-7 h-7 rounded-[6px]',
        className,
      )}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  ariaLabel,
  className,
}: {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm';
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-[6px] border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            title={option.title}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors duration-120 disabled:opacity-40',
              size === 'xs' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
              selected
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)] border border-line'
                : 'text-muted hover:text-ink border border-transparent',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <kbd
    className={cn(
      'inline-flex items-center justify-center rounded-[4px] border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted',
      className,
    )}
  >
    {children}
  </kbd>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}> = ({ children, tone = 'neutral', className }) => {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    accent: 'bg-accent-soft text-accent-text border-accent/25',
    success: 'bg-success-soft text-success border-success/25',
    warning: 'bg-warning-soft text-warning border-warning/25',
    danger: 'bg-danger-soft text-danger border-danger/25',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium leading-tight whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
};

export const Dialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  titleId: string;
  subtitle?: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, titleId, subtitle, maxWidthClass = 'max-w-md', children }) => {
  const t = useT();
  const modalChrome = useModalChrome(open, onClose, titleId);
  if (!open) return null;

  return (
    <div className="modal-scrim" {...modalChrome}>
      <div
        className={cn('modal-panel flex max-h-[90dvh] flex-col overflow-hidden', maxWidthClass)}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="orca-icon-btn -mr-1 -mt-0.5"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
        <div className="scrollbar-orca flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};
