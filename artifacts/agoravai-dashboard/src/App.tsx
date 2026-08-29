import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch as ToggleSwitch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  Activity,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Database,
  ExternalLink,
  Hash,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  Menu,
  MessageSquare,
  MonitorCog,
  PanelTop,
  Paintbrush,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { createContext, useContext } from 'react';
import type { DiscordIdentity, GuildConfigUpdate, GuildSummary } from '@workspace/api-client-react';
import {
  getGetDiscordIdentityQueryKey,
  getGetGuildConfigQueryKey,
  getGetGuildStatsQueryKey,
  getListGuildChannelsQueryKey,
  getListGuildsQueryKey,
  useGetDiscordIdentity,
  useGetGuildConfig,
  useGetGuildStats,
  useListGuildChannels,
  useListGuilds,
  useSendTicketPanel,
  useUpdateGuildConfig,
  useUpdateTicketPanel,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import NotFound from '@/pages/not-found';
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type GuildContextValue = {
  identity?: DiscordIdentity;
  guilds: GuildSummary[];
  selectedGuild?: GuildSummary;
  selectedId: string;
  setSelectedId: (id: string) => void;
  guildsLoading: boolean;
  identityLoading: boolean;
  guildsError: boolean;
  identityError: boolean;
  retry: () => void;
};

const GuildContext = createContext<GuildContextValue | null>(null);

function useGuildContext() {
  const value = useContext(GuildContext);
  if (!value) throw new Error('Guild context is unavailable');
  return value;
}

function useSelectedId() {
  const { selectedId } = useGuildContext();
  return selectedId;
}

function AppDataProvider({ children }: { children: ReactNode }) {
  const identityQuery = useGetDiscordIdentity({
    query: { queryKey: getGetDiscordIdentityQueryKey(), retry: false },
  });
  const guildQuery = useListGuilds({
    query: { queryKey: getListGuildsQueryKey(), retry: false },
  });
  const guilds = guildQuery.data ?? [];
  const [selectedId, setSelectedIdState] = useState(() => localStorage.getItem('agoravai:selectedGuild') ?? '');
  const selectedGuild = guilds.find((guild) => guild.guildId === selectedId) ?? guilds[0];
  const setSelectedId = (id: string) => {
    localStorage.setItem('agoravai:selectedGuild', id);
    setSelectedIdState(id);
  };
  useEffect(() => {
    if (!selectedId && guilds[0]) setSelectedId(guilds[0].guildId);
  }, [guilds, selectedId]);
  const retry = () => {
    void identityQuery.refetch();
    void guildQuery.refetch();
  };
  return (
    <GuildContext.Provider value={{
      identity: identityQuery.data,
      guilds,
      selectedGuild,
      selectedId: selectedGuild?.guildId ?? selectedId,
      setSelectedId,
      guildsLoading: guildQuery.isLoading,
      identityLoading: identityQuery.isLoading,
      guildsError: Boolean(guildQuery.error),
      identityError: Boolean(identityQuery.error),
      retry,
    }}>
      {children}
    </GuildContext.Provider>
  );
}

const navItems = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/configuration', label: 'Configuration', icon: Settings2 },
  { href: '/tickets', label: 'Ticket panel', icon: PanelTop },
  { href: '/servers', label: 'Servers', icon: Database },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { identity, selectedGuild, guilds, setSelectedId, guildsLoading, identityLoading } = useGuildContext();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = identity?.globalName || identity?.username || 'Discord operator';
  return (
    <div className="noise app-surface min-h-[100dvh] text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-3">
          <Link href="/overview" className="group flex items-center gap-3" data-testid="link-brand">
            <span className="sidebar-brand-mark flex size-11 items-center justify-center rounded-[15px] bg-sidebar-primary text-sidebar-primary-foreground">
              <Zap className="size-[21px] transition-transform group-hover:rotate-12" strokeWidth={2.7} />
            </span>
            <span>
              <span className="block font-display text-[20px] font-extrabold tracking-tight text-sidebar-foreground">AgoraVai</span>
              <span className="font-mono text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/45">your server sidekick</span>
            </span>
          </Link>
          <button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu" aria-label="Close navigation">
            <X className="size-4" />
          </button>
        </div>
        <div className="relative mt-8 rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-3">
          <span className="doodle-star right-3 top-2 text-sidebar-primary">✦</span>
          <p className="mb-2 px-1 font-mono text-[10px] font-medium uppercase tracking-[.16em] text-sidebar-foreground/45">Active playground</p>
          <div className="relative">
            <select
              value={selectedGuild?.guildId ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
              className="w-full appearance-none rounded-xl border border-sidebar-border bg-sidebar/70 py-3 pl-3 pr-8 text-left text-xs font-bold text-sidebar-accent-foreground outline-none ring-sidebar-primary focus:ring-2"
              data-testid="select-sidebar-server"
            >
              {guilds.length === 0 && <option value="">No server connected</option>}
              {guilds.map((guild) => <option key={guild.guildId} value={guild.guildId}>{guild.discordName || 'Unnamed server'}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3.5 size-3.5 text-sidebar-foreground/50" />
          </div>
        </div>
        <nav className="mt-7 space-y-1" aria-label="Primary navigation">
          <p className="mb-2 px-3 font-mono text-[10px] font-medium uppercase tracking-[.16em] text-sidebar-foreground/40">Run the community</p>
          {navItems.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`} data-active={active} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}>
              <span className={`flex size-8 items-center justify-center rounded-lg ${active ? 'bg-sidebar-primary-foreground/15' : 'bg-sidebar-accent'}`}><Icon className="size-[17px]" strokeWidth={active ? 2.5 : 1.9} /></span><span>{item.label}</span>
              {item.href === '/tickets' && selectedGuild?.hasTicketChannel && <span className={`ml-auto size-2 rounded-full ${active ? 'bg-sidebar-primary-foreground' : 'bg-sidebar-primary'}`} />}
              {active && <ChevronRight className="ml-auto size-4" />}
            </Link>;
          })}
        </nav>
        <div className="mt-auto space-y-3">
          <Link href="/settings" className={`nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold ${location === '/settings' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`} data-active={location === '/settings'} data-testid="link-nav-settings">
            <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent"><MonitorCog className="size-[17px]" /></span><span>Settings</span>
          </Link>
          <Separator className="bg-sidebar-border" />
          <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-3">
            {identityLoading ? <Skeleton className="size-9 rounded-xl bg-sidebar-foreground/10" /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary font-display text-sm font-extrabold text-sidebar-primary-foreground">{displayName.slice(0, 2).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-sidebar-accent-foreground" data-testid="text-sidebar-identity">{displayName}</p>
              <p className="truncate font-mono text-[10px] text-sidebar-foreground/45">{identity?.email || 'Discord connected'}</p>
            </div>
            <span className="ml-auto size-2 shrink-0 rounded-full bg-chart-5" />
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-foreground/30 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-mobile-overlay" />}
      <main className="min-h-[100dvh] md:pl-[268px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/80 bg-background/85 px-5 backdrop-blur-xl md:px-10">
          <div className="flex items-center gap-3">
            <button className="rounded-xl border-2 border-border bg-card p-2 md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu" aria-label="Open navigation"><Menu className="size-4" /></button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="font-display text-base font-extrabold text-foreground">Howdy, operator</span><span className="text-border">/</span><span className="font-semibold text-foreground">{selectedGuild?.discordName || 'Select a server'}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border-2 border-border bg-card px-3 py-1.5 sm:flex"><span className="status-dot size-2 rounded-full bg-chart-5" /><span className="font-mono text-[10px] font-medium uppercase tracking-[.11em] text-muted-foreground">Bot is online</span></div>
            <Link href="/settings" className="flex size-10 items-center justify-center rounded-xl border-2 border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:text-foreground" data-testid="link-header-settings" aria-label="Open settings"><Settings2 className="size-4" /></Link>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
    <div><p className="font-mono text-[10px] font-medium uppercase tracking-[.2em] text-primary">{eyebrow}</p><h1 className="mt-2 font-display text-3xl font-bold tracking-[-.045em] text-foreground md:text-[40px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>
    {action}
  </div>;
}

function LoadingGrid() {
  return <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-32 rounded-xl" /></div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Card className="border-dashed bg-card/60"><CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center"><span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Compass className="size-5" /></span><h2 className="font-display text-lg font-bold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</CardContent></Card>;
}

function ErrorState({ onRetry, title = 'Could not load this view' }: { onRetry: () => void; title?: string }) {
  return <Card className="border-destructive/25 bg-destructive/[.03]"><CardContent className="flex flex-col items-start gap-4 px-6 py-10 sm:flex-row sm:items-center"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="size-5" /></span><div className="flex-1"><h2 className="font-display font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">The connection did not respond. Your saved setup is safe. Try again when ready.</p></div><Button variant="outline" onClick={onRetry} data-testid="button-retry"><RefreshCw className="mr-2 size-4" />Retry</Button></CardContent></Card>;
}

function ConnectionGate({ children }: { children: ReactNode }) {
  const { identity, guilds, guildsLoading, identityLoading, guildsError, identityError, retry } = useGuildContext();
  if (identityLoading || guildsLoading) return <><PageHeading eyebrow="Control room" title="Loading workspace" description="Checking your Discord connection and available servers." /><LoadingGrid /></>;
  if (identityError) return <><PageHeading eyebrow="Connection required" title="Bring your server online" description="AgoraVai needs an authenticated Discord connection before it can show your control room." /><EmptyState title="Discord is not connected" description="Connect your Discord account to manage bot configuration, panels, and server modules from one place." action={<Button onClick={retry} data-testid="button-connect-discord"><ShieldCheck className="mr-2 size-4" />Check connection</Button>} /></>;
  if (!identity || guildsError) return <><PageHeading eyebrow="Connection issue" title="We lost the signal" description="Your Discord identity or server list could not be reached." /><ErrorState onRetry={retry} title="Discord workspace unavailable" /></>;
  if (!guilds.length) return <><PageHeading eyebrow="No workspace" title="No servers configured yet" description="Once AgoraVai is added to a server where you have administrator access, it will appear here." /><EmptyState title="Your server list is empty" description="Ask a server owner to install AgoraVai, then return here to begin setup." action={<Button variant="outline" onClick={retry} data-testid="button-refresh-empty-servers"><RefreshCw className="mr-2 size-4" />Refresh server list</Button>} /></>;
  return <>{children}</>;
}

function StatCard({ label, value, detail, icon: Icon, tone = 'teal' }: { label: string; value: string; detail: string; icon: typeof Users; tone?: 'teal' | 'orange' | 'ink' }) {
  return <Card className="card-lift overflow-hidden"><CardContent className="relative p-5"><div className={`absolute right-0 top-0 h-full w-1 ${tone === 'orange' ? 'bg-accent' : tone === 'ink' ? 'bg-foreground/70' : 'bg-primary'}`} /><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className="mt-3 font-display text-3xl font-bold tracking-[-.04em]" data-testid={`text-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className={`flex size-9 items-center justify-center rounded-lg ${tone === 'orange' ? 'bg-accent/15 text-accent-foreground' : tone === 'ink' ? 'bg-secondary text-foreground' : 'bg-primary/10 text-primary'}`}><Icon className="size-[17px]" /></span></div></CardContent></Card>;
}

function OverviewPage() {
  const guildId = useSelectedId();
  const { selectedGuild } = useGuildContext();
  const statsQuery = useGetGuildStats(guildId, { query: { enabled: Boolean(guildId), queryKey: getGetGuildStatsQueryKey(guildId) } });
  const configQuery = useGetGuildConfig(guildId, { query: { enabled: Boolean(guildId), queryKey: getGetGuildConfigQueryKey(guildId) } });
  const stats = statsQuery.data;
  const config = configQuery.data;
  const modules = [
    { label: 'Welcome', enabled: config?.welcomeEnabled ?? selectedGuild?.welcomeEnabled, icon: Users, color: 'bg-accent' },
    { label: 'Partnerships', enabled: config?.partnerEnabled ?? selectedGuild?.partnerEnabled, icon: ExternalLink, color: 'bg-primary' },
    { label: 'Ticket channel', enabled: Boolean(config?.ticketChannel ?? selectedGuild?.hasTicketChannel), icon: LifeBuoy, color: 'bg-foreground/70' },
    { label: 'Shop', enabled: selectedGuild?.hasShop, icon: Store, color: 'bg-chart-3' },
  ];
  return <ConnectionGate><PageHeading eyebrow="Server overview" title={selectedGuild?.discordName || 'Overview'} description="A live read on your community, bot modules, and operational health." action={<Link href="/configuration" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="link-overview-configure">Configure modules <ArrowUpRight className="ml-2 size-4" /></Link>} />
    {statsQuery.isLoading || configQuery.isLoading ? <LoadingGrid /> : statsQuery.error ? <ErrorState onRetry={() => void statsQuery.refetch()} /> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Community members" value={formatNumber(stats?.totalUsers)} detail="Members in this server" icon={Users} /><StatCard label="Open tickets" value={formatNumber(stats?.openTickets)} detail={`${formatNumber(stats?.totalTickets)} total tickets`} icon={LifeBuoy} tone="orange" /><StatCard label="Partnerships" value={formatNumber(stats?.totalPartnerships)} detail="Tracked through AgoraVai" icon={ExternalLink} /><StatCard label="Economy in circulation" value={formatBalance(stats?.totalEconomy)} detail={`Top balance ${formatBalance(stats?.richestBalance)}`} icon={BarChart3} tone="ink" /></div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><Card className="dashboard-grid overflow-hidden"><CardHeader className="flex flex-row items-start justify-between border-b border-border/70"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">Module pulse</p><CardTitle className="mt-1 font-display text-xl">What is running now</CardTitle></div><Badge variant="outline" className="gap-1.5 border-accent/30 bg-accent/10 text-xs text-foreground"><span className="size-1.5 rounded-full bg-accent" />Live</Badge></CardHeader><CardContent className="grid gap-3 p-5 sm:grid-cols-2">{modules.map((module) => { const Icon = module.icon; return <div key={module.label} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/75 p-4" data-testid={`module-${module.label.toLowerCase().replaceAll(' ', '-')}`}><span className={`flex size-9 items-center justify-center rounded-lg ${module.enabled ? `${module.color} text-primary-foreground` : 'bg-muted text-muted-foreground'}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{module.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{module.enabled ? 'Configured and active' : 'Ready to configure'}</p></div>{module.enabled ? <Check className="size-4 text-accent-foreground" /> : <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Off</span>}</div>; })}</CardContent></Card>
        <Card><CardHeader><p className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">Server signal</p><CardTitle className="mt-1 font-display text-xl">Admin access</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between border-b border-border/70 pb-4"><span className="text-sm text-muted-foreground">Role</span><Badge variant="secondary" className="font-mono text-[10px] uppercase">{selectedGuild?.isOwner ? 'Owner' : 'Administrator'}</Badge></div><div className="flex items-center justify-between border-b border-border/70 pb-4"><span className="text-sm text-muted-foreground">Guild ID</span><span className="font-mono text-[10px]" data-testid="text-guild-id">{guildId}</span></div><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Bot status</span><span className="flex items-center gap-2 text-sm font-semibold"><span className="status-dot size-1.5 rounded-full bg-accent" />Operational</span></div><Link href="/settings" className="mt-2 flex items-center text-xs font-bold text-primary hover:underline" data-testid="link-overview-settings">View server settings <ArrowUpRight className="ml-1 size-3.5" /></Link></CardContent></Card></div></>}</ConnectionGate>;
}

function ServersPage() {
  const { guilds, selectedGuild, setSelectedId, retry, guildsLoading } = useGuildContext();
  return <ConnectionGate><PageHeading eyebrow="Workspace" title="Your servers" description="Choose the community you want to operate. AgoraVai only shows servers where your Discord access is sufficient." action={<Button variant="outline" onClick={retry} disabled={guildsLoading} data-testid="button-refresh-servers"><RefreshCw className={`mr-2 size-4 ${guildsLoading ? 'animate-spin' : ''}`} />Refresh</Button>} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{guilds.map((guild) => <Card key={guild.guildId} className={`card-lift overflow-hidden ${selectedGuild?.guildId === guild.guildId ? 'border-primary/50 ring-1 ring-primary/20' : ''}`} data-testid={`card-server-${guild.guildId}`}><CardContent className="p-5"><div className="flex items-start gap-4"><div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-display text-lg font-bold text-primary">{(guild.discordName || 'S').slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate font-display font-bold">{guild.discordName || 'Unnamed server'}</h2>{selectedGuild?.guildId === guild.guildId && <Badge className="bg-accent text-accent-foreground">Active</Badge>}</div><p className="mt-1 font-mono text-[10px] text-muted-foreground">{guild.memberCount ? formatNumber(guild.memberCount) : '—'} members · {guild.isOwner ? 'Owner' : 'Admin'}</p></div></div><Separator className="my-5" /><div className="flex flex-wrap gap-2">{guild.welcomeEnabled && <Badge variant="outline">Welcome</Badge>}{guild.partnerEnabled && <Badge variant="outline">Partners</Badge>}{guild.hasTicketChannel && <Badge variant="outline">Tickets</Badge>}{guild.hasShop && <Badge variant="outline">Shop</Badge>}{!guild.welcomeEnabled && !guild.partnerEnabled && !guild.hasTicketChannel && !guild.hasShop && <span className="text-xs text-muted-foreground">No modules configured</span>}</div><Button className="mt-5 w-full" variant={selectedGuild?.guildId === guild.guildId ? 'secondary' : 'outline'} onClick={() => setSelectedId(guild.guildId)} data-testid={`button-use-server-${guild.guildId}`}>{selectedGuild?.guildId === guild.guildId ? <><Check className="mr-2 size-4" />Currently selected</> : 'Use this server'}</Button></CardContent></Card>)}</div></ConnectionGate>;
}

const inputFields = {
  welcome: [['welcomeTitle', 'Message title'], ['welcomeChannel', 'Channel ID'], ['welcomeText', 'Welcome message']],
  partner: [['partnerChannel', 'Channel ID'], ['partnerResponsibleRole', 'Responsible role ID'], ['partnerMessage', 'Partner message']],
  social: [['instaHandle', 'Instagram handle'], ['instaChannel', 'Instagram channel ID'], ['tellonymChannel', 'Tellonym channel ID']],
  shop: [['lojaTitle', 'Shop title'], ['lojaText', 'Shop description'], ['lojaConversao', 'Conversion note']],
} as const;

function TextField({ name, label, value, onChange, multiline = false }: { name: string; label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <div className="space-y-2"><Label htmlFor={name} className="text-xs font-semibold">{label}</Label>{multiline ? <Textarea id={name} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[88px] resize-y bg-background/70 text-sm" data-testid={`input-${name}`} /> : <Input id={name} value={value} onChange={(event) => onChange(event.target.value)} className="bg-background/70 text-sm" data-testid={`input-${name}`} />}</div>;
}

function ModuleCard({ title, description, icon: Icon, enabled, onToggle, children, accent = 'teal', showToggle = true, alwaysOpen = false }: { title: string; description: string; icon: typeof Users; enabled: boolean; onToggle: (value: boolean) => void; children: ReactNode; accent?: 'teal' | 'orange'; showToggle?: boolean; alwaysOpen?: boolean }) {
  return <Card className={`overflow-hidden ${enabled ? 'border-primary/25' : ''}`}><CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/70"><div className="flex gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${enabled ? accent === 'orange' ? 'bg-accent text-accent-foreground' : 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="size-4" /></span><div><CardTitle className="font-display text-lg">{title}</CardTitle><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p></div></div>{showToggle && <div className="flex items-center gap-2"><span className="font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">{enabled ? 'Enabled' : 'Disabled'}</span><ToggleSwitch checked={enabled} onCheckedChange={onToggle} data-testid={`switch-${title.toLowerCase().replaceAll(' ', '-')}`} /></div>}</CardHeader>{(enabled || alwaysOpen) && <CardContent className="grid gap-4 p-5 md:grid-cols-2">{children}</CardContent>}</Card>;
}

function ConfigurationPage() {
  const guildId = useSelectedId();
  const { selectedGuild } = useGuildContext();
  const { toast } = useToast();
  const client = useQueryClient();
  const configQuery = useGetGuildConfig(guildId, { query: { enabled: Boolean(guildId), queryKey: getGetGuildConfigQueryKey(guildId) } });
  const update = useUpdateGuildConfig();
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const initializedForId = useRef('');
  useEffect(() => {
    if (configQuery.data && initializedForId.current !== guildId) {
      initializedForId.current = guildId;
      const data = configQuery.data as unknown as Record<string, unknown>;
      const next: Record<string, string | boolean> = {};
      Object.entries(data).forEach(([key, value]) => { if (typeof value === 'string' || typeof value === 'boolean') next[key] = value; });
      setDraft(next);
    }
  }, [configQuery.data, guildId]);
  const setField = (key: string, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  const enabled = (key: string, fallback = false) => Boolean(draft[key] ?? fallback);
  const value = (key: string) => String(draft[key] ?? '');
  const save = () => {
    const payload = Object.fromEntries(
      Object.entries(draft).filter(([key]) => key !== 'id' && key !== 'guildId' && !key.startsWith('ticketPanel')),
    ) as GuildConfigUpdate;
    update.mutate({ guildId, data: payload }, {
      onSuccess: (saved) => {
        client.setQueryData(getGetGuildConfigQueryKey(guildId), saved);
        void client.invalidateQueries({ queryKey: getListGuildsQueryKey() });
        toast({ title: 'Configuration saved', description: 'AgoraVai will use the updated module settings.' });
      },
      onError: () => toast({ title: 'Save failed', description: 'Your changes were not applied. Try again.', variant: 'destructive' }),
    });
  };
  return <ConnectionGate><PageHeading eyebrow="Bot configuration" title="Make the bot yours" description={`Tune how AgoraVai speaks, welcomes, and routes work in ${selectedGuild?.discordName || 'your server'}. Changes apply to the selected server.`} action={<Button onClick={save} disabled={update.isPending || configQuery.isLoading} className="shadow-sm" data-testid="button-save-configuration">{update.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}Save changes</Button>} />
    {configQuery.isLoading ? <LoadingGrid /> : configQuery.error ? <ErrorState onRetry={() => void configQuery.refetch()} /> : <div className="space-y-5">
      <ModuleCard title="Tickets" description="Define the core ticket identity here; use the dedicated panel page when you are ready to publish it to Discord." icon={LifeBuoy} enabled={Boolean(draft.ticketChannel || draft.ticketTitle)} onToggle={() => undefined} showToggle={false} alwaysOpen><TextField name="ticketChannel" label="Ticket channel ID" value={value('ticketChannel')} onChange={(v) => setField('ticketChannel', v)} /><TextField name="ticketCategory" label="Category ID" value={value('ticketCategory')} onChange={(v) => setField('ticketCategory', v)} /><TextField name="ticketTitle" label="Panel title" value={value('ticketTitle')} onChange={(v) => setField('ticketTitle', v)} /><TextField name="ticketBtnLabel" label="Button label" value={value('ticketBtnLabel')} onChange={(v) => setField('ticketBtnLabel', v)} /><TextField name="ticketText" label="Panel message" value={value('ticketText')} onChange={(v) => setField('ticketText', v)} multiline /><div className="flex items-center justify-end md:col-span-2"><Link href="/tickets" className="inline-flex items-center text-xs font-bold text-primary hover:underline" data-testid="link-configuration-ticket-panel">Open panel publisher <ArrowUpRight className="ml-1 size-3.5" /></Link></div></ModuleCard>
      <ModuleCard title="Welcome flow" description="Greet new members with a focused message in the right channel." icon={Users} enabled={enabled('welcomeEnabled', selectedGuild?.welcomeEnabled)} onToggle={(v) => setField('welcomeEnabled', v)}>{inputFields.welcome.map(([name, label]) => <TextField key={name} name={name} label={label} value={value(name)} onChange={(v) => setField(name, v)} multiline={name === 'welcomeText'} />)}<ToggleField label="Show member avatar" checked={enabled('welcomeShowAvatar')} onChange={(v) => setField('welcomeShowAvatar', v)} /><ToggleField label="Show welcome title" checked={enabled('welcomeShowTitle', true)} onChange={(v) => setField('welcomeShowTitle', v)} /></ModuleCard>
      <ModuleCard title="Partnerships" description="Keep partner announcements consistent and give your team a clean workflow." icon={ExternalLink} enabled={enabled('partnerEnabled', selectedGuild?.partnerEnabled)} onToggle={(v) => setField('partnerEnabled', v)}>{inputFields.partner.map(([name, label]) => <TextField key={name} name={name} label={label} value={value(name)} onChange={(v) => setField(name, v)} multiline={name === 'partnerMessage'} />)}<ToggleField label="Notify by direct message" checked={enabled('partnerNotifyDm')} onChange={(v) => setField('partnerNotifyDm', v)} /><ToggleField label="Remove on member leave" checked={enabled('partnerRemoveOnLeave')} onChange={(v) => setField('partnerRemoveOnLeave', v)} /></ModuleCard>
      <ModuleCard title="Instagram & Tellonym" description="Route social activity into dedicated channels without losing your server voice." icon={MessageSquare} enabled={Boolean(draft.instaChannel || draft.tellonymChannel)} onToggle={(v) => { if (!v) { setField('instaChannel', ''); setField('tellonymChannel', ''); } }} accent="orange" alwaysOpen>{inputFields.social.map(([name, label]) => <TextField key={name} name={name} label={label} value={value(name)} onChange={(v) => setField(name, v)} />)}</ModuleCard>
      <ModuleCard title="Shop" description="Give members a clear path to browse, buy, and understand your server economy." icon={Store} enabled={Boolean(draft.lojaTitle || selectedGuild?.hasShop)} onToggle={() => undefined} accent="orange" showToggle={false} alwaysOpen>{inputFields.shop.map(([name, label]) => <TextField key={name} name={name} label={label} value={value(name)} onChange={(v) => setField(name, v)} multiline={name === 'lojaText'} />)}<ToggleField label="Use visual divider" checked={enabled('lojaUseDivider', true)} onChange={(v) => setField('lojaUseDivider', v)} /></ModuleCard>
      <ModuleCard title="Bot identity" description="Set the public profile details your community sees when the bot speaks." icon={ShieldCheck} enabled={true} onToggle={() => undefined} showToggle={false} alwaysOpen><TextField name="botBio" label="Bot bio" value={value('botBio')} onChange={(v) => setField('botBio', v)} multiline /><TextField name="botIconUrl" label="Icon URL" value={value('botIconUrl')} onChange={(v) => setField('botIconUrl', v)} /><TextField name="botBannerUrl" label="Banner URL" value={value('botBannerUrl')} onChange={(v) => setField('botBannerUrl', v)} /><TextField name="aiChannelId" label="AI channel ID" value={value('aiChannelId')} onChange={(v) => setField('aiChannelId', v)} /></ModuleCard>
    </div>}</ConnectionGate>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2.5"><span className="text-xs font-semibold">{label}</span><ToggleSwitch checked={checked} onCheckedChange={onChange} data-testid={`switch-option-${label.toLowerCase().replaceAll(' ', '-')}`} /></div>;
}

function TicketsPage() {
  const guildId = useSelectedId();
  const { selectedGuild } = useGuildContext();
  const { toast } = useToast();
  const client = useQueryClient();
  const configQuery = useGetGuildConfig(guildId, { query: { enabled: Boolean(guildId), queryKey: getGetGuildConfigQueryKey(guildId) } });
  const channelsQuery = useListGuildChannels(guildId, { query: { enabled: Boolean(guildId), queryKey: getListGuildChannelsQueryKey(guildId) } });
  const updateConfig = useUpdateGuildConfig();
  const sendPanel = useSendTicketPanel();
  const updatePanel = useUpdateTicketPanel();
  const config = configQuery.data;
  const [draft, setDraft] = useState({ channel: '', category: '', title: '', text: '', button: '', openText: '' });
  const initialized = useRef('');
  useEffect(() => {
    if (config && initialized.current !== guildId) {
      initialized.current = guildId;
      setDraft({ channel: config.ticketChannel || '', category: config.ticketCategory || '', title: config.ticketTitle || 'Open a ticket', text: config.ticketText || 'Need a hand? Open a private ticket and our team will be with you shortly.', button: config.ticketBtnLabel || 'Create ticket', openText: config.ticketOpenText || '' });
    }
  }, [config, guildId]);
  const updateDraft = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const savePanel = () => updateConfig.mutate({ guildId, data: { ticketChannel: draft.channel || null, ticketCategory: draft.category || null, ticketTitle: draft.title, ticketText: draft.text, ticketBtnLabel: draft.button, ticketOpenText: draft.openText || null } }, { onSuccess: (saved) => { client.setQueryData(getGetGuildConfigQueryKey(guildId), saved); void client.invalidateQueries({ queryKey: getListGuildsQueryKey() }); toast({ title: 'Panel settings saved', description: 'Your next Discord panel will use this copy.' }); }, onError: () => toast({ title: 'Could not save panel', description: 'Check the fields and try again.', variant: 'destructive' }) });
  const runPanelAction = (kind: 'send' | 'update') => {
    const mutation = kind === 'send' ? sendPanel : updatePanel;
    const publish = () => mutation.mutate(
      { guildId },
      {
        onSuccess: (result) => {
          void client.invalidateQueries({ queryKey: getGetGuildConfigQueryKey(guildId) });
          void client.invalidateQueries({ queryKey: getListGuildsQueryKey() });
          toast({
            title: kind === 'send' ? 'Panel sent to Discord' : 'Panel updated in Discord',
            description: result.messageId ? `Message ID ${result.messageId}` : 'Discord confirmed the panel action.',
          });
        },
        onError: () => toast({
          title: 'Discord action failed',
          description: 'The panel could not be changed. Confirm the channel and try again.',
          variant: 'destructive',
        }),
      },
    );

    // Persist the current draft first so publishing never sends stale database copy.
    updateConfig.mutate(
      {
        guildId,
        data: {
          ticketChannel: draft.channel || null,
          ticketCategory: draft.category || null,
          ticketTitle: draft.title,
          ticketText: draft.text,
          ticketBtnLabel: draft.button,
          ticketOpenText: draft.openText || null,
        },
      },
      {
        onSuccess: (saved) => {
          client.setQueryData(getGetGuildConfigQueryKey(guildId), saved);
          publish();
        },
        onError: () => toast({
          title: 'Could not save panel',
          description: 'Save the panel settings before publishing it.',
          variant: 'destructive',
        }),
      },
    );
  };
  return <ConnectionGate><PageHeading eyebrow="Ticket operations" title="Ticket panel" description="Design the hand-off members see, then publish it directly into a Discord channel." action={<div className="flex gap-2"><Button variant="outline" onClick={() => runPanelAction('update')} disabled={updatePanel.isPending || updateConfig.isPending || !config?.ticketPanelMessageId} data-testid="button-update-ticket-panel">{updatePanel.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Update existing</Button><Button onClick={() => runPanelAction('send')} disabled={sendPanel.isPending || updateConfig.isPending} data-testid="button-send-ticket-panel">{sendPanel.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ExternalLink className="mr-2 size-4" />}Send to Discord</Button></div>} />
    {configQuery.isLoading ? <LoadingGrid /> : configQuery.error ? <ErrorState onRetry={() => void configQuery.refetch()} /> : <div className="grid gap-5 xl:grid-cols-[1fr_380px]"><Card><CardHeader><p className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">Message setup</p><CardTitle className="font-display text-xl">Where should tickets land?</CardTitle><p className="text-sm leading-6 text-muted-foreground">Channel IDs are selected from the channels AgoraVai can currently see.</p></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="ticket-channel" className="text-xs font-semibold">Ticket channel</Label><select id="ticket-channel" value={draft.channel} onChange={(e) => updateDraft('channel', e.target.value)} className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="select-ticket-channel"><option value="">Choose a channel</option>{(channelsQuery.data ?? []).map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select>{channelsQuery.error && <p className="text-xs text-destructive">Channels unavailable. You can paste an ID in Configuration.</p>}</div><TextField name="ticket-category" label="Category ID" value={draft.category} onChange={(v) => updateDraft('category', v)} /></div><TextField name="ticket-title" label="Panel title" value={draft.title} onChange={(v) => updateDraft('title', v)} /><TextField name="ticket-text" label="Panel message" value={draft.text} onChange={(v) => updateDraft('text', v)} multiline /><div className="grid gap-4 sm:grid-cols-2"><TextField name="ticket-button-label" label="Button label" value={draft.button} onChange={(v) => updateDraft('button', v)} /><TextField name="ticket-open-text" label="Opening message" value={draft.openText} onChange={(v) => updateDraft('openText', v)} /></div><div className="flex justify-end border-t border-border/70 pt-5"><Button onClick={savePanel} disabled={updateConfig.isPending} data-testid="button-save-ticket-panel">{updateConfig.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}Save panel settings</Button></div></CardContent></Card><TicketPreview title={draft.title} text={draft.text} button={draft.button} channel={draft.channel} /></div>}</ConnectionGate>;
}

function TicketPreview({ title, text, button, channel }: { title: string; text: string; button: string; channel: string }) {
  return <Card className="h-fit overflow-hidden border-foreground/15 bg-[#262b38] text-[#f4f0e8]"><CardHeader className="border-b border-[#ffffff12] pb-4"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-[#e8a15c] text-[#202532]"><MessageSquare className="size-3.5" /></span><div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#abb4c5]">Discord preview</p><p className="text-[11px] text-[#abb4c5]">{channel ? `# ${channel}` : '# choose-a-channel'}</p></div></div></CardHeader><CardContent className="p-5"><div className="rounded-lg border-l-2 border-[#e8a15c] bg-[#1f2430] p-4"><p className="font-display text-lg font-bold">{title || 'Your ticket title'}</p><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#c5cbd6]">{text || 'Your panel message will appear here.'}</p><button className="mt-5 rounded-md bg-[#e8a15c] px-3 py-2 text-xs font-bold text-[#202532]" disabled data-testid="button-ticket-preview">{button || 'Create ticket'}</button></div><p className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.1em] text-[#818b9f]"><CircleHelp className="size-3" />Preview only · publish when ready</p></CardContent></Card>;
}

function SettingsPage() {
  const { identity, selectedGuild } = useGuildContext();
  return <ConnectionGate><PageHeading eyebrow="Workspace settings" title="Settings" description="A quick audit of the connected Discord identity and the server currently in focus." /><div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><Card><CardHeader><p className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">Connected account</p><CardTitle className="font-display text-xl">Discord identity</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-4 rounded-xl bg-secondary/60 p-4"><span className="flex size-12 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">{(identity?.globalName || identity?.username || 'D').slice(0, 2).toUpperCase()}</span><div><p className="font-semibold" data-testid="text-settings-identity">{identity?.globalName || identity?.username}</p><p className="text-xs text-muted-foreground">@{identity?.username}</p></div><Badge className="ml-auto gap-1.5 bg-accent text-accent-foreground"><span className="size-1.5 rounded-full bg-accent-foreground" />Connected</Badge></div><InfoRow label="Discord ID" value={identity?.id || 'Not available'} /><InfoRow label="Email" value={identity?.email || 'Private'} /></CardContent></Card><Card><CardHeader><p className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">Selected server</p><CardTitle className="font-display text-xl">{selectedGuild?.discordName || 'No server selected'}</CardTitle></CardHeader><CardContent className="space-y-4"><InfoRow label="Guild ID" value={selectedGuild?.guildId || 'Not available'} /><InfoRow label="Access level" value={selectedGuild?.isOwner ? 'Server owner' : 'Administrator'} /><InfoRow label="Members" value={selectedGuild?.memberCount ? formatNumber(selectedGuild.memberCount) : 'Not reported'} /><InfoRow label="Permissions" value={String(selectedGuild?.permissions ?? 'Not reported')} /><div className="mt-5 rounded-xl border border-accent/25 bg-accent/10 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 text-accent-foreground" /><p className="text-xs leading-5 text-foreground/75">AgoraVai only exposes servers where your Discord session has administrator access. Keep your permissions current to avoid failed panel actions.</p></div></div></CardContent></Card></div><Card className="mt-5"><CardHeader><p className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">About this workspace</p><CardTitle className="font-display text-xl">Operational notes</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">{[['Fast by default', 'Queries are scoped to the selected guild so the dashboard stays quick and focused.'], ['Safe changes', 'Configuration saves return the server copy before the interface marks them complete.'], ['Discord first', 'Panel actions are explicit and visible, so there is no mystery about what reached Discord.']].map(([title, body]) => <div key={title} className="rounded-xl border border-border/70 p-4"><p className="text-sm font-bold">{title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p></div>)}</CardContent></Card></ConnectionGate>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-0 last:pb-0"><span className="text-xs text-muted-foreground">{label}</span><span className="max-w-[65%] truncate text-right font-mono text-[10px]" data-testid={`text-setting-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</span></div>;
}

function HomeRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/overview', { replace: true }); }, [setLocation]);
  return <div className="min-h-[100dvh] bg-background" />;
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);
}

function formatBalance(value?: number | null) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <AppDataProvider>
        <AppShell>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/servers" component={ServersPage} />
            <Route path="/overview" component={OverviewPage} />
            <Route path="/configuration" component={ConfigurationPage} />
            <Route path="/tickets" component={TicketsPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      </AppDataProvider>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
