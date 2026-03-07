import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ChatInput } from "../ChatInput";

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

// Mock lucide-react icons as simple spans
vi.mock("lucide-react", () => {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "__esModule") return true;
      const Component = ({ size: _s, fill: _f, ...rest }: Record<string, unknown>) => (
        <span data-testid={`icon-${prop}`} {...rest} />
      );
      Component.displayName = prop;
      return Component;
    },
  };
  return new Proxy({}, handler);
});

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
  // Wait for the models useEffect to settle
  await waitFor(() => {});
  return result!;
}

// ── Tests ─────────────────────────────────────────────────────

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders textarea and send button", async () => {
    await renderChatInput();
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("send button is disabled when message is empty", async () => {
    await renderChatInput();
    const sendBtn = screen.getByTitle("发送 (Enter)");
    expect(sendBtn).toBeDisabled();
  });

  it("send button becomes enabled after typing text", async () => {
    await renderChatInput();
    const textarea = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Hello" } });
    });
    const sendBtn = screen.getByTitle("发送 (Enter)");
    expect(sendBtn).not.toBeDisabled();
  });

  it("calls onSend with message when send button is clicked", async () => {
    const onSend = vi.fn();
    await renderChatInput({ onSend });
    const textarea = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Hello world" } });
    });
    const sendBtn = screen.getByTitle("发送 (Enter)");
    await act(async () => {
      fireEvent.click(sendBtn);
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toBe("Hello world");
  });

  it("typing / opens the command panel", async () => {
    await renderChatInput();
    const textarea = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "/" } });
    });
    expect(screen.getByText("命令")).toBeInTheDocument();
  });

  it("shows stop button when isGenerating is true", async () => {
    await renderChatInput({ isGenerating: true });
    const stopBtn = screen.getByTitle("停止生成");
    expect(stopBtn).toBeInTheDocument();
  });

  it("calls onStop when stop button is clicked", async () => {
    const onStop = vi.fn();
    await renderChatInput({ isGenerating: true, onStop });
    const stopBtn = screen.getByTitle("停止生成");
    await act(async () => {
      fireEvent.click(stopBtn);
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not call onSend when disabled", async () => {
    const onSend = vi.fn();
    await renderChatInput({ onSend, disabled: true });
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears input after sending", async () => {
    await renderChatInput();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "test message" } });
    });
    const sendBtn = screen.getByTitle("发送 (Enter)");
    await act(async () => {
      fireEvent.click(sendBtn);
    });
    expect(textarea.value).toBe("");
  });
});
