// ============================================================================
// Form Builder — response scoring (Phase 8F-2). Pure. Reuses the survey scoring
// engine for parity: only the survey-style 'yesno'/'rating' fields contribute to
// a 0..100 score (data-entry fields are not scored). A form with no scored field
// has no score (→ null, stored as NULL in erp_form_responses.score).
// ============================================================================

import { scoreSurvey, type SurveyQuestion } from '@/lib/erp/survey';
import { allFields, type FormDefinition, type FormAnswers, type FormField } from './model';

/** Map a scoreable form field to a survey question, or null when not scored. */
function toScoredQuestion(f: FormField): SurveyQuestion | null {
  if (f.type === 'yesno' || f.type === 'rating') {
    return { key: f.key, label: f.label, type: f.type, max: f.max };
  }
  return null;
}

/** Weighted 0..100 score over a form's yesno/rating fields, or null when the form
 *  has none (a pure data form). Pure. */
export function scoreFormResponse(def: FormDefinition, answers: FormAnswers): number | null {
  const questions = allFields(def)
    .map(toScoredQuestion)
    .filter((q): q is SurveyQuestion => q !== null);
  return questions.length ? scoreSurvey({ questions }, answers).score : null;
}
