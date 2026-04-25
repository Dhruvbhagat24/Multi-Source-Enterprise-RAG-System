"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ─────────────────────────────────────────────────────────── */

type SettingsTab = "general" | "account";

/* ─── Icons ─────────────────────────────────────────────────────────── */

const icons = {
  user: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  dots: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  ),
  monitor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

/* ─── Custom Select ─────────────────────────────────────────────────── */

function CustomSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-[13px] transition-all outline-none"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 10,
          padding: "10px 14px",
          color: selected ? "#fff" : "rgba(255,255,255,0.4)",
        }}
      >
        <span>{selected?.label || placeholder || "Select…"}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          {icons.chevronDown}
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 z-50 rounded-xl"
            style={{
              top: "calc(100% + 4px)",
              background: "rgba(18,18,32,0.98)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              padding: 4,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-lg text-[13px] transition-colors hover:bg-white/5 ${
                  value === opt.value ? "text-indigo-400 font-medium" : "text-slate-300"
                }`}
                style={{ padding: "8px 12px" }}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Tab Button ────────────────────────────────────────────────────── */

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all ${
        active ? "text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
      }`}
      style={{ padding: "9px 12px" }}
    >
      {active && (
        <motion.div
          layoutId="settings-tab-highlight"
          className="absolute inset-0 rounded-lg"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        />
      )}
      <span className="relative z-10" style={{ color: active ? "#818cf8" : undefined }}>
        {icon}
      </span>
      <span className="relative z-10">{label}</span>
    </button>
  );
}

/* ─── Active Sessions Data ──────────────────────────────────────────── */

const activeSessions = [
  {
    id: "1",
    device: "Chrome (Windows)",
    location: "Ahmedabad, Gujarat, IN",
    created: "Apr 9, 2026, 1:30 PM",
    updated: "Apr 24, 2026, 2:22 PM",
    isCurrent: true,
  },
  {
    id: "2",
    device: "Android (Android)",
    location: "Ahmedabad, Gujarat, IN",
    created: "Apr 13, 2026, 8:09 AM",
    updated: "Apr 24, 2026, 9:07 AM",
    isCurrent: false,
  },
];

/* ─── General Tab ───────────────────────────────────────────────────── */

