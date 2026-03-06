import { enCoreMessages } from './en-core';
import { enAgentMessages } from './en-agents';
import { enProductMessages } from './en-product';

export const enMessages = {
  ...enCoreMessages,
  ...enAgentMessages,
  ...enProductMessages,
} as const;
