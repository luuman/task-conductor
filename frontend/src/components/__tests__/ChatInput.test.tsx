import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// Mock lucide-react to avoid SVG rendering issues
vi.mock("lucide-react", () => {
  const icon = (name: string) => {
    const Component = (props: Record<string, unknown>) => {
      const { size: _size, fill: _fill, ...rest } = props;
      return <span data-testid={`icon-${name}`} {...rest} />;
    };
    Component.displayName = name;
    return Component;
  };
  return new Proxy({}, {
    get: (_target, prop: string) => icon(prop),
  });
});

// ── Helpers ───────────────────────────────────────────────────

const defaultProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isGenerating: false,
};

function renderChatInput(overrides: Partial<typeof defaultProps> = {}) {
  return render(<ChatInput {...defaultProps} {...overrides} />);
}

// ── Tests ─────────────────────────────────────────────────────

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders textarea and send button", () => {
    renderChatInput();
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    // Send button (SendHorizontal icon)
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("send button is disabled when message is empty", () => {
    renderChatInput();
    // The send button has title "发送 (Enter)"
    const sendBtn = screen.getByTitle("发送 (Enter)");
    expect(sendBtn).toBeDisabled();
  });

  it("send button becomes enabled after typing text", async () => {
    const user = userEvent.setup();
    renderChatInput();
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello");
    const sendBtn = screen.getByTitle("发送 (Enter)");
    expect(sendBtn).not.toBeDisabled();
  });

  it("calls onSend with message when send button is clicked", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderChatInput({ onSend });
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello world");
    const sendBtn = screen.getByTitle("发送 (Enter)");
    await user.click(sendBtn);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toBe("Hello world");
  });

  it("typing / opens the command panel", async () => {
    const user = userEvent.setup();
    renderChatInput();
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "/");
    // The command panel should show "命令" header text
    expect(screen.getByText("命令")).toBeInTheDocument();
  });

  it("shows stop button when isGenerating is true", () => {
    renderChatInput({ isGenerating: true });
    const stopBtn = screen.getByTitle("停止生成");
    expect(stopBtn).toBeInTheDocument();
  });

  it("calls onStop when stop button is clicked", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    renderChatInput({ isGenerating: true, onStop });
    const stopBtn = screen.getByTitle("停止生成");
    await user.click(stopBtn);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not call onSend when disabled", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderChatInput({ onSend, disabled: true });
    const textarea = screen.getByRole("textbox");
    // textarea is disabled so we can't type
    expect(textarea).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears input after sending", async () => {
    const user = userEvent.setup();
    renderChatInput();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(textarea, "test message");
    const sendBtn = screen.getByTitle("发送 (Enter)");
    await user.click(sendBtn);
    expect(textarea.value).toBe("");
  });
});
