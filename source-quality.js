function studyTextProblem(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (/^(?:error|access denied|forbidden|unauthorized|not found|404|403|sign in|log in|loading|redirecting|enable javascript|javascript is required)\b/i.test(value) && value.length < 500) return 'The source returned an error, login prompt or viewer shell, not study material.';
  if (/\bSlide\s+\d+:/i.test(value)) {
    const sections = String(text).split(/\bSlide\s+\d+:/i).slice(1);
    const explanatory = sections.some(section => section.split(/\n/).some(line => {
      const clean = line.trim();
      const words = clean.match(/[\p{L}]{2,}/gu) || [];
      return words.length >= 10 && !/\?$/.test(clean) && /\b(is|are|means|refers|uses|used|helps|includes|shows|measures|examines|influence|because|represents|identifies|compares|describes|can|should|must)\b/i.test(clean);
    }));
    if (!explanatory) return 'Only slide headings or fragments were extracted, not explanations. The useful content may be in images; use a text-based or OCR-readable copy.';
  }
  const words = value.match(/[\p{L}]{2,}/gu) || [];
  if (value.length < 80 || words.length < 12 || new Set(words.map(word => word.toLowerCase())).size < 8) return 'Too little meaningful text to generate grounded questions; the response may be a viewer shell or title only.';
  return '';
}
if (typeof module !== 'undefined') module.exports = { studyTextProblem };
