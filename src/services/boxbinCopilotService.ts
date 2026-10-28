import { copilotText as ct, copilotLanguage, copilotError } from '@/lib/copilotI18n';
import { supabase } from "@/lib/supabase";
export const MAX_CHATS_PER_USER = 10;
export const MAX_FILES_PER_USER = 15;
export const MAX_MESSAGES_PER_CHAT = 20;
export interface CopilotAction {
  label: string;
  path: string;
  actionType: "navigate" | "info" | "open_tab";
  payload?: any;
}
export type ActionProposalType = "create_item" | "create_bin" | "move_item" | "assign_location" | "create_location" | "update_item" | "update_bin" | "update_location" | "focus_bin_chat" | "generate_inventory_pdf" | "generate_image";
export interface ActionProposal {
  type: ActionProposalType;
  data: Record<string, any>;
  status?: "pending" | "executed" | "cancelled";
  resultMessage?: string;
}
export interface CopilotResponse {
  reply: string;
  suggestedActions: CopilotAction[];
  suggestedQuestions: string[];
  actionProposal?: ActionProposal | null;
  isValuation?: boolean;
  sources?: {
    title: string;
    url: string;
  }[];
  searchSuggestions?: string[];
}
export interface ChatMessage {
  id: string;
  sender: "user" | "copilot";
  text: string;
  attachedFile?: {
    name: string;
    type: string;
    previewUrl?: string;
    base64?: string;
    fileObj?: File;
  };
  isStreaming?: boolean;
  isValuation?: boolean;
  sources?: {
    title: string;
    url: string;
  }[];
  searchSuggestions?: string[];
  actions?: CopilotAction[];
  suggestedQuestions?: string[];
  actionProposal?: ActionProposal;
  timestamp: Date;
}
export interface CopilotChatSession {
  id: string;
  userId: string;
  binId?: string;
  title: string;
  createdAt: any;
  updatedAt: any;
  messageCount: number;
  filesCount: number;
  messages: ChatMessage[];
}
export interface CopilotUsageStats {
  totalFilesUploaded: number;
  maxFilesAllowed: number;
  maxMessagesPerChat: number;
  maxChatsAllowed: number;
}
export function openBinCopilot(binId = '', binName?: string) {
  window.dispatchEvent(new CustomEvent('open-bin-copilot', {
    detail: {
      binId,
      binName
    }
  }));
}
export function normalizeText(value: unknown) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
const storageKey = (userId: string) => `boxbin_copilot_sessions_${userId}`;
// Do not persist photos/base64 or provider-generated HTML in localStorage or chat rows.
function persistedMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(({
    attachedFile,
    searchSuggestions: _html,
    ...m
  }) => ({
    ...m,
    isStreaming: false,
    ...(attachedFile ? {
      attachedFile: {
        name: attachedFile.name,
        type: attachedFile.type
      }
    } : {})
  }));
}
export function loadLocalSessions(userId: string): CopilotChatSession[] {
  if (!userId) return [];
  try {
    const rows = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter(s => s.userId === userId && Array.isArray(s.messages)).slice(0, MAX_CHATS_PER_USER).map(s => ({
      ...s,
      messages: persistedMessages(s.messages).map(m => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }))
    }));
  } catch {
    return [];
  }
}
function saveLocalSessions(userId: string, sessions: CopilotChatSession[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(sessions.map(s => ({
      ...s,
      messages: persistedMessages(s.messages)
    }))));
  } catch {/* Supabase remains authoritative; browser cache is optional. */}
}
export async function loadCopilotSessions(userId: string): Promise<CopilotChatSession[]> {
  const {
    data,
    error
  } = await supabase.from('copilot_chats').select('*').eq('userId', userId).order('updatedAt', {
    ascending: false
  }).limit(MAX_CHATS_PER_USER);
  if (error) throw new Error(ct('historyError'));
  // Import the previous local-only implementation once, preserving conversations without photos.
  const marker = `boxbin_copilot_imported_${userId}`;
  const legacy = loadLocalSessions(userId);
  let imported = false;
  try {
    imported = localStorage.getItem(marker) === '1';
  } catch {/* optional cache */}
  if (!imported && !data?.length && legacy.length) {
    const rows = legacy.map(s => ({
      id: s.id,
      userId,
      binId: s.binId || null,
      title: String(s.title || ct('inventoryQuery')).slice(0, 160),
      messages: persistedMessages(s.messages.slice(-21)),
      messageCount: Math.min(s.messages.length, 21),
      filesCount: s.filesCount || 0
    }));
    const {
      error: importError
    } = await supabase.from('copilot_chats').upsert(rows, {
      onConflict: 'id',
      ignoreDuplicates: true
    });
    if (importError) throw new Error(ct('historyImportError'));
    try {
      localStorage.setItem(marker, '1');
    } catch {/* server rows prevent reimport */}
    return loadCopilotSessions(userId);
  }
  try {
    localStorage.setItem(marker, '1');
  } catch {/* optional cache */}
  const sessions = (data || []).map(s => ({
    ...s,
    messages: persistedMessages(s.messages || []).map(m => ({
      ...m,
      timestamp: new Date(m.timestamp)
    }))
  })) as CopilotChatSession[];
  saveLocalSessions(userId, sessions);
  return sessions;
}
export const welcomeMessage = (): ChatMessage => ({
  id: `welcome-${crypto.randomUUID()}`,
  sender: 'copilot',
  timestamp: new Date(),
  text: ct('welcome'),
  suggestedQuestions: [ct('questionTools'), ct('questionValue'), ct('questionGarage')]
});
export async function createCopilotSession(userId: string, title = ct('inventoryQuery'), binId?: string): Promise<string> {
  if (!userId) throw new Error(ct('signIn'));
  const sessions = await loadCopilotSessions(userId);
  if (sessions.length >= MAX_CHATS_PER_USER) throw new Error(ct('chatLimit'));
  const id = `session-${crypto.randomUUID()}`;
  const session: CopilotChatSession = {
    id,
    userId,
    title: title.trim().slice(0, 160) || ct('inventoryQuery'),
    binId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filesCount: 0,
    messageCount: 1,
    messages: [welcomeMessage()]
  };
  const {
    error
  } = await supabase.from('copilot_chats').insert({
    ...session,
    binId: binId || null
  });
  if (error) throw new Error(ct('createChatError'));
  saveLocalSessions(userId, [session, ...sessions]);
  return id;
}
export async function saveSessionMessages(userId: string, sessionId: string, messages: ChatMessage[], titleUpdate?: string, filesCountIncrement = 0, binId?: string | null): Promise<void> {
  const rows = loadLocalSessions(userId),
    session = rows.find(s => s.id === sessionId);
  const payload = {
    messages: persistedMessages(messages),
    messageCount: messages.length,
    filesCount: (session?.filesCount || 0) + filesCountIncrement,
    updatedAt: new Date().toISOString(),
    ...(titleUpdate ? {
      title: titleUpdate.slice(0, 160)
    } : {}),
    ...(binId !== undefined ? {
      binId
    } : {})
  };
  const {
    data,
    error
  } = await supabase.from('copilot_chats').update(payload).eq('id', sessionId).eq('userId', userId).select('id').single();
  if (error || !data) throw new Error(ct('saveHistoryError'));
  if (session) {
    Object.assign(session, payload);
    saveLocalSessions(userId, rows);
  }
}
export async function deleteCopilotSession(userId: string, sessionId: string): Promise<void> {
  const {
    error
  } = await supabase.from('copilot_chats').delete().eq('id', sessionId).eq('userId', userId);
  if (error) throw new Error(ct('deleteChatError'));
  saveLocalSessions(userId, loadLocalSessions(userId).filter(s => s.id !== sessionId));
}
async function invoke<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const {
    data,
    error
  } = await supabase.functions.invoke(name, {
    body: { ...body, language: copilotLanguage() }
  });
  if (error) {
    let detail: any;
    try {
      detail = await error.context?.json();
    } catch {/* offline/invalid response */}
    // Keep the user-facing message curated, but leave a safe diagnostic in
    // DevTools so a 503 can be tied to the server contract without exposing
    // provider responses or credentials.
    console.error('Copilot function error', {
      function: name,
      status: error.context?.status,
      code: detail?.code
    });
    // Only display the curated error contract from our server, never provider exceptions.
    throw new Error(copilotError(detail?.code));
  }
  if (!data || data.error) throw new Error(ct('responseUnavailable'));
  return data;
}
export async function fetchLiveInventoryContext(_userId: string, activeBinId?: string | null) {
  return await invoke('boxbin-copilot', {
    operation: 'context',
    binId: activeBinId || null
  });
}
export async function streamQueryToBoxBinCopilot(query: string, chatHistory: {
  sender: string;
  text: string;
  actionProposal?: ActionProposal;
}[], context: any, onChunk: (text: string) => void): Promise<CopilotResponse> {
  const response = await invoke<CopilotResponse>('boxbin-copilot', {
    query,
    chatHistory,
    binId: context.binId || null,
    context: {
      attachedImageBase64: context.attachedImageBase64,
      attachedImageMime: context.attachedImageMime
    }
  });
  if (typeof response.reply !== 'string' || !Array.isArray(response.suggestedActions) || !Array.isArray(response.suggestedQuestions)) throw new Error(ct('invalidResponse'));
  onChunk(response.reply);
  return response;
}
async function execute(type: string, data: Record<string, any>, requestId: string) {
  const result = await invoke('boxbin-copilot', {
    operation: 'execute',
    type,
    data,
    requestId
  });
  window.dispatchEvent(new CustomEvent('boxbin-inventory-changed'));
  return result;
}
export const executeCreateItem = (_userId: string, data: Record<string, any>, requestId: string): Promise<{
  itemId: string;
  name: string;
}> => execute('create_item', data, requestId);
export const executeCreateBin = (_userId: string, data: Record<string, any>, requestId: string): Promise<{
  binId: string;
  name: string;
}> => execute('create_bin', data, requestId);
export const executeMoveItem = (_userId: string, data: Record<string, any>, requestId: string): Promise<{
  message: string;
}> => execute('move_item', data, requestId);
export const executeAssignLocation = (_userId: string, data: Record<string, any>, requestId: string): Promise<{
  message: string;
}> => execute('assign_location', data, requestId);
export const executeCreateLocation = (_userId: string, data: Record<string, any>, requestId: string): Promise<{
  locationId: string;
  name: string;
}> => execute('create_location', data, requestId);
export const executeUpdateItem = (_userId: string, data: Record<string, any>, requestId: string) => execute('update_item', data, requestId);
export const executeUpdateBin = (_userId: string, data: Record<string, any>, requestId: string) => execute('update_bin', data, requestId);
export const executeUpdateLocation = (_userId: string, data: Record<string, any>, requestId: string) => execute('update_location', data, requestId);
export const prepareInventoryDocument = (
  binId: string | null,
  title: string,
  language?: string,
  timeZone?: string
) => invoke('boxbin-copilot', {
  operation: 'document',
  binId,
  title,
  language: language || copilotLanguage(),
  timeZone: timeZone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined)
});
export function generateCopilotImage(prompt: string, aspectRatio: string, requestId: string): Promise<{
  base64: string;
  mimeType: string;
}> {
  return invoke('boxbin-image', {
    prompt,
    aspectRatio,
    requestId
  });
}
export function retrieveCopilotImage(requestId: string): Promise<{
  image: {
    base64: string;
    mimeType: string;
  } | null;
}> {
  return invoke('boxbin-image', {
    requestId,
    retrieveOnly: true
  });
}
export const searchInventoryOptions = (search = '', offset = 0) => invoke('boxbin-copilot', {
  operation: 'context',
  search,
  offset
});
