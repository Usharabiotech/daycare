import { describe, expect, it } from 'vitest';
import { estimateSubsidy, parentFeeMonthly, staffRequired } from '@/domain/rules/provinces';
import { compareQueue, estimateWaitMonths, orderQueue } from '@/domain/queue';

describe('province fee rules', () => {
  it('Alberta program centres charge the flat monthly fee', () => {
    expect(parentFeeMonthly({ province: 'AB', centreFeeMonthly: 1450, inProgram: true }).amount).toBe(326.25);
  });
  it('Ontario program centres charge the daily fee over 21.7 days', () => {
    expect(parentFeeMonthly({ province: 'ON', centreFeeMonthly: 1950, inProgram: true }).amount).toBeCloseTo(477.4, 1);
  });
  it('non-program centres charge their own fee', () => {
    expect(parentFeeMonthly({ province: 'BC', centreFeeMonthly: 1650, inProgram: false }).amount).toBe(1650);
  });
});

describe('BC Affordable Child Care Benefit', () => {
  it('gives the maximum at adjusted income of $45,000 (family of four earning $49,000)', () => {
    const e = estimateSubsidy({ province: 'BC', annualIncome: 49_000, familySize: 4, parentFeeMonthly: 1650 });
    expect(e.monthly).toBe(1250);
    expect(e.confidence).toBe('rule');
  });
  it('tapers to zero at the top of the income range', () => {
    expect(estimateSubsidy({ province: 'BC', annualIncome: 120_000, familySize: 2, parentFeeMonthly: 1650 }).monthly).toBe(0);
  });
  it('never exceeds the parent fee', () => {
    expect(estimateSubsidy({ province: 'BC', annualIncome: 20_000, familySize: 3, parentFeeMonthly: 300 }).monthly).toBe(300);
  });
});

describe('ratios', () => {
  it('Ontario infant ratio 3:10 needs 2 staff for 4 children and 3 for 10', () => {
    expect(staffRequired(4, [3, 10])).toBe(2);
    expect(staffRequired(10, [3, 10])).toBe(3);
    expect(staffRequired(0, [3, 10])).toBe(0);
  });
});

describe('queue ordering', () => {
  const d = (s: string) => new Date(s);
  it('puts staff children, then siblings, then earliest applications first', () => {
    const q = orderQueue([
      { id: 'late', appliedAt: d('2026-05-01'), flags: {} },
      { id: 'early', appliedAt: d('2025-01-01'), flags: {} },
      { id: 'sibling', appliedAt: d('2026-09-01'), flags: { sibling: true } },
      { id: 'staff', appliedAt: d('2026-10-01'), flags: { staffChild: true } },
    ]);
    expect(q.map((x) => x.id)).toEqual(['staff', 'sibling', 'early', 'late']);
    expect(compareQueue(q[0], q[1])).toBeLessThan(0);
  });
  it('estimates longer waits further back in the queue', () => {
    const [lo1] = estimateWaitMonths('infant', 10, 5);
    const [lo2] = estimateWaitMonths('infant', 10, 50);
    expect(lo2).toBeGreaterThan(lo1);
  });
});
