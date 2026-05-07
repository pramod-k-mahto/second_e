"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";

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

interface CompanySettings {
  ai_provider: string | null;
  ai_model: string | null;
  ai_api_key: string | null;
  ai_temperature: number | null;
  ai_max_tokens: number | null;
  ai_system_prompt: string | null;
  ai_permissions: Record<string, boolean> | null;
  ai_chatbot_config: ChatbotConfig | null;
}

const DEFAULT_CHATBOT_CONFIG: ChatbotConfig = {
  name: "AI Assistant",
  tagline: "How can I help you today?",
  welcome_message: "Hello! I'm your AI assistant. Ask me anything about your orders, tasks, or business data.",
  offline_message: "We are currently offline. Please leave your message and we'll get back to you soon.",
  contact_email: "",
  contact_phone: "",
  language: "en",
  show_contact_button: true,
};

const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o (Recommended)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast & Cheap)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  google: [
    { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro (Latest)" },
    { value: "gemini-3.1-flash", label: "Gemini 3.1 Flash (Fastest)" },
    { value: "gemini-3-pro", label: "Gemini 3 Pro" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
  mistral: [
    { value: "mistral-large-latest", label: "Mistral Large" },
    { value: "mistral-medium-latest", label: "Mistral Medium" },
    { value: "mistral-small-latest", label: "Mistral Small" },
  ],
  groq: [
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
  cohere: [
    { value: "command-r-plus", label: "Command R+" },
    { value: "command-r", label: "Command R" },
  ],
};

const PERMISSION_LABELS: Record<string, { label: string; description: string }> = {
  can_read_tasks: { label: "Read Tasks", description: "View and query open tasks and their statuses." },
  can_read_orders: { label: "Read Orders", description: "Fetch sales and purchase order summaries." },
  can_create_tasks: { label: "Create Tasks", description: "Allow the AI to create new tasks on behalf of users." },
  can_update_orders: { label: "Update Orders", description: "Allow the AI to modify existing orders (e.g., change status)." },
  can_read_ledger: { label: "Read Ledger", description: "Access account and ledger balance information." },
  can_read_inventory: { label: "Read Inventory", description: "Query stock levels and item details." },
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ne", label: "Nepali (नेपाली)" },
  { value: "hi", label: "Hindi (हिन्दी)" },
  { value: "zh", label: "Chinese (中文)" },
  { value: "ar", label: "Arabic (عربي)" },
  { value: "fr", label: "French (Français)" },
  { value: "es", label: "Spanish (Español)" },
  { value: "de", label: "German (Deutsch)" },
  { value: "ja", label: "Japanese (日本語)" },
];

function SectionHeader({ number, title, icon }: { number: number; title: string; icon: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-sm font-bold shrink-0">
        {number}
      </span>
      <span className="flex items-center gap-2">{icon} {title}</span>
    </h2>
  );
}

function InputField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const INPUT_CLS = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all dark:border-slate-700 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400";
const TEXTAREA_CLS = `${INPUT_CLS} resize-y min-h-[80px]`;

export default function AIAssistantSettingsPage() {
  const { companyId } = useParams() as { companyId: string };
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Provider section
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [prompt, setPrompt] = useState("");

  // Permissions section
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    can_read_tasks: true,
    can_read_orders: true,
    can_create_tasks: false,
    can_update_orders: false,
    can_read_ledger: false,
    can_read_inventory: false,
  });

  // Chatbot profile section
  const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfig>(DEFAULT_CHATBOT_CONFIG);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await api.get<CompanySettings>(`/companies/${companyId}/settings`);
        setProvider(data.ai_provider || "openai");
        setModel(data.ai_model || "gpt-4o");
        setApiKey(data.ai_api_key || "");
        setTemperature(data.ai_temperature ?? 0.7);
        setMaxTokens(data.ai_max_tokens ?? 1024);
        setPrompt(data.ai_system_prompt || "");
        if (data.ai_permissions) {
          setPermissions((prev) => ({ ...prev, ...data.ai_permissions }));
        }
        if (data.ai_chatbot_config) {
          setChatbotConfig((prev) => ({ ...prev, ...data.ai_chatbot_config }));
        }
      } catch {
        showToast({ title: "Error", description: "Could not load AI settings", variant: "error" });
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [companyId]);

  // Reset model if provider changes to a valid one
  useEffect(() => {
    const models = PROVIDER_MODELS[provider.toLowerCase()];
    if (models && models.length > 0) {
      if (!models.find(m => m.value === model)) {
        setModel(models[0].value);
      }
    }
  }, [provider]);

  const togglePermission = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateConfig = (key: keyof ChatbotConfig, value: string | boolean) => {
    setChatbotConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/companies/${companyId}/settings`, {
        ai_provider: provider,
        ai_model: model,
        ai_api_key: apiKey || undefined,
        ai_temperature: temperature,
        ai_max_tokens: maxTokens,
        ai_system_prompt: prompt,
        ai_permissions: permissions,
        ai_chatbot_config: chatbotConfig,
      });
      showToast({ title: "Saved", description: "AI Assistant settings updated successfully.", variant: "success" });
      setIsEditing(false);
    } catch (err: any) {
      showToast({
        title: "Error",
        description: err.response?.data?.detail || "Could not save settings",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <svg className="animate-spin w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <span className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              AI Assistant Configuration
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Configure the AI engine, set permissions, and personalise the chatbot&apos;s appearance and contact information.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-md shadow-indigo-200 dark:shadow-none active:scale-95 flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Modify
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  window.location.reload(); // Hard refresh to reset all complex states easily
                }}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium transition-all shadow-sm text-sm"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 rounded-xl font-bold transition-all shadow-sm text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <fieldset disabled={!isEditing || saving} className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <SectionHeader number={1} title="AI Provider & Engine" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
            </svg>
          } />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="AI Provider">
              <select className={INPUT_CLS} value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="openai">OpenAI (GPT-4o, etc.)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="google">Google (Gemini)</option>
                <option value="mistral">Mistral AI</option>
                <option value="groq">Groq (Llama, Gemma, Mixtral)</option>
                <option value="cohere">Cohere</option>
              </select>
            </InputField>
            
            <InputField label="AI Model">
              <select className={INPUT_CLS} value={model} onChange={(e) => setModel(e.target.value)}>
                {PROVIDER_MODELS[provider.toLowerCase()]?.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
                {!PROVIDER_MODELS[provider.toLowerCase()] && (
                  <option value="default">Default Model</option>
                )}
              </select>
            </InputField>

            <InputField label="API Key" hint="Leave blank to keep your existing key unchanged.">
              <input
                type="password"
                className={INPUT_CLS}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </InputField>

            <div className="grid grid-cols-2 gap-3">
              <InputField label="Temperature" hint="0.0 - 1.0 (Low = factual, High = creative)">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1.5"
                  className={INPUT_CLS}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                />
              </InputField>
              <InputField label="Max Tokens" hint="Max words per response">
                <input
                  type="number"
                  step="128"
                  min="128"
                  max="4096"
                  className={INPUT_CLS}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                />
              </InputField>
            </div>
          </div>
          <InputField label="System Prompt / Strategy" hint="Custom instructions the AI will always follow. E.g., tone, constraints, company context.">
            <textarea
              rows={3}
              className={TEXTAREA_CLS}
              placeholder="E.g., You are a helpful assistant for ABC Corp. Always reply professionally and never share financial details with customers."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </InputField>
        </div>

        {/* ─── Section 2: Chatbot Profile ─── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <SectionHeader number={2} title="Chatbot Profile & Appearance" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          } />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Chatbot Name" hint="The name displayed in the chat widget header.">
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="e.g., Assist, Aria, Support Bot"
                value={chatbotConfig.name}
                onChange={(e) => updateConfig("name", e.target.value)}
              />
            </InputField>
            <InputField label="Tagline" hint="Short subtitle shown under the chatbot name.">
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="e.g., Ask me anything!"
                value={chatbotConfig.tagline}
                onChange={(e) => updateConfig("tagline", e.target.value)}
              />
            </InputField>
          </div>
          <InputField label="Welcome Message" hint="The first message users see when they open the chat.">
            <textarea
              rows={2}
              className={TEXTAREA_CLS}
              placeholder="e.g., Hello! I'm your AI assistant. How can I help you today?"
              value={chatbotConfig.welcome_message}
              onChange={(e) => updateConfig("welcome_message", e.target.value)}
            />
          </InputField>
          <InputField label="Offline / Unavailable Message" hint="Shown when the AI cannot process requests (e.g., missing API key).">
            <textarea
              rows={2}
              className={TEXTAREA_CLS}
              placeholder="e.g., We're currently offline. Please contact us directly."
              value={chatbotConfig.offline_message}
              onChange={(e) => updateConfig("offline_message", e.target.value)}
            />
          </InputField>
          <InputField label="Response Language" hint="Primary language for AI responses.">
            <select
              className={INPUT_CLS}
              value={chatbotConfig.language}
              onChange={(e) => updateConfig("language", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </InputField>
        </div>

        {/* ─── Section 3: Contact Details ─── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <SectionHeader number={3} title="Contact Information" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          } />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Contact Email" hint="Displayed to users when they ask for human support.">
              <input
                type="email"
                className={INPUT_CLS}
                placeholder="support@yourcompany.com"
                value={chatbotConfig.contact_email}
                onChange={(e) => updateConfig("contact_email", e.target.value)}
              />
            </InputField>
            <InputField label="Contact Phone" hint="Optional phone number displayed for human support.">
              <input
                type="tel"
                className={INPUT_CLS}
                placeholder="+977-980-0000000"
                value={chatbotConfig.contact_phone}
                onChange={(e) => updateConfig("contact_phone", e.target.value)}
              />
            </InputField>
          </div>
          {/* Show Contact Button Toggle */}
          <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${chatbotConfig.show_contact_button ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              checked={chatbotConfig.show_contact_button}
              onChange={(e) => updateConfig("show_contact_button", e.target.checked)}
            />
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Show &quot;Contact Us&quot; Button</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Display a quick-contact shortcut in the chat widget so users can reach your team directly.
              </div>
            </div>
          </label>
        </div>

        {/* ─── Section 4: AI Permissions ─── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <SectionHeader number={4} title="AI Permissions" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          } />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Control exactly what the AI is allowed to do. Disabled permissions are never exposed as tools to the LLM.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(PERMISSION_LABELS).map(([key, { label, description }]) => {
              const val = !!permissions[key];
              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                    val
                      ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-900/20"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={val}
                    onChange={() => togglePermission(key)}
                  />
                  <div>
                    <div className={`text-sm font-medium ${val ? "text-indigo-900 dark:text-indigo-200" : "text-slate-700 dark:text-slate-300"}`}>
                      {label}
                    </div>
                    <div className="text-[11px] mt-0.5 text-slate-500 dark:text-slate-400">{description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        </fieldset>
        {/* ─── Save Button ─── */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !isEditing}
            className="inline-flex items-center gap-2 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-md shadow-indigo-200 dark:shadow-none active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
