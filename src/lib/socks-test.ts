/**
 * 零依赖 SOCKS5 测活:手写 SOCKS5 握手 + 经代理发 HTTP/1.1 204 探测。
 * - DNS 走代理(SOCKS5h 语义),测真实可用性
 * - 全程超时控制,单条失败不影响整体
 */
import net from "node:net";
import tls from "node:tls";
import type { ProxyProtocol } from "@/lib/socks-parse";

export type SocksCheckResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

const PROBE_HOST = "www.gstatic.com";
const PROBE_PORT = 80;

export type ProxyAuth = {
  username: string;
  password: string;
};

/** 统一入口:按协议分派到 SOCKS5 握手或 HTTP CONNECT */
export function checkProxy(
  host: string,
  port: number,
  protocol: ProxyProtocol = "socks5",
  timeoutMs = 8000,
  auth?: ProxyAuth,
): Promise<SocksCheckResult> {
  return protocol === "socks5"
    ? checkSocks5(host, port, timeoutMs, auth)
    : checkHttpConnect(host, port, protocol === "https", timeoutMs, auth);
}

/** HTTP(S) 代理探测:可选 TLS 连接代理，再建立 CONNECT 隧道并请求 204。 */
function checkHttpConnect(
  host: string,
  port: number,
  useTls: boolean,
  timeoutMs = 8000,
  auth?: ProxyAuth,
): Promise<SocksCheckResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    let tunnelReady = false;
    const done = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* 已关 */ }
      resolve({ ok, latencyMs: Date.now() - t0, error });
    };

    const socket = useTls
      ? tls.connect({
          host,
          port,
          servername: net.isIP(host) === 0 ? host : undefined,
        })
      : net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done(false, "timeout"));
    socket.on("error", (e: NodeJS.ErrnoException) =>
      done(false, e.code ?? e.message),
    );
    // CONNECT 成功不代表目标探测成功；必须实际收到 generate_204 响应。
    socket.on("close", () => {
      if (!settled) done(false, tunnelReady ? "probe-closed" : "closed-early");
    });

    socket.on(useTls ? "secureConnect" : "connect", () => {
      const authHeader = auth
        ? `Proxy-Authorization: Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}\r\n`
        : "";
      socket.write(
        `CONNECT ${PROBE_HOST}:${PROBE_PORT} HTTP/1.1\r\nHost: ${PROBE_HOST}:${PROBE_PORT}\r\n${authHeader}\r\n`,
        "latin1",
      );
    });

    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("latin1");
      if (!tunnelReady) {
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd < 0) {
          if (buf.length > 16 * 1024) return done(false, "proxy-headers-too-large");
          return;
        }
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(buf.slice(0, headerEnd));
        if (!m) return done(false, "not-http-proxy");
        if (m[1] !== "200") return done(false, `connect-reject-${m[1]}`);
        tunnelReady = true;
        buf = buf.slice(headerEnd + 4);
        socket.write(
          `GET /generate_204 HTTP/1.1\r\nHost: ${PROBE_HOST}\r\nUser-Agent: ark-check/1.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`,
          "latin1",
        );
        if (!buf) return;
      }
      const m2 = /^HTTP\/1\.[01] (\d{3})/.exec(buf);
      if (m2) done(m2[1] === "204" || m2[1] === "200");
      else if (buf.length > 16) done(false, "bad-http-response");
    });
  });
}

export function checkSocks5(
  host: string,
  port: number,
  timeoutMs = 8000,
  auth?: ProxyAuth,
): Promise<SocksCheckResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    // 0=method negotiation, 1=username/password auth, 2=CONNECT, 3=HTTP probe
    let stage = 0;
    let buf = Buffer.alloc(0);
    const done = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // 已关闭
      }
      resolve({ ok, latencyMs: Date.now() - t0, error });
    };

    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);

    socket.on("timeout", () => done(false, "timeout"));
    socket.on("error", (e: NodeJS.ErrnoException) =>
      done(false, e.code ?? e.message),
    );
    socket.on("close", () => {
      if (!settled) done(false, "closed-early");
    });

    socket.on("connect", () => {
      if (auth) {
        const username = Buffer.from(auth.username, "utf8");
        const password = Buffer.from(auth.password, "utf8");
        if (
          username.length < 1 ||
          username.length > 255 ||
          password.length > 255
        ) {
          return done(false, "invalid-auth-length");
        }
        // 同时允许服务端选择无认证，兼容误带凭据的代理列表。
        socket.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
      } else {
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
      }
    });

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      if (stage === 0) {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05) return done(false, "not-socks5");
        const method = buf[1];
        if (method === 0xff) return done(false, "no-acceptable-auth");
        buf = buf.subarray(2);
        if (buf.length > 0) return done(false, "unexpected-negotiation-data");
        if (method === 0x02) {
          if (!auth) return done(false, "auth-required");
          const username = Buffer.from(auth.username, "utf8");
          const password = Buffer.from(auth.password, "utf8");
          const request = Buffer.alloc(3 + username.length + password.length);
          request[0] = 0x01;
          request[1] = username.length;
          username.copy(request, 2);
          request[2 + username.length] = password.length;
          password.copy(request, 3 + username.length);
          stage = 1;
          socket.write(request);
          return;
        }
        if (method !== 0x00) return done(false, "unsupported-auth-method");
        stage = 2;
        writeConnectRequest();
        return;
      }

      if (stage === 1) {
        if (buf.length < 2) return;
        if (buf[0] !== 0x01) return done(false, "bad-auth-response");
        if (buf[1] !== 0x00) return done(false, "auth-rejected");
        buf = buf.subarray(2);
        if (buf.length > 0) return done(false, "unexpected-auth-data");
        stage = 2;
        writeConnectRequest();
        return;
      }

      if (stage === 2) {
        if (buf.length < 4) return;
        if (buf[0] !== 0x05) return done(false, "bad-connect-response");
        if (buf[1] !== 0x00) {
          return done(false, `connect-reject-0x${buf[1].toString(16)}`);
        }
        const atyp = buf[3];
        let need = 6;
        if (atyp === 0x01) need = 10;
        else if (atyp === 0x03) {
          if (buf.length < 5) return;
          need = 7 + buf[4];
        } else if (atyp === 0x04) need = 22;
        if (buf.length < need) return;
        buf = buf.subarray(need);
        stage = 3;
        socket.write(
          `GET /generate_204 HTTP/1.1\r\nHost: ${PROBE_HOST}\r\nUser-Agent: ark-check/1.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`,
          "latin1",
        );
        if (buf.length > 0) fallthrough();
        return;
      }

      fallthrough();

      function fallthrough() {
        if (stage !== 3 || settled) return;
        const s = buf.toString("latin1");
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(s);
        if (m) {
          done(m[1] === "204" || m[1] === "200");
        } else if (s.length > 16) {
          done(false, "bad-http-response");
        }
      }

      function writeConnectRequest() {
        // CONNECT 请求:域名走代理解析(SOCKS5h 语义)。
        const hb = Buffer.from(PROBE_HOST, "utf8");
        const req = Buffer.alloc(7 + hb.length);
        req[0] = 0x05;
        req[1] = 0x01;
        req[2] = 0x00;
        req[3] = 0x03;
        req[4] = hb.length;
        hb.copy(req, 5);
        req.writeUInt16BE(PROBE_PORT, 5 + hb.length);
        socket.write(req);
      }
    });
  });
}

/** 简单并发池:逐个领取任务执行,worker 数固定 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        await worker(items[i]);
      } catch {
        // 单任务异常吞掉,保证池不中断
      }
    }
  });
  await Promise.all(lanes);
}
