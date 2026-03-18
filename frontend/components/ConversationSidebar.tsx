"use client";

import { useEffect, useState } from "react";
import { Conversation, getConversations, getMessages, deleteConversation } from "@/lib/api";
import { ChatMessage } from "@/hooks/useChat";

interface Props {
  activeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string, messages: ChatMessage[]) => void;
  onNewChat: () => void;
}

function SidebarContent({
  activeId,
  conversations,
  hoveredId,
  onSelect,
  onNewChat,
  onClose,
  onHover,
  onDelete,
}: {
  activeId: string | null;
  conversations: Conversation[];
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
  onHover: (id: string | null) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#2a2a2a]">
        <span className="text-[#f0f0f0] font-semibold text-sm tracking-wide">Nexus</span>
        <button
          onClick={onClose}
          className="text-[#555] hover:text-[#f0f0f0] transition-colors p-1 rounded"
          aria-label="Close sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New Chat button */}
      <div className="px-3 py-3">
        <button
          onClick={onNewChat}
          className="w-full text-left text-sm text-[#888] border border-[#2a2a2a] rounded-lg px-3 py-2 hover:text-[#f0f0f0] hover:border-[#444] transition-colors"
        >
          + New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 && (
          <p className="text-[#444] text-xs text-center mt-6">No conversations yet</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            onMouseEnter={() => onHover(c.id)}
            onMouseLeave={() => onHover(null)}
            className={`group flex items-center justify-between rounded-lg px-3 py-2 mb-1 cursor-pointer transition-colors text-sm ${
              activeId === c.id
                ? "bg-[#1a1830] text-[#f0f0f0] border border-[#7c6bf0]/30"
                : "text-[#888] hover:bg-[#1e1e1e] hover:text-[#f0f0f0]"
            }`}
          >
            <span className="truncate flex-1 pr-2">{c.title ?? "Untitled"}</span>
            {hoveredId === c.id && (
              <button
                onClick={(e) => onDelete(e, c.id)}
                className="text-[#555] hover:text-red-400 transition-colors shrink-0 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function ConversationSidebar({ activeId, isOpen, onClose, onSelect, onNewChat }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    getConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeId) {
      getConversations().then(setConversations).catch(() => {});
    }
  }, [activeId]);

  async function handleSelect(id: string) {
    const msgs = await getMessages(id);
    const mapped: ChatMessage[] = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
    onSelect(id, mapped);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNewChat();
  }

  const contentProps = {
    activeId,
    conversations,
    hoveredId,
    onSelect: handleSelect,
    onNewChat,
    onClose,
    onHover: setHoveredId,
    onDelete: handleDelete,
  };

  return (
    <>
      {/* Desktop: inline column, collapses to w-0 when closed */}
      <div
        className={`hidden md:flex flex-col bg-[#141414] border-r border-[#2a2a2a] h-full overflow-hidden transition-all duration-200 ${
          isOpen ? "w-60" : "w-0 border-r-0"
        }`}
      >
        <SidebarContent {...contentProps} />
      </div>

      {/* Mobile: fixed overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 bg-[#141414] border-r border-[#2a2a2a] flex flex-col h-full">
            <SidebarContent {...contentProps} />
          </div>
          {/* Backdrop */}
          <div className="flex-1 bg-black/60" onClick={onClose} />
        </div>
      )}
    </>
  );
}
