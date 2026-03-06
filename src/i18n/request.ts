import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { allMessages } from './messages';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate that the incoming locale is valid
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: allMessages[locale as keyof typeof allMessages],
  };
});
