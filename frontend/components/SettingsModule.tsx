"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  getSettings,
  updateSettings,
  getSystemHealth,
  type Settings,
  type SystemHealth,
} from "@/lib/api";
import { useApp } from "@/lib/store";

// ─── Status Dot ─────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const isConnected = status === "connected";
  return (
    <div className="flex items-center gap-2">
      <motion.div
        animate={isConnected ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
        className={`w-2.5 h-2.5 rounded-full ${
          isConnected ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"
        }`}
      />
      <span className={`text-xs ${isConnected ? "text-green-400" : "text-red-400"}`}>
        {isConnected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}

// ─── Select Input ───────────────────────────────────────────────────

function SelectField({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
  description?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-white font-medium mb-1">{label}</label>
      {description && (
        <p className="text-[11px] text-slate-500 mb-2">{description}</p>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={label}
        aria-label={label}
        className="w-full bg-surface-secondary border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25 transition-all appearance-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-surface-secondary">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Component Card ─────────────────────────────────────────────────

function ComponentCard({
  title,
  icon,
  status,
  provider,
  model,
  delay,
}: {
  title: string;
  icon: string;
  status: string;
  provider: string;
  model: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <h3 className="text-sm text-white font-medium">{title}</h3>
        </div>
        <StatusDot status={status} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Provider</span>
          <span className="text-slate-300 font-mono">{provider}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Model</span>
          <span className="text-slate-300 font-mono text-right max-w-50 truncate">
            {model}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Settings Module ───────────────────────────────────────────

// Default settings when API is unavailable
const defaultSettings: Settings = {
  llm: { provider: "ollama", model: "llama3" },
  embeddings: { provider: "hf", model: "all-MiniLM-L6-v2" },
  available_providers: { llm: ["ollama", "openai"], embeddings: ["hf", "openai"] },
  available_models: {
    ollama: ["llama3", "llama3:8b-instruct-q4_K_M", "mistral", "codellama", "gemma"],
    openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    hf: ["all-MiniLM-L6-v2", "all-mpnet-base-v2", "multi-qa-MiniLM-L6-cos-v1"],
  },
};

export default function SettingsModule() {
  const { capabilities } = useApp();
  const settingsUnavailable = Boolean(capabilities && !capabilities.modules.settings);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);

  // Form state
  const [llmProvider, setLlmProvider] = useState(defaultSettings.llm.provider);
  const [llmModel, setLlmModel] = useState(defaultSettings.llm.model);
  const [embProvider, setEmbProvider] = useState(defaultSettings.embeddings.provider);
  const [embModel, setEmbModel] = useState(defaultSettings.embeddings.model);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, h] = await Promise.all([getSettings(), getSystemHealth()]);
        setSettings(s);
        setHealth(h);
        setLlmProvider(s.llm.provider);
        setLlmModel(s.llm.model);
        setEmbProvider(s.embeddings.provider);
        setEmbModel(s.embeddings.model);
        setApiOnline(true);
      } catch {
        // API not available, use defaults
        setApiOnline(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        llm_provider: llmProvider,
        llm_model: llmModel,
        embeddings_provider: embProvider,
        embeddings_model: embModel,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // Refresh health
      const h = await getSystemHealth();
      setHealth(h);
    } catch {
      // Handle error
    }
    setSaving(false);
  };

  const llmModels = (settings.available_models && llmProvider && settings.available_models[llmProvider]) || [];
  const embModels = (settings.available_models && embProvider && settings.available_models[embProvider]) || [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-12 space-y-10">
        {settingsUnavailable && (
          <div className="glass rounded-xl p-4 border border-yellow-500/20 text-xs text-yellow-200 w-full">
            Settings API is temporarily unreachable. Showing last known/default values.
          </div>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
        >
          <h1 className="text-2xl font-bold text-white mb-1">
            System <span className="text-gradient">Settings</span>
          </h1>
          <p className="text-sm text-slate-400">
            Configure AI providers, models, and system parameters
          </p>
          <div className="mt-4">
            <button
              onClick={async () => {
                try {
                  const h = await getSystemHealth();
                  setHealth(h);
                } catch {
                  // No-op: health polling is optional
                }
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-cyan-400/20 text-cyan-300 hover:bg-cyan-400/10 transition-colors"
            >
              Refresh System Status
            </button>
          </div>
        </motion.div>

        {/* API Status Banner */}
        {!apiOnline && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl p-5 border border-yellow-500/20 flex items-center gap-3 w-full"
          >
            <span className="text-yellow-400">⚠️</span>
            <p className="text-xs text-yellow-300">
              Backend API is offline. Showing default configuration. Start the API server to manage live settings.
            </p>
          </motion.div>
        )}

        {/* System Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
        >
          <h2 className="text-sm text-slate-400 font-medium mb-3">
            System Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ComponentCard
              title="Language Model"
              icon="🧠"
              status={health?.components?.llm?.status || "disconnected"}
              provider={health?.components?.llm?.provider || "—"}
              model={health?.components?.llm?.model || "—"}
              delay={0}
            />
            <ComponentCard
              title="Embeddings"
              icon="🔮"
              status={health?.components?.embeddings?.status || "disconnected"}
              provider={health?.components?.embeddings?.provider || "—"}
              model={health?.components?.embeddings?.model || "—"}
              delay={0.05}
            />
            <ComponentCard
              title="Vector Store"
              icon="💾"
              status={health?.components?.vector_store?.status || "disconnected"}
              provider={health?.components?.vector_store?.type || "—"}
              model="ChromaDB"
              delay={0.1}
            />
          </div>
        </motion.div>

        {/* Configuration */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-7 md:p-8 w-full"
        >
          <h2 className="text-sm text-white font-semibold mb-5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center text-sm">⚙️</span>
            LLM Configuration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SelectField
              label="Provider"
              value={llmProvider}
              options={settings?.available_providers.llm || ["ollama", "openai"]}
              onChange={(v) => {
                setLlmProvider(v);
                // Reset model when provider changes
                const models = settings?.available_models[v] || [];
                if (models.length > 0) setLlmModel(models[0]);
              }}
              description="Select the LLM provider for AI responses"
            />
            <SelectField
              label="Model"
              value={llmModel}
              options={llmModels}
              onChange={setLlmModel}
              description="Choose the specific model to use"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-7 md:p-8 w-full"
        >
          <h2 className="text-sm text-white font-semibold mb-5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center text-sm">🔮</span>
            Embeddings Configuration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SelectField
              label="Provider"
              value={embProvider}
              options={settings?.available_providers.embeddings || ["hf", "openai"]}
              onChange={(v) => {
                setEmbProvider(v);
                const models = settings?.available_models[v] || [];
                if (models.length > 0) setEmbModel(models[0]);
              }}
              description="Select the embeddings provider"
            />
            <SelectField
              label="Model"
              value={embModel}
              options={embModels}
              onChange={setEmbModel}
              description="Choose the embeddings model"
            />
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="w-full flex justify-end pt-2"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              saved
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-linear-to-r from-indigo-600 to-purple-600 text-white shadow-glow hover:shadow-glow-lg"
            } disabled:opacity-50`}
            id="save-settings"
          >
            {saving ? "Saving..." : saved ? "✓ Saved" : "Save Changes"}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
