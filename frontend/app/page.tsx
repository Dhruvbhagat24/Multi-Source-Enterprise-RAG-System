"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "@/components/Sidebar";
import ChatModule from "@/components/ChatModule";
import DocumentsModule from "@/components/DocumentsModule";
import SettingsModule from "@/components/SettingsModule";
import ProjectsModule from "@/components/ProjectsModule";
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
const moduleComponents: Record<string, React.ComponentType> = {
  chat: ChatModule,
  documents: DocumentsModule,
  settings: SettingsModule,
  projects: ProjectsModule,
};

// Animation variants for page transitions
const pageVariants = {
  initial: { opacity: 0, x: 20, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -20, filter: "blur(4px)" },
};

export default function Home() {
  const { activeModule, setCapabilities, sidebarOpen, toggleSidebar } = useApp();
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [moduleAvailability, setModuleAvailability] = useState({
    chat: true,
    documents: true,
    settings: true,
    projects: true,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

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
          projects: prev.projects,
        }));
      }
    };

    loadCapabilities();
    const interval = setInterval(loadCapabilities, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [setCapabilities]);

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
      projects: moduleAvailability.projects,
    }),
    [moduleAvailability]
  );

  const ActiveComponent =
    moduleComponents[activeModule] || (availableModules.chat ? ChatModule : DocumentsModule);

  return (
    <main className="relative h-dvh w-full overflow-hidden app-shell">
      {/* 3D Background */}
      <Scene3D />
      <div className="cursor-glow" />

      {/* App UI Layer */}
      <div className="relative z-10 grid h-full w-full grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 md:grid-cols-[auto_1fr]">
        {isMobile && sidebarOpen && (
          <button
            className="fixed inset-0 z-20 bg-slate-950/55 backdrop-blur-[1px] md:hidden"
            onClick={toggleSidebar}
            aria-label="Close sidebar"
          />
        )}

        {/* Sidebar */}
        <Sidebar availableModules={availableModules} />

        {/* Main Content */}
        <div className="glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10">
          {/* Mobile sidebar toggle (no desktop top bar) */}
          <button
            onClick={toggleSidebar}
            className="absolute top-4 left-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition-colors hover:bg-white/5 hover:text-white md:hidden"
            aria-label="Open sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Active Module */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <ActiveComponent />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
