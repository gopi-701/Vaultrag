import { describe, expect, it, vi } from "vitest";

import {
  ChatRequestCoordinator,
  chatFailureMessage,
  executeChatRequest,
} from "@/components/chat/request-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function callbacks() {
  return {
    onStarted: vi.fn(),
    onSuccess: vi.fn(),
    onUnauthorized: vi.fn(),
    onError: vi.fn(),
    onFinished: vi.fn(),
  };
}

function execute(
  coordinator: ChatRequestCoordinator,
  fetcher: typeof fetch,
  handlers = callbacks(),
) {
  return {
    handlers,
    completion: executeChatRequest({
      coordinator,
      url: "/api/chat",
      init: { method: "POST" },
      fetcher,
      parse: (payload) => payload,
      ...handlers,
    }),
  };
}

describe("chat request concurrency", () => {
  it("ignores a Retail response that resolves after switching personas", async () => {
    const coordinator = new ChatRequestCoordinator();
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise) as unknown as typeof fetch;
    const retail = execute(coordinator, fetcher);

    coordinator.invalidate();
    pending.resolve(Response.json({ answer: "stale retail answer" }));
    await retail.completion;

    expect(retail.handlers.onSuccess).not.toHaveBeenCalled();
    expect(retail.handlers.onError).not.toHaveBeenCalled();
    expect(retail.handlers.onFinished).not.toHaveBeenCalled();
  });

  it("does not let a stale Retail 401 clear an Investment Banker session", async () => {
    const coordinator = new ChatRequestCoordinator();
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise) as unknown as typeof fetch;
    let activeSession = "retail_banker";
    const handlers = callbacks();
    handlers.onUnauthorized.mockImplementation(() => {
      activeSession = "guest";
    });
    const retail = execute(coordinator, fetcher, handlers);

    coordinator.invalidate();
    activeSession = "investment_banker";
    pending.resolve(Response.json({ error: "expired" }, { status: 401 }));
    await retail.completion;

    expect(activeSession).toBe("investment_banker");
    expect(handlers.onUnauthorized).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("aborts the active request when its persona generation is invalidated", () => {
    const coordinator = new ChatRequestCoordinator();
    const request = coordinator.begin();
    if (!request) throw new Error("Expected an active request");

    expect(request.signal.aborted).toBe(false);
    coordinator.invalidate();

    expect(request.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(request)).toBe(false);
  });

  it("allows a new query immediately without waiting for the stale request", async () => {
    const coordinator = new ChatRequestCoordinator();
    const stale = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce(Response.json({ answer: "Apollo answer" })) as unknown as typeof fetch;
    const first = execute(coordinator, fetcher);

    coordinator.invalidate();
    const second = execute(coordinator, fetcher);
    await second.completion;

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(second.handlers.onSuccess).toHaveBeenCalledWith({
      answer: "Apollo answer",
    });
    stale.resolve(Response.json({ answer: "stale" }));
    await first.completion;
    expect(first.handlers.onSuccess).not.toHaveBeenCalled();
  });

  it("handles a current 401 without retrying as Guest", async () => {
    const coordinator = new ChatRequestCoordinator();
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ error: "expired" }, { status: 401 }),
    ) as unknown as typeof fetch;
    let session = "retail_banker";
    const handlers = callbacks();
    handlers.onUnauthorized.mockImplementation(() => {
      session = "guest";
    });
    const current = execute(coordinator, fetcher, handlers);

    await current.completion;

    expect(session).toBe("guest");
    expect(handlers.onUnauthorized).toHaveBeenCalledOnce();
    expect(handlers.onError).toHaveBeenCalledWith(chatFailureMessage(401));
    expect(handlers.onFinished).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("retains synchronous duplicate-submission prevention", async () => {
    const coordinator = new ChatRequestCoordinator();
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise) as unknown as typeof fetch;
    const first = execute(coordinator, fetcher);
    const duplicate = execute(coordinator, fetcher);

    await expect(duplicate.completion).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();

    pending.resolve(Response.json({ answer: "current" }));
    await first.completion;
  });

  it("ignores completion after unmount invalidates the coordinator", async () => {
    const coordinator = new ChatRequestCoordinator();
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise) as unknown as typeof fetch;
    const request = execute(coordinator, fetcher);

    coordinator.invalidate();
    pending.resolve(Response.json({ answer: "completed after unmount" }));
    await request.completion;

    expect(request.handlers.onSuccess).not.toHaveBeenCalled();
    expect(request.handlers.onError).not.toHaveBeenCalled();
    expect(request.handlers.onUnauthorized).not.toHaveBeenCalled();
    expect(request.handlers.onFinished).not.toHaveBeenCalled();
  });
});
