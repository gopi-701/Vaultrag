export interface ActiveChatRequest {
  readonly id: number;
  readonly generation: number;
  readonly signal: AbortSignal;
}

export class ChatRequestCoordinator {
  private generation = 0;
  private nextRequestId = 0;
  private active:
    | { request: ActiveChatRequest; controller: AbortController }
    | null = null;

  begin(): ActiveChatRequest | null {
    if (this.active) return null;

    const controller = new AbortController();
    const request: ActiveChatRequest = {
      id: ++this.nextRequestId,
      generation: this.generation,
      signal: controller.signal,
    };
    this.active = { request, controller };
    return request;
  }

  isCurrent(request: ActiveChatRequest): boolean {
    return this.active?.request === request &&
      request.generation === this.generation &&
      !request.signal.aborted;
  }

  finish(request: ActiveChatRequest): boolean {
    if (!this.isCurrent(request)) return false;
    this.active = null;
    return true;
  }

  invalidate(): void {
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
  }
}

export function chatFailureMessage(status: number) {
  return status === 401
    ? "Your employee session expired. Select the persona again or continue as Guest."
    : "VaultRAG could not complete the request. Please try again.";
}

interface ExecuteChatRequestInput<T> {
  coordinator: ChatRequestCoordinator;
  url: string;
  init: RequestInit;
  fetcher?: typeof fetch;
  parse: (payload: unknown) => T;
  onStarted: () => void;
  onSuccess: (result: T) => void;
  onUnauthorized: () => void;
  onError: (message: string) => void;
  onFinished: () => void;
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function executeChatRequest<T>(
  input: ExecuteChatRequestInput<T>,
): Promise<boolean> {
  const request = input.coordinator.begin();
  if (!request) return false;

  input.onStarted();
  try {
    const response = await (input.fetcher ?? fetch)(input.url, {
      ...input.init,
      signal: request.signal,
    });
    const payload = await responseJson(response);

    if (!input.coordinator.isCurrent(request)) return true;

    if (response.status === 401) {
      input.onUnauthorized();
      input.onError(chatFailureMessage(response.status));
      return true;
    }

    if (!response.ok) {
      input.onError(chatFailureMessage(response.status));
      return true;
    }

    const parsed = input.parse(payload);
    if (input.coordinator.isCurrent(request)) input.onSuccess(parsed);
  } catch {
    if (input.coordinator.isCurrent(request)) {
      input.onError(chatFailureMessage(500));
    }
  } finally {
    if (input.coordinator.finish(request)) input.onFinished();
  }

  return true;
}
