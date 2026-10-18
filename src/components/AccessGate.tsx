import { useState } from "react";
import { Check, Clock, Copy, LogOut, Mail, MessageCircle, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ADMIN_EMAIL, accessEmailText, whatsappAccessLink, type AccessInfo } from "@/lib/access";

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

function PendingApprovalModal({ info, onSignOut }: { info: AccessInfo; onSignOut: () => void }) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary sm:mx-0">
              <Clock className="h-6 w-6" />
            </span>
            <DialogTitle>Your Account Is Pending Approval</DialogTitle>
            <DialogDescription>
              Your account has been created successfully, but access to GARE is currently
              restricted. Please contact the administrator to request approval. You'll be able to
              log in once your access is approved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Button asChild className="w-full">
              <a
                href={whatsappAccessLink(info)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Request Access on WhatsApp
              </a>
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={copyEmailRequest}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy Email Request"}
            </Button>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Administrator email</p>
            <a
              href={`mailto:${ADMIN_EMAIL}`}
              className="mt-0.5 inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <Mail className="h-3.5 w-3.5" />
              {ADMIN_EMAIL}
            </a>
          </div>

          <p className="text-xs text-muted-foreground">
            Your account details are saved. You do not need to register again.
          </p>

          <SignOutFooter onSignOut={onSignOut} />
        </DialogContent>
      </Dialog>
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
          {suspended ? "Your Access Is Suspended" : "Your Access Was Not Approved"}
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

export function AccessGate({ info, onSignOut }: { info: AccessInfo; onSignOut: () => void }) {
  if (info.status === "pending") return <PendingApprovalModal info={info} onSignOut={onSignOut} />;
  if (info.status === "rejected" || info.status === "suspended") {
    return <AccessStatusScreen info={info} onSignOut={onSignOut} />;
  }
  return null;
}
