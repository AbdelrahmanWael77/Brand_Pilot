/**
 * Server-side campaign checks (task 5.3).
 *
 * The browser's Brand QA (`qa(c, camp)` in public/index.html) runs on the state blob. These are
 * the same content checks, computed only from trusted read paths:
 *   - the campaign mirror (campaigns.js)   what the campaign says
 *   - `approvedFacts`                      what the company has approved as knowledge
 *   - `audit`                              which recommendations the server itself can produce
 * A failed check is a finding, not an error. Colours are not mirrored, so contrast and palette
 * stay browser-only and are reported in `notChecked`.
 */
import { createCampaigns } from './campaigns.js';
import { approvedFacts } from './knowledge.js';
import { audit } from './audit.js';

/** Wording that claims a ranking, a guarantee, a percentage or a customer count (same pattern as the browser). */
export const RISK = /(#\s?1\b|number one|\bbest\b|guarantee|\bdouble\b|award|\d+\s?%|\d[\d,]*\+\s*(customers|clients|users)|الأفضل|رقم ?1|مضمون|ضمان)/i;
export const NOT_CHECKED = ['contrast', 'palette'];
const DURATION = /(\d+)[- ]?(day|days|يوم|أيام|minute|دقيقة)/gi;
const isAr = (s) => /[؀-ۿ]/.test(s || '');
const txt = (a) => Object.values(a.fields).map((f) => f.v).join('\n');

/**
 * Pure. `campaign` from the mirror, `facts` from `approvedFacts`, `auditItems` from `audit(...).items`.
 * → `{ checks: [{ id, pass, basis, affected, detail }], passed, failed, exportable, notChecked }`
 */
export function computeCampaignQa(campaign, facts, auditItems) {
  const b = campaign.brief;
  const as = campaign.assets;
  const copy = as.filter((a) => a.type !== 'guide');
  const approved = (cat) => new Set(facts.filter((f) => f.cat === cat && f.type !== 'conflict').map((f) => f.text.trim()));
  const checks = [];
  const chk = (id, basis, affected, detail) => checks.push({ id, pass: affected.length === 0, basis, affected, detail });
  const ids = (list) => list.map((a) => a.id);

  chk(
    'cta-used',
    'campaign',
    ids(copy.filter((a) => {
      const k = a.lang === 'ar' ? b.ctaAr : b.ctaEn;
      return !k || !txt(a).includes(k);
    })),
    'Every asset except the messaging guide contains the brief CTA of its language, word for word.',
  );

  const ctas = approved('ctas');
  const notApproved = (set, ...values) => values.some((v) => v.trim() && !set.has(v.trim()));
  chk('cta-approved', 'facts', notApproved(ctas, b.ctaEn, b.ctaAr) ? ['brief'] : [], 'Each CTA in the brief is the text of an approved CTA fact.');
  chk('offer-approved', 'facts', notApproved(approved('offers'), b.offerEn, b.offerAr) ? ['brief'] : [], 'Each offer in the brief is the text of an approved offer fact.');

  const offN = (b.offerEn.match(/\d+/) || [])[0];
  chk(
    'offer-numbers',
    'campaign',
    offN ? ids(copy.filter((a) => (txt(a).match(DURATION) || []).some((x) => parseInt(x, 10) !== +offN))) : [],
    'Durations stated in assets match the number in the English offer.',
  );

  chk('claims', 'campaign', ids(copy.filter((a) => RISK.test(txt(a)))), 'No ranking, guarantee, percentage or customer-count wording in any text field (pattern check).');

  chk(
    'placeholders',
    'campaign',
    ids(as.filter((a) => Object.entries(a.fields).some(([k, f]) => k !== 'f4' && (f.v.includes('⟦') || !f.v.trim())))),
    'No ⟦…⟧ marker (a slot with no approved wording) and no empty field; the optional fourth landing feature is exempt.',
  );

  chk(
    'language',
    'campaign',
    ids(copy.filter((a) => (a.lang === 'ar' ? !isAr(Object.values(a.fields)[0].v) : isAr(txt(a))))),
    'Arabic assets are in Arabic; English assets contain no Arabic.',
  );

  chk('links', 'campaign', /^https?:\/\/[^\s/]+\.[^\s]+/.test(b.url) ? [] : ['brief'], 'The landing URL in the brief is a valid http(s) address.');
  chk('review', 'campaign', ids(as.filter((a) => a.flagged)), 'No asset is waiting for review after a campaign change.');

  // Is the recommendation this campaign came from one the server can stand behind right now?
  if (campaign.rec === null) {
    checks.push({ id: 'recommendation', pass: true, basis: 'campaign', affected: [], detail: 'Manual campaign: it does not claim to come from a recommendation.' });
  } else {
    const item = auditItems.find((i) => i.id === campaign.rec && (i.basis === 'data' || i.basis === 'facts'));
    checks.push(
      item
        ? { id: 'recommendation', pass: true, basis: 'audit', affected: [], detail: `Recommendation "${campaign.rec}" is produced by the server audit from validated ${item.basis === 'data' ? 'data' : 'approved facts'}: ${item.title}` }
        : { id: 'recommendation', pass: false, basis: 'audit', affected: ['brief'], detail: `Recommendation "${campaign.rec}" is not verified on the server: the server audit does not currently produce it from validated data or approved facts.` },
    );
  }

  const failed = checks.filter((c) => !c.pass).length;
  return {
    checks,
    passed: checks.length - failed,
    failed,
    // Ready to leave the building: every check passes and a person approved every asset.
    exportable: failed === 0 && as.length > 0 && as.every((a) => a.status === 'approved'),
    notChecked: NOT_CHECKED,
  };
}

/** Checks for one mirrored campaign, or null when the company has no such campaign. */
export function campaignQa(db, companyId, campaignId) {
  const campaign = createCampaigns(db).get(companyId, campaignId);
  if (!campaign) return null;
  return {
    campaign: { id: campaign.id, name: campaign.name, rec: campaign.rec },
    ...computeCampaignQa(campaign, approvedFacts(db, companyId), audit(db, companyId).items),
  };
}
