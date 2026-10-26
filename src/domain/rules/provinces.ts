/**
 * Province rule packs for childcare: program fees, staff:child ratios and subsidy logic.
 *
 * Figures as researched in October 2026. Fees and subsidy thresholds change every year,
 * and ratios here are simplified to one value per age group. Verify every value against
 * the current provincial regulation before relying on it in production, and keep the
 * `sources` list up to date when you change a number.
 */
import type { AgeGroup } from '../types';

export type ProvinceCode = 'ON' | 'BC' | 'AB' | 'QC' | 'MB' | 'SK';

/** Average care days per month used to turn a daily fee into a monthly one. */
export const CARE_DAYS_PER_MONTH = 21.7;

export interface ProvinceRules {
  code: ProvinceCode;
  name: string;
  /** Name of the reduced-fee program centres can join. */
  programName: string;
  /** Daily parent fee at program centres (if the province sets one). */
  programDailyFee?: number;
  /** Flat monthly parent fee at program centres (Alberta). */
  programFlatMonthly?: number;
  /** [staff, children], e.g. [3, 10] means 3 staff per 10 children. */
  ratios: Record<AgeGroup, [number, number]>;
  subsidy: 'bc_accb' | 'municipal' | 'none';
  summary: string;
  sources: string[];
}

export const PROVINCES: Record<ProvinceCode, ProvinceRules> = {
  ON: {
    code: 'ON',
    name: 'Ontario',
    programName: 'CWELCC ($10-a-day program)',
    programDailyFee: 22,
    ratios: { infant: [3, 10], toddler: [1, 5], preschool: [1, 8] },
    subsidy: 'municipal',
    summary: 'CWELCC centres charge about $22/day. Municipal fee subsidy (income-tested) can lower this further; in Toronto it is only valid at CWELCC centres.',
    sources: ['https://www.policyalternatives.ca/?p=88240'],
  },
  BC: {
    code: 'BC',
    name: 'British Columbia',
    programName: '$10 a Day ChildCareBC',
    programDailyFee: 10,
    ratios: { infant: [1, 4], toddler: [1, 4], preschool: [1, 8] },
    subsidy: 'bc_accb',
    summary: 'Most centres set market fees, reduced by the fee reduction initiative. A minority are $10-a-day sites. The Affordable Child Care Benefit is income-tested.',
    sources: [
      'https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/child-care-benefit/information-for-families/eligibility-estimate-funding',
    ],
  },
  AB: {
    code: 'AB',
    name: 'Alberta',
    programName: 'Affordability Grant',
    programFlatMonthly: 326.25,
    ratios: { infant: [1, 3], toddler: [1, 5], preschool: [1, 8] },
    subsidy: 'none',
    summary: 'Flat $326.25/month for full-time care (100+ hours) and $230 part-time at centres with the Affordability Grant.',
    sources: ['https://www.alberta.ca/affordability-grant'],
  },
  QC: {
    code: 'QC',
    name: 'Quebec',
    programName: 'Reduced-contribution places',
    programDailyFee: 9.65,
    ratios: { infant: [1, 5], toddler: [1, 8], preschool: [1, 10] },
    subsidy: 'none',
    summary: 'Subsidized places cost about $9.65/day. Access is through the provincial single window, which is being replaced.',
    sources: ['https://www.noovo.info/nouvelle/remplacement-de-la-place-0-5-quebec-mise-sur-de-veritables-listes-dattente.html'],
  },
  MB: {
    code: 'MB',
    name: 'Manitoba',
    programName: '$10 a day',
    programDailyFee: 10,
    ratios: { infant: [1, 4], toddler: [1, 6], preschool: [1, 8] },
    subsidy: 'none',
    summary: '$10/day or less at funded centres.',
    sources: ['https://childcarecanada.org/node/18228'],
  },
  SK: {
    code: 'SK',
    name: 'Saskatchewan',
    programName: '$10 a day',
    programDailyFee: 10,
    ratios: { infant: [1, 3], toddler: [1, 5], preschool: [1, 10] },
    subsidy: 'none',
    summary: '$10/day at regulated centres.',
    sources: ['https://childcarecanada.org/node/18228'],
  },
};

