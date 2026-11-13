// Anbieter-Konfiguration fuer den Phase-0-Test.
// allowedHosts: Ziele, die IN der eingebetteten Ansicht bleiben duerfen (Login, Challenges).
// Alles andere wird im Standardbrowser geoeffnet.

const PROVIDERS = {
  claude: {
    label: 'Claude',
    url: 'https://claude.ai/',
    partition: 'persist:nexus-claude',
    allowedHosts: [
      'claude.ai',
      'anthropic.com',
      'claude.com',
      'challenges.cloudflare.com',
      'accounts.google.com',
      'appleid.apple.com',
    ],
  },
  chatgpt: {
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    partition: 'persist:nexus-chatgpt',
    allowedHosts: [
      'chatgpt.com',
      'openai.com',
      'oaistatic.com',
      'oaiusercontent.com',
      'challenges.cloudflare.com',
      'accounts.google.com',
      'login.live.com',
      'login.microsoftonline.com',
      'appleid.apple.com',
    ],
  },
};

function hostAllowed(provider, rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  return provider.allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
}

module.exports = { PROVIDERS, hostAllowed };
