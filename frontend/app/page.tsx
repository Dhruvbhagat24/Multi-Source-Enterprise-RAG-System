"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "@/components/Sidebar";
import ChatModule from "@/components/ChatModule";
import DocumentsModule from "@/components/DocumentsModule";
import SettingsModule from "@/components/SettingsModule";
import { useApp } from "@/lib/store";
import { getBackendCapabilities } from "@/lib/api";

// Lazy-load the 3D scene for performance
const Scene3D = dynamic(() => import("@/components/Scene3D"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-surface-primary z-0" />
  ),
});

// Module content map
const moduleComponents = {
  chat: ChatModule,
  documents: DocumentsModule,
  settings: SettingsModule,
};

// Animation variants for page transitions
const pageVariants = {
  initial: { opacity: 0, x: 20, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -20, filter: "blur(4px)" },
};

export default function Home() {
  const { activeModule, setActiveModule, capabilities, setCapabilities } = useApp();
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [moduleAvailability, setModuleAvailability] = useState({
    chat: true,
    documents: true,
    settings: true,
  });

  useEffect(() => {
    let mounted = true;

    const loadCapabilities = async () => {
      const data = await getBackendCapabilities();
      if (!mounted) return;

      // Keep last known-good modules to avoid transient network drops
      // from hard-disabling UI sections.
      const hasAnyEndpoint = Object.values(data.endpoints).some(Boolean);
      if (hasAnyEndpoint) {
        setCapabilities(data);
        setModuleAvailability((prev) => ({
          chat: prev.chat || data.modules.chat,
          documents: prev.documents || data.modules.documents,
          settings: prev.settings || data.modules.settings,
        }));

        if (!data.modules[activeModule]) {
          if (data.modules.chat) setActiveModule("chat");
          else if (data.modules.documents) setActiveModule("documents");
          else if (data.modules.settings) setActiveModule("settings");
        }
      }
    };

    loadCapabilities();
    const interval = setInterval(loadCapabilities, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activeModule, setActiveModule, setCapabilities]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setCursor({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--cursor-x", `${cursor.x - 160}px`);
    document.documentElement.style.setProperty("--cursor-y", `${cursor.y - 160}px`);
  }, [cursor]);

  const availableModules = useMemo(
    () => ({
      chat: moduleAvailability.chat,
      documents: moduleAvailability.documents,
      settings: moduleAvailability.settings,
    }),
    [moduleAvailability]
  );

  const ActiveComponent =
    moduleComponents[activeModule] || (availableModules.chat ? ChatModule : DocumentsModule);

  return (
    <main className="flex h-screen w-screen overflow-hidden relative app-shell">
      {/* 3D Background */}
      <Scene3D />
      <div className="cursor-glow" />

      {/* App UI Layer */}
      <div className="relative z-10 flex w-full h-full">
        {/* Sidebar */}
        <Sidebar availableModules={availableModules} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 glass">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white capitalize">
                {activeModule === "chat" ? "💬 Chat" : activeModule === "documents" ? "📂 Documents" : "⚙️ Settings"}
              </h2>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-[11px] text-slate-500">
                {activeModule === "chat"
                  ? "Ask questions about your documents"
                  : activeModule === "documents"
                  ? "Upload & manage documents"
                  : "Configure system settings"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 tracking-wide">
                {capabilities ? "Backend mapped" : "Discovering backend"}
              </span>
              <div className="flex items-center gap-1.5">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`w-2 h-2 rounded-full ${capabilities?.endpoints?.health ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]" : "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.5)]"}`}
                />
                <span className="text-[10px] text-slate-500">
                  {capabilities?.endpoints?.health ? "System Online" : "Reconnecting"}
                </span>
              </div>
            </div>
          </header>

          {/* Active Module */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <ActiveComponent />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
