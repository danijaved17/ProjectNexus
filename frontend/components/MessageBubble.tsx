import React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  terms?: string[];
  onTermClick?: (term: string) => void;
}

// Split a plain string into an array of React nodes, wrapping matched terms as clickable buttons.
function highlightTerms(
  text: string,
  terms: string[],
  onTermClick: (term: string) => void
): React.ReactNode[] {
  if (!terms.length) return [text];

  // Escape special regex characters in each term, then join with | for alternation
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const term = match[1];
    nodes.push(
      <button
        key={match.index}
        onClick={() => onTermClick(term)}
        className="text-[#c4b5fd] underline decoration-dotted underline-offset-2 cursor-pointer hover:text-[#7c6bf0] transition-colors"
      >
        {term}
      </button>
    );
    last = match.index + term.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Recursively walk React children, applying highlightTerms to any string nodes.
function processChildren(
  children: React.ReactNode,
  terms: string[],
  onTermClick: (term: string) => void
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return highlightTerms(child, terms, onTermClick);
    }
    if (React.isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (el.props.children) {
        return React.cloneElement(el, {
          ...el.props,
          children: processChildren(el.props.children, terms, onTermClick),
        });
      }
    }
    return child;
  });
}

export default function MessageBubble({ role, content, isStreaming, terms = [], onTermClick }: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] bg-[#7c6bf0] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  // Build custom ReactMarkdown components that highlight terms inside text nodes
  const shouldHighlight = terms.length > 0 && !!onTermClick && !isStreaming;

  const components: Components = shouldHighlight
    ? {
        p: ({ children }) => (
          <p>{processChildren(children, terms, onTermClick!)}</p>
        ),
        li: ({ children }) => (
          <li>{processChildren(children, terms, onTermClick!)}</li>
        ),
        h1: ({ children }) => <h1>{processChildren(children, terms, onTermClick!)}</h1>,
        h2: ({ children }) => <h2>{processChildren(children, terms, onTermClick!)}</h2>,
        h3: ({ children }) => <h3>{processChildren(children, terms, onTermClick!)}</h3>,
      }
    : {};

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[70%] bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
        <div className="prose prose-sm prose-invert max-w-none
          prose-p:my-1 prose-p:leading-relaxed
          prose-headings:text-[#f0f0f0] prose-headings:font-semibold
          prose-strong:text-[#f0f0f0]
          prose-code:text-[#c4b5fd] prose-code:bg-[#2a2a2a] prose-code:px-1 prose-code:rounded
          prose-pre:bg-[#2a2a2a] prose-pre:border prose-pre:border-[#333]
          prose-ul:my-1 prose-ol:my-1
          prose-li:my-0.5
          prose-a:text-[#7c6bf0]">
          <ReactMarkdown components={components}>{content}</ReactMarkdown>
        </div>
        {isStreaming && (
          <span className="inline-block w-0.5 h-4 bg-[#7c6bf0] ml-0.5 align-middle animate-pulse" />
        )}
      </div>
    </div>
  );
}