export function getProvince(code: string): ProvinceRules | undefined {
  return PROVINCES[code as ProvinceCode];
}

export interface ParentFeeInput {
  province: string;
  centreFeeMonthly: number;
  inProgram: boolean;
}

/** Monthly parent fee before income-tested subsidy. */
export function parentFeeMonthly({ province, centreFeeMonthly, inProgram }: ParentFeeInput): { amount: number; basis: string } {
  const p = getProvince(province);
  if (!p || !inProgram) return { amount: centreFeeMonthly, basis: 'Centre fee' };
  if (p.programFlatMonthly != null) return { amount: Math.min(p.programFlatMonthly, centreFeeMonthly || Infinity), basis: `${p.programName} flat fee` };
  if (p.programDailyFee != null) {
    const amount = round2(p.programDailyFee * CARE_DAYS_PER_MONTH);
    return { amount: centreFeeMonthly ? Math.min(amount, centreFeeMonthly) : amount, basis: `${p.programName} at $${p.programDailyFee}/day` };
  }
  return { amount: centreFeeMonthly, basis: 'Centre fee' };
}

export interface SubsidyInput {
  province: string;
  annualIncome: number;
  familySize: number;
  childrenWithSupportNeeds?: number;
  parentFeeMonthly: number;
}

export interface SubsidyEstimate {
  monthly: number;
  confidence: 'rule' | 'approximate' | 'apply';
  explanation: string;
}

// BC Affordable Child Care Benefit, licensed group care.
const BC_FULL_BENEFIT_INCOME = 45_000;
const BC_ZERO_BENEFIT_INCOME = 111_000; // approximate end of eligibility
const BC_MAX_MONTHLY = 1_250; // indicative maximum; real maximum varies by care type and age

export function estimateSubsidy(input: SubsidyInput): SubsidyEstimate {
  const p = getProvince(input.province);
  if (!p) return { monthly: 0, confidence: 'apply', explanation: 'This province is not configured yet.' };

  if (p.subsidy === 'bc_accb') {
    const adjusted = input.annualIncome
      - 2_000 * Math.max(0, input.familySize - 2)
      - 3_000 * (input.childrenWithSupportNeeds ?? 0);
    let benefit: number;
    let confidence: SubsidyEstimate['confidence'];
    if (adjusted <= BC_FULL_BENEFIT_INCOME) {
      benefit = BC_MAX_MONTHLY;
      confidence = 'rule';
    } else if (adjusted >= BC_ZERO_BENEFIT_INCOME) {
      benefit = 0;
      confidence = 'approximate';
    } else {
      benefit = BC_MAX_MONTHLY * (1 - (adjusted - BC_FULL_BENEFIT_INCOME) / (BC_ZERO_BENEFIT_INCOME - BC_FULL_BENEFIT_INCOME));
      confidence = 'approximate';
    }
    benefit = round2(Math.min(benefit, input.parentFeeMonthly));
    return {
      monthly: benefit,
      confidence,
      explanation: `Adjusted income $${adjusted.toLocaleString('en-CA')} (less $2,000 per family member after two and $3,000 per child with support needs). Maximum benefit applies at $45,000 or less for licensed care; the taper above that is approximated. Paid to the centre.`,
    };
  }
  if (p.subsidy === 'municipal') {
    return {
      monthly: 0,
      confidence: 'apply',
      explanation: 'Fee subsidy is income-tested and run by your municipality. Apply to your local children\'s services office for an exact amount.',
    };
  }
  return { monthly: 0, confidence: 'rule', explanation: p.summary };
}

/** Staff needed for a number of children under a [staff, children] ratio. */
export function staffRequired(children: number, [staffPer, childrenPer]: [number, number]): number {
  if (children <= 0) return 0;
  return Math.ceil((children * staffPer) / childrenPer);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
