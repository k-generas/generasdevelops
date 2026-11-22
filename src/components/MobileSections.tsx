import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Tab = { key: string; label: string };

export function MobileTabBar({
  tabs,
  value,
  onChange,
}: {
  tabs: Tab[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="-mx-4 sticky top-14 z-20 flex gap-2 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur xl:hidden">
      {tabs.map((tab) => (
        <Button
          key={tab.key}
          size="sm"
          className="shrink-0"
          variant={value === tab.key ? "default" : "outline"}
          onClick={() => {
            onChange(tab.key);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}

export function MobilePane({
  name,
  value,
  children,
}: {
  name: string;
  value: string;
  children: ReactNode;
}) {
  return <div className={name === value ? "" : "hidden xl:block"}>{children}</div>;
}
