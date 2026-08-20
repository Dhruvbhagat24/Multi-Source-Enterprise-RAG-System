"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadDocument, getDocuments, deleteDocument, getDocumentStatus, type DocumentItem } from "@/lib/api";
import { useApp } from "@/lib/store";

/* ─── Helpers ───────────────────────────────────────────────────────── */

const fileIcons: Record<string, { icon: string; color: string }> = {
  pdf: { icon: "📄", color: "rgba(239,68,68,0.12)" },
  docx: { icon: "📝", color: "rgba(59,130,246,0.12)" },
  xlsx: { icon: "📊", color: "rgba(34,197,94,0.12)" },
  csv: { icon: "📋", color: "rgba(16,185,129,0.12)" },
  default: { icon: "📎", color: "rgba(148,163,184,0.12)" },
};

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return fileIcons[ext] || fileIcons.default;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/* ─── Status Badge ──────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    processing: { bg: "rgba(250,204,21,0.10)", color: "#fbbf24", label: "Processing" },
    completed: { bg: "rgba(52,211,153,0.10)", color: "#6ee7b7", label: "Completed" },
    failed: { bg: "rgba(248,113,113,0.10)", color: "#fca5a5", label: "Failed" },
  };
  const c = cfg[status] || cfg.processing;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-full text-[9px] sm:text-[10px] font-medium whitespace-nowrap"
      style={{ padding: "2px 6px sm:padding-2px sm:padding-8px", background: c.bg, color: c.color }}
    >
      {status === "processing" && (
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="inline-block h-1 w-1 rounded-full shrink-0"
          style={{ background: c.color }}
        />
      )}
      {c.label}
    </span>
  );
}

/* ─── Drop Zone ─────────────────────────────────────────────────────── */