function GeneralTab() {
  const [fullName, setFullName] = useState("Dhruv Bhagat");
  const [displayName, setDisplayName] = useState("Dhruv");
  const [role, setRole] = useState("");
  const [preferences, setPreferences] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      {/* Profile Section */}
      <div style={{ marginBottom: 32 }}>
        <h2
          className="text-[15px] font-semibold text-white"
          style={{ marginBottom: 20 }}
        >
          Profile
        </h2>

        {/* Name Row */}
        <div className="grid grid-cols-2 gap-5" style={{ marginBottom: 20 }}>
          <div>
            <label
              className="block text-[12px] font-medium text-slate-400"
              style={{ marginBottom: 6 }}
            >
              Full name
            </label>
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "linear-gradient(135deg, #06b6d4, #6366f1)",
                }}
              >
                <span className="text-[11px] font-bold text-white">DB</span>
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="flex-1 text-[13px] text-white outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  padding: "10px 14px",
                }}
                placeholder="Your full name"
              />
            </div>
          </div>
          <div>
            <label
              className="block text-[12px] font-medium text-slate-400"
              style={{ marginBottom: 6 }}
            >
              What should the AI call you? *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full text-[13px] text-white outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 10,
                padding: "10px 14px",
              }}
              placeholder="Display name"
            />
          </div>
        </div>

        {/* Role Selection */}
        <div style={{ marginBottom: 20 }}>
          <label
            className="block text-[12px] font-medium text-slate-400"
            style={{ marginBottom: 6 }}
          >
            What best describes your work?
          </label>
          <CustomSelect
            value={role}
            options={[
              { value: "engineer", label: "Software Engineer" },
              { value: "data-scientist", label: "Data Scientist" },
              { value: "researcher", label: "Researcher" },
              { value: "analyst", label: "Data Analyst" },
              { value: "product-manager", label: "Product Manager" },
              { value: "designer", label: "Designer" },
              { value: "student", label: "Student" },
              { value: "other", label: "Other" },
            ]}
            onChange={setRole}
            placeholder="Select your role"
          />
        </div>

        {/* Preferences */}
        <div style={{ marginBottom: 24 }}>
          <label
            className="block text-[12px] font-medium text-slate-400"
            style={{ marginBottom: 4 }}
          >
            What personal preferences should the AI consider in responses?
          </label>
          <p
            className="text-[11px] text-slate-500"
            style={{ marginBottom: 8 }}
          >
            Your preferences will apply to all conversations.
          </p>
          <textarea
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            rows={4}
            className="w-full resize-none text-[13px] text-white outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
            placeholder="e.g. when learning new concepts, I find analogies particularly helpful"
          />
        </div>

        {/* Save */}
        <div className="flex justify-end" style={{ marginTop: 20 }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            className="text-[12px] font-medium transition-all"
            style={{
              padding: "9px 24px",
              borderRadius: 10,
              background: saved
                ? "rgba(52,211,153,0.12)"
                : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: saved ? "#6ee7b7" : "#fff",
              border: saved ? "1px solid rgba(52,211,153,0.2)" : "none",
            }}
            id="save-general-settings"
          >
            {saved ? "✓ Saved" : "Save Changes"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/* ─── Account Tab ───────────────────────────────────────────────────── */

function AccountTab() {
  const [orgIdCopied, setOrgIdCopied] = useState(false);
  const orgId = "0695d3f3-b627-42c8-b45c-a165d064d084";

  const handleCopyOrgId = () => {
    navigator.clipboard.writeText(orgId);
    setOrgIdCopied(true);
    setTimeout(() => setOrgIdCopied(false), 2000);
  };

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-white" style={{ marginBottom: 20 }}>
        Account
      </h2>

      {/* Log Out */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 18 }}
      >
        <div>
          <p className="text-[13px] text-indigo-400 font-medium">Log out of all devices</p>
        </div>
        <button
          className="flex items-center gap-2 rounded-lg text-[12px] font-medium text-white transition-all hover:bg-white/5"
          style={{
            padding: "8px 18px",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
          }}
        >
          {icons.logout}
          <span>Log out</span>
        </button>
      </div>

      {/* Delete Account */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 20 }}
      >
        <div>
          <p className="text-[13px] text-red-400 font-medium">Delete your account</p>
        </div>
        <button
          className="flex items-center gap-2 rounded-lg text-[12px] font-medium transition-all hover:opacity-90"
          style={{
            padding: "8px 18px",
            background: "rgba(239,68,68,0.9)",
            color: "#fff",
            borderRadius: 10,
          }}
        >
          {icons.trash}
          <span>Delete account</span>
        </button>
      </div>

      {/* Organization ID */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 24 }}
      >
        <p className="text-[13px] text-indigo-400 font-medium">Organization ID</p>
        <div className="flex items-center gap-2">
          <span
            className="text-[12px] font-mono text-slate-400"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "6px 12px",
            }}
          >
            {orgId}
          </span>
          <button
            onClick={handleCopyOrgId}
            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-white/5 hover:text-white"
            title="Copy Organization ID"
          >
            {orgIdCopied ? (
              <span className="text-emerald-400">{icons.check}</span>
            ) : (
              icons.copy
            )}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 24,
        }}
      />

      {/* Active Sessions */}
      <h3 className="text-[15px] font-semibold text-white" style={{ marginBottom: 18 }}>
        Active sessions
      </h3>

      {/* Sessions Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Table Header */}
        <div
          className="grid text-[11px] font-semibold uppercase tracking-wider text-indigo-400"
          style={{
            gridTemplateColumns: "2fr 2fr 1.5fr 1.5fr 40px",
            padding: "12px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <span>Device</span>
          <span>Location</span>
          <span>Created</span>
          <span>Updated</span>
          <span />
        </div>

        {/* Table Rows */}
        {activeSessions.map((session) => (
          <div
            key={session.id}
            className="grid items-center text-[12px] transition-colors hover:bg-white/[0.02]"
            style={{
              gridTemplateColumns: "2fr 2fr 1.5fr 1.5fr 40px",
              padding: "14px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-slate-400">{icons.monitor}</span>
              <span className="text-indigo-400 font-medium">{session.device}</span>
              {session.isCurrent && (
                <span
                  className="text-[9px] font-semibold uppercase rounded-full"
                  style={{
                    padding: "2px 8px",
                    background: "rgba(52,211,153,0.10)",
                    color: "#6ee7b7",
                    letterSpacing: "0.5px",
                  }}
                >
                  Current
                </span>
              )}
            </div>
            <span className="text-slate-400">{session.location}</span>
            <span className="text-slate-400">{session.created}</span>
            <span className="text-slate-400">{session.updated}</span>
            <button className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300">
              {icons.dots}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Settings Module ──────────────────────────────────────────── */

export default function SettingsModule() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: icons.user },
    { id: "account", label: "Account", icon: icons.shield },
  ];

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Left Sidebar Tabs */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: 200,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          padding: "28px 12px",
        }}
      >
        {/* Settings Title */}
        <h1
          className="text-[20px] font-bold text-white"
          style={{ padding: "0 12px", marginBottom: 20 }}
        >
          Settings
        </h1>

        {/* Tab Buttons */}
        <nav className="flex flex-col gap-1">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              active={activeTab === tab.id}
              label={tab.label}
              icon={tab.icon}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </nav>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: "28px 40px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ maxWidth: 780 }}
          >
            {activeTab === "general" ? <GeneralTab /> : <AccountTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
