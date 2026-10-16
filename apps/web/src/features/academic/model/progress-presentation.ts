import type { ProgressResponse } from '@cenit/contracts/academic';
export type CourseProgress = ProgressResponse['data']['courses'][number];
export const progressLabels: Record<CourseProgress['status'], string> = {
  passed: 'Aprobada', failed: 'Reprobada', inProgress: 'En curso', notTaken: 'No cursada',
};
