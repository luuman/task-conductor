import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────

// Mock i18n
vi.mock("../../i18n", () => ({
  default: { t: (key: string) => key },
}));

// Mock the api module
vi.mock("../../lib/api", () => ({
  api: {
    chat: {
      models: vi.fn().mockResolvedValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet 4", default: true },
        { id: "claude-opus-4-20250514", name: "Opus 4" },
      ]),
    },
  },
}));

// Create a simple icon factory
function makeIcon(name: string) {
  const Icon = (props: { size?: number; fill?: string; className?: string }) => {
    const { size: _s, fill: _f, ...rest } = props;
    return React.createElement("span", { "data-testid": `icon-${name}`, ...rest });
  };
  Icon.displayName = name;
  return Icon;
}

// Mock lucide-react with explicit named exports
vi.mock("lucide-react", () => ({
  SendHorizontal: makeIcon("SendHorizontal"),
  Square: makeIcon("Square"),
  Paperclip: makeIcon("Paperclip"),
  X: makeIcon("X"),
  Hash: makeIcon("Hash"),
  Cpu: makeIcon("Cpu"),
  Download: makeIcon("Download"),
  Trash2: makeIcon("Trash2"),
  Plus: makeIcon("Plus"),
  HelpCircle: makeIcon("HelpCircle"),
  Terminal: makeIcon("Terminal"),
  Gauge: makeIcon("Gauge"),
  Shield: makeIcon("Shield"),
  FolderOpen: makeIcon("FolderOpen"),
  Wallet: makeIcon("Wallet"),
  Zap: makeIcon("Zap"),
  MessageSquarePlus: makeIcon("MessageSquarePlus"),
  RotateCcw: makeIcon("RotateCcw"),
  BrainCircuit: makeIcon("BrainCircuit"),
  SlidersHorizontal: makeIcon("SlidersHorizontal"),
  Ban: makeIcon("Ban"),
}));

import { ChatInput } from "../ChatInput";

// ── Helpers ───────────────────────────────────────────────────

const defaultProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isGenerating: false,
};

async function renderChatInput(overrides: Partial<typeof defaultProps> = {}) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<ChatInput {...defaultProps} {...overrides} />);
  });
  // Let the models useEffect resolve
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return result!;
}

// ── Tests ─────────────────────────────────────────────────────

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders textarea and send button", async () => {
    await renderChatInput();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(1);
  });

  it("send button is disabled when message is empty", async () => {
    await renderChatInput();
    expect(screen.getByTitle("发送 (Enter)")).toBeDisabled();
  });

  it("send button becomes enabled after typing text", async () => {
    await renderChatInput();
    const textarea = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Hello" } });
    });
    expect(screen.getByTitle("发送 (Enter)")).not.toBeDisabled();
  });

  it("calls onSend with message when send button is clicked", async () => {
    const onSend = vi.fn();
    await renderChatInput({ onSend });
    const textarea = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Hello world" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTitle("发送 (Enter)"));
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toBe("Hello world");
  });

  it("typing / opens the command panel", async () => {
    await renderChatInput();
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "/" } });
    });
    expect(screen.getByText("命令")).toBeInTheDocument();
  });

  it("shows stop button when isGenerating is true", async () => {
    await renderChatInput({ isGenerating: true });
    expect(screen.getByTitle("停止生成")).toBeInTheDocument();
  });

  it("calls onStop when stop button is clicked", async () => {
    const onStop = vi.fn();
    await renderChatInput({ isGenerating: true, onStop });
    await act(async () => {
      fireEvent.click(screen.getByTitle("停止生成"));
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not call onSend when disabled", async () => {
    const onSend = vi.fn();
    await renderChatInput({ onSend, disabled: true });
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears input after sending", async () => {
    await renderChatInput();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "test message" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTitle("发送 (Enter)"));
    });
    expect(textarea.value).toBe("");
  });
});
