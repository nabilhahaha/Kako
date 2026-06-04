import { describe, it, expect } from 'vitest';
import { answerScore, scoreSurvey, validateSurvey, type SurveyDef } from './survey';

describe('survey · answerScore', () => {
  it('yesno → 1/0', () => {
    expect(answerScore({ key: 'q', label: 'q', type: 'yesno' }, 'yes')).toBe(1);
    expect(answerScore({ key: 'q', label: 'q', type: 'yesno' }, 'no')).toBe(0);
    expect(answerScore({ key: 'q', label: 'q', type: 'yesno' }, 'نعم')).toBe(1);
  });
  it('rating scales by max (default 5)', () => {
    expect(answerScore({ key: 'q', label: 'q', type: 'rating' }, 4)).toBe(0.8);
    expect(answerScore({ key: 'q', label: 'q', type: 'rating', max: 10 }, 5)).toBe(0.5);
  });
  it('select uses option score, else 1 for chosen', () => {
    const q = { key: 'q', label: 'q', type: 'select' as const, options: [{ value: 'a', score: 0.25 }, { value: 'b' }] };
    expect(answerScore(q, 'a')).toBe(0.25);
    expect(answerScore(q, 'b')).toBe(1);
    expect(answerScore(q, 'z')).toBe(0); // not an option
  });
  it('text/photo and blanks are unscored (null)', () => {
    expect(answerScore({ key: 'q', label: 'q', type: 'text' }, 'hi')).toBeNull();
    expect(answerScore({ key: 'q', label: 'q', type: 'photo' }, 'url')).toBeNull();
    expect(answerScore({ key: 'q', label: 'q', type: 'yesno' }, '')).toBeNull();
    expect(answerScore({ key: 'q', label: 'q', type: 'number' }, 7)).toBeNull(); // no max → unscored data
  });
});

describe('survey · scoreSurvey', () => {
  const def: SurveyDef = {
    questions: [
      { key: 'available', label: 'On shelf?', type: 'yesno', weight: 2, required: true },
      { key: 'facings', label: 'Facings', type: 'rating', max: 5, weight: 1, required: true },
      { key: 'photo', label: 'Photo', type: 'photo', required: true },
      { key: 'note', label: 'Note', type: 'text' },
    ],
  };

  it('weights scored answers and tracks completion', () => {
    const s = scoreSurvey(def, { available: 'yes', facings: 4, photo: 'u', note: '' });
    // (2*1 + 1*0.8) / (2+1) = 2.8/3 = 0.933 → 93
    expect(s.score).toBe(93);
    expect(s.scoredAnswered).toBe(2);
    expect(s.requiredTotal).toBe(3);
    expect(s.requiredAnswered).toBe(3); // available, facings, photo all answered
    expect(s.completionPct).toBe(100);
    expect(s.complete).toBe(true);
  });

  it('incomplete when a required answer is missing', () => {
    const s = scoreSurvey(def, { available: 'no', facings: 0 });
    expect(s.score).toBe(0);        // both scored answers are 0
    expect(s.requiredAnswered).toBe(2); // photo missing
    expect(s.complete).toBe(false);
  });

  it('no scored questions → 100 score (completion still tracked)', () => {
    const s = scoreSurvey({ questions: [{ key: 'p', label: 'p', type: 'photo', required: true }] }, {});
    expect(s.score).toBe(100);
    expect(s.complete).toBe(false);
  });
});

describe('survey · validateSurvey', () => {
  it('flags empty, missing key/label, dup key, select without options', () => {
    expect(validateSurvey({ questions: [] })).toMatch(/at least one/);
    expect(validateSurvey({ questions: [{ key: '', label: 'x', type: 'yesno' }] })).toMatch(/key/);
    expect(validateSurvey({ questions: [{ key: 'a', label: '', type: 'yesno' }] })).toMatch(/label/);
    expect(validateSurvey({ questions: [{ key: 'a', label: 'A', type: 'yesno' }, { key: 'a', label: 'B', type: 'yesno' }] })).toMatch(/Duplicate/);
    expect(validateSurvey({ questions: [{ key: 'a', label: 'A', type: 'select' }] })).toMatch(/options/);
    expect(validateSurvey({ questions: [{ key: 'a', label: 'A', type: 'yesno' }] })).toBeNull();
  });
});
