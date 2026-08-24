import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  netConnect: vi.fn(),
  tlsConnect: vi.fn(),
  isIP: vi.fn(() => 0),
}));

vi.mock("node:net", () => ({
  default: {
    connect: mocks.netConnect,
    isIP: mocks.isIP,
  },
}));

vi.mock("node:tls", () => ({
  default: {
    connect: mocks.tlsConnect,
  },
}));

import { checkProxy } from "@/lib/socks-test";

class FakeSocket extends EventEmitter {
  writes: (string | Buffer)[] = [];
  destroyed = false;

  constructor(
    event: "connect" | "secureConnect",
    private readonly respond: (data: string | Buffer, socket: FakeSocket) => void,
  ) {
    super();
    queueMicrotask(() => this.emit(event));
  }

  setTimeout() {
    return this;
  }

  write(data: string | Buffer) {
    this.writes.push(data);
    this.respond(data, this);
    return true;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

beforeEach(() => {
  mocks.netConnect.mockReset();
  mocks.tlsConnect.mockReset();
  mocks.isIP.mockReset();
  mocks.isIP.mockReturnValue(0);
});

describe("checkProxy", () => {
  it("完成 SOCKS5 username/password 认证后再探测目标", async () => {
    let step = 0;
    const socket = new FakeSocket("connect", (data, current) => {
      step++;
      if (step === 1) {
        expect(Buffer.from(data as Buffer)).toEqual(
          Buffer.from([0x05, 0x02, 0x00, 0x02]),
        );
        current.emit("data", Buffer.from([0x05, 0x02]));
      } else if (step === 2) {
        expect(Buffer.from(data as Buffer)).toEqual(
          Buffer.from([0x01, 0x04, 0x75, 0x73, 0x65, 0x72, 0x04, 0x70, 0x40, 0x73, 0x73]),
        );
        current.emit("data", Buffer.from([0x01, 0x00]));
      } else if (step === 3) {
        expect((data as Buffer)[0]).toBe(0x05);
        expect((data as Buffer)[1]).toBe(0x01);
        current.emit(
          "data",
          Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]),
        );
      } else {
        expect(String(data)).toContain("GET /generate_204");
        current.emit("data", Buffer.from("HTTP/1.1 204 No Content\r\n\r\n"));
      }
    });
    mocks.netConnect.mockReturnValue(socket);

    await expect(
      checkProxy("proxy.example.com", 1080, "socks5", 8000, {
        username: "user",
        password: "p@ss",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(step).toBe(4);
  });

  it("HTTP CONNECT 使用 Basic 代理认证", async () => {
    const socket = new FakeSocket("connect", (data, current) => {
      const request = String(data);
      if (request.startsWith("CONNECT")) {
        expect(request).toContain("Proxy-Authorization: Basic dXNlcjpwYXNz\r\n");
        current.emit("data", Buffer.from("HTTP/1.1 200 Connection Established\r\n\r\n"));
      } else {
        current.emit("data", Buffer.from("HTTP/1.1 204 No Content\r\n\r\n"));
      }
    });
    mocks.netConnect.mockReturnValue(socket);

    await expect(
      checkProxy("proxy.example.com", 8080, "http", 8000, {
        username: "user",
        password: "pass",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.tlsConnect).not.toHaveBeenCalled();
  });

  it("HTTP CONNECT 等待完整响应头后再探测目标", async () => {
    const socket = new FakeSocket("connect", (data, current) => {
      const request = String(data);
      if (request.startsWith("CONNECT")) {
        current.emit(
          "data",
          Buffer.from(
            "HTTP/1.1 200 Connection Established\r\nProxy-Agent: test\r\n",
          ),
        );
        expect(current.writes).toHaveLength(1);
        current.emit("data", Buffer.from("\r\n"));
      } else {
        current.emit("data", Buffer.from("HTTP/1.1 204 No Content\r\n\r\n"));
      }
    });
    mocks.netConnect.mockReturnValue(socket);

    await expect(
      checkProxy("proxy.example.com", 8080, "http"),
    ).resolves.toMatchObject({ ok: true });
    expect(socket.writes).toHaveLength(2);
  });

  it("HTTPS 代理通过 TLS 连接代理端", async () => {
    const socket = new FakeSocket("secureConnect", (data, current) => {
      const request = String(data);
      current.emit(
        "data",
        Buffer.from(
          request.startsWith("CONNECT")
            ? "HTTP/1.1 200 Connection Established\r\n\r\n"
            : "HTTP/1.1 204 No Content\r\n\r\n",
        ),
      );
    });
    mocks.tlsConnect.mockReturnValue(socket);

    await expect(
      checkProxy("proxy.example.com", 8443, "https"),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.tlsConnect).toHaveBeenCalledWith({
      host: "proxy.example.com",
      port: 8443,
      servername: "proxy.example.com",
    });
    expect(mocks.netConnect).not.toHaveBeenCalled();
  });
});
