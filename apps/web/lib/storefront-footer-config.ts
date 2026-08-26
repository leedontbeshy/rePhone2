export type StorefrontSocialPlatform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK';

export interface StorefrontSocialLink {
  readonly href: string;
  readonly label: string;
  readonly platform: StorefrontSocialPlatform;
}

export interface StorefrontFooterConfig {
  readonly email: string | null;
  readonly socialLinks: readonly StorefrontSocialLink[];
}

type PublicEnvironment = Readonly<Record<string, string | undefined>>;

const DEVELOPMENT_DEFAULTS = {
  email: 'hello@rephone.vn',
  facebook: 'https://www.facebook.com/rephone.vn',
  instagram: 'https://www.instagram.com/rephone.vn',
  tiktok: 'https://www.tiktok.com/@rephone.vn',
} as const;

const SOCIAL_SOURCES = [
  {
    developmentDefault: DEVELOPMENT_DEFAULTS.facebook,
    environmentKey: 'NEXT_PUBLIC_SOCIAL_FACEBOOK_URL',
    hostname: 'facebook.com',
    label: 'Facebook',
    platform: 'FACEBOOK',
  },
  {
    developmentDefault: DEVELOPMENT_DEFAULTS.instagram,
    environmentKey: 'NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL',
    hostname: 'instagram.com',
    label: 'Instagram',
    platform: 'INSTAGRAM',
  },
  {
    developmentDefault: DEVELOPMENT_DEFAULTS.tiktok,
    environmentKey: 'NEXT_PUBLIC_SOCIAL_TIKTOK_URL',
    hostname: 'tiktok.com',
    label: 'TikTok',
    platform: 'TIKTOK',
  },
] as const;

export function getStorefrontFooterConfig(
  environment: PublicEnvironment = process.env,
): StorefrontFooterConfig {
  const useDevelopmentDefaults = environment.NODE_ENV === 'development';
  return {
    email: normalizeEmail(
      environment.NEXT_PUBLIC_STORE_EMAIL ??
        (useDevelopmentDefaults ? DEVELOPMENT_DEFAULTS.email : undefined),
    ),
    socialLinks: SOCIAL_SOURCES.flatMap((source) => {
      const href = normalizeSocialUrl(
        environment[source.environmentKey] ??
          (useDevelopmentDefaults ? source.developmentDefault : undefined),
        source.hostname,
      );
      return href === null
        ? []
        : [{ href, label: source.label, platform: source.platform } satisfies StorefrontSocialLink];
    }),
  };
}

function normalizeEmail(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  if (email.length === 0 || email.length > 320) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeSocialUrl(value: string | undefined, expectedHostname: string): string | null {
  const candidate = value?.trim();
  if (candidate === undefined || candidate.length === 0) return null;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const isExpectedHost =
      hostname === expectedHostname || hostname.endsWith(`.${expectedHostname}`);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      !isExpectedHost
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
