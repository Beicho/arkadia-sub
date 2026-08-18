/**
 * 零依赖 SOCKS5 测活:手写 SOCKS5 握手 + 经代理发 HTTP/1.1 204 探测。
 * - DNS 走代理(SOCKS5h 语义),测真实可用性
 * - 全程超时控制,单条失败不影响整体
 */
import net from "node:net";

export type SocksCheckResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

const PROBE_HOST = "www.gstatic.com";
const PROBE_PORT = 80;

export function checkSocks5(
  host: string,
  port: number,
  timeoutMs = 8000,
): Promise<SocksCheckResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
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
      // 问候:仅支持无认证(福利池来源均为裸代理)
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      if (stage === 0) {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05) return done(false, "not-socks5");
        if (buf[1] === 0xff) return done(false, "no-acceptable-auth");
        if (buf[1] !== 0x00) return done(false, "auth-required");
        buf = buf.subarray(2);
        stage = 1;
        // CONNECT 请求:域名走代理解析
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
        return;
      }

      if (stage === 1) {
        if (buf.length < 4) return;
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
        stage = 2;
        socket.write(
          `GET /generate_204 HTTP/1.1\r\nHost: ${PROBE_HOST}\r\nUser-Agent: ark-check/1.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`,
          "latin1",
        );
        if (buf.length > 0) fallthrough();
        return;
      }

      fallthrough();

      function fallthrough() {
        if (stage !== 2 || settled) return;
        const s = buf.toString("latin1");
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(s);
        if (m) {
          done(m[1] === "204" || m[1] === "200");
        } else if (s.length > 16) {
          done(false, "bad-http-response");
        }
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
