import type {
  MastProjectState,
  ManpowerMember,
  HaulingLogEntry,
  CentralMaterialItem,
  HaulingRateConfig,
  CivilWorksAttendanceRecord,
  CivilWorksPayrollSnapshot,
  HaulerPayrollSnapshot,
  HaulerPayoutRecord,
  ReportDetailsSpec,
} from '@/entities/project/types';

export type StaffPermission = 'manpower_payroll' | 'hauling_inventory';
export interface AccessUser {
  id: string;
  username: string;
  displayName: string;
  role: 'super_admin' | 'staff';
  permissions: StaffPermission[];
  projectIds: string[];
  isActive: boolean;
}
export function canAccess(
  user: AccessUser | null,
  permission: StaffPermission
): boolean {
  return Boolean(
    user?.isActive &&
    (user.role === 'super_admin' || user.permissions.includes(permission))
  );
}
export interface StaffWorkspaceDto {
  id: string;
  version: number;
  permissions: StaffPermission[];
  context: Pick<
    MastProjectState,
    | 'projectName'
    | 'location'
    | 'contractor'
    | 'preparedBy'
    | 'projectType'
    | 'lastUpdated'
  > & { reportDetails?: ReportDetailsSpec };
  haulerNames: string[];
  destinations: { id: string; name: string }[];
  haulingLogs: HaulingLogEntry[];
  haulingRateConfig: HaulingRateConfig;
  inventorySummary?: import('@/entities/project/haulingInventory').CentralMaterialStatusRow[];
  centralMaterials?: CentralMaterialItem[];
  manpowerRoster?: ManpowerMember[];
  civilAttendance?: CivilWorksAttendanceRecord[];
  civilPayrollHistory?: CivilWorksPayrollSnapshot[];
  haulerPayrollHistory?: HaulerPayrollSnapshot[];
  haulerPayouts?: HaulerPayoutRecord[];
}
export type StaffCommandType =
  | 'member.save'
  | 'attendance.save'
  | 'payroll.create'
  | 'payroll.status'
  | 'payout.save'
  | 'hauling.save'
  | 'material.save'
  | 'material.delete'
  | 'rates.save';
export interface StaffCommand {
  operationId: string;
  expectedVersion: number;
  type: StaffCommandType;
  payload: Record<string, unknown>;
}
export interface AuditEntry {
  id: string;
  project_id: string | null;
  user_id: string;
  username: string;
  display_name: string;
  domain: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  diff_json: string;
  operation_id: string;
  version_before: number | null;
  version_after: number | null;
  created_at: string;
}
