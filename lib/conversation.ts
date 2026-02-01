export function getActualJid(whatsappId: string): string {
  const at = whatsappId.indexOf("@");
  return at >= 0 ? whatsappId.slice(at + 1) : whatsappId;
}

export function getSessionIdFromComposite(whatsappId: string): string | null {
  const at = whatsappId.indexOf("@");
  return at >= 0 ? whatsappId.slice(0, at) : null;
}

export function buildConversationId(sessionId: string, jid: string): string {
  return `${sessionId}@${jid}`;
}

export function normalizeUserID(jid: string): string {
  const rawNumberMatch = jid.match(/^(\d+)@/);
  if (rawNumberMatch) return rawNumberMatch[1];
  const actual = getActualJid(jid);
  const match = actual.match(/^(\d+)@/);
  return match ? match[1] : actual.replace(/@.*$/, "");
}

export function isSimulatorConversation(whatsappId: string): boolean {
  return whatsappId.startsWith("sim:");
}

export function buildSimulatorConversationId(sessionId: string, testUserId: string): string {
  return `sim:${sessionId}:${testUserId}`;
}

export function parseSimulatorConversationId(
  conversationId: string
): { sessionId: string; testUserId: string } | null {
  if (!conversationId.startsWith("sim:")) return null;
  const parts = conversationId.split(":");
  if (parts.length !== 3) return null;
  return { sessionId: parts[1], testUserId: parts[2] };
}
