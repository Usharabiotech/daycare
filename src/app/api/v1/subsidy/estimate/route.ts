import { estimateSubsidy, parentFeeMonthly } from '@/domain/rules/provinces';
import { body, handle } from '../../_lib';

/** POST /api/v1/subsidy/estimate { province, annualIncome, familySize, childrenWithSupportNeeds?, centreFeeMonthly, inProgram } */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ province: string; annualIncome: number; familySize: number; childrenWithSupportNeeds?: number; centreFeeMonthly: number; inProgram: boolean }>(req);
    const fee = parentFeeMonthly({ province: b.province, centreFeeMonthly: b.centreFeeMonthly, inProgram: b.inProgram });
    const subsidy = estimateSubsidy({ ...b, parentFeeMonthly: fee.amount });
    return { parentFee: fee, subsidy, estimatedMonthlyCost: Math.max(0, fee.amount - subsidy.monthly) };
  });
}
