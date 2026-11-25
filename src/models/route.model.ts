import { SoftDeleteColumns } from './common.model';

export interface WeeklyRouteSchedule {
  weekdays: number[];
  departureTime: string;
  orderAcceptanceEndsTime: string;
  orderAcceptanceDaysBefore?: number;
}

export interface RouteModel extends SoftDeleteColumns {
  id: number;
  name: string;
  schedule: WeeklyRouteSchedule | string;
  description: string | null;
}
