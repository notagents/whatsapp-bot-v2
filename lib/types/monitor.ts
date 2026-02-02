export type MonitorConversationItem = {
  whatsappId: string;
  lastMessageAt: number;
  lastSnippet: string;
  lastSource: "user" | "bot";
  turnsLast24h?: number;
  errorCount?: number;
};

export type MonitorConversationsResponse = {
  items: MonitorConversationItem[];
  nextCursor?: string;
};

export type MonitorConversationDetail = {
  conversation: { sessionId: string; whatsappId: string };
  messages: Array<{
    _id?: string;
    whatsappId: string;
    sessionId: string;
    userID: string;
    channel: "whatsapp" | "simulator";
    messageText: string;
    messageTime: number;
    source: "user" | "bot";
    processed: boolean;
    botMessageId?: string;
    configOverride?: "draft" | "published";
  }>;
  turns: Array<{
    _id?: string;
    whatsappId: string;
    sessionId: string;
    userID: string;
    channel?: "whatsapp" | "simulator";
    createdAt: number;
    messageIds: string[];
    text: string;
    status: string;
    router?: { agentId: string; reason: string; confidence: number };
    response?: {
      text?: string;
      messageId?: string;
      sentAt?: number;
      blockedReason?: string;
    };
    meta?: {
      rawEventIds?: string[];
      flow?: {
        mode: string;
        flowPath: string;
        state?: string;
        kbUsed?: boolean;
        kbChunks?: number;
      };
    };
    configOverride?: "draft" | "published";
  }>;
  agentRuns: Array<{
    _id?: string;
    turnId: string;
    whatsappId: string;
    agentId: string;
    startedAt: number;
    endedAt?: number;
    status: string;
    input?: unknown;
    output?: unknown;
    error?: { message: string; stack?: string };
  }>;
  state: {
    whatsappId: string;
    state: Record<string, unknown>;
    updatedAt: number;
  } | null;
  memory: {
    whatsappId: string;
    userID: string;
    facts: Array<{
      key: string;
      value: string;
      confidence: number;
      updatedAt: number;
    }>;
    recap: { text: string; updatedAt: number };
    structuredContext?: Record<string, unknown>;
    contextSchemaVersion?: number;
  } | null;
  responsesEnabled: {
    whatsappId: string;
    sessionId: string;
    userID: string;
    enabled: boolean;
    updatedAt: number;
    disabledUntilUTC?: string;
  } | null;
};
