import type { AcademicCourse } from '@cenit/contracts/academic';

const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
export const semesterLabel = (start: number, end = start) => start === end ? `Semestre ${roman[start - 1]}` : `Semestres ${roman[start - 1]}–${roman[end - 1]}`;

export function groupBySemester(courses: readonly AcademicCourse[]) {
  const groups = new Map<string, { semester: number; semesterEnd: number; courses: AcademicCourse[] }>();
  for (const course of [...courses].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const key = `${course.semester}-${course.semesterEnd}`;
    let group = groups.get(key);
    if (!group) {
      group = { semester: course.semester, semesterEnd: course.semesterEnd, courses: [] };
      groups.set(key, group);
    }
    group.courses.push(course);
  }
  return [...groups.values()].sort((a, b) => a.semester - b.semester || a.semesterEnd - b.semesterEnd);
}
