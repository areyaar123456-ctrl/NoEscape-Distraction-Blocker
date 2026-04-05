'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Clock, Shield, Lock, Unlock, Zap, Laptop, Globe, Check, AlertCircle,
    Settings, Activity, History, Trash2, Plus, X, ShieldAlert, RefreshCcw, ExternalLink
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:3001';

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
        setUser({ email: 'local@focus.agent' });
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
        <div className="flex flex-col items-center justify-center min-h-screen">
            <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4 neon-glow" />
            <p className="text-blue-500/50 font-black text-[10px] uppercase tracking-[0.3em] text-glow">INITIALIZING_LOCAL_DB</p>
        </div>
    );

    if (!user && !activeSession) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8 selection:bg-blue-500/30">
                <div className="w-full max-w-sm space-y-8 animate-pulse-glow p-10 rounded-[3rem] border border-blue-500/30 bg-slate-900/50 backdrop-blur-xl">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center neon-glow">
                            <Zap className="text-white fill-white" size={32} />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-3xl font-black italic tracking-tighter text-white text-glow">FOCUS_AGENT</h1>
                            <p className="text-blue-400 text-[10px] uppercase font-black tracking-widest text-glow">Desktop Terminal</p>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-500 text-[10px] font-black uppercase tracking-tight flex items-center gap-3 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">IDENTIFIER</label>
                            <input
                                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-4 bg-slate-950 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500/50 outline-none transition-all text-sm font-bold text-white uppercase placeholder:text-slate-700 neon-glow"
                                placeholder="USER@AGENT.COM" required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">SECURE_KEY</label>
                            <input
                                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-4 bg-slate-950 border border-white/10 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500/50 outline-none transition-all text-sm font-bold text-white placeholder:text-slate-700 neon-glow"
                                placeholder="••••••••" required
                            />
                        </div>
                        <button type="submit" className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-[1.5rem] transition-all active:scale-[0.98] neon-glow text-xs tracking-widest uppercase mt-4">
                            Authenticate
                        </button>
                    </form>

                    <div className="flex flex-col items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => handleOpenWeb()}
                            className="text-blue-400 hover:text-blue-300 text-[10px] font-black uppercase tracking-[0.2em] transition-colors text-glow flex items-center gap-2"
                        >
                            Visit Web Version <ExternalLink size={10} />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenWeb('http://localhost:3000/register')}
                            className="text-slate-500 hover:text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] transition-colors text-glow"
                        >
                            Request Access Protocol
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen text-slate-100 selection:bg-blue-500/30">
            <div className="max-w-xl mx-auto p-8 lg:p-12 space-y-10">
                <header className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center neon-glow">
                            <Zap className="text-white fill-white" size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black italic tracking-tighter text-white text-glow">FOCUS_AGENT</h1>
                            <p className="text-[9px] font-black text-blue-500/50 uppercase tracking-[0.3em]">
                                {user?.email ? user.email.split('@')[0] : 'SESSION_LOCAL'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={handleForceSync}
                            disabled={isSyncing}
                            className={cn("p-3 bg-slate-900 border border-white/10 rounded-xl text-slate-500 hover:text-blue-400 hover:border-blue-500/50 transition-all", isSyncing && "animate-spin text-blue-400 border-blue-500/50")}
                        >
                            <RefreshCcw size={18} />
                        </button>
                    </div>
                </header>

                {isAdmin === false && (
                    <div className="p-5 bg-amber-500/10 border-2 border-amber-500/50 rounded-3xl animate-pulse-glow">
                        <div className="flex items-start gap-4">
                            <ShieldAlert className="text-amber-500 shrink-0" size={24} />
                            <div className="space-y-1">
                                <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest">Elevated Access Required</h4>
                                <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                                    The blocking engine needs Administrator privileges to modify system rules.
                                    Please <span className="text-amber-400">Run as Administrator</span> to enable full protection.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-500 text-[10px] font-black uppercase tracking-tight flex items-center gap-3">
                        <AlertCircle size={14} /> {error}
                    </div>
                )}

                <main className="space-y-6">
                    {activeSession ? (
                        <div className="relative group animate-pulse-glow rounded-[2.5rem]">
                            <div className="relative bg-slate-900/80 backdrop-blur-md border-2 border-blue-500/50 p-10 lg:p-12 rounded-[2.5rem] flex flex-col items-center text-center space-y-8 overflow-hidden z-10">
                                <Activity className="absolute -top-10 -right-10 w-40 h-40 text-blue-500/10 rotate-12" />

                                <div className="flex items-center gap-3 px-5 py-1.5 bg-blue-500/10 border border-blue-500/50 rounded-full neon-glow">
                                    <Lock size={12} className="text-blue-400" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 text-glow">Enforcement Active</span>
                                </div>

                                <div className="space-y-1">
                                    <h2 className="text-8xl font-black font-mono tracking-tighter text-white text-glow">
                                        {Math.max(0, Math.floor((new Date(activeSession.end_time).getTime() - Date.now()) / 60000))}
                                        <span className="text-2xl text-blue-500/50 ml-2">m</span>
                                    </h2>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Time Remaining</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 w-full pt-4">
                                    <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 space-y-1">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Domains</p>
                                        <p className="text-lg font-black text-white">{activeSession.blocklist?.blocked_domains?.length || activeSession.domains?.length || 0}</p>
                                    </div>
                                    <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 space-y-1">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Applications</p>
                                        <p className="text-lg font-black text-white">{activeSession.blocklist?.blocked_apps?.length || activeSession.apps?.length || 0}</p>
                                    </div>
                                </div>

                                <div className="w-full pt-4 border-t border-white/5 space-y-3">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Protection Status</p>
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

                                <button onClick={handleEndSession} className="w-full py-5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.5)] active:scale-95 transition-all mt-4">
                                    Abort Session
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] space-y-8 relative overflow-hidden">

                            <div className="flex gap-4 border-b border-white/5 pb-2">
                                {['focus', 'blocklists', 'history'].map(t => (
                                    <button
                                        key={t} onClick={() => setActiveTab(t as any)}
                                        className={cn("text-[10px] font-black uppercase tracking-widest pb-3 border-b-2 transition-all", activeTab === t ? "border-blue-500 text-blue-400 text-glow" : "border-transparent text-slate-500 hover:text-slate-300"
                                        )}>{t}</button>
                                ))}
                            </div>

                            {activeTab === 'focus' && (
                                <div className="space-y-8 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-6">
                                        <div className="flex items-center gap-3">
                                            <Clock size={20} className="text-blue-500" />
                                            <h2 className="text-lg font-black uppercase tracking-tight text-glow">Setup Protocol</h2>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Locked</span>
                                            <button onClick={() => setLockedMode(!lockedMode)} className={cn("w-8 h-4 rounded-full transition-all relative", lockedMode ? "bg-blue-500 neon-glow" : "bg-slate-800")}>
                                                <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all", lockedMode ? "right-0.5" : "left-0.5")} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Duration</label>
                                                <span className="text-xs font-black text-blue-400 text-glow">{duration} Min</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[25, 45, 60].map(m => (
                                                    <button key={m} onClick={() => setDuration(m)} className={cn("py-3 rounded-xl font-black text-xs transition-all border", duration === m ? "bg-blue-600 border-blue-500 text-white neon-glow" : "bg-slate-950 border-white/5 text-slate-600")}>{m}</button>
                                                ))}
                                            </div>
                                            <input type="range" min="5" max="180" step="5" value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer" />
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Profile(s)</label>
                                            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                                {blocklists.map(l => (
                                                    <button key={l.id} onClick={() => setSelectedBlocklistIds(prev => prev.includes(l.id) ? prev.filter(id => id !== l.id) : [...prev, l.id])} className={cn("w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between", selectedBlocklistIds.includes(l.id) ? "bg-blue-600/20 border-blue-500/50 text-blue-400 neon-glow" : "bg-slate-950 border-white/5 text-slate-500")}>
                                                        <span className="text-[10px] font-black uppercase tracking-tight truncate text-glow">{l.name}</span>
                                                        {selectedBlocklistIds.includes(l.id) && <Check size={12} />}
                                                    </button>
                                                ))}
                                                {blocklists.length === 0 && <p className="text-[10px] font-black text-slate-600 uppercase italic">No profiles constructed.</p>}
                                            </div>
                                        </div>
                                    </div>
                                    {lockedMode && (
                                        <div className="p-5 bg-amber-500/10 border-2 border-amber-500/50 rounded-3xl animate-in zoom-in-95 duration-200">
                                            <div className="flex items-start gap-4">
                                                <ShieldAlert className="text-amber-500 shrink-0" size={20} />
                                                <div className="space-y-1">
                                                    <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Permanent Lockdown Protocol</h4>
                                                    <p className="text-[9px] text-slate-400 font-bold leading-relaxed uppercase">
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
                                            "w-full py-6 font-black rounded-3xl text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-20 neon-glow active:scale-[0.98]",
                                            lockedMode 
                                                ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]" 
                                                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white"
                                        )}
                                    >
                                        {lockedMode ? 'Execute Persistent Lockdown' : 'Execute Enforcement'}
                                    </button>
                                </div>
                            )}

                            {activeTab === 'blocklists' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {!isCreatingList ? (
                                        <>
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Profiles</h3>
                                                <button onClick={() => setIsCreatingList(true)} className="text-[10px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest flex items-center gap-1 text-glow">
                                                    New <Plus size={12} />
                                                </button>
                                            </div>
                                            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                                {blocklists.map(l => (
                                                    <div key={l.id} className="p-4 bg-slate-950 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-blue-500/30 transition-all">
                                                        <div className="flex items-center gap-3">
                                                            <Shield size={14} className="text-blue-500" />
                                                            <span className="text-[10px] font-black text-white uppercase tracking-tight">{l.name}</span>
                                                        </div>
                                                        <button onClick={() => handleDeleteBlocklist(l.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                                {blocklists.length === 0 && <p className="text-center text-slate-600 text-[10px] font-black uppercase py-6">No profiles constructed.</p>}
                                            </div>
                                                                                    <div className="pt-4 border-t border-white/5">
                                                <button 
                                                    onClick={() => window.api?.triggerSplash()}
                                                    className="w-full p-4 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center gap-3 group hover:border-blue-500/30 transition-all hover:neon-glow"
                                                >
                                                    <Zap size={14} className="text-blue-500 group-hover:animate-pulse" />
                                                    <span className="text-[10px] font-black text-slate-500 group-hover:text-blue-400 uppercase tracking-[0.2em] transition-colors">Diagnostic: Test Feedback System</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-6 bg-slate-950/50 p-6 border border-blue-500/30 rounded-2xl neon-glow">
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest text-glow">Construct Profile</h3>
                                                <button onClick={() => setIsCreatingList(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
                                            </div>
                                            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Profile Designation (e.g. Deep Work)" className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm font-black text-white focus:ring-2 focus:ring-blue-500 outline-none" />

                                            <div className="space-y-4">
                                                <div className="flex gap-2">
                                                    <input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="Domain.com" className="flex-1 bg-slate-900 border border-white/10 rounded-xl p-3 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                                                    <button onClick={() => { if (customDomain) { setCustomDomainsList(prev => Array.from(new Set([...prev, customDomain.trim()]))); setCustomDomain(''); } }} className="px-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-black text-[10px] uppercase text-white transition-all">Add</button>
                                                </div>

                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-2">Quick Add</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {CATEGORY_FILTERS.map(c => (
                                                        <button key={c.name} onClick={() => setCustomDomainsList(prev => Array.from(new Set([...prev, ...c.domains])))} className="p-2 bg-slate-900/50 border border-white/5 rounded-lg hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left flex items-center justify-between group">
                                                            <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-400 transition-colors">{c.name} Category</span>
                                                            <Plus size={10} className="text-slate-700 group-hover:text-blue-500" />
                                                        </button>
                                                    ))}
                                                    {COMMON_FILTERS.map(f => (
                                                        <button key={f.name} onClick={() => setCustomDomainsList(prev => Array.from(new Set([...prev, ...f.domains])))} className="p-2 bg-slate-900/50 border border-white/5 rounded-lg hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left flex items-center justify-between group">
                                                            <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-400 transition-colors">{f.name}</span>
                                                            <Plus size={10} className="text-slate-700 group-hover:text-blue-500" />
                                                        </button>
                                                    ))}
                                                </div>

                                                <div className="pt-4 space-y-4">
                                                    <div className="space-y-2">
                                                        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-3">
                                                            <AlertCircle size={14} className="text-blue-400 mt-0.5 shrink-0" />
                                                            <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
                                                                If the application you want to block doesn't appear, make sure it is <span className="text-blue-400">currently running</span> and then scan again.
                                                            </p>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-3">
                                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Application Picker</p>
                                                                <div className="flex items-center gap-2 px-2 py-1 bg-slate-900 border border-white/5 rounded-lg">
                                                                    <span className="text-[8px] font-black text-slate-500 uppercase">Advanced</span>
                                                                    <button 
                                                                        onClick={() => setShowAllApps(!showAllApps)} 
                                                                        className={cn("w-6 h-3 rounded-full transition-all relative", showAllApps ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-800")}
                                                                    >
                                                                        <div className={cn("absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all", showAllApps ? "right-0.5" : "left-0.5")} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <button 
                                                                onClick={fetchRunningApps} 
                                                                disabled={isScanningApps}
                                                                className={cn("text-[9px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest flex items-center gap-1 transition-colors", isScanningApps && "animate-pulse")}
                                                            >
                                                                {isScanningApps ? 'Analyzing System...' : 'Scan System'} <RefreshCcw size={10} />
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
                                                                            "p-2.5 bg-slate-900/50 border rounded-xl flex items-center gap-3 transition-all text-left group",
                                                                            isSelected ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "border-white/5 hover:border-white/10 hover:bg-slate-900"
                                                                        )}
                                                                    >
                                                                        {app.icon ? (
                                                                            <img src={app.icon} className="w-6 h-6 rounded shadow-sm" alt="" />
                                                                        ) : (
                                                                            <Laptop size={16} className="text-slate-600" />
                                                                        )}
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className={cn("text-[9px] font-black uppercase truncate", isSelected ? "text-blue-400 text-glow" : "text-slate-400 group-hover:text-slate-300")}>{app.name}</p>
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
                                                                <span key={i} className="px-2 py-1 bg-slate-800 text-[9px] font-black text-blue-300 rounded uppercase flex items-center gap-1">
                                                                    {d} <X size={10} className="cursor-pointer hover:text-red-400" onClick={() => setCustomDomainsList(customDomainsList.filter((_, idx) => idx !== i))} />
                                                                </span>
                                                            ))}
                                                            {customAppsList.map((app, i) => (
                                                                <span key={i} className="px-2 py-1 bg-blue-500/10 text-[9px] font-black text-blue-300 border border-blue-500/20 rounded-lg uppercase flex items-center gap-1.5 animate-in zoom-in-95 duration-200">
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
                                                className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
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
                                            <div key={session.id} className="p-4 bg-slate-950 border border-white/5 rounded-2xl flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <History size={16} className="text-blue-500" />
                                                    <div>
                                                        <p className="text-[10px] font-black text-white uppercase tracking-tight">
                                                            {new Date(session.start_time).toLocaleDateString()}
                                                        </p>
                                                        <p className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">
                                                            {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-blue-400 text-glow uppercase">{session.blocklist?.name}</p>
                                                    <p className="text-[9px] font-bold text-white uppercase mt-0.5">
                                                        {session.start_time ? Math.max(0, Math.round((new Date(session.ended_at || session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000)) : '?'} Min
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-10 space-y-2">
                                            <History size={32} className="mx-auto text-slate-700" />
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No Logs Available</p>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                </main>

                <footer className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
                    <div className="p-4 bg-slate-900/30 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
                        <Globe size={14} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DNS Shield</span>
                    </div>
                    <div className="p-4 bg-slate-900/30 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
                        <Zap size={14} className="text-blue-500" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Signal Relay</span>
                    </div>
                    <div className="p-4 bg-slate-900/30 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
                        <Activity size={14} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Core Guard</span>
                    </div>
                </footer>
            </div>
        </div>
    );
}
