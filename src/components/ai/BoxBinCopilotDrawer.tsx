import { useTranslation } from 'react-i18next';
import { copilotText as ct, copilotLanguage } from '@/lib/copilotI18n';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Box, MapPin, Package, Search, PencilLine, FileText, ArrowLeft, ChevronRight, MessageSquare, ShieldCheck, Bot, Check, Phone, PhoneOff, Square, History, Loader2, Mic, MicOff, Paperclip, Plus, Send, Sparkles, Trash2, X, AudioLines, Captions } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CopilotProposalFields } from './CopilotProposalFields';
import { useCopilotViewport } from './useCopilotViewport';
import { toast } from 'sonner';
import { CopilotArtifactEditor } from './CopilotArtifactEditor';
import { SafeMarkdown, SearchSuggestions } from './SafeMarkdown';
import { CopilotVoiceStream, type LiveState } from '@/services/copilotVoiceStream';
import { voiceService } from '@/services/voiceService';
import { type ActionProposal, type ChatMessage, type CopilotChatSession, MAX_CHATS_PER_USER, MAX_FILES_PER_USER, MAX_MESSAGES_PER_CHAT, loadCopilotSessions, welcomeMessage, createCopilotSession, saveSessionMessages, deleteCopilotSession, fetchLiveInventoryContext, streamQueryToBoxBinCopilot, prepareInventoryDocument, executeCreateItem, executeCreateBin, executeMoveItem, executeAssignLocation, executeCreateLocation, executeUpdateItem, executeUpdateBin, executeUpdateLocation } from '@/services/boxbinCopilotService';
const titles = (): Record<string, string> => ({
  update_item: ct('updateItem'),
  update_bin: ct('updateBin'),
  update_location: ct('updateLocation'),
  create_item: ct('registerItem'),
  create_bin: ct('createBin'),
  move_item: ct('moveItem'),
  assign_location: ct('assignLocation'),
  create_location: ct('createLocation'),
  focus_bin_chat: ct('focusBin'),
  generate_inventory_pdf: ct('preparePdf'),
  generate_image: ct('generateImage')
});
const errorText = (e: unknown) => e instanceof Error ? e.message : ct('operationFailed');
export function BoxBinCopilotDrawer() {
  const { i18n } = useTranslation();
  const language = copilotLanguage(i18n.resolvedLanguage || i18n.language);
  const previousLanguage = useRef(language);
  const {
    currentUser
  } = useAuth(),
    location = useLocation(),
    navigate = useNavigate();
  const userId = currentUser?.id || '';
  const [isOpen, setIsOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [query, setQuery] = useState('');
  const viewport = useCopilotViewport(isOpen);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [proposalError, setProposalError] = useState<{ id: string; text: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage()]),
    [sessions, setSessions] = useState<CopilotChatSession[]>([]),
    [sessionId, setSessionId] = useState<string | null>(null);
  const [binId, setBinId] = useState<string | null>(null),
    [context, setContext] = useState<any>(null),
    [contextError, setContextError] = useState('');
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [listening, setListening] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>('ended');
  const [voiceMode, setVoiceMode] = useState<'voice' | 'text'>('voice');
  const [showCaptions, setShowCaptions] = useState(true);
  const [liveCaption, setLiveCaption] = useState({ input: '', output: '' });
  const [micMuted, setMicMuted] = useState(false);
  const [voiceWarning, setVoiceWarning] = useState('');
  const voiceStream = useRef<CopilotVoiceStream | null>(null);
  const liveMessages = useRef<ChatMessage[]>([]);
  const livePartial = useRef<{ id: string; input: string; output: string } | null>(null);
  const liveSave = useRef<Promise<void>>(Promise.resolve());
  const callActive = liveState !== 'ended';
  const cancelVoice = () => {
    voiceStream.current?.stop();
    voiceStream.current = null;
    setLiveState('ended');
    setMicMuted(false);
    setVoiceMode('voice');
    setLiveCaption({ input: '', output: '' });
  };
  const [attached, setAttached] = useState<ChatMessage['attachedFile']>(),
    [artifact, setArtifact] = useState<{
      msgId: string;
      proposal: ActionProposal;
    } | null>(null);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
  } | null>(null),
    drag = useRef<{
      x: number;
      y: number;
      left: number;
      top: number;
      moved: boolean;
    } | null>(null);
  const [filesCount, setFilesCount] = useState(0),
    [savingError, setSavingError] = useState('');
  const bottom = useRef<HTMLDivElement>(null),
    messagesContainer = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    identity = useRef(userId),
    epoch = useRef(0),
    contextRequest = useRef(0);
  identity.current = userId;
  const locked = busy || !!artifact || callActive;
  const limitReached = messages.filter(m => !m.id.startsWith('welcome-')).length >= MAX_MESSAGES_PER_CHAT;
  const voiceProposal = [...messages].reverse().find(message => message.sender === 'copilot' && message.actionProposal && message.actionProposal.status !== 'executed' && message.actionProposal.status !== 'cancelled')?.actionProposal;
  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesContainer.current;
    if (el) {
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
    bottom.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'end'
    });
  }, []);
  const refreshSessions = useCallback(async () => {
    const loaded = await loadCopilotSessions(userId);
    if (identity.current === userId) {
      setSessions(loaded);
      setFilesCount(loaded.reduce((n, s) => n + (s.filesCount || 0), 0));
    }
    return loaded;
  }, [userId]);
  const refreshContext = useCallback(async () => {
    const request = ++contextRequest.current;
    try {
      const ctx = await fetchLiveInventoryContext(userId, binId);
      if (identity.current === userId && request === contextRequest.current) {
        setContext(ctx);
        setContextError('');
      }
    } catch (e) {
      if (identity.current === userId && request === contextRequest.current) {
        setContext(null);
        setContextError(errorText(e));
      }
    }
  }, [userId, binId]);
  useEffect(() => {
    let live = true;
    epoch.current++;
    busyRef.current = false;
    setBusy(false);
    setSessions([]);
    setSessionId(null);
    setMessages([welcomeMessage()]);
    setBinId(null);
    setContext(null);
    setAttached(undefined);
    setArtifact(null);
    setSavingError('');
    setFilesCount(0);
    voiceService.stopListening();
    if (userId) refreshSessions().then(rows => {
      if (!live) return;
      const first = rows[0];
      if (first) {
        setSessionId(first.id);
        setMessages(first.messages);
        setBinId(first.binId || null);
      }
    }).catch(e => {
      if (live) setSavingError(errorText(e));
    });
    return () => {
      live = false;
      epoch.current++;
      voiceStream.current?.stop();
      voiceService.stopListening();
    };
  }, [userId, refreshSessions]);
  useEffect(() => {
    if (isOpen && userId) void refreshContext();
  }, [isOpen, userId, refreshContext]);
  useEffect(() => {
    if (isOpen && !historyOpen) {
      scrollToBottom(false);
      const r1 = requestAnimationFrame(() => scrollToBottom(false));
      const r2 = requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom(false)));
      const t1 = setTimeout(() => scrollToBottom(false), 40);
      const t2 = setTimeout(() => scrollToBottom(false), 120);
      const t3 = setTimeout(() => scrollToBottom(false), 260);
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [isOpen, historyOpen, sessionId, scrollToBottom]);
  useEffect(() => {
    if (isOpen && !historyOpen) {
      scrollToBottom(true);
    }
  }, [messages, isOpen, historyOpen, scrollToBottom]);
  useEffect(() => {
    if (!isOpen) { voiceService.stopListening(); cancelVoice(); }
  }, [isOpen]);
  useEffect(() => {
    const changed = () => {
      if (isOpen) void refreshContext();
    };
    window.addEventListener('boxbin-inventory-changed', changed);
    return () => window.removeEventListener('boxbin-inventory-changed', changed);
  }, [isOpen, refreshContext]);
  useEffect(() => {
    if (previousLanguage.current === language) return;
    previousLanguage.current = language;
    voiceService.stopListening();
    if (voiceStream.current) { cancelVoice(); setVoiceWarning(ct('languageChanged')); }
  }, [language]);
  const selectSession = (s: CopilotChatSession) => {
    cancelVoice();
    epoch.current++;
    setSessionId(s.id);
    setMessages(s.messages);
    setBinId(s.binId || null);
    setHistoryOpen(false);
    setAttached(undefined);
    setQuery('');
    setTimeout(() => scrollToBottom(false), 40);
  };
  const newSession = async (focus: string | null = null, name?: string) => {
    if (!userId || busyRef.current || voiceStream.current || artifact) return;
    busyRef.current = true;
    setBusy(true);
    const turn = ++epoch.current;
    try {
      const id = await createCopilotSession(userId, focus ? `📦 ${name || ct('bin')}` : undefined, focus || undefined);
      if (turn !== epoch.current) return;
      const rows = await refreshSessions();
      const s = rows.find(x => x.id === id);
      if (s) selectSession(s);
      setSavingError('');
    } catch (e) {
      if (turn === epoch.current) toast.error(errorText(e));
    } finally {
      if (identity.current === userId) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    const open = (event: Event) => {
      if (busyRef.current || voiceStream.current || artifact) {
        toast.info(ct('waitOperation'));
        return;
      }
      const detail = (event as CustomEvent).detail || {};
      const focus = detail.binId ? String(detail.binId) : null;
      setIsOpen(true);
      setHistoryOpen(false);
      const existing = sessions.find(s => (s.binId || null) === focus);
      if (existing) selectSession(existing); else void newSession(focus, detail.binName);
    };
    window.addEventListener('open-bin-copilot', open);
    return () => window.removeEventListener('open-bin-copilot', open);
  });
  const persist = async (list: ChatMessage[], id = sessionId, focus = binId, files = 0) => {
    if (!id) return;
    try {
      await saveSessionMessages(userId, id, list, undefined, files, focus);
      if (identity.current === userId) {
        setSavingError('');
        await refreshSessions();
      }
    } catch (e) {
      if (identity.current === userId) setSavingError(errorText(e));
    }
  };
  const startCall = async () => {
    if (!userId || busyRef.current || voiceStream.current || artifact || attached || limitReached) return;
    voiceService.stopListening();
    setVoiceMode('voice');
    setShowCaptions(true);
    setLiveCaption({ input: '', output: '' });
    setVoiceWarning(''); setMicMuted(false);
    const turn = ++epoch.current;
    let id = sessionId;
    liveMessages.current = messages;
    livePartial.current = null;
    const isCurrent = () => turn === epoch.current && identity.current === userId;
    const save = (list: ChatMessage[]) => {
      const chatId = id;
      if (!chatId) return;
      // Sequential snapshots prevent a slower prior turn from overwriting a newer one.
      liveSave.current = liveSave.current.catch(() => { }).then(() => persist(list, chatId, binId));
    };
    const complete = (data: { id: string; input: string; interrupted: boolean; answer: import('@/services/boxbinCopilotService').CopilotResponse }) => {
      if (!isCurrent()) return;
      const list: ChatMessage[] = [...liveMessages.current,
      { id: `voice-user-${data.id}`, sender: 'user', text: data.input || ct('voiceNoTranscript'), timestamp: new Date() },
      {
        id: `voice-bot-${data.id}`, sender: 'copilot', text: data.answer.reply + (data.interrupted ? `\n\n[${ct('interrupted')}]` : ''), timestamp: new Date(), isStreaming: false,
        actions: data.answer.suggestedActions, suggestedQuestions: data.answer.suggestedQuestions,
        actionProposal: data.interrupted ? undefined : data.answer.actionProposal || undefined,
        sources: data.answer.sources, searchSuggestions: data.answer.searchSuggestions, isValuation: data.answer.isValuation
      }
      ];
      livePartial.current = null;
      liveMessages.current = list;
      setMessages(list); save(list);
      if (list.filter(m => !m.id.startsWith('welcome-')).length >= MAX_MESSAGES_PER_CHAT) {
        voiceStream.current?.stop();
        setVoiceWarning(ct('messageLimit'));
      }
    };
    const call = new CopilotVoiceStream({
      history: () => liveMessages.current.slice(-8).map(m => ({ sender: m.sender, text: m.text, actionProposal: m.actionProposal })),
      onState: state => {
        if (!isCurrent()) return;
        setLiveState(state);
        if (state === 'ended') {
          voiceStream.current = null;
          const partial = livePartial.current;
          if (partial && (partial.input || partial.output)) complete({ ...partial, interrupted: true, answer: { reply: partial.output || ct('callEnded'), suggestedActions: [], suggestedQuestions: [] } });
        }
      },
      onTranscript: data => {
        if (!isCurrent()) return;
        livePartial.current = data;
        setLiveCaption({ input: data.input, output: data.output });
        setMessages([...liveMessages.current,
        ...(data.input ? [{ id: `voice-user-${data.id}`, sender: 'user' as const, text: data.input, timestamp: new Date(), isStreaming: true }] : []),
        { id: `voice-bot-${data.id}`, sender: 'copilot', text: data.output, timestamp: new Date(), isStreaming: true }
        ]);
      },
      onTurn: complete,
      onWarning: message => { if (isCurrent()) setVoiceWarning(message); }
    });
    voiceStream.current = call;
    const prepared = call.prepare(); // Activate microphone/audio in this click.
    try {
      // Attach rejection handling immediately while the session is created.
      const created = id ? Promise.resolve(id) : createCopilotSession(userId, ct('voiceConversation'), binId || undefined);
      const [chatId] = await Promise.all([created, prepared]);
      if (!isCurrent() || voiceStream.current !== call) { call.stop(); return; }
      id = chatId; setSessionId(chatId);
      await call.connect(binId);
    } catch (error) {
      call.stop();
      if (isCurrent()) { setVoiceWarning(errorText(error)); voiceStream.current = null; }
    }
  };
  const sendLiveText = () => {
    const text = query.trim();
    if (!text || !voiceStream.current || liveState === 'ended' || limitReached) return;
    if (!voiceStream.current.sendText(text)) {
      setVoiceWarning(ct('voiceNotReady'));
      return;
    }
    setQuery('');
  };
  const reviewVoiceAction = () => {
    voiceStream.current?.stop();
    voiceStream.current = null;
    setLiveState('ended');
    setVoiceMode('text');
  };
  const send = async (textToSend?: string) => {
    const text = (textToSend ?? query).trim();
    if (!text && !attached || !userId || busyRef.current || voiceStream.current || artifact || limitReached) return;
    if (text.length > 6000) {
      toast.error(ct('queryLimit'));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const turn = ++epoch.current;
    voiceService.stopListening();
    const photo = attached;
    setAttached(undefined);
    setQuery('');
    const user: ChatMessage = {
      id: `user-${crypto.randomUUID()}`,
      sender: 'user',
      text: text || ct('analyzePhoto'),
      attachedFile: photo,
      timestamp: new Date()
    };
    const placeholder: ChatMessage = {
      id: `bot-${crypto.randomUUID()}`,
      sender: 'copilot',
      text: '',
      isStreaming: true,
      timestamp: new Date()
    };
    const previous = messages;
    setMessages([...previous, user, placeholder]);
    let id = sessionId;
    try {
      if (!id) {
        id = await createCopilotSession(userId, text.slice(0, 32) || ct('imageQuery'), binId || undefined);
        if (turn !== epoch.current) return;
        setSessionId(id);
      }
      const history = previous.slice(-8).map(m => ({ sender: m.sender, text: m.text, actionProposal: m.actionProposal }));
      const requestContext = { binId, attachedImageBase64: photo?.base64, attachedImageMime: photo?.type };
      let partial = '';
      const onText = (delta: string) => {
        if (turn !== epoch.current) return;
        partial += delta;
        setMessages([...previous, user, { ...placeholder, text: partial }]);
      };
      const response = await streamQueryToBoxBinCopilot(user.text, history, requestContext, onText);
      if (turn !== epoch.current) return;
      const completed: ChatMessage = {
        ...placeholder,
        text: response.reply,
        isStreaming: false,
        actions: response.suggestedActions,
        suggestedQuestions: response.suggestedQuestions,
        actionProposal: response.actionProposal || undefined,
        isValuation: response.isValuation,
        sources: response.sources,
        searchSuggestions: response.searchSuggestions
      };
      const list = [...previous, user, completed];
      setMessages(list);
      await persist(list, id, binId, photo ? 1 : 0);
    } catch (e) {
      if (turn !== epoch.current) return;
      cancelVoice();
      const list = [...previous, user, {
        ...placeholder,
        isStreaming: false,
        text: errorText(e)
      }];
      setMessages(list);
      await persist(list, id, binId, photo ? 1 : 0);
    } finally {
      if (turn === epoch.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const updateProposal = (id: string, patch: Record<string, any>) => setMessages(old => old.map(m => m.id === id && m.actionProposal ? {
    ...m,
    actionProposal: {
      ...m.actionProposal,
      data: {
        ...m.actionProposal.data,
        ...patch
      }
    }
  } : m));
  const completeProposal = async (msgId: string, proposal: ActionProposal, resultMessage: string, status: 'executed' | 'cancelled' = 'executed', focus = binId) => {
    const list = messages.map(m => m.id === msgId ? {
      ...m,
      actionProposal: {
        ...proposal,
        status,
        resultMessage
      }
    } : m);
    setMessages(list);
    await persist(list, sessionId, focus);
  };
  const execute = async (msg: ChatMessage) => {
    setProposalError(null);
    const p = msg.actionProposal;
    if (!p || p.status === 'executed' || p.status === 'cancelled' || busyRef.current || voiceStream.current || artifact) return;
    busyRef.current = true;
    setBusy(true);
    const turn = ++epoch.current;
    try {
      if (p.type === 'generate_inventory_pdf') {
        const draft = await prepareInventoryDocument(p.data.binId || binId, p.data.title || ct('inventoryTitle'));
        if (turn === epoch.current) setArtifact({
          msgId: msg.id,
          proposal: {
            ...p,
            data: {
              ...p.data,
              documentDraft: draft
            }
          }
        });
        return;
      }
      if (p.type === 'generate_image') {
        setArtifact({
          msgId: msg.id,
          proposal: p
        });
        return;
      }
      if (p.type === 'focus_bin_chat') {
        await fetchLiveInventoryContext(userId, p.data.binId);
        if (turn !== epoch.current) return;
        setBinId(p.data.binId);
        await completeProposal(msg.id, p, ct('focusedChat', { name: p.data.binName }), 'executed', p.data.binId);
        return;
      }
      const executors = {
        create_item: executeCreateItem,
        create_bin: executeCreateBin,
        move_item: executeMoveItem,
        assign_location: executeAssignLocation,
        update_item: executeUpdateItem,
        update_bin: executeUpdateBin,
        update_location: executeUpdateLocation,
        create_location: executeCreateLocation
      };
      const executor = executors[p.type];
      await executor(userId, p.data, msg.id);
      if (turn !== epoch.current) return;
      await completeProposal(msg.id, p, ct('changeSaved'));
      toast.success(ct('savedToast'));
      await refreshContext();
    } catch (e) {
      if (turn === epoch.current) { setProposalError({ id: msg.id, text: errorText(e) }); toast.error(errorText(e)); }
    } finally {
      if (turn === epoch.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const removeSession = async (id: string) => {
    if (busyRef.current || artifact) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await deleteCopilotSession(userId, id);
      const rows = await refreshSessions();
      if (identity.current !== userId) return;
      if (sessionId === id) {
        if (rows[0]) selectSession(rows[0]); else {
          setSessionId(null);
          setMessages([welcomeMessage()]);
          setBinId(null);
        }
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      if (identity.current === userId) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const pickFile = (file?: File) => {
    if (!file || locked) return;
    if (filesCount >= MAX_FILES_PER_USER) {
      toast.error(ct('photoLimit'));
      return;
    }
    if (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error(ct('photoFormat'));
      return;
    }
    const reader = new FileReader(),
      turn = epoch.current;
    reader.onerror = () => toast.error(ct('imageReadError'));
    reader.onload = () => {
      if (turn !== epoch.current) return;
      const url = String(reader.result);
      setAttached({
        name: file.name,
        type: file.type,
        base64: url.split(',')[1],
        previewUrl: url
      });
    };
    reader.readAsDataURL(file);
  };
  const starter = (key: string) => {
    setQuery(ct(key));
    requestAnimationFrame(() => composer.current?.focus());
  };
  useEffect(() => {
    if (composer.current) { composer.current.style.height = 'auto'; composer.current.style.height = `${Math.min(112, composer.current.scrollHeight)}px`; }
    if (isOpen && !historyOpen) { scrollToBottom(false); }
  }, [query, isOpen, historyOpen, scrollToBottom]);
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: r.left,
      top: r.top,
      moved: false
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const x = e.clientX - d.x,
      y = e.clientY - d.y;
    if (Math.abs(x) + Math.abs(y) > 6) d.moved = true;
    if (d.moved) setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 56, d.left + x)),
      y: Math.max(0, Math.min(window.innerHeight - 56, d.top + y))
    });
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag.current && !drag.current.moved) setIsOpen(true);
    drag.current = null;
  };
  return <>
    {!isOpen && <button aria-label={ct('openCopilot')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => {
      drag.current = null;
    }} onKeyDown={e => {
      if (e.key === 'Enter' || e.key === ' ') setIsOpen(true);
    }} style={position ? {
      left: position.x,
      top: position.y
    } : undefined} className={`fixed z-40 size-14 rounded-2xl bg-slate-900 text-white shadow-lg flex items-center justify-center touch-none ${position ? '' : 'bottom-6 right-6'}`}>
      <Bot />
    </button>}

    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent showCloseButton={false} style={viewport} onOpenAutoFocus={event => { event.preventDefault(); scrollToBottom(false); if (window.innerWidth >= 640) composer.current?.focus(); }}
        className="!fixed !left-auto !right-0 !top-0 !translate-x-0 !translate-y-0 !w-full !max-w-none !gap-0 !rounded-none !border-0 !p-0 flex min-h-0 flex-col overflow-hidden bg-white shadow-2xl sm:!right-4 sm:!top-4 sm:!w-[min(680px,calc(100vw-2rem))] sm:!rounded-3xl sm:!border sm:border-slate-200">
        <header className="shrink-0 bg-slate-950 px-4 pb-3 pt-4 text-white sm:px-5" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/20"><Sparkles className="size-5 text-blue-200" /></div>
              <div className="min-w-0"><DialogTitle className="truncate text-base font-semibold tracking-tight text-white">BoxBin Copilot</DialogTitle><DialogDescription className="mt-0.5 truncate text-xs text-slate-400">{ct('assistantSubtitle')}</DialogDescription></div>
            </div>
            <div className="flex shrink-0 items-center">
              <Button size="icon" variant="ghost" className="size-11 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label={historyOpen ? ct('returnChat') : ct('history')} disabled={locked} onClick={() => { setHistoryOpen(!historyOpen); void refreshSessions().catch(e => setSavingError(errorText(e))); }}>{historyOpen ? <ArrowLeft className="size-4" /> : <History className="size-4" />}</Button>
              <Button size="icon" variant="ghost" className="size-11 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label={ct('newGlobalChat')} disabled={locked} onClick={() => void newSession()}><Plus className="size-5" /></Button>
              <Button size="icon" variant="ghost" className="size-11 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label={ct('close')} onClick={() => setIsOpen(false)}><X className="size-5" /></Button>
            </div>
          </div>
          <div aria-label={ct('contextLabel')} className="mt-3 flex min-w-0 items-center gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"><Box className="size-3.5 shrink-0 text-blue-200" /><span className="truncate">{binId ? context?.activeBin?.name || ct('selectedBin') : ct('globalInventory')}</span></span>
            {binId ? <button disabled={locked} className="ml-auto min-h-9 shrink-0 text-blue-200 underline-offset-4 hover:underline disabled:opacity-50" onClick={() => void newSession()}>{ct('openGlobalChat')}</button> : context && <span className="ml-auto shrink-0 text-slate-400">{ct('itemsCount', { count: context.inventoryMetrics.totalItems })}</span>}
          </div>
        </header>
        {historyOpen ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><MessageSquare className="size-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">{ct('conversations', { count: sessions.length, max: MAX_CHATS_PER_USER })}</h3></div>
          {!sessions.length && <p className="py-12 text-center text-sm text-slate-500">{ct('historyEmpty')}</p>}
          <div className="space-y-2">{sessions.map(s => <div key={s.id} className={`flex min-w-0 items-center gap-1 rounded-2xl border bg-white p-2 ${s.id === sessionId ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200'}`}>
            <button disabled={locked} onClick={() => selectSession(s)} className="min-w-0 flex-1 rounded-xl p-2 text-left"><span className="block truncate text-sm font-medium text-slate-800">{s.title}</span><span className="mt-1 block text-xs text-slate-500">{ct('chatCount', { count: s.messageCount })}</span></button>
            <Button aria-label={ct('deleteChat', { title: s.title })} size="icon" variant="ghost" className="size-11 shrink-0 rounded-xl text-slate-400 hover:text-red-600" disabled={locked} onClick={() => void removeSession(s.id)}><Trash2 className="size-4" /></Button>
          </div>)}</div>
        </div> : <>
          {callActive && voiceMode === 'voice' ? <section aria-label={ct('voiceMode')} className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 py-10 text-center text-white">
            <div className={`absolute size-56 rounded-full bg-blue-500/10 blur-2xl ${liveState === 'responding' ? 'animate-pulse' : ''}`} />
            <div className={`relative flex size-36 items-center justify-center rounded-full border border-blue-300/30 bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_0_70px_rgba(59,130,246,0.45)] ${liveState === 'responding' ? 'motion-safe:animate-[pulse_1.4s_ease-in-out_infinite]' : ''}`}>
              <AudioLines className="size-14" aria-hidden="true" />
            </div>
            <p className="relative mt-8 text-lg font-semibold">{ct(liveState === 'connecting' ? 'connecting' : liveState === 'reconnecting' ? 'reconnecting' : liveState === 'responding' ? 'speaking' : micMuted ? 'micMuted' : 'listening')}</p>
            <p className="relative mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{ct('voiceModeHint')}</p>
            <Button type="button" variant="ghost" className="relative mt-5 min-h-10 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-pressed={showCaptions} aria-label={ct(showCaptions ? 'hideCaptions' : 'showCaptions')} onClick={() => setShowCaptions(value => !value)}><Captions className="mr-2 size-4" />{ct(showCaptions ? 'hideCaptions' : 'showCaptions')}</Button>
            {showCaptions && (liveCaption.input || liveCaption.output) && <div aria-live="polite" className="relative mt-5 max-h-48 w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-left text-base leading-7 text-slate-100 shadow-lg sm:text-lg"><p className="text-xs font-semibold uppercase tracking-wide text-blue-200">{liveCaption.input ? ct('you') : ct('assistant')}</p>{liveCaption.input && <p className="mt-1 break-words">{liveCaption.input}</p>}{liveCaption.output && <p className="mt-3 break-words border-t border-white/15 pt-3">{liveCaption.output}</p>}</div>}
            {voiceProposal && <div className="relative mt-5 w-full max-w-md rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-left"><p className="text-xs font-semibold uppercase tracking-wide text-amber-200">{ct('voiceActionReady')}</p><p className="mt-1 text-sm font-semibold text-white">{titles()[voiceProposal.type] || ct('proposal')}</p><p className="mt-1 text-xs leading-relaxed text-slate-300">{ct('voiceActionHint')}</p><Button type="button" variant="secondary" className="mt-3 min-h-10 rounded-xl text-xs" onClick={reviewVoiceAction}>{ct('reviewAction')}</Button></div>}
            <div className="relative mt-8 flex items-center gap-2 text-xs text-slate-400"><span className={`size-2 rounded-full ${liveState === 'responding' ? 'bg-blue-300 animate-ping' : 'bg-emerald-400'}`} />{ct('voiceLive')}</div>
          </section> : <div ref={messagesContainer} data-testid="copilot-messages" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
            {binId && <p className="mb-3 flex items-center gap-2 text-xs text-blue-700"><ShieldCheck className="size-3.5 shrink-0" />{ct('binScope')}</p>}
            {contextError && <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">{contextError}</p>}
            {savingError && <div role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{savingError}<button disabled={locked} className="ml-2 min-h-9 underline" onClick={() => void persist(messages)}>{ct('retrySave')}</button></div>}
            <div className="space-y-5">{messages.map(msg => msg.id.startsWith('welcome-') ? <article key={msg.id} className="min-w-0 pb-2">
              {messages.length === 1 && <><div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Sparkles className="size-6" /></div><h3 className="max-w-sm text-2xl font-semibold leading-tight tracking-tight text-slate-900">{ct('welcomeTitle')}</h3><p className="mb-3 mt-2 text-sm text-slate-500">{ct('welcomeShort')}</p></>}
              <div className="text-sm leading-relaxed text-slate-600"><SafeMarkdown text={ct('welcome')} /></div>
              {messages.length === 1 && <div className="mt-5 grid grid-cols-2 gap-2">
                {([{ icon: Search, label: 'findItems', prompt: 'promptFind' }, { icon: Box, label: 'createBin', prompt: 'promptCreateBin' }, { icon: Package, label: 'addItem', prompt: 'promptCreateItem' }, { icon: MapPin, label: 'createLocation', prompt: 'promptCreateLocation' }, { icon: PencilLine, label: 'editRecord', prompt: 'promptEdit' }, { icon: FileText, label: 'inventoryReport', prompt: 'promptReport' }]).map(({ icon: Icon, label, prompt }) => <button key={prompt} type="button" disabled={locked || limitReached} onClick={() => starter(prompt)} className="group flex min-h-16 min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50"><Icon className="size-4 shrink-0 text-blue-600" /><span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{ct(label)}</span><ChevronRight className="hidden size-3.5 text-slate-300 sm:block" /></button>)}
              </div>}
              {messages.length === 1 && <div className="mt-4 flex flex-wrap gap-1.5">{welcomeMessage().suggestedQuestions?.slice(0, 2).map(q => <button key={q} disabled={locked || limitReached} onClick={() => void send(q)} className="min-h-10 rounded-xl bg-slate-50 px-3 py-2 text-left text-xs text-slate-500 hover:text-blue-700 disabled:opacity-50">{q}</button>)}</div>}
            </article> : <article key={msg.id} className={`min-w-0 ${msg.sender === 'user' ? 'ml-auto max-w-[90%]' : 'w-full'}`}>
              <div className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 ${msg.sender === 'user' ? 'justify-end' : ''}`}>{msg.sender === 'copilot' && <Sparkles className="size-3 text-blue-500" />}{ct(msg.sender === 'user' ? 'you' : 'assistant')}</div>
              <div className={msg.sender === 'user' ? 'rounded-2xl rounded-tr-md bg-slate-900 px-4 py-3 text-sm leading-relaxed text-white' : 'text-sm leading-relaxed text-slate-700'}>
                {msg.attachedFile && <div className="mb-2 break-words text-xs">{msg.attachedFile.previewUrl && <img src={msg.attachedFile.previewUrl} alt={ct('attachedPhoto')} className="mb-1 max-h-32 rounded-xl" />}{msg.attachedFile.name}{!msg.attachedFile.previewUrl && ct('photoNotStored')}</div>}
                {msg.isStreaming && !msg.text ? <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500"><Loader2 className="size-4 shrink-0 animate-spin" />{ct('thinking')}</div> : <SafeMarkdown text={msg.text} />}
              </div>
              {!!msg.sources?.length && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><p className="mb-2 font-semibold text-slate-700">{ct('webSources')}</p>{msg.sources.map((s, i) => <a key={i} href={s.url.startsWith('https://') ? s.url : undefined} target="_blank" rel="noopener noreferrer" className="block truncate py-1 text-blue-700 underline">{s.title}</a>)}<p className="mt-2 text-slate-500">{ct('priceNotice')}</p></div>}
              {msg.searchSuggestions?.map((html, i) => <SearchSuggestions key={i} html={html} />)}
              {msg.actionProposal && <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-3 sm:px-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><PencilLine className="size-4 shrink-0 text-blue-600" /><span>{titles()[msg.actionProposal.type] || ct('proposal')}</span></div><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${msg.actionProposal.status === 'executed' ? 'bg-emerald-50 text-emerald-700' : msg.actionProposal.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'}`}>{ct(msg.actionProposal.status === 'executed' ? 'savedStatus' : msg.actionProposal.status === 'cancelled' ? 'discardedStatus' : 'readyReview')}</span></div>
                <div className="space-y-4 p-3 sm:p-4">{msg.actionProposal.status === 'executed' || msg.actionProposal.status === 'cancelled' ? <>
                  <p className="break-words text-sm text-slate-600">{msg.actionProposal.resultMessage}</p>{['generate_inventory_pdf', 'generate_image'].includes(msg.actionProposal.type) && msg.actionProposal.status === 'executed' && <Button variant="outline" className="min-h-11 rounded-xl" disabled={locked} onClick={() => setArtifact({ msgId: msg.id, proposal: msg.actionProposal! })}>{ct('reopenFile')}</Button>}
                </> : <>
                  <CopilotProposalFields proposal={msg.actionProposal} disabled={locked} update={patch => updateProposal(msg.id, patch)} />
                  {proposalError?.id === msg.id && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{proposalError.text}</p>}
                  <div className="flex flex-wrap gap-2"><Button disabled={locked} onClick={() => void execute(msg)} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 text-sm text-white hover:bg-blue-700"><Check className="mr-1 size-4 shrink-0" />{ct(['generate_inventory_pdf', 'generate_image'].includes(msg.actionProposal.type) ? 'reviewFile' : 'confirmAction')}</Button><Button variant="outline" className="min-h-11 rounded-xl" disabled={locked} onClick={() => void completeProposal(msg.id, msg.actionProposal!, ct('discarded'), 'cancelled')}>{ct('discard')}</Button></div>
                </>}</div>
              </div>}
              {!!msg.actions?.length && <div className="mt-3 flex flex-wrap gap-2">{msg.actions.filter(a => /^\/(home|locations|bin-details\/[a-zA-Z0-9_-]+)$/.test(a.path)).map((a, i) => <Button key={i} variant="outline" className="min-h-11 max-w-full rounded-xl whitespace-normal text-xs" disabled={locked} onClick={() => { navigate(a.path); setIsOpen(false); }}>{a.label}<ChevronRight className="ml-1 size-3" /></Button>)}</div>}
              {!!msg.suggestedQuestions?.length && msg.id === messages[messages.length - 1]?.id && <div className="mt-3 flex flex-wrap gap-2">{msg.suggestedQuestions.map((q, i) => <button key={i} disabled={locked || limitReached} onClick={() => void send(q)} className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-left text-xs text-blue-700 disabled:opacity-50">{q}</button>)}</div>}
            </article>)}</div><div ref={bottom} />
          </div>}
          <footer className="shrink-0 border-t border-slate-100 bg-white px-3 pt-3 sm:px-5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {callActive && <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-blue-700">{ct('voiceLive')}</span><div className="flex items-center gap-1"><Button type="button" variant={voiceMode === 'voice' ? 'secondary' : 'ghost'} className="min-h-10 rounded-xl px-3 text-xs" aria-label={ct(voiceMode === 'voice' ? 'switchToText' : 'switchToVoice')} onClick={() => setVoiceMode(voiceMode === 'voice' ? 'text' : 'voice')}>{voiceMode === 'voice' ? <><MessageSquare className="mr-1.5 size-4" />{ct('switchToText')}</> : <><AudioLines className="mr-1.5 size-4" />{ct('switchToVoice')}</>}</Button><Button variant="ghost" aria-label={ct('endCall')} className="min-h-10 rounded-xl text-red-700 hover:bg-red-50" onClick={cancelVoice}><PhoneOff className="mr-1 size-4" />{ct('end')}</Button></div></div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><span role="status" className="flex items-center gap-2 text-sm font-medium text-slate-800"><span className="size-2 rounded-full bg-emerald-500" />{ct(liveState === 'connecting' ? 'connecting' : liveState === 'reconnecting' ? 'reconnecting' : liveState === 'responding' ? 'speaking' : micMuted ? 'micMuted' : 'listening')}</span><div className="flex items-center gap-1"><Button size="icon" variant="ghost" className="size-11 rounded-xl" aria-label={ct(micMuted ? 'unmuteCall' : 'muteCall')} onClick={() => { voiceStream.current?.mute(!micMuted); setMicMuted(!micMuted); }}>{micMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}</Button>{liveState === 'responding' && <Button size="icon" variant="ghost" className="size-11 rounded-xl" aria-label={ct('stopAudio')} onClick={() => voiceStream.current?.stopAudio()}><Square className="size-4" /></Button>}</div></div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{ct(voiceMode === 'voice' ? 'voiceReviewHint' : 'textCallHint')}</p>
            </div>}
            {voiceWarning && <p role="status" className="mb-2 text-xs leading-relaxed text-amber-800">{voiceWarning}</p>}
            {limitReached && <p className="mb-2 text-xs text-amber-800">{ct('maxMessages')}</p>}
            <form className={callActive && voiceMode === 'voice' ? 'hidden' : 'rounded-2xl border border-slate-200 bg-slate-50/60 p-2 transition-shadow focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50'} onSubmit={e => { e.preventDefault(); if (callActive) sendLiveText(); else void send(); }}>
              {attached && <div className="mb-2 flex min-w-0 items-center gap-2 rounded-xl border bg-white p-2 text-xs"><img src={attached.previewUrl} className="size-10 shrink-0 rounded-lg object-cover" alt={ct('photoToSend')} /><span className="min-w-0 flex-1 truncate">{attached.name}</span><Button type="button" size="icon" variant="ghost" className="size-11" aria-label={ct('removePhoto')} disabled={locked} onClick={() => setAttached(undefined)}><X className="size-4" /></Button></div>}
              <textarea ref={composer} rows={2} aria-label={ct('queryLabel')} value={query} maxLength={6000}
                onChange={e => { setQuery(e.target.value); scrollToBottom(false); }}
                onFocus={() => scrollToBottom(false)}
                disabled={(callActive ? voiceMode === 'voice' : locked) || limitReached} placeholder={ct(callActive ? 'textCallPlaceholder' : listening ? 'listeningDictation' : 'queryPlaceholder')}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); if (callActive) sendLiveText(); else void send(); } }}
                className="block max-h-28 min-h-12 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-base leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50 sm:text-sm" />
              <div className="flex items-center justify-between gap-1">
                <div className="flex min-w-0 items-center"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} /><Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 rounded-xl text-slate-500" aria-label={ct('attachPhoto')} disabled={locked || limitReached || filesCount >= MAX_FILES_PER_USER} onClick={() => fileInput.current?.click()}><Paperclip className="size-4" /></Button><Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 rounded-xl text-slate-500" aria-label={ct(listening ? 'stopDictation' : 'dictateQuery')} disabled={locked || limitReached} onClick={() => { if (!voiceService.isSupported()) { toast.error(ct('unsupportedDictation')); return; } voiceService.toggleListening(t => setQuery(t), setListening, language); }}>{listening ? <MicOff className="size-4 text-red-600" /> : <Mic className="size-4" />}</Button><button type="button" aria-label={ct('startCall')} disabled={busy || !!artifact || limitReached || !!attached} className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50" onClick={() => void startCall()}><Phone className="size-4 shrink-0" /><span>{ct('talkGemini')}</span></button></div>
                <Button type="submit" size="icon" aria-label={ct('sendQuery')} disabled={limitReached || (callActive ? !query.trim() : locked || !query.trim() && !attached)} className="size-11 shrink-0 rounded-xl bg-slate-900 text-white hover:bg-slate-800">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
              </div>
            </form>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-slate-400"><ShieldCheck className="size-3 shrink-0" />{ct('confirmHint')}</p>
            {location.pathname.startsWith('/bin-details/') && !binId && <p className="mt-1 text-center text-[10px] text-slate-400">{ct('focusHint')}</p>}
          </footer>
        </>}
      </DialogContent>
    </Dialog>

    {artifact && <CopilotArtifactEditor key={artifact.msgId} requestId={artifact.msgId} proposal={artifact.proposal} userName={currentUser?.displayName || ct('user')} binName={context?.activeBin?.name} locationName={context?.activeBin?.location?.name} onClose={() => setArtifact(null)} onComplete={(data, resultMessage) => {
      void completeProposal(artifact.msgId, {
        ...artifact.proposal,
        data
      }, resultMessage);
    }} />}
  </>;
}