function DropZone({ onUpload }: { onUpload: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); onUpload(Array.from(e.dataTransfer.files)); }}
      className="relative cursor-pointer rounded-xl transition-all shrink-0"
      style={{
        border: `2px dashed ${isDragging ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
        background: isDragging ? "rgba(99,102,241,0.06)" : "transparent",
        padding: "max(20px, 4vw) max(16px, 3vw)",
        textAlign: "center",
      }}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.xlsx,.xls,.csv"
        onChange={(e) => { if (e.target.files) onUpload(Array.from(e.target.files)); e.target.value = ""; }}
        className="absolute inset-0 opacity-0 cursor-pointer"
        id="file-upload-input"
        title="Upload documents"
        aria-label="Upload documents"
      />
      <div className="flex flex-col items-center">
        <div
          className="flex items-center justify-center rounded-xl shrink-0"
          style={{ width: 40, height: 40, background: "rgba(99,102,241,0.10)", marginBottom: 10 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="text-xs sm:text-sm text-white font-medium" style={{ marginBottom: 4 }}>
          {isDragging ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="text-[11px] sm:text-xs text-slate-500">
          or <span className="text-indigo-400">browse files</span>
        </p>
        <p className="text-[10px] sm:text-[11px] text-slate-600" style={{ marginTop: 6 }}>
          PDF, DOCX, XLSX, CSV
        </p>
      </div>
    </div>
  );
}

/* ─── Document Row ──────────────────────────────────────────────────── */

function DocumentRow({ doc, onDelete }: { doc: DocumentItem; onDelete: (id: string) => void }) {
  const fi = getFileIcon(doc.filename);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="group flex items-center gap-2 sm:gap-3 rounded-lg transition-colors hover:bg-white/3"
      style={{ padding: "8px 10px sm:padding-10px sm:padding-12px" }}
    >
      <span
        className="flex shrink-0 items-center justify-center rounded-lg text-sm sm:text-[14px]"
        style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, background: fi.color }}
      >
        {fi.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm text-white font-medium truncate">{doc.filename}</p>
        <p className="text-[10px] sm:text-[11px] text-slate-500">{formatBytes(doc.size)}</p>
      </div>
      <StatusBadge status={doc.status} />
      <button
        onClick={() => onDelete(doc.id)}
        className="shrink-0 rounded-md p-1 opacity-0 transition-all group-hover:opacity-60 hover:opacity-100! hover:bg-red-500/10 text-slate-500 hover:text-red-400 ml-1 sm:ml-2"
        title={`Delete ${doc.filename}`}
        aria-label={`Delete ${doc.filename}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
      {doc.error && <p className="text-[9px] sm:text-[10px] text-red-400 ml-2">Error: {doc.error}</p>}
    </motion.div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────── */

export default function DocumentsModule() {
  const { capabilities, pendingUploads, setPendingUploads, userId } = useApp();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeFile, setActiveFile] = useState<string>("");
  const documentsUnavailable = Boolean(capabilities && !capabilities.modules.documents);

  // Global document reload every 10s
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      try {
        const docs = await getDocuments(userId);
        setDocuments(docs);
        setPendingUploads((prev) => {
          if (prev.length === 0) return prev;
          const docNames = new Set(docs.map((d) => d.filename));
          return prev.filter((name) => !docNames.has(name));
        });
      } catch { /* keep existing */ }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [setPendingUploads, userId]);

  // Fast polling for documents currently processing via Redis Status endpoint
  useEffect(() => {
    if (!userId) return;
    const processingDocs = documents.filter(d => d.status === "processing");
    if (processingDocs.length === 0) return;

    const interval = setInterval(async () => {
      for (const doc of processingDocs) {
        try {
          const res = await getDocumentStatus(doc.id, userId);
          if (res.status !== "processing" && res.status !== "unknown") {
            setDocuments(prev => prev.map(d => 
              d.id === doc.id ? { ...d, status: res.status as DocumentItem["status"] } : d
            ));
          }
        } catch {
          // Ignore polling errors
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [documents, userId]);

  const handleUpload = useCallback(async (files: File[]) => {
    if (!userId) return;
    setUploading(true);
    setPendingUploads((prev) => [...prev, ...files.map((f) => f.name)]);
    for (const file of files) {
      setActiveFile(file.name);
      try {
        const doc = await uploadDocument(file, userId);
        setDocuments((prev) => [...prev, doc]);
      } catch (err) { console.error("Upload failed:", err); }
      finally { setPendingUploads((prev) => prev.filter((n) => n !== file.name)); }
    }
    setActiveFile("");
    setUploading(false);
  }, [setPendingUploads, userId]);

  const handleDelete = useCallback(async (id: string) => {
    if (!userId) return;
    await deleteDocument(id, userId);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, [userId]);

  const stats = {
    total: documents.length,
    completed: documents.filter((d) => d.status === "completed").length,
    processing: documents.filter((d) => d.status === "processing").length,
    failed: documents.filter((d) => d.status === "failed").length,
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto w-full" style={{ padding: "max(16px, 2vw) max(24px, 3vw)" }}>
        <div className="w-full max-w-7xl mx-auto">

          {/* Warning */}
          {documentsUnavailable && (
            <div
              className="flex items-center gap-2.5 rounded-lg text-xs sm:text-[11px] text-yellow-200/80"
              style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.12)" }}
            >
              <span>⚠️</span>
              <span>Documents API is temporarily unreachable. Auto-retrying in background.</span>
            </div>
          )}

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white" style={{ marginBottom: 4 }}>Documents</h1>
            <p className="text-xs sm:text-sm text-slate-500">Upload and manage documents for the RAG knowledge base</p>
          </div>

          {/* Stats row - responsive grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" style={{ marginBottom: 20 }}>
            {([
              { label: "Total", value: stats.total, color: "#fff" },
              { label: "Completed", value: stats.completed, color: "#6ee7b7" },
              { label: "Processing", value: stats.processing, color: "#fbbf24" },
              { label: "Failed", value: stats.failed, color: "#fca5a5" },
            ] as const).map((s) => (
              <div
                key={s.label}
                className="rounded-lg text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "12px 8px sm:padding-14px sm:padding-12px" }}
              >
                <p className="text-base sm:text-lg lg:text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[9px] sm:text-[10px] text-slate-500" style={{ marginTop: 2 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Two-column: Upload + Documents list */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 min-h-0">

            {/* Left: Upload */}
            <div className="flex flex-col min-h-0">
              <h2 className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ marginBottom: 10 }}>
                Upload
              </h2>
              <DropZone onUpload={handleUpload} />

              {/* Upload progress */}
              {(uploading || pendingUploads.length > 0) && (
                <div
                  className="rounded-lg shrink-0"
                  style={{ marginTop: 10, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-[10px] sm:text-[11px] text-indigo-300" style={{ marginBottom: 6 }}>
                    Ingestion pipeline active{activeFile ? ` — ${activeFile}` : ""}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
                    {pendingUploads.slice(0, 4).map((name) => (
                      <div key={name} className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 shrink-0">
                        <span className="truncate" style={{ maxWidth: "70%" }}>{name}</span>
                        <span className="text-cyan-300 shrink-0 ml-2">Queued</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Documents list */}
            <div className="flex flex-col min-h-0">
              <h2 className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ marginBottom: 10, flexShrink: 0 }}>
                Uploaded Documents ({documents.length})
              </h2>
              <div
                className="rounded-xl flex-1 min-h-0 overflow-y-auto"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full" style={{ padding: "40px 20px" }}>
                    <p className="text-xs sm:text-sm text-slate-500">No documents uploaded yet</p>
                    <p className="text-[11px] sm:text-xs text-slate-600" style={{ marginTop: 4 }}>
                      Upload files to build the knowledge base
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: "4px" }}>
                    <AnimatePresence mode="popLayout">
                      {documents.map((doc) => (
                        <DocumentRow key={doc.id} doc={doc} onDelete={handleDelete} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
