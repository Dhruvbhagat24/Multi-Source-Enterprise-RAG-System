"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadDocument, getDocuments, deleteDocument, type DocumentItem } from "@/lib/api";
import { useApp } from "@/lib/store";

// ─── File type icons ────────────────────────────────────────────────

const fileIcons: Record<string, { icon: string; color: string }> = {
  pdf: { icon: "📄", color: "from-red-500/20 to-red-600/10" },
  docx: { icon: "📝", color: "from-blue-500/20 to-blue-600/10" },
  xlsx: { icon: "📊", color: "from-green-500/20 to-green-600/10" },
  csv: { icon: "📋", color: "from-emerald-500/20 to-emerald-600/10" },
  default: { icon: "📎", color: "from-slate-500/20 to-slate-600/10" },
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

// ─── Status Badge ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string; animate: boolean }> = {
    processing: { color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", label: "Processing", animate: true },
    completed: { color: "text-green-400 bg-green-500/10 border-green-500/20", label: "Completed", animate: false },
    failed: { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Failed", animate: false },
  };

  const cfg = config[status] || config.processing;

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cfg.color} font-medium flex items-center gap-1`}>
      {cfg.animate && (
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-yellow-400"
        />
      )}
      {cfg.label}
    </span>
  );
}

// ─── Drop Zone ──────────────────────────────────────────────────────

function DropZone({ onUpload }: { onUpload: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    onUpload(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onUpload(Array.from(e.target.files));
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 px-8 py-10 text-center cursor-pointer flex flex-col items-center justify-center ${
        isDragging
          ? "border-indigo-400 bg-indigo-500/10 shadow-glow"
          : "border-white/10 hover:border-indigo-500/30 hover:bg-white/2"
      }`}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="absolute inset-0 opacity-0 cursor-pointer"
        id="file-upload-input"
        title="Upload documents"
        aria-label="Upload documents"
      />

      <motion.div
        animate={isDragging ? { y: -5, scale: 1.1 } : { y: 0, scale: 1 }}
        className="mb-4 w-full flex justify-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
      </motion.div>

      <p className="text-sm text-white font-medium mb-2">
        {isDragging ? "Drop files here" : "Drag & drop files here"}
      </p>
      <p className="text-xs text-slate-500">
        or <span className="text-indigo-400 hover:underline">browse files</span>
      </p>
      <p className="text-[10px] text-slate-600 mt-3">
        Supports PDF, DOCX, XLSX, CSV
      </p>
    </motion.div>
  );
}

// ─── Document Card ──────────────────────────────────────────────────

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: DocumentItem;
  onDelete: (id: string) => void;
}) {
  const fileIcon = getFileIcon(doc.filename);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass glass-hover rounded-xl p-4 group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg bg-linear-to-br ${fileIcon.color} flex items-center justify-center text-lg shrink-0`}>
            {fileIcon.icon}
          </div>
          <div>
            <p className="text-sm text-white font-medium truncate max-w-50">
              {doc.filename}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {formatBytes(doc.size)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={doc.status} />
          <button
            onClick={() => onDelete(doc.id)}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all"
            title={`Delete ${doc.filename}`}
            aria-label={`Delete ${doc.filename}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Processing bar */}
      {doc.status === "processing" && (
        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "70%" }}
            transition={{ duration: 3, ease: "easeInOut" }}
            className="h-full rounded-full bg-linear-to-r from-indigo-500 to-purple-500"
          />
        </div>
      )}

      {doc.error && (
        <p className="text-[10px] text-red-400 mt-2">Error: {doc.error}</p>
      )}
    </motion.div>
  );
}

// ─── Main Documents Module ──────────────────────────────────────────

export default function DocumentsModule() {
  const { capabilities, pendingUploads, setPendingUploads } = useApp();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeFile, setActiveFile] = useState<string>("");
  const documentsUnavailable = Boolean(capabilities && !capabilities.modules.documents);

  // Load documents
  useEffect(() => {
    const load = async () => {
      try {
        const docs = await getDocuments();
        setDocuments(docs);
        setPendingUploads((prev) => {
          if (prev.length === 0) return prev;
          const docNames = new Set(docs.map((d) => d.filename));
          return prev.filter((name) => !docNames.has(name));
        });
      } catch {
        // Keep previous data on transient network/API issues.
      }
    };
    load();

    // Poll for status updates
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [setPendingUploads]);

  const handleUpload = useCallback(async (files: File[]) => {
    setUploading(true);
    setPendingUploads((prev) => [...prev, ...files.map((f) => f.name)]);

    for (const file of files) {
      setActiveFile(file.name);
      try {
        const doc = await uploadDocument(file);
        setDocuments((prev) => [...prev, doc]);
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        setPendingUploads((prev) => prev.filter((name) => name !== file.name));
      }
    }
    setActiveFile("");
    setUploading(false);
  }, [setPendingUploads]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const stats = {
    total: documents.length,
    completed: documents.filter((d) => d.status === "completed").length,
    processing: documents.filter((d) => d.status === "processing").length,
    failed: documents.filter((d) => d.status === "failed").length,
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="min-h-full w-full px-4 py-7 sm:px-6 lg:px-8 flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-12">
        {documentsUnavailable && (
          <div className="glass rounded-xl p-3 border border-yellow-500/20 text-xs text-yellow-200 max-w-4xl mx-auto w-full">
            Documents API is temporarily unreachable. Auto-retrying in background.
          </div>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-4xl mx-auto"
        >
          <h1 className="text-2xl font-bold text-white mb-1">
            Document <span className="text-gradient">Ingestion</span>
          </h1>
          <p className="text-sm text-slate-400">
            Upload and manage documents for the RAG knowledge base
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto w-full">
          {[
            { label: "Total", value: stats.total, color: "text-white" },
            { label: "Completed", value: stats.completed, color: "text-green-400" },
            { label: "Processing", value: stats.processing, color: "text-yellow-400" },
            { label: "Failed", value: stats.failed, color: "text-red-400" },
          ].map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass rounded-xl p-4 text-center"
            >
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-slate-500 mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Upload Zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-4xl mx-auto w-full"
        >
          <DropZone onUpload={handleUpload} />
          {(uploading || pendingUploads.length > 0) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 glass rounded-xl p-3.5">
              <p className="text-xs text-indigo-300 mb-2">
                Ingestion pipeline active {activeFile ? `- ${activeFile}` : ""}
              </p>
              <p className="text-[10px] text-slate-500 mb-2">
                Queued means the file is still being uploaded to the backend. After upload completes, it appears below as Processing or Completed.
              </p>
              <div className="space-y-1.5">
                {pendingUploads.slice(0, 4).map((name) => (
                  <div key={name} className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[70%]">{name}</span>
                    <span className="text-cyan-300">Queued</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Documents List */}
        <div className="max-w-4xl mx-auto w-full pt-1">
          <h3 className="text-sm text-slate-400 font-medium mb-4 text-center">
            Uploaded Documents
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
          {documents.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-600 text-sm">No documents uploaded yet</p>
              <p className="text-slate-700 text-xs mt-1">
                Upload files to build the knowledge base
              </p>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
