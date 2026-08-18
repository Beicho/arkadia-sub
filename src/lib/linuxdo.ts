/** LinuxDo Connect OAuth2 (connect.linux.do) */

const CONNECT_BASE = process.env.LINUXDO_CONNECT_BASE ?? "https://connect.linux.do";

export function clientId(): string {
  return process.env.LINUXDO_CLIENT_ID ?? "";
}
export function clientSecret(): string {
  return process.env.LINUXDO_CLIENT_SECRET ?? "";
}
export function redirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/auth/callback`;
}

export function authorizeUrl(state: string, appUrl: string): string {
  const u = new URL(`${CONNECT_BASE}/oauth2/authorize`);
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri(appUrl));
  u.searchParams.set("scope", "read");
  u.searchParams.set("state", state);
  return u.toString();
}

export type LinuxDoUser = {
  id: number;
  username: string;
  name: string | null;
  avatar_url: string | null;
  trust_level: number;
  active: boolean;
  silenced?: boolean;
};

export async function exchangeCode(
  code: string,
  appUrl: string,
): Promise<string> {
  const res = await fetch(`${CONNECT_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(appUrl),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`LinuxDo token exchange failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("LinuxDo token exchange: no access_token");
  }
  return data.access_token;
}

export async function fetchUserInfo(accessToken: string): Promise<LinuxDoUser> {
  const res = await fetch(`${CONNECT_BASE}/api/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`LinuxDo userinfo failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as LinuxDoUser;
  if (typeof data.id !== "number" || typeof data.username !== "string") {
    throw new Error("LinuxDo userinfo: unexpected payload");
  }
  return data;
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
