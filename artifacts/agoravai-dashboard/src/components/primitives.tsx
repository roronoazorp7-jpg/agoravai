import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" data-testid="brand-agoravai">
      <span className="relative grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary shadow-[3px_3px_0_hsl(225_29%_16%)]">
        <span className="absolute size-4 rounded-[5px] border-2 border-primary-foreground/90" />
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[hsl(var(--accent))]" />
      </span>
      {!compact && <span className="font-display text-[17px] font-bold tracking-[-.04em]">agora<span className="text-[hsl(var(--accent))]">vai</span></span>}
    </span>
  );
}

export function StatusDot({ active = true, label }: { active?: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.13em] text-muted-foreground">
      <span className={cn('size-2 rounded-full', active ? 'bg-[hsl(var(--accent))] shadow-[0_0_0_4px_hsl(var(--accent)/.13)]' : 'bg-muted-foreground/40')} />
      {label ?? (active ? 'Live' : 'Off')}
    </span>
  );
}

export function DiscordAvatar({ src, name, size = 'md' }: { src?: string | null; name?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const initials = (name || 'AG').slice(0, 2).toUpperCase();
  return src ? (
    <img src={src} alt="" className={cn('rounded-[9px] object-cover', size === 'sm' ? 'size-8' : size === 'lg' ? 'size-16 rounded-2xl' : 'size-11')} data-testid={`img-avatar-${name || 'discord'}`} />
  ) : (
    <span className={cn('grid shrink-0 place-items-center rounded-[9px] bg-[hsl(var(--primary)/.14)] font-display font-bold text-primary', size === 'sm' ? 'size-8 text-[10px]' : size === 'lg' ? 'size-16 rounded-2xl text-xl' : 'size-11 text-sm')} data-testid={`avatar-fallback-${name || 'discord'}`}>
      {initials}
    </span>
  );
}

export function Button({ children, className, variant = 'primary', loading, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'outline' | 'danger'; loading?: boolean }) {
  return (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-[9px] px-4 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-primary-foreground shadow-[0_5px_0_hsl(245_55%_43%)] hover:-translate-y-px hover:shadow-[0_6px_0_hsl(245_55%_43%)] active:translate-y-0 active:shadow-[0_2px_0_hsl(245_55%_43%)]',
        variant === 'quiet' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        variant === 'outline' && 'border border-border bg-card text-foreground shadow-sm hover:bg-muted',
        variant === 'danger' && 'border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15',
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-2', className)}>
      <span className="flex items-center justify-between text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">
        {label}
        {hint && <span className="font-normal normal-case tracking-normal text-muted-foreground/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('h-11 w-full rounded-[9px] border border-input bg-background px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/10', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('min-h-28 w-full resize-y rounded-[9px] border border-input bg-background px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/10', props.className)} />;
}

export function Select({ value, onChange, options, placeholder, testId }: { value?: string | null; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder: string; testId: string }) {
  return (
    <span className="relative block">
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="h-11 w-full appearance-none rounded-[9px] border border-input bg-background px-3.5 pr-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" data-testid={testId}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" />
    </span>
  );
}

export function Toggle({ checked, onChange, label, description, testId }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string; testId: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-xl p-2 text-left transition-colors hover:bg-muted/70" data-testid={testId}>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full p-1 transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/25')}>
        <span className={cn('block size-4 rounded-full bg-card shadow-sm transition-transform', checked && 'translate-x-5')} />
        {checked && <Check className="absolute right-1 top-1 size-4 text-primary-foreground" />}
      </span>
    </button>
  );
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[.2em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.04em]">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><span className="size-3 rounded-full bg-primary" /></span>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Could not load this view', onRetry }: { title?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
      <p className="font-display font-bold text-destructive">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">Check your connection, then try again.</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry} data-testid="button-retry">Try again</Button>}
    </div>
  );
}