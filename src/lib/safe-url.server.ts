const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
  "100.100.100.200",
  "169.254.169.254",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".lan",
  ".home.arpa",
  ".nip.io",
  ".sslip.io",
  ".xip.io",
  ".localtest.me",
  ".lvh.me",
  ".vcap.me",
  ".traefik.me",
];

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b, c] = values as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const value = host.toLowerCase().split("%")[0] ?? host.toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith("ff")) return true;
  if (value.startsWith("2001:db8")) return true;
  if (value.startsWith("2002:")) return true;
  if (value.startsWith("::ffff:")) return true;
  return false;
}

export function safeHttpUrl(value: string | URL): URL | null {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value.toString()) : new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const bareHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (!bareHost) return null;
  if (BLOCKED_HOSTS.has(bareHost)) return null;
  if (BLOCKED_SUFFIXES.some((suffix) => bareHost.endsWith(suffix))) return null;

  if (isBlockedIpv4(bareHost)) return null;
  if (bareHost.includes(":") && isBlockedIpv6(bareHost)) return null;

  if (!bareHost.includes(".") && !bareHost.includes(":")) return null;
  return url;
}

export function assertSafeHttpUrl(value: string | URL): URL {
  const url = safeHttpUrl(value);
  if (!url) throw new Error("Website URL is not a public http(s) address.");
  return url;
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
};

export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  let url = assertSafeHttpUrl(input);
  const maxRedirects = options.maxRedirects ?? 3;
  const signal = init.signal ?? (options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : null);

  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(url, { ...init, redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirects >= maxRedirects) {
      await response.body?.cancel();
      throw new Error("Website redirected too many times.");
    }
    url = assertSafeHttpUrl(new URL(location, url));
    await response.body?.cancel();
  }
}
