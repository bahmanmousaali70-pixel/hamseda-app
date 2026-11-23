export interface PersonalSecurityProfile {
  backupSecurityEmail: string;
  securityWebhookUrl: string;
}

const STORAGE_KEY = 'hamseda_personal_safety_v1';

const DEFAULT_PROFILE: PersonalSecurityProfile = {
  backupSecurityEmail: '',
  securityWebhookUrl: '',
};

export function loadPersonalCallProfile(): PersonalSecurityProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {...DEFAULT_PROFILE};
    const parsed = JSON.parse(raw) as Partial<PersonalSecurityProfile>;
    return {
      backupSecurityEmail: typeof parsed.backupSecurityEmail === 'string' ? parsed.backupSecurityEmail : '',
      securityWebhookUrl: typeof parsed.securityWebhookUrl === 'string' ? parsed.securityWebhookUrl : '',
    };
  } catch {
    return {...DEFAULT_PROFILE};
  }
}

export function savePersonalCallProfile(patch: Partial<PersonalSecurityProfile>): PersonalSecurityProfile {
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
