import { loadEnvConfig } from '@next/env';

// Standalone workers do not get Next.js env loading automatically.
loadEnvConfig(process.cwd());
