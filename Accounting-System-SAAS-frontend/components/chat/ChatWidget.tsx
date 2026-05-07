import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, sendChatMessage } from '@/lib/chat/api';
import { api } from '@/lib/api';

interface ChatbotConfig {
  name: string;
  tagline: string;
  welcome_message: string;
  offline_message: string;
  contact_email: string;
  contact_phone: string;
  language: string;
  show_contact_button: boolean;
}

interface ChatWidgetProps {
  companyId: number;
}

export function ChatWidget({ companyId }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleChat = () => setIsOpen(!isOpen);

  // Fetch config on mount
  useEffect(() => {
    async function fetchConfig() {
      try {
        const { data } = await api.get(`/companies/${companyId}/settings`);
        if (data.ai_chatbot_config) {
          setConfig(data.ai_chatbot_config);
        }
      } catch (error) {
        console.error("Failed to fetch chatbot config", error);
      }
    }
    fetchConfig();
  }, [companyId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newContext = [...messages, newMsg];
    
    setMessages(newContext);
    setInput('');
    setIsLoading(true);

    try {
      const reply = await sendChatMessage(companyId, newContext);
      setMessages([...newContext, { role: 'assistant', content: reply }]);
    } catch (error: any) {
      console.error("Chat error", error);
      const errorMsg = error.response?.data?.detail || config?.offline_message || 'An error occurred while connecting to the AI service.';
      setMessages([
        ...newContext, 
        { role: 'assistant', content: errorMsg }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 sm:w-96 min-h-[400px] h-[60vh] max-h-[600px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300 ease-out">
          {/* Header */}
          <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between text-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="overflow-hidden">
                <h3 className="font-semibold text-sm truncate">{config?.name || "AI Assistant"}</h3>
                <p className="text-[10px] opacity-80 truncate">{config?.tagline || "Powered by Antigravity"}</p>
              </div>
            </div>
            <button 
              onClick={toggleChat}
              className="p-1 hover:bg-white/20 rounded-full transition-colors focus:outline-none"
              aria-label="Close Chat"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-80 text-center px-6 space-y-4">
                <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-600">Welcome!</p>
                  <p className="text-xs leading-relaxed">
                    {config?.welcome_message || "Hello! I'm your AI assistant. How can I assist you with your work today?"}
                  </p>
                </div>
                
                {config?.show_contact_button && (
                  <div className="pt-2 flex flex-col gap-2 w-full">
                    {config.contact_email && (
                      <a href={`mailto:${config.contact_email}`} className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-all text-slate-500 font-medium truncate">
                        Email: {config.contact_email}
                      </a>
                    )}
                    {config.contact_phone && (
                      <a href={`tel:${config.contact_phone}`} className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-all text-slate-500 font-medium truncate">
                        Phone: {config.contact_phone}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed relative ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/20' 
                        : 'bg-white border text-slate-700 border-slate-200 rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-slate-100 shadow-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-100">
            <form onSubmit={handleSend} className="flex items-end gap-2 relative">
              <textarea
                className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none overflow-hidden placeholder:text-slate-400 shadow-inner"
                rows={1}
                placeholder="Message AI..."
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // auto-grow
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm active:scale-95"
              >
                <svg className="w-4 h-4 translate-x-px translate-y-px" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </form>
            <div className="text-[10px] text-center text-slate-400 mt-2">
               AI can make mistakes. Verify critical actions.
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          className="group flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 hover:scale-110 active:scale-95 transition-all duration-300 ease-out border border-white/10"
          aria-label="Open AI Assistant"
        >
          <svg className="w-6 h-6 transform group-hover:-rotate-12 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default ChatWidget;
