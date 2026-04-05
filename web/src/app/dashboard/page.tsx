'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
    Clock, Shield, Plus, Trash2, Globe, Laptop, Zap, X, Check, Tablet,
    History, Settings, Layout, Search, Filter, AlertCircle, ChevronRight,
    Monitor, Smartphone, Play, Square, PlusCircle, ExternalLink, RefreshCcw
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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

export default function Dashboard() {
    const { user, token } = useAuthStore();
    const queryClient = useQueryClient();

    // UI State
    const [activeTab, setActiveTab] = useState<'sessions' | 'history'>('sessions');
    const [sessionTab, setSessionTab] = useState<'now' | 'later' | 'recurring'>('now');
    const [durationHours, setDurationHours] = useState(0);
    const [durationMinutes, setDurationMinutes] = useState(25);
    const [selectedBlocklistIds, setSelectedBlocklistIds] = useState<string[]>([]);
    const [lockedMode, setLockedMode] = useState(false);

    // Blocklist State
    const [editingListId, setEditingListId] = useState<string | null>(null);
    const [isCreatingList, setIsCreatingList] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [customDomain, setCustomDomain] = useState('');
    const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
    const [customApp, setCustomApp] = useState('');
    const [selectedApps, setSelectedApps] = useState<string[]>([]);
    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    // Queries
    const { data: activeSession } = useQuery({
        queryKey: ['activeSession', token],
        queryFn: async () => {
            const { data } = await axios.get(`${API_BASE}/sessions/active`, authHeader);
            return data;
        },
        enabled: !!token,
        refetchInterval: 5000,
    });

    const { data: blocklists } = useQuery({
        queryKey: ['blocklists', token],
        queryFn: async () => {
            const { data } = await axios.get(`${API_BASE}/blocklists`, authHeader);
            return data;
        },
        enabled: !!token,
    });

    const { data: sessionHistory } = useQuery({
        queryKey: ['sessionHistory'],
        queryFn: async () => {
            const { data } = await axios.get(`${API_BASE}/sessions/history`, authHeader);
            return data;
        },
        enabled: !!token,
    });

    // Mutations
    const startSession = useMutation({
        mutationFn: (data: any) => axios.post(`${API_BASE}/sessions/start`, data, authHeader),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['activeSession'] });
            queryClient.invalidateQueries({ queryKey: ['sessionHistory'] });
            setSelectedBlocklistIds([]);
        },
        onError: (err: any) => {
            const msg = err.response?.data?.error || 'Failed to start session';
            alert(`[ERROR] ${msg}`);
        }
    });

    const endSession = useMutation({
        mutationFn: () => axios.post(`${API_BASE}/sessions/end`, {}, authHeader),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activeSession'] });
            queryClient.invalidateQueries({ queryKey: ['sessionHistory'] });
        },
    });

    const createBlocklist = useMutation({
        mutationFn: (data: any) => axios.post(`${API_BASE}/blocklists`, data, authHeader),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['blocklists'] });
            setIsCreatingList(false);
            setNewListName('');
            setSelectedDomains([]);
            setSelectedApps([]);
        },
    });

    const deleteBlocklist = useMutation({
        mutationFn: (id: string) => axios.delete(`${API_BASE}/blocklists/${id}`, authHeader),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocklists'] }),
    });

    const addDomain = useMutation({
        mutationFn: ({ listId, domain }: { listId: string, domain: string }) =>
            axios.post(`${API_BASE}/blocklists/${listId}/domains`, { domain }, authHeader),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocklists'] }),
    });

    // Handlers
    const handleStartSession = async () => {
        if (selectedBlocklistIds.length === 0) return;
        const totalMinutes = (durationHours * 60) + durationMinutes;

        let finalBlocklistId = selectedBlocklistIds[0];

        // If multiple are selected, merge them into a new temporary list
        if (selectedBlocklistIds.length > 1) {
            const selectedLists = blocklists.filter((l: any) => selectedBlocklistIds.includes(l.id));
            const combinedDomains = Array.from(new Set(selectedLists.flatMap((l: any) => l.blocked_domains?.map((d: any) => d.domain) || [])));
            const combinedApps = Array.from(new Set(selectedLists.flatMap((l: any) => l.blocked_apps?.map((a: any) => a.process_name) || [])));

            try {
                const { data: tempBlocklist } = await axios.post(`${API_BASE}/blocklists`, {
                    name: `Merged Profile: ${selectedLists.map((l: any) => l.name).join(' + ')}`,
                    domains: combinedDomains,
                    apps: combinedApps
                }, authHeader);
                finalBlocklistId = tempBlocklist.id;
            } catch (err) {
                console.error("Failed to merge blocklists", err);
                return;
            }
        }

        startSession.mutate({
            duration_minutes: totalMinutes,
            blocklist_id: finalBlocklistId,
            locked_mode: lockedMode
        });
    };

    const handleQuickAdd = (listId: string, domain: string) => {
        addDomain.mutate({ listId, domain });
    };

    // Loader Splash View
    if (!blocklists && !activeSession) {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center space-y-6">
                <div className="w-16 h-16 rounded-3xl bg-blue-500/10 border-2 border-blue-500/20 flex items-center justify-center animate-pulse">
                    <Zap className="text-blue-500 fill-blue-500/50 animate-bounce" size={24} />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-black text-white tracking-widest uppercase">Connecting to Focus Engine...</h2>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest max-w-sm">
                        Establishing secure connection to background interception service.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-blue-500/30">
            {/* Top Navigation */}
            <nav className="border-b border-white/5 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <Zap className="text-white fill-white" size={18} />
                            </div>
                            <span className="text-xl font-black italic tracking-tighter text-white">FOCUS_AGENT</span>
                        </div>
                        <div className="h-6 w-px bg-white/10 hidden md:block" />
                        <div className="hidden md:flex items-center gap-6">
                            {['Dashboard', 'Devices', 'Sync', 'Help'].map((link) => (
                                <a key={link} href="#" className="text-sm font-medium text-slate-400 hover:text-blue-400 transition-colors uppercase tracking-widest">{link}</a>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end">
                            <span className="text-xs font-bold text-white">{user?.email}</span>
                            <span className="text-[10px] text-slate-500 uppercase font-black">Free Tier</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-blue-400 font-black">
                            {user?.email?.[0].toUpperCase()}
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-[1600px] mx-auto p-6 lg:p-10 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-10">

                {/* Left Sidebar - Options & Devices */}
                <aside className="md:col-span-1 lg:col-span-1 space-y-10">
                    {/* My Devices */}
                    <section className="space-y-4">
                        <div className="flex justify-between items-center group">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-slate-400 transition-colors">My Devices</h3>
                            <button className="text-[10px] font-bold text-blue-500 hover:text-blue-400 flex items-center gap-1">
                                ADD <PlusCircle size={12} />
                            </button>
                        </div>
                        <div className="space-y-2">
                            <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 flex items-center gap-3 group hover:border-blue-500/30 transition-all">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-white uppercase tracking-tight">Main Workstation</p>
                                    <p className="text-[10px] text-slate-500 font-medium">Windows 11 • Active</p>
                                </div>
                                <Monitor size={16} className="text-slate-700 group-hover:text-blue-500/50 transition-colors" />
                            </div>
                        </div>
                    </section>

                    {/* Options */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Protection Options</h3>
                        <div className="p-5 rounded-3xl bg-slate-900/50 border border-white/5 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Shield size={18} className={cn(lockedMode ? "text-blue-400" : "text-slate-600")} />
                                    <span className="text-sm font-bold">Locked Mode</span>
                                </div>
                                <button
                                    onClick={() => setLockedMode(!lockedMode)}
                                    className={cn(
                                        "w-10 h-5 rounded-full transition-all relative",
                                        lockedMode ? "bg-blue-600" : "bg-slate-800"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                                        lockedMode ? "right-1" : "left-1"
                                    )} />
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                                Locked mode prevents you from stopping sessions early. Use for maximum discipline.
                            </p>
                        </div>
                    </section>

                    {/* Tour Card */}
                    <button className="w-full p-5 rounded-3xl bg-blue-600 hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 flex items-center justify-center gap-3 text-white font-black text-xs uppercase tracking-widest group active:scale-95">
                        <Play size={16} className="fill-white" /> View Dashboard Tour
                    </button>
                </aside>

                {/* Main Content Area */}
                <div className="md:col-span-3 lg:col-span-4 space-y-10">

                    {/* Session Management Section */}
                    <section className="bg-slate-900/30 border border-white/5 rounded-[3rem] overflow-hidden backdrop-blur-sm">
                        <div className="bg-slate-900/50 px-8 py-2 border-b border-white/5 flex gap-8">
                            <button
                                onClick={() => setActiveTab('sessions')}
                                className={cn(
                                    "text-xs font-black uppercase tracking-widest py-4 border-b-2 transition-all",
                                    activeTab === 'sessions' ? "border-blue-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"
                                )}
                            >My Sessions</button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={cn(
                                    "text-xs font-black uppercase tracking-widest py-4 border-b-2 transition-all",
                                    activeTab === 'history' ? "border-blue-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"
                                )}
                            >Session History</button>
                        </div>

                        <div className="p-8 lg:p-12 space-y-10">
                            {activeTab === 'sessions' ? (
                                <>
                                    <div className="flex items-center gap-3">
                                        <Plus size={20} className="text-blue-500" />
                                        <h2 className="text-xl font-black uppercase tracking-tight">Add Session</h2>
                                    </div>

                                    <div className="space-y-8">
                                        {/* Timing Tabs */}
                                        <div className="flex gap-8 border-b border-white/5 pb-1">
                                            {['Start now', 'Start later', 'Recurring session'].map((t) => (
                                                <button
                                                    key={t}
                                                    onClick={() => setSessionTab(t.split(' ')[1] as any)}
                                                    className={cn(
                                                        "text-[10px] font-black uppercase tracking-[0.2em] pb-3 border-b-2 transition-all",
                                                        (t.includes('now') && sessionTab === 'now') || (t.includes('later') && sessionTab === 'later') || (t.includes('Recurring') && sessionTab === 'recurring')
                                                            ? "border-blue-500 text-white"
                                                            : "border-transparent text-slate-600 hover:text-slate-400"
                                                    )}
                                                >{t}</button>
                                            ))}
                                        </div>

                                        {activeSession?.active ? (
                                            <div className="bg-slate-900/80 backdrop-blur-xl border-2 border-blue-500/50 rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center justify-between gap-8 animate-pulse-glow neon-glow shadow-2xl shadow-blue-500/20">
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3 px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full w-max">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                                                        <span className="text-[10px] font-black uppercase">Active Enforcement</span>
                                                    </div>
                                                    <div className="space-y-0">
                                                        <p className="text-[10px] font-black text-blue-500/50 uppercase tracking-widest">Global Timer</p>
                                                        <h3 className="text-7xl font-black font-mono text-white tracking-tighter">
                                                            {Math.max(0, Math.floor((new Date(activeSession.end_time).getTime() - new Date().getTime()) / 60000))}
                                                            <span className="text-3xl text-slate-500 ml-2">m</span>
                                                        </h3>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => endSession.mutate()}
                                                    className="px-10 py-5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl shadow-red-900/40 active:scale-95 transition-all"
                                                >
                                                    Stop Session
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                                                {/* Left Column - Duration */}
                                                <div className="bg-slate-900/50 border border-white/5 p-8 rounded-3xl space-y-8">
                                                    <div className="flex flex-col gap-4">
                                                        <div className="space-y-2">
                                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Block Duration</p>
                                                            <select
                                                                className="w-full bg-slate-800 border-2 border-slate-700 hover:border-blue-500/50 rounded-xl p-4 text-sm font-black text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer appearance-none"
                                                                value={`${durationHours}:${durationMinutes}`}
                                                                onChange={(e) => {
                                                                    const [h, m] = e.target.value.split(':');
                                                                    setDurationHours(parseInt(h));
                                                                    setDurationMinutes(parseInt(m));
                                                                }}
                                                            >
                                                                <option value="0:5">5 Minutes (Quick Break/Test)</option>
                                                                <option value="0:15">15 Minutes (Short Sprint)</option>
                                                                <option value="0:25">25 Minutes (Pomodoro)</option>
                                                                <option value="0:45">45 Minutes (Extended Block)</option>
                                                                <option value="1:0">1 Hour (Deep Work)</option>
                                                                <option value="2:0">2 Hours (Marathon)</option>
                                                                <option value="4:0">4 Hours (Half Day)</option>
                                                                <option value="8:0">8 Hours (Full Workday)</option>
                                                            </select>
                                                        </div>
                                                        <button
                                                            onClick={handleStartSession}
                                                            disabled={selectedBlocklistIds.length === 0 || startSession.isPending}
                                                            className="flex-1 py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white rounded-2xl font-black uppercase text-sm tracking-[0.2em] shadow-xl shadow-emerald-900/40 active:scale-[0.98] transition-all"
                                                        >
                                                            {startSession.isPending ? 'Initiating...' : 'Start'}
                                                        </button>
                                                    </div>

                                                    {/* Block Selection */}
                                                    <div className="space-y-4">
                                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Block these distractions:</p>
                                                        <div className="relative">
                                                            <select
                                                                value={selectedBlocklistIds[0] || ""}
                                                                onChange={(e) => setSelectedBlocklistIds([e.target.value])}
                                                                className="w-full bg-slate-800/80 border-2 border-slate-700 hover:border-blue-500/50 rounded-xl p-4 pr-10 text-sm font-black text-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer appearance-none transition-all shadow-lg shadow-black/20"
                                                            >
                                                                <option value="" disabled>Select a routine...</option>
                                                                {blocklists?.map((list: any) => (
                                                                    <option key={list.id} value={list.id}>
                                                                        {list.name} ({list.blocked_domains?.length || 0} sites, {list.blocked_apps?.length || 0} apps)
                                                                    </option>
                                                                ))}
                                                            </select>

                                                            {blocklists?.length === 0 && (
                                                                <p className="text-xs text-slate-600 italic px-2">No blocklists available</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right Column - Device Selection */}
                                                <div className="bg-slate-900/50 border border-white/5 p-8 rounded-3xl space-y-4">
                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Enforce on these devices:</p>
                                                    <div className="space-y-3">
                                                        <div className="p-4 rounded-xl bg-slate-800/50 border border-blue-500/30 flex items-center gap-4">
                                                            <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
                                                                <Check size={10} className="text-white" />
                                                            </div>
                                                            <Monitor size={18} className="text-blue-400" />
                                                            <span className="text-sm font-bold">Main Workstation (This Device)</span>
                                                        </div>
                                                        <div className="p-4 rounded-xl bg-slate-800/20 border border-white/5 opacity-50 flex items-center gap-4 cursor-not-allowed">
                                                            <div className="w-4 h-4 rounded border border-slate-700" />
                                                            <Smartphone size={18} className="text-slate-600" />
                                                            <span className="text-sm font-bold">iPhone 15 Pro (Offline)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                                    {sessionHistory && sessionHistory.length > 0 ? (
                                        sessionHistory.map((session: any) => (
                                            <div key={session.id} className="p-6 bg-slate-900/50 border border-white/5 hover:border-blue-500/30 rounded-2xl transition-all flex items-center justify-between group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                                                        <History size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white uppercase tracking-tight">
                                                            {new Date(session.start_time).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-1">
                                                            {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-950 border border-white/5 rounded-lg mb-1">
                                                        <Shield size={10} className="text-emerald-500" />
                                                        <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">{session.blocklist?.name || 'Unknown List'}</span>
                                                    </div>
                                                    <p className="text-xs font-black text-white">
                                                        {Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000)} MIN
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="space-y-6 text-center py-10">
                                            <History size={48} className="mx-auto text-slate-700" />
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-bold text-white text-glow">No Recent Sessions</h3>
                                                <p className="text-slate-500 max-w-sm mx-auto text-xs uppercase tracking-widest">Your deep work history will appear here once you complete your first focus session.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* My Blocklists Section */}
                    <section className="space-y-8">
                        <div className="flex justify-between items-end">
                            <div className="flex items-center gap-3">
                                <Layout size={24} className="text-blue-500" />
                                <div>
                                    <h2 className="text-2xl font-black uppercase tracking-tight">My Blocklists</h2>
                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Guardian profiles for focus</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setIsCreatingList(true); setEditingListId(null); }}
                                className="px-6 py-3 bg-white text-slate-950 hover:bg-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-white/5"
                            >
                                Add Blocklist <Plus size={16} className="inline ml-1" />
                            </button>
                        </div>

                        {/* List Creation / Editing Form */}
                        {isCreatingList && (
                            <div className="bg-slate-900 border-2 border-blue-500/30 rounded-[2.5rem] p-8 lg:p-10 space-y-10 animate-in slide-in-from-top-4 duration-300 shadow-2xl shadow-blue-900/20">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-black italic uppercase tracking-tighter text-blue-400">
                                        {editingListId ? 'Edit Blocklist' : 'Create New Blocklist'}
                                    </h3>
                                    <button onClick={() => setIsCreatingList(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">List Name</p>
                                            <input
                                                value={newListName} onChange={(e) => setNewListName(e.target.value)}
                                                placeholder="e.g. Deep Work, No Social Media"
                                                className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-xl font-black text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Your Custom Websites</p>
                                            <div className="flex gap-4">
                                                <input
                                                    value={customDomain} onChange={(e) => setCustomDomain(e.target.value)}
                                                    placeholder="e.g. youtube.com"
                                                    className="flex-1 bg-slate-950 border border-white/10 rounded-xl p-4 font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (!customDomain) return;
                                                        setSelectedDomains(prev => Array.from(new Set([...prev, customDomain.trim()])));
                                                        setCustomDomain('');
                                                    }}
                                                    className="px-8 bg-blue-600 hover:bg-blue-500 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                                                >Add Site</button>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Selected Domains</p>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedDomains.map((d, i) => (
                                                    <span key={i} className="px-2 py-1 bg-slate-800 text-[10px] font-black text-blue-300 rounded uppercase flex items-center gap-1">
                                                        {d} <X size={10} className="cursor-pointer hover:text-red-400" onClick={() => setSelectedDomains(selectedDomains.filter((_, idx) => idx !== i))} />
                                                    </span>
                                                ))}
                                                {selectedDomains.length === 0 && <p className="text-xs text-slate-600 italic">No domains added yet</p>}
                                            </div>
                                        </div>

                                        <div className="space-y-4 pt-4 border-t border-white/5">
                                            <div className="space-y-4">
                                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">System Applications</p>
                                                <div className="flex gap-4">
                                                    <input
                                                        value={customApp} onChange={(e) => setCustomApp(e.target.value)}
                                                        placeholder="e.g. Valorant.exe"
                                                        className="flex-1 bg-slate-950 border border-white/10 rounded-xl p-4 font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            if (!customApp) return;
                                                            let appName = customApp.trim();
                                                            if (!appName.toLowerCase().endsWith('.exe')) appName += '.exe';
                                                            setSelectedApps(prev => Array.from(new Set([...prev, appName])));
                                                            setCustomApp('');
                                                        }}
                                                        className="px-8 bg-blue-600 hover:bg-blue-500 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                                                    >Add App</button>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {selectedApps.map((a, i) => (
                                                    <span key={i} className="px-2.5 py-1.5 bg-slate-800/80 border border-purple-500/20 text-xs font-bold text-purple-300 rounded-lg flex items-center gap-2">
                                                        {a} <X size={12} className="cursor-pointer hover:text-red-400 transition-colors" onClick={() => setSelectedApps(selectedApps.filter((_, idx) => idx !== i))} />
                                                    </span>
                                                ))}
                                                {selectedApps.length === 0 && <p className="text-xs text-slate-600 italic px-2">No apps selected yet</p>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Common Filters</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {COMMON_FILTERS.map(f => (
                                                    <button key={f.name} onClick={() => setSelectedDomains(prev => Array.from(new Set([...prev, ...f.domains])))} className="p-3 bg-slate-950/50 border border-white/5 rounded-xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left flex items-center justify-between group">
                                                        <span className="text-xs font-bold text-slate-400 group-hover:text-blue-400 transition-colors">{f.name}</span>
                                                        <Plus size={12} className="text-slate-700 group-hover:text-blue-500" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Category Filters</p>
                                            <div className="grid grid-cols-2 gap-3">
                                                {CATEGORY_FILTERS.map(c => (
                                                    <button key={c.name} onClick={() => setSelectedDomains(prev => Array.from(new Set([...prev, ...c.domains])))} className="p-3 bg-slate-950/50 border border-white/5 rounded-xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left flex items-center justify-between group">
                                                        <span className="text-xs font-bold text-slate-400 group-hover:text-blue-400 transition-colors">{c.name}</span>
                                                        <PlusCircle size={14} className="text-slate-700 group-hover:text-blue-500" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/5 flex justify-end gap-4">
                                    <button onClick={() => setIsCreatingList(false)} className="px-8 py-3 text-xs font-black uppercase text-slate-500 hover:text-white transition-colors">Cancel</button>
                                    <button
                                        onClick={() => createBlocklist.mutate({ name: newListName, domains: selectedDomains, apps: selectedApps })}
                                        disabled={!newListName || createBlocklist.isPending}
                                        className="px-12 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-black uppercase text-xs tracking-[0.2em] transition-all shadow-xl shadow-blue-900/40"
                                    >
                                        Save Blocklist
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Blocklist Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {blocklists?.map((list: any) => (
                                <div key={list.id} className="group bg-slate-900/60 border border-white/5 p-8 rounded-[2rem] hover:bg-slate-900/80 hover:border-blue-500/80 hover:neon-glow transition-all duration-300 relative overflow-hidden backdrop-blur-md">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500" />

                                    <div className="flex justify-between items-start relative z-10 sm-6">
                                        <div className="space-y-1 mb-6">
                                            <div className="flex items-center gap-2">
                                                <Shield size={14} className="text-blue-500" />
                                                <h3 className="text-xl font-black text-white uppercase tracking-tight">{list.name}</h3>
                                            </div>
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                {list.blocked_domains?.length + list.blocked_apps?.length || 0} items active
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setEditingListId(list.id); setNewListName(list.name); setIsCreatingList(true); }}
                                                className="p-2.5 bg-slate-800 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all"
                                            >
                                                <Settings size={14} />
                                            </button>
                                            <button
                                                onClick={() => deleteBlocklist.mutate(list.id)}
                                                className="p-2.5 bg-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4 relative z-10 pt-4 border-t border-white/5">
                                        <div className="flex flex-wrap gap-1.5">
                                            {list.blocked_domains?.slice(0, 5).map((d: any) => (
                                                <span key={d.id} className="px-2.5 py-1 bg-slate-950/50 border border-white/5 rounded-lg text-[10px] font-bold text-slate-400">
                                                    {d.domain}
                                                </span>
                                            ))}
                                            {list.blocked_domains?.length > 5 && (
                                                <span className="px-2.5 py-1 text-[10px] font-black text-slate-600">+{list.blocked_domains.length - 5} MORE</span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {list.blocked_apps?.slice(0, 3).map((a: any) => (
                                                <span key={a.id} className="px-2.5 py-1 bg-slate-950/50 border border-white/5 rounded-lg text-[10px] font-bold text-slate-400">
                                                    {a.process_name}
                                                </span>
                                            ))}
                                            {list.blocked_apps?.length > 3 && (
                                                <span className="px-2.5 py-1 text-[10px] font-black text-slate-600">+{list.blocked_apps.length - 3} APPS</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => { setEditingListId(list.id); setIsCreatingList(true); }}
                                            className="text-[10px] font-black text-blue-500/60 hover:text-blue-500 uppercase tracking-tighter flex items-center gap-1 transition-colors"
                                        >
                                            Manage Items <ChevronRight size={10} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            {/* Footer */}
            <footer className="max-w-[1600px] mx-auto p-10 mt-20 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-2 opacity-30">
                    <Zap size={14} className="text-white" />
                    <span className="text-xs font-black uppercase tracking-widest text-white">Focus Agent v1.0.42</span>
                </div>
                <div className="flex gap-8">
                    {['Status', 'Privacy', 'Terms', 'Support'].map(f => (
                        <a key={f} href="#" className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-blue-500 transition-colors">{f}</a>
                    ))}
                </div>
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">© 2026 DIGITAL_DISCIPLINE_LABS</span>
            </footer>

            {/* Manage Apps Modal now handled by Native Electron BrowserWindow */}
        </div>
    );
}
