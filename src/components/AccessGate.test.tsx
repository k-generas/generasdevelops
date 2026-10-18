import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccessGate } from "./AccessGate";
import type { AccessInfo } from "@/lib/access";

function info(over: Partial<AccessInfo> = {}): AccessInfo {
  return {
    status: "pending",
    email: "newuser@example.com",
    name: null,
    isAdmin: false,
    ...over,
  };
}

describe("AccessGate", () => {
  it("shows the early-access list screen with a redemption field", () => {
    render(<AccessGate info={info()} onSignOut={vi.fn()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: /early access list/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /redeem/i })).toBeDisabled();
    expect(screen.getByLabelText(/have an access code/i)).toBeInTheDocument();
    expect(screen.getByText("newuser@example.com")).toBeInTheDocument();
    expect(screen.getByText("pending", { exact: false })).toBeInTheDocument();
  });

  it("links to the verified WhatsApp number and the owner email", () => {
    render(<AccessGate info={info()} onSignOut={vi.fn()} />);

    const wa = screen.getByRole("link", { name: /whatsapp/i });
    expect(wa.getAttribute("href")).toContain("wa.me/250794144738");

    const mail = screen.getByRole("link", { name: /generaskagiraneza@gmail.com/i });
    expect(mail.getAttribute("href")).toContain("mailto:generaskagiraneza@gmail.com");
  });

  it("offers a sign out action", () => {
    const onSignOut = vi.fn();
    render(<AccessGate info={info()} onSignOut={onSignOut} />);

    const buttons = screen.getAllByRole("button", { name: /sign out/i });
    expect(buttons.length).toBeGreaterThan(0);
    buttons[0]!.click();
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("shows a suspended screen for suspended accounts", () => {
    render(<AccessGate info={info({ status: "suspended" })} onSignOut={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /suspended/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/have an access code/i)).not.toBeInTheDocument();
  });

  it("shows a rejected screen for rejected accounts", () => {
    render(<AccessGate info={info({ status: "rejected" })} onSignOut={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /not approved/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/have an access code/i)).not.toBeInTheDocument();
  });

  it("renders nothing for approved accounts", () => {
    const { container } = render(
      <AccessGate info={info({ status: "approved" })} onSignOut={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
