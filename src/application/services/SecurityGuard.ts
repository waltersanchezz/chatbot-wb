import { securityBlockedMessage } from '../flows/handoffFlow';

const BLOCKED = [
  /api[_\s-]?key/i,
  /prompt\s+interno/i,
  /system\s+prompt/i,
  /openai/i,
  /token\s+de\s+acceso/i,
  /variable[s]?\s+de\s+entorno/i,
  /muestra(me)?\s+(el|tu|tus)\s+prompt/i,
  /revela/i,
  /\.env\b/i,
];

export class SecurityGuard {
  isSensitiveProbe(message: string): boolean {
    return BLOCKED.some((re) => re.test(message));
  }

  blockedReply(): string {
    return securityBlockedMessage();
  }
}
