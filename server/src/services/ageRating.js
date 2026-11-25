/** Estimated age ≈ grade + 5 (no birthdates in seed). Grade 0 = kindergarten. */
function estimatedAge(grade) {
  return Number.isInteger(grade) && grade >= 0 && grade <= 12 ? grade + 5 : null;
}

/** @returns {boolean | null} null when either side is unknown */
export function isAboveEstimatedAge(ageRating, grade) {
  const age = estimatedAge(grade);
  if (age === null || typeof ageRating !== 'number') return null;
  return ageRating > age;
}
