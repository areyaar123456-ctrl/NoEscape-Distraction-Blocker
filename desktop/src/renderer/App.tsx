'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Clock, Shield, Lock, Unlock, Zap, Laptop, Globe, Check, AlertCircle,
    Settings, Activity, History, Trash2, Plus, X, ShieldAlert, RefreshCcw, ExternalLink
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:3001';
const BRAND_NAME = 'NoEscape';

const COMMON_FILTERS = [
    { name: 'Amazon', domains: ['amazon.com', 'amazon.in'] },
    { name: 'Instagram', domains: ['instagram.com'] },
    { name: 'Reddit', domains: ['reddit.com'] },
    { name: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
    { name: 'LinkedIn', domains: ['linkedin.com'] },
    { name: 'Twitter', domains: ['twitter.com', 'x.com'] },
    { name: 'Netflix', domains: ['netflix.com'] },
    { name: 'TikTok', domains: ['tiktok.com'] },
    { name: 'Facebook', domains: ['facebook.com'] },
    { name: 'Gmail', domains: ['gmail.com', 'mail.google.com'] },
];

const CATEGORY_FILTERS = [
    { name: 'Social', domains: ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com'] },
    { name: 'Shopping', domains: ['amazon.com', 'ebay.com', 'walmart.com'] },
    { name: 'Video', domains: ['youtube.com', 'netflix.com', 'hulu.com', 'twitch.tv'] },
    { name: 'Messaging', domains: ['whatsapp.com', 'telegram.org', 'slack.com'] },
];

declare global {
    interface Window {
        api: {
            startSession: (data: any) => Promise<any>;
            endSession: () => Promise<any>;
            getStatus: () => Promise<any>;
            syncBlocklist: (data: any) => Promise<any>;
            openExternal: (url: string) => Promise<void>;
            checkAdmin: () => Promise<boolean>;
            getBlocklists: () => Promise<any[]>;
            saveBlocklists: (lists: any[]) => Promise<boolean>;
            getHistory: () => Promise<any[]>;
            saveHistory: (history: any[]) => Promise<boolean>;
            getRunningApps: (showAll?: boolean) => Promise<any[]>;
            getFileIcon: (path: string) => Promise<string | null>;
            triggerSplash: () => Promise<void>;
        };
    }
}

function cn(...classes: (string | boolean | undefined | null)[]) {
    return classes.filter(c => typeof c === 'string').join(' ');
}

export default function App() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [user, setUser] = useState<any>(null);
    const [token, setToken] = useState<string | null>(null);
    const [activeSession, setActiveSession] = useState<any>(null);
    const [duration, setDuration] = useState(25);
    const [blocklists, setBlocklists] = useState<any[]>([]);
    const [sessionHistory, setSessionHistory] = useState<any[]>([]);
    const [selectedBlocklistIds, setSelectedBlocklistIds] = useState<string[]>([]);
    const [lockedMode, setLockedMode] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    // TABS
    const [activeTab, setActiveTab] = useState<'focus' | 'history' | 'blocklists'>('focus');

    // Blocklist creation
    const [isCreatingList, setIsCreatingList] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [customDomain, setCustomDomain] = useState('');
    const [customDomainsList, setCustomDomainsList] = useState<string[]>([]);
    const [runningApps, setRunningApps] = useState<any[]>([]);
    const [customAppsList, setCustomAppsList] = useState<any[]>([]);
    const [isScanningApps, setIsScanningApps] = useState(false);
    const [showAllApps, setShowAllApps] = useState(false);

    useEffect(() => {
        // Auto-initialize local user immediately (bypassing login)
        setUser({ email: 'local@noescape.app' });
        setToken('LOCAL_MODE');
        setLoading(false);

        // Check Admin Status
        if (window.api && (window.api as any).checkAdmin) {
            (window.api as any).checkAdmin().then(setIsAdmin);
        } else {
            setIsAdmin(false);
        }
    }, []);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        const loop = async () => {
            await checkStatus();
            timeout = setTimeout(loop, 5000);
        };

        fetchData();
        loop();

        return () => clearTimeout(timeout);
    }, []);

    const fetchData = async () => {
        try {
            if (!window.api) return;
            const blocks = await window.api.getBlocklists();
            const hist = await window.api.getHistory();
            setBlocklists(blocks || []);
            setSessionHistory(hist || []);
            console.log(`[DESKTOP] Fetched ${blocks?.length || 0} blocklists locally`);
        } catch (err: any) {
            console.error('Failed to fetch local data', err);
            setError(`LOCAL_STORE_ERROR: Failed to load data. (${err.message})`);
        }
    };

    const checkStatus = async () => {
        if (!window || !window.api) return;
        try {
            const localStatus = await window.api.getStatus();
            setActiveSession(localStatus.active ? localStatus : null);
        } catch (err: any) {
            console.error('Failed to sync status:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleForceSync = async () => {
        if (!window.api) return;
        setIsSyncing(true);
        setError(null);
        try {
            await Promise.all([fetchData(), checkStatus()]);
            console.log('[DESKTOP] Manual synchronization complete');
        } finally {
            setTimeout(() => setIsSyncing(false), 800);
        }
    };

    const fetchRunningApps = async () => {
        if (!window.api) return;
        setIsScanningApps(true);
        try {
            const apps = await window.api.getRunningApps(showAllApps);
            // Fetch icons in parallel
            const appsWithIcons = await Promise.all(apps.map(async (app: any) => {
                const icon = await window.api.getFileIcon(app.path);
                return { ...app, icon };
            }));
            setRunningApps(appsWithIcons);
        } catch (err) {
            console.error('Failed to fetch running apps:', err);
        } finally {
            setIsScanningApps(false);
        }
    };

    const handleOpenWeb = (url: string = 'http://localhost:3000') => {
        if (window.api && window.api.openExternal) {
            window.api.openExternal(url);
        } else {
            console.error('[DESKTOP] API Bridge not initialized');
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        // Login bypassed
    };

    const handleStartSession = async () => {
        if (selectedBlocklistIds.length === 0) return;

        const selectedLists = blocklists.filter(l => selectedBlocklistIds.includes(l.id));
        let domains = Array.from(new Set(selectedLists.flatMap((l: any) => l.blocked_domains?.map((d: any) => d.domain) || [])));
        let apps = Array.from(new Set(selectedLists.flatMap((l: any) => l.blocked_apps?.map((a: any) => a.process_name) || [])));

        const sessionId = 'loc-' + Date.now();
        const endTimeStr = new Date(Date.now() + duration * 60000).toISOString();

        try {
            if (!window.api) {
                setError('SYSTEM_ERROR: IPC Bridge unavailable.');
                return;
            }

            const mainResult = await window.api.startSession({
                id: sessionId,
                start_time: new Date().toISOString(),
                end_time: endTimeStr,
                locked_mode: lockedMode,
                domains,
                apps
            });

            // Immediate UI Update
            setActiveSession({ 
                id: sessionId,
                start_time: new Date().toISOString(),
                end_time: endTimeStr,
                locked_mode: lockedMode,
                active: true,
                domains,
                apps,
                blocklist: { 
                    name: selectedLists.map(l => l.name).join(' + '),
                    blocked_domains: domains.map(d => ({ domain: d })),
                    blocked_apps: apps.map(a => ({ process_name: a }))
                },
                blockingResults: {
                    hosts: mainResult.success,
                    firewall: mainResult.success,
                    process: mainResult.success
                }
            });
            setError(null);
            fetchData();
        } catch (err: any) {
            const apiError = err.message || err;
            setError(`START_FAILED: ${apiError}`);
            console.error('[DESKTOP] Start Session Error:', err);
        }
    };

    const handleEndSession = async () => {
        try {
            if (window.api) {
                await window.api.endSession();
            }
            checkStatus();
            fetchData();
        } catch (err) {
            setError('LOCKED_PROTOCOL: Cannot abort active locked session.');
        }
    };

    const handleCreateBlocklist = async () => {
        try {
            const newList = {
                id: 'bl-' + Date.now(),
                name: newListName,
                blocked_domains: customDomainsList.map((d, i) => ({ id: i, domain: d })),
                blocked_apps: customAppsList.map((a, i) => ({ id: i, process_name: a.name, process_path: a.path }))
            };
            const updatedLists = [...blocklists, newList];
            if (window.api) {
                await window.api.saveBlocklists(updatedLists);
            }
            setBlocklists(updatedLists);
            setIsCreatingList(false);
            setNewListName('');
            setCustomDomainsList([]);
            setCustomAppsList([]);
        } catch (err) {
            setError('Failed to create local blocklist');
        }
    };

    const handleDeleteBlocklist = async (id: string) => {
        try {
            const updatedLists = blocklists.filter(l => l.id !== id);
            if (window.api) {
                await window.api.saveBlocklists(updatedLists);
            }
            setBlocklists(updatedLists);
        } catch (err) {
            setError('Failed to delete local blocklist');
        }
    };

    if (loading) return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#080b12]">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/25 bg-red-400/10 shadow-[0_0_32px_rgba(239,68,68,0.16)]">
                <Shield className="text-red-200" size={24} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">Starting {BRAND_NAME}</p>
        </div>
    );

    if (!user && !activeSession) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8 selection:bg-red-500/25">
                <div className="w-full max-w-sm space-y-8 rounded-3xl border border-white/10 bg-[#10151f]/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
                    <div className="text-center space-y-4">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-300/30 bg-red-300/10 shadow-[0_0_32px_rgba(239,68,68,0.18)]">
                            <Shield className="text-red-100" size={30} />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-3xl font-black tracking-normal text-white">{BRAND_NAME}</h1>
                            <p className="text-[10px] uppercase font-bold tracking-normal text-red-300/80">Desktop Guard</p>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-500 text-[10px] font-black uppercase tracking-normal flex items-center gap-3 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-normal ml-1">IDENTIFIER</label>
                            <input
                                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-4 bg-slate-950 border border-white/10 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-500/50 outline-none transition-all text-sm font-bold text-white uppercase placeholder:text-slate-700 neon-glow"
                                placeholder="USER@AGENT.COM" required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-normal ml-1">SECURE_KEY</label>
                            <input
                                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-4 bg-slate-950 border border-white/10 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-500/50 outline-none transition-all text-sm font-bold text-white placeholder:text-slate-700 neon-glow"
                                placeholder="••••••••" required
                            />
                        </div>
                        <button type="submit" className="w-full py-5 bg-red-600 hover:bg-red-500 text-white font-black rounded-[1.5rem] transition-all active:scale-[0.98] neon-glow text-xs tracking-normal uppercase mt-4">
                            Authenticate
                        </button>
                    </form>

                    <div className="flex flex-col items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => handleOpenWeb()}
                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-normal text-red-300 transition-colors hover:text-red-100"
                        >
                            Visit Web Version <ExternalLink size={10} />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenWeb('http://localhost:3000/register')}
                            className="text-[10px] font-black uppercase tracking-normal text-slate-500 transition-colors hover:text-red-300"
                        >
                            Open Account Setup
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="noescape-shell min-h-screen bg-[#080707] text-slate-100 selection:bg-red-500/25">
            <div className="mx-auto grid min-h-screen max-w-7xl gap-6 p-5 lg:grid-cols-[330px_minmax(0,1fr)] lg:p-8">
                <aside className="reveal-up relative overflow-hidden rounded-[2rem] border border-red-500/20 bg-[#120b0b]/90 p-6 shadow-2xl shadow-black/40">
                    <div className="brand-orbit absolute right-6 top-6 h-24 w-24 rounded-full border border-red-400/20" />
                    <div className="relative z-10 flex h-full flex-col justify-between gap-10">
                        <div className="space-y-8">
                            <div className="flex items-center gap-4">
                                <div className="brand-mark flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/35 bg-red-500/15 shadow-[0_0_36px_rgba(239,68,68,0.2)]">
                                    <Shield className="text-red-100" size={28} />
                                </div>
                                <div>
                                    <h1 className="brand-title text-4xl font-black tracking-normal text-white">{BRAND_NAME}</h1>
                                    <p className="text-[10px] font-black uppercase tracking-normal text-red-200/70">Local Lockdown</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="max-w-[15rem] text-2xl font-black leading-[1.05] tracking-normal text-white">
                                    Build a wall between intent and impulse.
                                </p>
                                <p className="text-sm font-medium leading-6 text-slate-400">
                                    NoEscape keeps the enforcement path visible: profiles, locks, system state, and intercept feedback in one desktop cockpit.
                                </p>
                            </div>

                            <div className="grid gap-3">
                                <div className="metric-tile rounded-2xl border border-white/10 bg-black/25 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-normal text-slate-500">Profiles</p>
                                    <p className="mt-1 text-3xl font-black text-white">{blocklists.length}</p>
                                </div>
                                <div className="metric-tile rounded-2xl border border-white/10 bg-black/25 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-normal text-slate-500">Mode</p>
                                    <p className="mt-1 text-lg font-black text-red-100">{activeSession ? 'Locked In' : 'Ready'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-white/10 pt-5">
                            {[
                                ['DNS Guard', 'Hosts and resolver shield'],
                                ['App Guard', 'Process interruption layer'],
                                ['Tab Guard', 'Browser title interception'],
                            ].map(([label, desc]) => (
                                <div key={label} className="flex items-center gap-3">
                                    <div className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.7)]" />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-normal text-slate-200">{label}</p>
                                        <p className="text-[10px] font-semibold text-slate-500">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>

                <section className="reveal-up-delayed space-y-6">
                <header className="flex items-center justify-between rounded-[1.5rem] border border-white/10 bg-[#120b0b]/90 px-5 py-4 shadow-xl shadow-black/30">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/35 bg-red-500/15 shadow-[0_0_28px_rgba(239,68,68,0.18)]">
                            <Shield className="text-red-100" size={21} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-normal text-white">{BRAND_NAME}</h1>
                            <p className="text-[10px] font-bold uppercase tracking-normal text-slate-500">
                                {user?.email ? user.email.split('@')[0] : 'local mode'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-normal text-emerald-200 sm:block">
                            Local Guard
                        </div>
                        <button
                            onClick={handleForceSync}
                            disabled={isSyncing}
                            aria-label="Refresh NoEscape state"
                            className={cn("rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-400 transition-all hover:border-red-400/50 hover:text-red-100", isSyncing && "animate-spin border-red-400/50 text-red-100")}
                        >
                            <RefreshCcw size={18} />
                        </button>
                    </div>
                </header>

                {isAdmin === false && (
                    <div className="rounded-2xl border border-amber-400/35 bg-amber-400/10 p-5 shadow-lg shadow-amber-950/20">
                        <div className="flex items-start gap-4">
                            <ShieldAlert className="text-amber-500 shrink-0" size={24} />
                            <div className="space-y-1">
                                <h4 className="text-xs font-black uppercase tracking-normal text-amber-300">Elevated Access Required</h4>
                                <p className="text-xs font-medium leading-relaxed text-slate-300">
                                    The blocking engine needs Administrator privileges to modify system rules.
                                    Please <span className="text-amber-400">Run as Administrator</span> to enable full protection.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-3 rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-xs font-bold text-red-200">
                        <AlertCircle size={14} /> {error}
                    </div>
                )}

                <main className="space-y-6">
                    {activeSession ? (
                        <div className="relative rounded-3xl border border-red-300/20 bg-[#0d121d] p-8 shadow-2xl shadow-black/30">
                            <div className="relative z-10 flex flex-col items-center space-y-8 overflow-hidden text-center">
                                <Activity className="absolute -right-8 -top-10 h-36 w-36 rotate-12 text-red-300/10" />

                                <div className="flex items-center gap-3 rounded-full border border-red-300/35 bg-red-300/10 px-5 py-2">
                                    <Lock size={13} className="text-red-200" />
                                    <span className="text-[10px] font-black uppercase tracking-normal text-red-100">NoEscape Active</span>
                                </div>

                                <div className="space-y-1">
                                    <h2 className="font-mono text-8xl font-black tracking-normal text-white">
                                        {Math.max(0, Math.floor((new Date(activeSession.end_time).getTime() - Date.now()) / 60000))}
                                        <span className="ml-2 text-2xl text-red-300/60">m</span>
                                    </h2>
                                    <p className="text-[10px] font-black uppercase tracking-normal text-slate-500">Time Remaining</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 w-full pt-4">
                                    <div className="space-y-1 rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <p className="text-[9px] font-black uppercase tracking-normal text-slate-500">Domains</p>
                                        <p className="text-lg font-black text-white">{activeSession.blocklist?.blocked_domains?.length || activeSession.domains?.length || 0}</p>
                                    </div>
                                    <div className="space-y-1 rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <p className="text-[9px] font-black uppercase tracking-normal text-slate-500">Applications</p>
                                        <p className="text-lg font-black text-white">{activeSession.blocklist?.blocked_apps?.length || activeSession.apps?.length || 0}</p>
                                    </div>
                                </div>

                                <div className="w-full space-y-3 border-t border-white/10 pt-4">
                                    <p className="text-[9px] font-black uppercase tracking-normal text-slate-500">Protection Status</p>
                                    <div className="flex justify-center gap-6">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", activeSession.blockingResults?.hosts ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500")} />
                                            <span className="text-[8px] font-black uppercase text-slate-400">Hosts</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", activeSession.blockingResults?.firewall ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500")} />
                                            <span className="text-[8px] font-black uppercase text-slate-400">Firewall</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", activeSession.blockingResults?.process ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500")} />
                                            <span className="text-[8px] font-black uppercase text-slate-400">Process</span>
                                        </div>
                                    </div>
                                </div>

                                <button onClick={handleEndSession} className="mt-4 w-full rounded-2xl bg-red-600 py-5 text-xs font-black uppercase tracking-normal text-white shadow-lg shadow-red-950/40 transition-all hover:bg-red-500 active:scale-[0.98]">
                                    Abort Session
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d121d]/95 p-7 shadow-2xl shadow-black/30 backdrop-blur-xl">

                            <div className="mb-8 flex gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
                                {['focus', 'blocklists', 'history'].map(t => (
                                    <button
                                        key={t} onClick={() => setActiveTab(t as any)}
                                        className={cn("flex-1 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-normal transition-all", activeTab === t ? "bg-red-300/10 text-red-100 shadow-sm shadow-red-950/30" : "text-slate-500 hover:text-slate-300"
                                        )}>{t}</button>
                                ))}
                            </div>

                            {activeTab === 'focus' && (
                                <div className="space-y-8 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between border-b border-white/10 pb-6">
                                        <div className="flex items-center gap-3">
                                            <Clock size={20} className="text-red-300" />
                                            <h2 className="text-lg font-black uppercase tracking-normal text-white">Session Setup</h2>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black uppercase tracking-normal text-slate-400">Locked</span>
                                            <button aria-label="Toggle locked session mode" onClick={() => setLockedMode(!lockedMode)} className={cn("relative h-5 w-9 rounded-full transition-all", lockedMode ? "bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.26)]" : "bg-slate-800")}>
                                                <div className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", lockedMode ? "right-0.5" : "left-0.5")} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black uppercase tracking-normal text-slate-500">Duration</label>
                                                <span className="text-xs font-black text-red-200">{duration} Min</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[25, 45, 60].map(m => (
                                                    <button key={m} onClick={() => setDuration(m)} className={cn("rounded-xl border py-3 text-xs font-black transition-all", duration === m ? "border-red-300/40 bg-red-300/15 text-red-100" : "border-white/10 bg-black/20 text-slate-500 hover:text-slate-300")}>{m}</button>
                                                ))}
                                            </div>
                                            <input type="range" min="5" max="180" step="5" value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-black/30 accent-red-300" />
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-normal text-slate-500">Select Profile(s)</label>
                                            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                                {blocklists.map(l => (
                                                    <button key={l.id} onClick={() => setSelectedBlocklistIds(prev => prev.includes(l.id) ? prev.filter(id => id !== l.id) : [...prev, l.id])} className={cn("flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all", selectedBlocklistIds.includes(l.id) ? "border-red-300/40 bg-red-300/10 text-red-100" : "border-white/10 bg-black/20 text-slate-500 hover:text-slate-300")}>
                                                        <span className="truncate text-[10px] font-black uppercase tracking-normal">{l.name}</span>
                                                        {selectedBlocklistIds.includes(l.id) && <Check size={12} />}
                                                    </button>
                                                ))}
                                                {blocklists.length === 0 && <p className="text-[10px] font-black uppercase italic text-slate-600">No profiles yet.</p>}
                                            </div>
                                        </div>
                                    </div>
                                    {lockedMode && (
                                        <div className="animate-in zoom-in-95 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5 duration-200">
                                            <div className="flex items-start gap-4">
                                                <ShieldAlert className="shrink-0 text-amber-300" size={20} />
                                                <div className="space-y-1">
                                                    <h4 className="text-[10px] font-black uppercase tracking-normal text-amber-300">Locked Session</h4>
                                                    <p className="text-[10px] font-semibold leading-relaxed text-slate-300">
                                                        By proceeding, you will be <span className="text-amber-400">unable to abort</span> the session, quit the agent, or stop the background service until the timer expires.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <button 
                                        onClick={handleStartSession} 
                                        disabled={selectedBlocklistIds.length === 0} 
                                        className={cn(
                                            "w-full rounded-2xl py-5 text-xs font-black uppercase tracking-normal transition-all disabled:cursor-not-allowed disabled:opacity-30 active:scale-[0.98]",
                                            lockedMode 
                                                ? "bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg shadow-red-950/40 hover:from-red-500 hover:to-orange-400" 
                                                : "bg-red-300 text-slate-950 shadow-lg shadow-red-950/30 hover:bg-red-200"
                                        )}
                                    >
                                        {lockedMode ? 'Start Locked Session' : `Start ${BRAND_NAME}`}
                                    </button>
                                </div>
                            )}

                            {activeTab === 'blocklists' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {!isCreatingList ? (
                                        <>
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-[10px] font-black uppercase tracking-normal text-slate-500">Active Profiles</h3>
                                                <button onClick={() => setIsCreatingList(true)} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-normal text-red-200 transition-colors hover:text-red-100">
                                                    New <Plus size={12} />
                                                </button>
                                            </div>
                                            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                                {blocklists.map(l => (
                                                    <div key={l.id} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4 transition-all hover:border-red-300/30">
                                                        <div className="flex items-center gap-3">
                                                            <Shield size={14} className="text-red-300" />
                                                            <span className="text-[10px] font-black uppercase tracking-normal text-white">{l.name}</span>
                                                        </div>
                                                        <button aria-label={`Delete ${l.name}`} onClick={() => handleDeleteBlocklist(l.id)} className="text-slate-600 transition-colors hover:text-red-400">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                                {blocklists.length === 0 && <p className="py-6 text-center text-[10px] font-black uppercase text-slate-600">No profiles yet.</p>}
                                            </div>
                                            <div className="border-t border-white/10 pt-4">
                                                <button 
                                                    onClick={() => window.api?.triggerSplash()}
                                                    className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 transition-all hover:border-red-300/30"
                                                >
                                                    <Zap size={14} className="text-red-300 group-hover:animate-pulse" />
                                                    <span className="text-[10px] font-black uppercase tracking-normal text-slate-500 transition-colors group-hover:text-red-200">Test Intercept Screen</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-6 rounded-2xl border border-red-300/25 bg-black/20 p-6">
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-xs font-black uppercase tracking-normal text-red-200">Create Profile</h3>
                                                <button aria-label="Close profile editor" onClick={() => setIsCreatingList(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
                                            </div>
                                            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Profile name (e.g. Deep Work)" className="w-full rounded-xl border border-white/10 bg-[#0d121d] p-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-red-300/50" />

                                            <div className="space-y-4">
                                                <div className="flex gap-2">
                                                    <input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="Domain.com" className="flex-1 rounded-xl border border-white/10 bg-[#0d121d] p-3 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-red-300/50" />
                                                    <button onClick={() => { if (customDomain) { setCustomDomainsList(prev => Array.from(new Set([...prev, customDomain.trim()]))); setCustomDomain(''); } }} className="rounded-xl bg-red-300 px-4 text-[10px] font-black uppercase text-slate-950 transition-all hover:bg-red-200">Add</button>
                                                </div>

                                                <p className="pt-2 text-[10px] font-black uppercase tracking-normal text-slate-500">Quick Add</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {CATEGORY_FILTERS.map(c => (
                                                        <button key={c.name} onClick={() => setCustomDomainsList(prev => Array.from(new Set([...prev, ...c.domains])))} className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left transition-all hover:border-red-300/35 hover:bg-red-300/5">
                                                            <span className="text-[10px] font-bold text-slate-400 transition-colors group-hover:text-red-200">{c.name} Category</span>
                                                            <Plus size={10} className="text-slate-700 group-hover:text-red-300" />
                                                        </button>
                                                    ))}
                                                    {COMMON_FILTERS.map(f => (
                                                        <button key={f.name} onClick={() => setCustomDomainsList(prev => Array.from(new Set([...prev, ...f.domains])))} className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left transition-all hover:border-red-300/35 hover:bg-red-300/5">
                                                            <span className="text-[10px] font-bold text-slate-400 transition-colors group-hover:text-red-200">{f.name}</span>
                                                            <Plus size={10} className="text-slate-700 group-hover:text-red-300" />
                                                        </button>
                                                    ))}
                                                </div>

                                                <div className="pt-4 space-y-4">
                                                    <div className="space-y-2">
                                                        <div className="flex items-start gap-3 rounded-xl border border-red-300/20 bg-red-300/5 p-3">
                                                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-200" />
                                                            <p className="text-[10px] font-medium leading-relaxed text-slate-400">
                                                                If the application you want to block doesn't appear, make sure it is <span className="text-red-200">currently running</span> and then scan again.
                                                            </p>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-3">
                                                                <p className="text-[10px] font-black uppercase tracking-normal text-slate-500">Application Picker</p>
                                                                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                                                                    <span className="text-[8px] font-black text-slate-500 uppercase">Advanced</span>
                                                                    <button 
                                                                        onClick={() => setShowAllApps(!showAllApps)} 
                                                                        aria-label="Toggle advanced app scan"
                                                                        className={cn("relative h-3 w-6 rounded-full transition-all", showAllApps ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-800")}
                                                                    >
                                                                        <div className={cn("absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all", showAllApps ? "right-0.5" : "left-0.5")} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <button 
                                                                onClick={fetchRunningApps} 
                                                                disabled={isScanningApps}
                                                                className={cn("flex items-center gap-1 text-[9px] font-black uppercase tracking-normal text-red-200 transition-colors hover:text-red-100", isScanningApps && "animate-pulse")}
                                                            >
                                                                {isScanningApps ? 'Scanning...' : 'Scan'} <RefreshCcw size={10} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {runningApps.length > 0 && (
                                                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                                            {runningApps.map((app, i) => {
                                                                const isSelected = customAppsList.some(a => a.path === app.path);
                                                                return (
                                                                    <button
                                                                        key={i}
                                                                        onClick={() => {
                                                                            if (isSelected) {
                                                                                setCustomAppsList(prev => prev.filter(a => a.path !== app.path));
                                                                            } else {
                                                                                setCustomAppsList(prev => [...prev, app]);
                                                                            }
                                                                        }}
                                                                        className={cn(
                                                                            "group flex items-center gap-3 rounded-xl border bg-white/[0.03] p-2.5 text-left transition-all",
                                                                            isSelected ? "border-red-300/45 bg-red-300/10" : "border-white/10 hover:border-white/20 hover:bg-white/[0.06]"
                                                                        )}
                                                                    >
                                                                        {app.icon ? (
                                                                            <img src={app.icon} className="w-6 h-6 rounded shadow-sm" alt="" />
                                                                        ) : (
                                                                            <Laptop size={16} className="text-slate-600" />
                                                                        )}
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className={cn("truncate text-[9px] font-black uppercase", isSelected ? "text-red-100" : "text-slate-400 group-hover:text-slate-300")}>{app.name}</p>
                                                                            {showAllApps && <p className="text-[7px] text-slate-600 truncate mt-0.5 italic">{app.path}</p>}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {(customDomainsList.length > 0 || customAppsList.length > 0) && (
                                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                                                            {customDomainsList.map((d, i) => (
                                                                <span key={i} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[9px] font-black uppercase text-red-200">
                                                                    {d} <X size={10} className="cursor-pointer hover:text-red-400" onClick={() => setCustomDomainsList(customDomainsList.filter((_, idx) => idx !== i))} />
                                                                </span>
                                                            ))}
                                                            {customAppsList.map((app, i) => (
                                                                <span key={i} className="animate-in zoom-in-95 flex items-center gap-1.5 rounded-lg border border-red-300/20 bg-red-300/10 px-2 py-1 text-[9px] font-black uppercase text-red-200 duration-200">
                                                                    {app.name} <X size={10} className="cursor-pointer hover:text-red-400 transition-colors" onClick={() => setCustomAppsList(prev => prev.filter(a => a.path !== app.path))} />
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <button 
                                                onClick={handleCreateBlocklist} 
                                                disabled={!newListName || (customDomainsList.length === 0 && customAppsList.length === 0)} 
                                                className="w-full rounded-xl bg-red-300 py-4 text-[10px] font-black uppercase tracking-normal text-slate-950 transition-all hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                Save Profile
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div className="space-y-4 animate-in fade-in duration-300 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                                    {sessionHistory.length > 0 ? (
                                        sessionHistory.map(session => (
                                            <div key={session.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
                                                <div className="flex items-center gap-3">
                                                    <History size={16} className="text-red-300" />
                                                    <div>
                                                        <p className="text-[10px] font-black text-white uppercase tracking-normal">
                                                            {new Date(session.start_time).toLocaleDateString()}
                                                        </p>
                                                        <p className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">
                                                            {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p> 
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black uppercase text-red-200">{session.blocklist?.name}</p>
                                                    <p className="text-[9px] font-bold text-white uppercase mt-0.5">
                                                        {session.start_time ? Math.max(0, Math.round((new Date(session.ended_at || session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000)) : '?'} Min
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-10 space-y-2">
                                            <History size={32} className="mx-auto text-slate-700" />
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-normal">No Logs Available</p>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                </main>

                <footer className="grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                        <Globe size={14} className="text-emerald-300" />
                        <span className="text-[9px] font-black uppercase tracking-normal text-slate-400">DNS Guard</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-red-300/20 bg-red-300/5 p-4">
                        <Zap size={14} className="text-red-300" />
                        <span className="text-[9px] font-black uppercase tracking-normal text-slate-400">Signal Relay</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4">
                        <Activity size={14} className="text-amber-200" />
                        <span className="text-[9px] font-black uppercase tracking-normal text-slate-400">Core Guard</span>
                    </div>
                </footer>
                </section>
            </div>
        </div>
    );
}
