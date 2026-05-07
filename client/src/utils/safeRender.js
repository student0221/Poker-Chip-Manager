import DOMPurify from 'dompurify';

export function sanitizeText(input) {
  if (!input) return '';
  return DOMPurify.sanitize(String(input), { ALLOWED_TAGS: [] });
}

export function sanitizeHTML(input) {
  if (!input) return '';
  return DOMPurify.sanitize(String(input));
}
