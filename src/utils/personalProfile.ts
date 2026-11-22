export interface PersonalCallProfile {
  homeAddress: string;
  callbackPhone: string;
  voipWebhookUrl: string;
  backupSecurityEmail: string;
  securityWebhookUrl: string;
}

const STORAGE_KEY = 'hamseda_personal_safety_v1';

const DEFAULT_PROFILE: PersonalCallProfile = {
  homeAddress: '',
  callbackPhone: '',
  voipWebhookUrl: '',
  backupSecurityEmail: '',
  securityWebhookUrl: '',
};

export function loadPersonalCallProfile(): PersonalCallProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {...DEFAULT_PROFILE};
    const parsed = JSON.parse(raw) as Partial<PersonalCallProfile>;
    return {
      homeAddress: typeof parsed.homeAddress === 'string' ? parsed.homeAddress : '',
      callbackPhone: typeof parsed.callbackPhone === 'string' ? parsed.callbackPhone : '',
      voipWebhookUrl: typeof parsed.voipWebhookUrl === 'string' ? parsed.voipWebhookUrl : '',
      backupSecurityEmail: typeof parsed.backupSecurityEmail === 'string' ? parsed.backupSecurityEmail : '',
      securityWebhookUrl: typeof parsed.securityWebhookUrl === 'string' ? parsed.securityWebhookUrl : '',
    };
  } catch {
    return {...DEFAULT_PROFILE};
  }
}

export function savePersonalCallProfile(patch: Partial<PersonalCallProfile>): PersonalCallProfile {
  const next = {
    ...loadPersonalCallProfile(),
    ...patch,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('hamseda:profile-updated', {detail: next}));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}
