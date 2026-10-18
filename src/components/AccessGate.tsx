import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, LogOut, Mail, MessageCircle, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_EMAIL,
  accessEmailText,
  redeemAccessCode,
  redeemErrorMessage,
  whatsappAccessLink,
  type AccessInfo,
} from "@/lib/access";

function SignOutFooter({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex justify-center border-t pt-4">
      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );
}

function PendingScreen({
  info,
  onSignOut,
  onRedeemed,
}: {
  info: AccessInfo;
  onSignOut: () => void;
  onRedeemed: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function copyEmailRequest() {
    try {
      await navigator.clipboard.writeText(accessEmailText(info));
      setCopied(true);
      toast.success("Email request copied", {
        description: "Paste it into your email client and send it to the administrator.",
      });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy to clipboard", {
        description: `Open your email client and write to ${ADMIN_EMAIL} manually.`,
      });
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await redeemAccessCode(code);
    if (result.ok) {
      setSuccess("Access approved. Loading your workspace…");
      toast.success("Access approved", { description: "Welcome to GARE." });
      onRedeemed();
    } else {
      setError(redeemErrorMessage(result.error));
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-center text-xl font-bold">You&apos;re on the Early Access List</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Your account has been created successfully. GARE is currently in private early access.
          Contact the owner to request access. Once your account is approved, you can sign in and
          explore the platform.
        </p>

        <div className="mt-5 space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Account</span>
            <span className="truncate font-medium">{info.email || "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium capitalize">{info.status}</span>
          </div>
        </div>

        <form onSubmit={submitCode} className="mt-5 space-y-2">
          <Label htmlFor="access-code">Have an access code?</Label>
          <div className="flex gap-2">
            <Input
              id="access-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="GARE-XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" disabled={busy || !code.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-primary">{success}</p>}
        </form>

        <div className="mt-5 space-y-2">
          <Button asChild className="w-full">
            <a
              href={whatsappAccessLink(info)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Request access on WhatsApp
            </a>
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={copyEmailRequest}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy email request"}
          </Button>
        </div>

        <div className="mt-4 rounded-md border bg-muted/40 p-3 text-xs">
          <p className="text-muted-foreground">Owner email</p>
          <a
            href={`mailto:${ADMIN_EMAIL}`}
            className="mt-0.5 inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <Mail className="h-3.5 w-3.5" />
            {ADMIN_EMAIL}
          </a>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your account details are saved. You do not need to register again.
        </p>

        <div className="mt-4">
          <SignOutFooter onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  );
}

function AccessStatusScreen({ info, onSignOut }: { info: AccessInfo; onSignOut: () => void }) {
  const suspended = info.status === "suspended";
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <ShieldX className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">
          {suspended ? "Your access is suspended" : "Your access was not approved"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {suspended
            ? "Your GARE access has been temporarily suspended. Contact the administrator to have it restored."
            : "Your account was reviewed but was not approved for GARE access. Contact the administrator if you believe this is a mistake."}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Administrator email{" "}
          <a href={`mailto:${ADMIN_EMAIL}`} className="font-medium text-primary hover:underline">
            {ADMIN_EMAIL}
          </a>
        </p>
        <Button type="button" variant="outline" className="mt-6 w-full" onClick={onSignOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function AccessGate({
  info,
  onSignOut,
  onRedeemed,
}: {
  info: AccessInfo;
  onSignOut: () => void;
  onRedeemed?: () => void;
}) {
  if (info.status === "pending") {
    return (
      <PendingScreen info={info} onSignOut={onSignOut} onRedeemed={onRedeemed ?? (() => {})} />
    );
  }
  if (info.status === "rejected" || info.status === "suspended") {
    return <AccessStatusScreen info={info} onSignOut={onSignOut} />;
  }
  return null;
}
