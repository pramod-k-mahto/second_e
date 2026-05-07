import { api } from '../api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
}

export async function sendChatMessage(companyId: number, messages: ChatMessage[]): Promise<string> {
  const { data } = await api.post<ChatResponse>(`/companies/${companyId}/chat`, { messages });
  return data.reply;
}
