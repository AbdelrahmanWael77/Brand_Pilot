// P7 (owner 2026-11-21): plain words for the people who read BrandPilot. GA4 channel names ("Organic Social") are
// analytics jargon; every screen and recommendation names a channel in plain words instead. The raw name stays in
// the data (and in `subject`), so the audit, the number check and the trail keep matching on it. Each plain name
// keeps a word the number check reads as that channel (social, search, direct, referral, email / السوشيال، البحث…).
export const CHANNEL_PLAIN = {
  'Organic Social': ['your unpaid social media posts', 'منشوراتك على السوشيال'],
  'Organic Search': ['unpaid Google search', 'البحث في جوجل'],
  'Paid Social': ['paid social media ads', 'إعلانات السوشيال المدفوعة'],
  'Paid Search': ['paid search ads', 'إعلانات البحث المدفوعة'],
  Direct: ['direct visits', 'الزيارات المباشرة'],
  Referral: ['referral links', 'روابط الإحالة'],
  Email: ['email', 'البريد'],
};

/** A short channel word for one-line next steps ("Send social media visitors to one focused page"). */
export const CHANNEL_SHORT = {
  'Organic Social': ['social media', 'السوشيال'],
  'Organic Search': ['Google search', 'البحث في جوجل'],
  'Paid Social': ['paid social', 'إعلانات السوشيال'],
  'Paid Search': ['paid search', 'إعلانات البحث'],
  Direct: ['direct', 'الدخول المباشر'],
  Referral: ['referral', 'روابط الإحالة'],
  Email: ['email', 'البريد'],
};
export const chShort = (name, lang) => { const x = CHANNEL_SHORT[name]; return x ? x[lang === 'ar' ? 1 : 0] : name; };

/** The plain name of a channel in a language; an unknown name is returned as it is. */
export const chPlain = (name, lang) => {
  const x = CHANNEL_PLAIN[name];
  return x ? x[lang === 'ar' ? 1 : 0] : name;
};

/** First letter in upper case, for a plain name that starts an English sentence. */
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
