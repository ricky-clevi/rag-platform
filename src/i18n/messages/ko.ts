import { koCoreMessages } from './ko-core';
import { koAgentMessages } from './ko-agents';
import { koProductMessages } from './ko-product';

export const koMessages = {
  ...koCoreMessages,
  ...koAgentMessages,
  ...koProductMessages,
} as const;
